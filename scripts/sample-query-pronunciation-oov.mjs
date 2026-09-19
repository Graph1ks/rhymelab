#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const OOV_SAMPLE_SCHEMA='rhymelab-query-pronunciation-oov-sample-v1';
export const OOV_SAMPLE_POLICY='stratified-unresolved-local-db-v1';
export const DEFAULT_OOV_SAMPLE_SIZE=1000;
export const DEFAULT_OOV_SAMPLE_SEED='query-pronunciation-oov-v1';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const phraseDbPath=resolve(argValue('--phrases','data/local/rhymelab-phrases-v1.sqlite'));
const entityDbPath=resolve(argValue('--entities','data/local/rhymelab-entities-v1.sqlite'));
const outPath=resolve(argValue('--out','data/local/query-pronunciation-oov-sample-v1.json'));
const tsvPath=resolve(argValue('--tsv','data/local/query-pronunciation-oov-sample-v1.tsv'));
const requestedSize=Math.max(100,Math.min(5000,Number.parseInt(argValue('--size','1000'),10)||1000));
const seed=String(argValue('--seed',DEFAULT_OOV_SAMPLE_SEED));

for(const path of [phraseDbPath,entityDbPath]){
  if(!existsSync(path)) throw new Error(`Required local database missing: ${path}`);
}
await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(tsvPath),{recursive:true});

const REVIEW_STATES=[
  'accepted','reviewed','accepted_source_composition','accepted_source_backed',
];

function meta(db,key){
  try{return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;}
  catch{return null;}
}

function score(seedValue,key){
  return createHash('sha256')
    .update(`${seedValue}\u0000${key}`)
    .digest('hex');
}

function deterministicTake(rows,limit,seedValue,keyFn){
  const selected=[];
  for(const row of rows){
    const key=keyFn(row);
    const rank=score(seedValue,key);
    if(selected.length<limit){
      selected.push({rank,row});
      if(selected.length===limit) selected.sort((a,b)=>b.rank.localeCompare(a.rank));
      continue;
    }
    if(rank>=selected[0].rank) continue;
    selected[0]={rank,row};
    selected.sort((a,b)=>b.rank.localeCompare(a.rank));
  }
  return selected
    .sort((a,b)=>a.rank.localeCompare(b.rank))
    .map(({row})=>row);
}

function entityIterator(db,{language,preferred}){
  const locale=language==='de'?'de-DE':'en-US';
  const placeholders=REVIEW_STATES.map(()=>'?').join(',');
  return db.prepare(`
    SELECT
      n.name_id,n.entity_id,n.surface,n.normalized,n.language,n.name_kind,n.preferred,
      e.qid,e.primary_category,e.popularity_tier,e.popularity_percentile,e.popularity_score
    FROM entity_name n
    JOIN entity e USING(entity_id)
    WHERE n.searchable=1
      AND n.language=?
      AND n.preferred=?
      AND NOT EXISTS (
        SELECT 1 FROM entity_pronunciation p
        WHERE p.name_id=n.name_id
          AND p.locale=?
          AND p.review_state IN (${placeholders})
      )
    ORDER BY n.name_id
  `).iterate(language,preferred?1:0,locale,...REVIEW_STATES);
}

function phraseIterator(db){
  return db.prepare(`
    SELECT
      r.normalized,
      MIN(t.surface) AS surface,
      COUNT(*) AS token_occurrences,
      COUNT(DISTINCT r.phrase_id) AS phrase_count,
      SUM(CASE WHEN p.modern_eligible=1 THEN 1 ELSE 0 END) AS modern_phrase_occurrences
    FROM phrase_token_pronunciation_resolution r
    JOIN phrase_token t
      ON t.phrase_id=r.phrase_id AND t.token_index=r.token_index
    JOIN phrase p USING(phrase_id)
    WHERE r.status<>'resolved_preferred'
    GROUP BY r.normalized
    ORDER BY r.normalized
  `).iterate();
}

function entityCase(row,stratum){
  return {
    source_stratum:stratum,
    language:String(row.language),
    surface:String(row.surface),
    normalized:String(row.normalized),
    source_id:Number(row.name_id),
    context:{
      entity_id:Number(row.entity_id),
      qid:row.qid,
      primary_category:row.primary_category,
      name_kind:row.name_kind,
      preferred:Boolean(row.preferred),
      popularity_tier:row.popularity_tier,
      popularity_percentile:Number(row.popularity_percentile||0),
      popularity_score:Number(row.popularity_score||0),
    },
  };
}

function phraseCase(row){
  return {
    source_stratum:'phrase_de_unresolved_token',
    language:'de',
    surface:String(row.surface||row.normalized),
    normalized:String(row.normalized),
    source_id:String(row.normalized),
    context:{
      token_occurrences:Number(row.token_occurrences||0),
      phrase_count:Number(row.phrase_count||0),
      modern_phrase_occurrences:Number(row.modern_phrase_occurrences||0),
    },
  };
}

const phraseDb=new DatabaseSync(phraseDbPath,{readOnly:true});
const entityDb=new DatabaseSync(entityDbPath,{readOnly:true});
phraseDb.exec('PRAGMA query_only=ON;');
entityDb.exec('PRAGMA query_only=ON;');

