#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  BACKFILL_AUDIT_SAMPLE_SCHEMA,
  BACKFILL_AUDIT_SCHEMA,
  allocateEqualQuotas,
  classifySurface,
  stableScore,
} from './pronunciation-backfill-audit-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}
function intArg(flag,fallback,min=1,max=10_000_000){
  const value=Number.parseInt(String(argValue(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(value)?value:fallback));
}
const workPath=resolve(argValue('--work','data/local/pronunciation-backfill-v2.sqlite'));
const outPath=resolve(argValue('--out','data/local/pronunciation-backfill-v2-audit.json'));
const samplePath=resolve(argValue('--sample','data/local/pronunciation-backfill-v2-audit-sample-1000.json'));
const sampleTsvPath=resolve(argValue('--sample-tsv','data/local/pronunciation-backfill-v2-audit-sample-1000.tsv'));
const sampleSize=intArg('--sample-size',1000,100,10000);
const progressEvery=intArg('--progress-every',100000,1000,1000000);
const seed=String(argValue('--seed','pronunciation-backfill-audit-v1'));

if(!existsSync(workPath)) throw new Error('Backfill work database missing: '+workPath);
await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(samplePath),{recursive:true});
await mkdir(dirname(sampleTsvPath),{recursive:true});

const db=new DatabaseSync(workPath,{readOnly:true});
db.exec('PRAGMA query_only=ON;');

