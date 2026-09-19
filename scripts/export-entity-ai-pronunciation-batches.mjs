#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  openEnglishWriterDb,
} from '../src/english-writer-runtime.mjs';
import {
  DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
  prepareEntityEnglishEvidenceStatements,
  resolveEnglishEntityNameCandidate,
} from './entity-english-pronunciation-core.mjs';
import {
  compactExpandedEvidenceRow,
  entityPronunciationLookupUnits,
  prepareExpandedSourceLookup,
} from './entity-pronunciation-source-expansion-core.mjs';
import { normalizeEnglishSurface } from './en-writer-source-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const entityDbPath=resolve(argValue('--entities','data/local/rhymelab-entities-v1.sqlite'));
const englishDbPath=resolve(argValue('--en-db',DEFAULT_ENGLISH_WRITER_DB_PATH));
const markerPath=resolve(argValue('--en-marker',DEFAULT_ENGLISH_PRODUCT_MARKER_PATH));
const sourceIndexPath=resolve(
  argValue('--source-index','data/work/entity/entity-pronunciation-source-expansion-v1.sqlite')
);
const outDir=resolve(
  argValue('--out-dir','data/local/entity-ai-pronunciation-queue-v1')
);
const batchSize=Math.max(1000,Number.parseInt(argValue('--batch-size','10000'),10)||10000);
const compositionMaxTokens=Math.max(
  DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
  Math.min(12,Number.parseInt(argValue('--composition-max-tokens','8'),10)||8),
);
const expectedRaw=argValue('--expect',null);
const expectedCount=expectedRaw==null?null:Number.parseInt(expectedRaw,10);

for(const path of [entityDbPath,englishDbPath,sourceIndexPath]){
  if(!existsSync(path)) throw new Error(`Required local file missing: ${path}`);
}

function tsv(value){
  return String(value??'').replace(/[\t\r\n]+/gu,' ').trim();
}
function pct(n,d){return d?Math.round(n*10000/d)/100:0;}

await rm(outDir,{recursive:true,force:true});
await mkdir(join(outDir,'inputs'),{recursive:true});

const entityDb=new DatabaseSync(entityDbPath,{readOnly:true});
entityDb.exec('PRAGMA query_only=ON;');
const englishDb=openEnglishWriterDb(englishDbPath,{
  requireProductAcceptance:true,
  markerPath,
});
const sourceDb=new DatabaseSync(sourceIndexPath,{readOnly:true});
sourceDb.exec('PRAGMA query_only=ON;');

const acceptedStatements=prepareEntityEnglishEvidenceStatements(englishDb);
const expandedStatements=prepareExpandedSourceLookup(sourceDb);
const baselineTokenCache=new Map();
const unionTokenCache=new Map();

function acceptedExact(normalized){
  return acceptedStatements.pronunciation.get(normalized)||null;
}
function expandedExact(normalized){
  return compactExpandedEvidenceRow(expandedStatements.runtime.get(normalized));
}
function unionToken(normalized){
  if(unionTokenCache.has(normalized)) return unionTokenCache.get(normalized);
  const value=acceptedExact(normalized)||expandedExact(normalized)||null;
  unionTokenCache.set(normalized,value);
  return value;
}

function isResolved(surface){
  const baseline=resolveEnglishEntityNameCandidate(surface,{
    statements:acceptedStatements,
    tokenCache:baselineTokenCache,
    maxTokens:DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
  });
  if(
    baseline.status==='exact_source_backed'
    ||baseline.status==='bounded_token_composition'
  ) return {resolved:true,reason:baseline.status};

  const normalized=normalizeEnglishSurface(surface);
  if(expandedExact(normalized)) return {resolved:true,reason:'expanded_direct'};

  const units=entityPronunciationLookupUnits(surface);
  if(units.length>0&&units.length<=compositionMaxTokens){
    let ready=true;
    for(const unit of units){
      if(!unionToken(unit.normalized)){
        ready=false;
        break;
      }
    }
    if(ready) return {resolved:true,reason:'expanded_composition'};
  }

  return {
    resolved:false,
    reason:units.length>compositionMaxTokens
      ?'too_many_composition_units'
      :'unresolved_source_units',
  };
}

const rows=entityDb.prepare(`
  SELECT
    n.name_id,n.entity_id,n.surface,n.normalized,n.preferred,n.name_kind,
    e.qid,e.primary_category,e.popularity_tier,e.popularity_percentile,e.popularity_score,
    (
      SELECT p.surface
      FROM entity_name p
      WHERE p.entity_id=n.entity_id
        AND p.language='en'
        AND p.preferred=1
      ORDER BY p.name_id
      LIMIT 1
    ) AS preferred_context
  FROM entity_name n
  JOIN entity e USING(entity_id)
  WHERE n.searchable=1
    AND n.language='en'
  ORDER BY
    n.preferred DESC,
    e.popularity_percentile DESC,
    e.popularity_score DESC,
    e.qid,
    n.name_id
`).iterate();