try{
  const strata=[
    {
      id:'phrase_de_unresolved_token',
      language:'de',
      weight:1,
      rows:()=>phraseIterator(phraseDb),
      map:phraseCase,
      key:(row)=>String(row.normalized),
    },
    {
      id:'entity_de_preferred_unresolved',
      language:'de',
      weight:1,
      rows:()=>entityIterator(entityDb,{language:'de',preferred:true}),
      map:(row)=>entityCase(row,'entity_de_preferred_unresolved'),
      key:(row)=>String(row.name_id),
    },
    {
      id:'entity_en_preferred_unresolved',
      language:'en',
      weight:1,
      rows:()=>entityIterator(entityDb,{language:'en',preferred:true}),
      map:(row)=>entityCase(row,'entity_en_preferred_unresolved'),
      key:(row)=>String(row.name_id),
    },
    {
      id:'entity_de_alias_unresolved',
      language:'de',
      weight:1,
      rows:()=>entityIterator(entityDb,{language:'de',preferred:false}),
      map:(row)=>entityCase(row,'entity_de_alias_unresolved'),
      key:(row)=>String(row.name_id),
    },
    {
      id:'entity_en_alias_unresolved',
      language:'en',
      weight:1,
      rows:()=>entityIterator(entityDb,{language:'en',preferred:false}),
      map:(row)=>entityCase(row,'entity_en_alias_unresolved'),
      key:(row)=>String(row.name_id),
    },
  ];

  const baseQuota=Math.floor(requestedSize/strata.length);
  let remainder=requestedSize-baseQuota*strata.length;
  const sampled=[];
  const stratumReports=[];
  const seen=new Set();

  for(const stratum of strata){
    const quota=baseQuota+(remainder>0?1:0);
    if(remainder>0) remainder-=1;
    const raw=deterministicTake(
      stratum.rows(),
      quota*3,
      `${seed}|${stratum.id}`,
      stratum.key,
    );
    let selected=0;
    for(const row of raw){
      if(selected>=quota) break;
      const mapped=stratum.map(row);
      const dedupe=`${mapped.language}\u0000${mapped.normalized}`;
      if(seen.has(dedupe)) continue;
      seen.add(dedupe);
      sampled.push(mapped);
      selected+=1;
    }
    stratumReports.push({id:stratum.id,requested:quota,selected});
  }

  if(sampled.length<requestedSize){
    const allBackfill=[];
    for(const stratum of strata){
      for(const row of deterministicTake(
        stratum.rows(),
        Math.min(requestedSize,5000),
        `${seed}|backfill|${stratum.id}`,
        stratum.key,
      )){
        const mapped=stratum.map(row);
        const dedupe=`${mapped.language}\u0000${mapped.normalized}`;
        if(seen.has(dedupe)) continue;
        allBackfill.push({
          score:score(`${seed}|backfill`,`${stratum.id}|${stratum.key(row)}`),
          mapped,
          dedupe,
        });
      }
    }
    allBackfill.sort((a,b)=>a.score.localeCompare(b.score));
    for(const item of allBackfill){
      if(sampled.length>=requestedSize) break;
      seen.add(item.dedupe);
      sampled.push(item.mapped);
    }
  }

  if(sampled.length!==requestedSize){
    throw new Error(
      `Unable to build requested ${requestedSize}-case unresolved sample; selected ${sampled.length} unique cases.`
    );
  }

  const cases=sampled
    .map((row,index)=>({
      case_id:`oov-${String(index+1).padStart(4,'0')}`,
      ...row,
    }));

  const productSentinels=[
    'Vulkanschnecken','Glutamat','Winterwolf','Holladio','Dragonspawn','Ironworm','Baladur',
  ].map((surface,index)=>({
    sentinel_id:`sentinel-${String(index+1).padStart(2,'0')}`,
    surface,
    languages:['de','en'],
  }));

  const evidence={
    schema:OOV_SAMPLE_SCHEMA,
    policy:OOV_SAMPLE_POLICY,
    seed,
    requested_size:requestedSize,
    actual_size:cases.length,
    unique_language_normalized:seen.size,
    databases:{
      phrase:{
        path:phraseDbPath,
        schema:meta(phraseDb,'schema'),
        catalog_fingerprint:meta(phraseDb,'catalog_fingerprint'),
        pronunciation_fingerprint:meta(phraseDb,'phrase_pronunciation_fingerprint'),
      },
      entity:{
        path:entityDbPath,
        schema:meta(entityDb,'schema'),
        de_runtime_fingerprint:meta(entityDb,'entity_phonetic_runtime_fingerprint'),
        en_runtime_fingerprint:meta(entityDb,'entity_phonetic_runtime_fingerprint_en'),
      },
    },
    strata:stratumReports,
    product_sentinels:productSentinels,
    cases,
  };
  const semanticFingerprint=createHash('sha256')
    .update(JSON.stringify(evidence))
    .digest('hex');
  const report={...evidence,semantic_fingerprint:semanticFingerprint};

  await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');
  const header=[
    'case_id','source_stratum','language','surface','normalized','source_id','context_json',
  ];
  const lines=[
    header.join('\t'),
    ...cases.map((row)=>[
      row.case_id,row.source_stratum,row.language,row.surface,row.normalized,row.source_id,
      JSON.stringify(row.context||{}),
    ].map((value)=>String(value??'').replace(/[\t\r\n]/gu,' ')).join('\t')),
  ];
  await writeFile(tsvPath,lines.join('\n')+'\n','utf8');

  console.log(JSON.stringify({
    schema:report.schema,
    requested_size:requestedSize,
    actual_size:cases.length,
    strata:stratumReports,
    product_sentinels:productSentinels,
    semantic_fingerprint:semanticFingerprint,
    report:outPath,
    tsv:tsvPath,
  },null,2));
}finally{
  entityDb.close();
  phraseDb.close();
}
