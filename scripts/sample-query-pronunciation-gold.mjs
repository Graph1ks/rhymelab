#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  QUERY_PRONUNCIATION_GOLD_BUCKETS,
  QUERY_PRONUNCIATION_GOLD_POLICY,
  QUERY_PRONUNCIATION_GOLD_SAMPLE_SCHEMA,
  deterministicTake,
  syllableBucket,
} from './query-pronunciation-gold-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const deDbPath=resolve(argValue('--de','data/local/rhymelab-v5.sqlite'));
const enDbPath=resolve(argValue('--en','data/local/rhymelab-en-v1.sqlite'));
const outPath=resolve(argValue('--out','data/local/query-pronunciation-gold-sample-v1.json'));
const tsvPath=resolve(argValue('--tsv','data/local/query-pronunciation-gold-sample-v1.tsv'));
const requestedSize=Math.max(200,Math.min(5000,Number.parseInt(argValue('--size','1000'),10)||1000));
const seed=String(argValue('--seed','query-pronunciation-gold-v1'));

for(const path of [deDbPath,enDbPath]){
  if(!existsSync(path)) throw new Error(`Required local database missing: ${path}`);
}
await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(tsvPath),{recursive:true});

function meta(db,key){
  try{return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;}
  catch{return null;}
}
function bucketPredicate(bucket,column='syllable_count'){
  if(bucket==='1') return `${column}=1`;
  if(bucket==='2') return `${column}=2`;
  if(bucket==='3') return `${column}=3`;
  return `${column}>=4`;
}
function quotaMap(total){
  const base=Math.floor(total/QUERY_PRONUNCIATION_GOLD_BUCKETS.length);
  let remainder=total-base*QUERY_PRONUNCIATION_GOLD_BUCKETS.length;
  const map=new Map();
  for(const bucket of QUERY_PRONUNCIATION_GOLD_BUCKETS){
    map.set(bucket,base+(remainder-->0?1:0));
  }
  return map;
}

const deDb=new DatabaseSync(deDbPath,{readOnly:true});
const enDb=new DatabaseSync(enDbPath,{readOnly:true});
deDb.exec('PRAGMA query_only=ON;');
enDb.exec('PRAGMA query_only=ON;');

function deRows(bucket=null){
  const predicate=bucket?bucketPredicate(bucket,'h.syllable_count'):'h.syllable_count>=1';
  return deDb.prepare(`
    SELECT
      h.normalized,
      MIN(h.surface) AS surface,
      MIN(h.syllable_count) AS syllable_count
    FROM hot h
    WHERE h.lexicon_layer='dictionary'
      AND h.historical=0
      AND h.pronunciation_preferred=1
      AND h.pronunciation_eligible=1
      AND ${predicate}
    GROUP BY h.normalized
    ORDER BY h.normalized
  `).iterate();
}
function enRows(bucket=null){
  const predicate=bucket?bucketPredicate(bucket,'p.syllable_count'):'p.syllable_count>=1';
  return enDb.prepare(`
    SELECT
      f.id AS form_id,
      f.surface,
      f.normalized,
      MIN(p.syllable_count) AS syllable_count
    FROM en_form f
    JOIN en_pronunciation p ON p.form_id=f.id
    WHERE f.default_eligible=1
      AND p.default_profile_eligible=1
      AND ${predicate}
    GROUP BY f.id,f.surface,f.normalized
    ORDER BY f.normalized
  `).iterate();
}

const deRefs=deDb.prepare(`
  SELECT ipa,pronunciation_source,locale,dialect,pronunciation_register
  FROM hot
  WHERE normalized=?
    AND lexicon_layer='dictionary'
    AND historical=0
    AND pronunciation_eligible=1
  ORDER BY pronunciation_preferred DESC,pronunciation_rank,id
`);
const enRefs=enDb.prepare(`
  SELECT notation,raw,source,locales
  FROM en_pronunciation
  WHERE form_id=?
    AND default_profile_eligible=1
  ORDER BY id
`);

function enrichDe(row){
  return {
    language:'de',
    surface:String(row.surface),
    normalized:String(row.normalized),
    syllable_bucket:syllableBucket(row.syllable_count),
    references:deRefs.all(row.normalized).map((ref)=>({
      notation:'ipa',
      pronunciation:String(ref.ipa),
      source:String(ref.pronunciation_source||''),
      locale:ref.locale||null,
      dialect:ref.dialect||null,
      register:ref.pronunciation_register||null,
    })),
  };
}
function enrichEn(row){
  return {
    language:'en',
    surface:String(row.surface),
    normalized:String(row.normalized),
    syllable_bucket:syllableBucket(row.syllable_count),
    references:enRefs.all(row.form_id).map((ref)=>({
      notation:String(ref.notation),
      pronunciation:String(ref.raw),
      source:String(ref.source||''),
      locales:ref.locales||'[]',
    })),
  };
}