const queueHash=createHash('sha256');
const mappingLines=[
  'id\tname_id\tentity_id\tqid\tsurface\tnormalized\tpreferred\tname_kind\tcontext\tcategory\tpopularity_tier\tpopularity_percentile\treason'
];

let aiId=0;
let scanned=0;
let batchRows=[];
const batches=[];
const reasonCounts=new Map();

async function flushBatch(){
  if(!batchRows.length) return;
  const first=batchRows[0].id;
  const last=batchRows.at(-1).id;
  const batchNo=batches.length+1;
  const filename=
    `batch_${String(batchNo).padStart(4,'0')}_`
    +`${String(first).padStart(7,'0')}-${String(last).padStart(7,'0')}.tsv`;
  const lines=['id\tname\tctx\tcat'];
  for(const row of batchRows){
    lines.push(`${row.id}\t${tsv(row.name)}\t${tsv(row.ctx)}\t${tsv(row.cat)}`);
  }
  await writeFile(join(outDir,'inputs',filename),lines.join('\n')+'\n','utf8');
  batches.push({
    batch:batchNo,
    file:`inputs/${filename}`,
    first_id:first,
    last_id:last,
    rows:batchRows.length,
  });
  batchRows=[];
}

for(const row of rows){
  scanned+=1;
  const state=isResolved(row.surface);
  if(state.resolved) continue;

  aiId+=1;
  reasonCounts.set(state.reason,(reasonCounts.get(state.reason)||0)+1);
  const contextRaw=String(row.preferred_context||'').trim();
  const surface=String(row.surface||'').trim();
  const context=
    contextRaw&&normalizeEnglishSurface(contextRaw)!==normalizeEnglishSurface(surface)
      ?contextRaw
      :'';

  batchRows.push({
    id:aiId,
    name:surface,
    ctx:context,
    cat:String(row.primary_category||''),
  });

  mappingLines.push([
    aiId,
    Number(row.name_id),
    Number(row.entity_id),
    tsv(row.qid),
    tsv(surface),
    tsv(row.normalized),
    Number(row.preferred||0),
    tsv(row.name_kind),
    tsv(contextRaw),
    tsv(row.primary_category),
    tsv(row.popularity_tier),
    Number(row.popularity_percentile||0),
    state.reason,
  ].join('\t'));

  queueHash.update(JSON.stringify({
    id:aiId,
    name_id:Number(row.name_id),
    entity_id:Number(row.entity_id),
    surface,
    context:contextRaw,
    category:String(row.primary_category||''),
    reason:state.reason,
  })).update('\n');

  if(batchRows.length>=batchSize) await flushBatch();
}
await flushBatch();

if(expectedCount!=null&&aiId!==expectedCount){
  throw new Error(
    `Unresolved count mismatch: expected ${expectedCount}, generated ${aiId}. `
    +'Do not start AI annotation until the local source-expansion state is reconciled.'
  );
}

const mappingPath=join(outDir,'AI_ID_MAP_LOCAL_ONLY.tsv');
await writeFile(mappingPath,mappingLines.join('\n')+'\n','utf8');

const manifest={
  schema:'rhymelab-entity-ai-pronunciation-queue-v1',
  generated_from:{
    entities:entityDbPath,
    english_db:englishDbPath,
    source_index:sourceIndexPath,
  },
  ordering:'preferred_desc,popularity_percentile_desc,popularity_score_desc,qid,name_id',
  id_policy:'temporary_sequential_ai_id_1_based_not_runtime_identity',
  batch_size:batchSize,
  scanned_english_names:scanned,
  unresolved_rows:aiId,
  batch_count:batches.length,
  source_backed_rows_skipped:scanned-aiId,
  unresolved_pct:pct(aiId,scanned),
  unresolved_reason_counts:Object.fromEntries(
    [...reasonCounts.entries()].sort((a,b)=>b[1]-a[1])
  ),
  queue_fingerprint:queueHash.digest('hex'),
  upload_policy:{
    upload_only:'inputs/batch_*.tsv',
    never_upload:'AI_ID_MAP_LOCAL_ONLY.tsv',
  },
  input_columns:{
    id:'temporary AI-only integer id',
    name:'surface requiring pronunciation',
    ctx:'preferred English entity label; blank when same as name',
    cat:'primary entity category',
  },
  expected_ai_output_columns:['id','arp','q','f','alt'],
  batches,
};
await writeFile(join(outDir,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n','utf8');

entityDb.close();
englishDb.close();
sourceDb.close();

console.log('\nENTITY AI PRONUNCIATION QUEUE EXPORTED');
console.log(JSON.stringify({
  scanned_english_names:scanned,
  unresolved_rows:aiId,
  batch_size:batchSize,
  batch_count:batches.length,
  final_batch_rows:batches.at(-1)?.rows||0,
  out_dir:outDir,
  mapping:mappingPath,
  queue_fingerprint:manifest.queue_fingerprint,
},null,2));