function inc(object,key,amount=1){object[key]=(object[key]||0)+amount;}
function pct(n,d){return d?Number((n*100/d).toFixed(2)):0;}
function fingerprint(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function tsv(value){return String(value??'').replace(/[\t\r\n]/gu,' ');}

try{
  const schema=db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value||null;
  const policy=db.prepare("SELECT value FROM meta WHERE key='policy'").get()?.value||null;
  if(schema!=='rhymelab-pronunciation-backfill-v2'){
    throw new Error('Unexpected backfill schema: '+String(schema||'missing'));
  }

  const total=Number(db.prepare('SELECT COUNT(*) AS c FROM work_item').get()?.c||0);
  const byLanguage={};
  const byShape={};
  const byLengthBucket={};
  const byTokenCount={};
  const bySourceRefCount={};
  const languageShape={};
  const examplesByShape={};
  let scanned=0;
  const startedAt=Date.now();

  console.log('[audit] scanning '+total.toLocaleString('en-US')+' unique work items');
  for(const row of db.prepare([
    'SELECT item_id,language,surface,normalized,token_count,source_ref_count',
    'FROM work_item ORDER BY item_id',
  ].join(' ')).iterate()){
    const cls=classifySurface(row.surface,row.token_count);
    inc(byLanguage,row.language);
    inc(byShape,cls.shape);
    inc(byLengthBucket,cls.length_bucket);
    inc(byTokenCount,String(Math.min(Number(row.token_count)||1,10))+(Number(row.token_count)>10?'+':''));
    const refs=Number(row.source_ref_count)||0;
    const refBucket=refs<=1?'1':refs===2?'2':refs<=5?'3-5':refs<=10?'6-10':'11+';
    inc(bySourceRefCount,refBucket);
    languageShape[row.language]??={};
    inc(languageShape[row.language],cls.shape);
    examplesByShape[cls.shape]??=[];
    if(examplesByShape[cls.shape].length<12){
      examplesByShape[cls.shape].push({
        item_id:Number(row.item_id),
        language:row.language,
        surface:row.surface,
        source_ref_count:refs,
      });
    }
    scanned+=1;
    if(scanned%progressEvery===0||scanned===total){
      const elapsed=Math.max(.001,(Date.now()-startedAt)/1000);
      console.log(
        '[audit:items] '+scanned.toLocaleString('en-US')+'/'+total.toLocaleString('en-US')
        +' ('+pct(scanned,total).toFixed(2)+'%) · '+(scanned/elapsed).toFixed(0)+'/s'
      );
    }
  }

  const scopeCounts=Object.fromEntries(
    db.prepare('SELECT scope,COUNT(*) AS c FROM source_ref GROUP BY scope ORDER BY scope')
      .all().map((row)=>[row.scope,Number(row.c)]),
  );
  const scopes=Object.keys(scopeCounts);
  const quotas=allocateEqualQuotas(scopes,sampleSize);
  const reservoirs=new Map(scopes.map((scope)=>[scope,new Map()]));
  const reservoirLimit=new Map(scopes.map((scope)=>[scope,Math.max(quotas.get(scope)*12,200)]));
  const sourceTotal=Object.values(scopeCounts).reduce((sum,value)=>sum+value,0);
  let sourceScanned=0;
  const sourceStarted=Date.now();

  console.log('[audit] building deterministic '+sampleSize+'-case scope-balanced sample from '+sourceTotal.toLocaleString('en-US')+' source refs');
  for(const row of db.prepare([
    'SELECT sr.scope,w.item_id,w.language,w.surface,w.normalized,w.token_count,w.source_ref_count',
    'FROM source_ref sr JOIN work_item w ON w.item_id=sr.item_id',
    'ORDER BY sr.source_ref_id',
  ].join(' ')).iterate()){
    const scope=String(row.scope);
    const reservoir=reservoirs.get(scope);
    if(!reservoir){sourceScanned+=1;continue;}
    const key=String(row.item_id);
    if(!reservoir.has(key)){
      const rank=stableScore(seed,scope+'|'+key);
      const limit=reservoirLimit.get(scope);
      if(reservoir.size<limit){
        reservoir.set(key,{rank,row:{...row}});
      }else{
        let worstKey=null;
        let worstRank='';
        for(const [candidateKey,candidate] of reservoir){
          if(candidate.rank>worstRank){worstRank=candidate.rank;worstKey=candidateKey;}
        }
        if(rank<worstRank){
          reservoir.delete(worstKey);
          reservoir.set(key,{rank,row:{...row}});
        }
      }
    }
    sourceScanned+=1;
    if(sourceScanned%progressEvery===0||sourceScanned===sourceTotal){
      const elapsed=Math.max(.001,(Date.now()-sourceStarted)/1000);
      console.log(
        '[audit:sample] '+sourceScanned.toLocaleString('en-US')+'/'+sourceTotal.toLocaleString('en-US')
        +' ('+pct(sourceScanned,sourceTotal).toFixed(2)+'%) · '+(sourceScanned/elapsed).toFixed(0)+'/s'
      );
    }
  }

  const selected=[];
  const selectedIds=new Set();
  const sampleByScope={};
  for(const scope of scopes){
    const quota=quotas.get(scope);
    const candidates=[...reservoirs.get(scope).values()].sort((a,b)=>a.rank.localeCompare(b.rank));
    let count=0;
    for(const candidate of candidates){
      if(count>=quota) break;
      const id=Number(candidate.row.item_id);
      if(selectedIds.has(id)) continue;
      selectedIds.add(id);
      const cls=classifySurface(candidate.row.surface,candidate.row.token_count);
      selected.push({
        case_id:null,
        sampled_scope:scope,
        item_id:id,
        language:String(candidate.row.language),
        surface:String(candidate.row.surface),
        normalized:String(candidate.row.normalized),
        token_count:Number(candidate.row.token_count)||1,
        source_ref_count:Number(candidate.row.source_ref_count)||0,
        shape:cls.shape,
        length_bucket:cls.length_bucket,
      });
      count+=1;
    }
    sampleByScope[scope]={requested:quota,selected:count,population_refs:scopeCounts[scope]};
  }

  if(selected.length<sampleSize){
    const leftovers=[];
    for(const [scope,reservoir] of reservoirs){
      for(const candidate of reservoir.values()){
        const id=Number(candidate.row.item_id);
        if(selectedIds.has(id)) continue;
        leftovers.push({
          rank:stableScore(seed,'fill|'+scope+'|'+id),
          scope,
          row:candidate.row,
        });
      }
    }
    leftovers.sort((a,b)=>a.rank.localeCompare(b.rank));
    for(const candidate of leftovers){
      if(selected.length>=sampleSize) break;
      const id=Number(candidate.row.item_id);
      if(selectedIds.has(id)) continue;
      selectedIds.add(id);
      const cls=classifySurface(candidate.row.surface,candidate.row.token_count);
      selected.push({
        case_id:null,
        sampled_scope:candidate.scope,
        item_id:id,
        language:String(candidate.row.language),
        surface:String(candidate.row.surface),
        normalized:String(candidate.row.normalized),
        token_count:Number(candidate.row.token_count)||1,
        source_ref_count:Number(candidate.row.source_ref_count)||0,
        shape:cls.shape,
        length_bucket:cls.length_bucket,
      });
    }
  }
  if(selected.length!==sampleSize){
    throw new Error('Unable to construct requested '+sampleSize+' unique benchmark cases; selected '+selected.length);
  }
  selected.sort((a,b)=>a.sampled_scope.localeCompare(b.sampled_scope)||a.item_id-b.item_id);
  selected.forEach((row,index)=>{row.case_id='backfill-'+String(index+1).padStart(4,'0');});

  const audit={
    schema:BACKFILL_AUDIT_SCHEMA,
    policy:'structural-noise-audit-and-scope-balanced-sampling-v1',
    work_database:workPath,
    work_schema:schema,
    work_policy:policy,
    unique_items:total,
    source_refs:sourceTotal,
    by_language:byLanguage,
    by_shape:byShape,
    by_length_bucket:byLengthBucket,
    by_token_count:byTokenCount,
    by_source_ref_count:bySourceRefCount,
    language_shape:languageShape,
    scopes:scopeCounts,
    shape_examples:examplesByShape,
    interpretation:{
      clean_single:'single-token letter-dominant candidate',
      joined_lexeme:'single token containing only lexical hyphen/apostrophe joining',
      multiword:'contains whitespace or multiple resolver tokens',
      mixed_alnum:'contains both letters and digits',
      numeric:'digit-bearing with no letters',
      other_punctuation:'contains punctuation outside lexical hyphen/apostrophe',
      non_latin_letters:'contains non-Latin letters',
      single_character:'one-character lexical candidate',
      nonlexical:'no letters after normalization',
    },
  };
  audit.semantic_fingerprint=fingerprint(audit);

  const sample={
    schema:BACKFILL_AUDIT_SAMPLE_SCHEMA,
    policy:'equal-scope-deterministic-v1',
    seed,
    requested_size:sampleSize,
    actual_size:selected.length,
    source_work_fingerprint:audit.semantic_fingerprint,
    by_scope:sampleByScope,
    cases:selected,
  };
  sample.semantic_fingerprint=fingerprint(sample);

  await writeFile(outPath,JSON.stringify(audit,null,2)+'\n','utf8');
  await writeFile(samplePath,JSON.stringify(sample,null,2)+'\n','utf8');
  const header=['case_id','sampled_scope','item_id','language','surface','normalized','shape','length_bucket','token_count','source_ref_count'];
  await writeFile(sampleTsvPath,[
    header.join('\t'),
    ...selected.map((row)=>header.map((key)=>tsv(row[key])).join('\t')),
  ].join('\n')+'\n','utf8');

  console.log(JSON.stringify({
    schema:audit.schema,
    unique_items:total,
    source_refs:sourceTotal,
    by_language:byLanguage,
    by_shape:byShape,
    scopes:scopeCounts,
    sample_cases:selected.length,
    sample_by_scope:sampleByScope,
    report:outPath,
    sample:samplePath,
    sample_tsv:sampleTsvPath,
    semantic_fingerprint:audit.semantic_fingerprint,
  },null,2));
}finally{
  db.close();
}