function selectLanguage(language,total){
  const quotas=quotaMap(total);
  const seen=new Set();
  const selected=[];
  const byBucket={};
  const rowsFor=language==='de'?deRows:enRows;
  const enrich=language==='de'?enrichDe:enrichEn;

  for(const bucket of QUERY_PRONUNCIATION_GOLD_BUCKETS){
    const quota=quotas.get(bucket);
    const raw=deterministicTake(
      rowsFor(bucket),
      Math.max(quota*2,quota),
      `${seed}|${language}|${bucket}`,
      (row)=>String(row.normalized),
    );
    let count=0;
    for(const row of raw){
      if(count>=quota) break;
      const key=String(row.normalized);
      if(seen.has(key)) continue;
      const item=enrich(row);
      if(!item.references.length) continue;
      seen.add(key);
      selected.push(item);
      count+=1;
    }
    byBucket[bucket]={requested:quota,selected:count};
  }

  if(selected.length<total){
    const backfill=deterministicTake(
      rowsFor(null),
      Math.min(total*4,20000),
      `${seed}|${language}|backfill`,
      (row)=>String(row.normalized),
    );
    for(const row of backfill){
      if(selected.length>=total) break;
      const key=String(row.normalized);
      if(seen.has(key)) continue;
      const item=enrich(row);
      if(!item.references.length) continue;
      seen.add(key);
      selected.push(item);
    }
  }

  if(selected.length!==total){
    throw new Error(`Unable to sample ${total} ${language} source-backed controls; selected ${selected.length}.`);
  }
  return {selected,byBucket};
}

try{
  const deQuota=Math.floor(requestedSize/2);
  const enQuota=requestedSize-deQuota;
  const de=selectLanguage('de',deQuota);
  const en=selectLanguage('en',enQuota);
  const cases=[...de.selected,...en.selected]
    .map((row,index)=>({
      case_id:`gold-${String(index+1).padStart(4,'0')}`,
      ...row,
    }));

  const evidence={
    schema:QUERY_PRONUNCIATION_GOLD_SAMPLE_SCHEMA,
    policy:QUERY_PRONUNCIATION_GOLD_POLICY,
    purpose:'Held-out source-backed lexical pronunciation controls for measuring optional eSpeak-NG query-pronunciation quality; not unresolved-row gold.',
    seed,
    requested_size:requestedSize,
    actual_size:cases.length,
    language_counts:{de:deQuota,en:enQuota},
    bucket_counts:{de:de.byBucket,en:en.byBucket},
    databases:{
      de:{
        schema:meta(deDb,'schema')||meta(deDb,'database_schema'),
        semantic_fingerprint:meta(deDb,'semantic_fingerprint'),
      },
      en:{
        schema:meta(enDb,'schema'),
        semantic_fingerprint:meta(enDb,'semantic_fingerprint'),
      },
    },
    safeguards:{
      source_backed_controls_only:true,
      generated_pronunciations_as_gold:false,
      historical_de_controls:false,
      default_eligible_en_controls:true,
      runtime_promotion:false,
    },
    cases,
  };
  const semanticFingerprint=createHash('sha256')
    .update(JSON.stringify(evidence))
    .digest('hex');
  const report={...evidence,semantic_fingerprint:semanticFingerprint};
  await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');

  const header=['case_id','language','surface','normalized','syllable_bucket','reference_count'];
  const lines=[
    header.join('\t'),
    ...cases.map((row)=>[
      row.case_id,row.language,row.surface,row.normalized,row.syllable_bucket,row.references.length,
    ].map((value)=>String(value??'').replace(/[\t\r\n]/gu,' ')).join('\t')),
  ];
  await writeFile(tsvPath,lines.join('\n')+'\n','utf8');

  console.log(JSON.stringify({
    schema:report.schema,
    cases:report.actual_size,
    language_counts:report.language_counts,
    bucket_counts:report.bucket_counts,
    semantic_fingerprint:semanticFingerprint,
    report:outPath,
    tsv:tsvPath,
  },null,2));
}finally{
  enDb.close();
  deDb.close();
}
