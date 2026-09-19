#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  openEnglishWriterDb,
} from '../src/english-writer-runtime.mjs';
import {
  parseCmudictEntry,
  readJson,
  sha256File,
} from './en-writer-source-core.mjs';
import {
  DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
  prepareEntityEnglishEvidenceStatements,
  resolveEnglishEntityNameCandidate,
} from './entity-english-pronunciation-core.mjs';
import {
  ENTITY_PRONUNCIATION_SOURCE_EXPANSION_POLICY,
  classifyKaikkiProperNamePronunciations,
  cmudictEntityPronunciation,
  collectEntityPronunciationTargets,
  compactExpandedEvidenceRow,
  createEntityPronunciationSourceStorage,
  entityPronunciationLookupUnits,
  insertEntityPronunciationEvidence,
  mobyEntityPronunciation,
  parseMobyPronunciationLine,
  prepareEntityPronunciationSourceInsert,
  prepareExpandedSourceLookup,
} from './entity-pronunciation-source-expansion-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}
function hasFlag(flag){ return args.includes(flag); }

const registryPath=resolve(
  argValue('--registry','sources/entity/entity-pronunciation-expansion-v1.json')
);
const registry=await readJson(registryPath);
const entityDbPath=resolve(
  argValue('--entities','data/local/rhymelab-entities-v1.sqlite')
);
const englishDbPath=resolve(
  argValue('--en-db',DEFAULT_ENGLISH_WRITER_DB_PATH)
);
const markerPath=resolve(
  argValue('--en-marker',DEFAULT_ENGLISH_PRODUCT_MARKER_PATH)
);
const indexPath=resolve(
  argValue('--index','data/work/entity/entity-pronunciation-source-expansion-v1.sqlite')
);
const reportPath=resolve(
  argValue('--out','data/local/entity-pronunciation-source-expansion-v1-report.json')
);
const progressEvery=Math.max(
  10000,
  Number.parseInt(argValue('--progress-every','250000'),10)||250000,
);
const compositionMaxTokens=Math.max(
  DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
  Math.min(12,Number.parseInt(argValue('--composition-max-tokens','8'),10)||8),
);

function firstExisting(candidates){
  for(const candidate of candidates.filter(Boolean)){
    const path=resolve(candidate);
    if(existsSync(path)) return path;
  }
  return null;
}

const englishSourceRegistry=await readJson('sources/en/phase12b-sources-v1.json');
const rawDir=resolve(englishSourceRegistry.local_raw_directory);
const englishSources=Object.fromEntries(
  englishSourceRegistry.sources.map((source)=>[source.source_id,source])
);
const kaikkiSource=englishSources['enwiktionary-kaikki-raw-20260916'];
const cmuSource=englishSources['cmudict-en-us-74790861'];

const kaikkiPath=firstExisting([
  argValue('--kaikki'),
  rawDir&&kaikkiSource?.local_filename
    ?resolve(rawDir,kaikkiSource.local_filename)
    :null,
  'data/raw/en/enwiktionary-kaikki-20260916.jsonl.gz',
  'enwiktionary-kaikki-20260916.jsonl.gz',
]);
const cmudictPath=firstExisting([
  argValue('--cmudict'),
  rawDir&&cmuSource?.local_filename
    ?resolve(rawDir,cmuSource.local_filename)
    :null,
  'data/raw/en/cmudict-74790861.dict',
  'cmudict-74790861.dict',
]);
const mobyPath=firstExisting([
  argValue('--moby'),
  registry?.sources?.moby_pronunciator?.default_local_path,
  'data/raw/entity/mpron.txt',
  'mpron.txt',
]);

if(!kaikkiPath){
  throw new Error(
    'Existing enwiktionary-kaikki-20260916.jsonl.gz not found. '
    +'Use --kaikki <path>; this workflow does not redownload it.'
  );
}
if(!cmudictPath){
  throw new Error(
    'Pinned CMUdict file not found. Use --cmudict <path>.'
  );
}

await mkdir(dirname(indexPath),{recursive:true});
await mkdir(dirname(reportPath),{recursive:true});
await rm(indexPath,{force:true});
await rm(`${indexPath}-wal`,{force:true});
await rm(`${indexPath}-shm`,{force:true});

const entityDb=new DatabaseSync(entityDbPath,{readOnly:true});
entityDb.exec('PRAGMA query_only=ON;');
const englishDb=openEnglishWriterDb(englishDbPath,{
  requireProductAcceptance:true,
  markerPath,
});
const sourceDb=new DatabaseSync(indexPath);
createEntityPronunciationSourceStorage(sourceDb);

function meta(key,value){
  sourceDb.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key,String(value));
}

console.log('\n12C SOURCE EXPANSION: collect English Entity name/token targets…');
const targetRows=entityDb.prepare(`
  SELECT n.surface
  FROM entity_name n
  WHERE n.searchable=1
    AND n.language='en'
  ORDER BY n.name_id
`).iterate();
const targets=collectEntityPronunciationTargets(targetRows);
console.log(JSON.stringify({
  english_names:targets.english_names,
  distinct_names:targets.distinct_names.size,
  distinct_units:targets.distinct_units.size,
  lookup_targets:targets.all_targets.size,
},null,2));

const insertEvidence=prepareEntityPronunciationSourceInsert(sourceDb);
const insertMany=sourceDb.transaction((rows)=>{
  let inserted=0;
  for(const row of rows) inserted+=insertEntityPronunciationEvidence(insertEvidence,row);
  return inserted;
});

const sourceStats={
  kaikki:{
    lines:0,
    english_proper_name_records:0,
    matched_records:0,
    pronunciation_rows_seen:0,
    inserted:0,
    en_us_inserted:0,
    generic_en_inserted:0,
    en_gb_inserted:0,
    parse_errors:0,
  },
  cmudict:{
    rows:0,
    matched_rows:0,
    inserted:0,
  },
  moby:{
    available:Boolean(mobyPath),
    rows:0,
    matched_rows:0,
    inserted:0,
  },
};

console.log('\n12C SOURCE EXPANSION: scan existing raw Kaikki proper-name IPA…');
const kaikkiLines=createInterface({
  input:createReadStream(kaikkiPath).pipe(createGunzip()),
  crlfDelay:Infinity,
});
for await(const line of kaikkiLines){
  sourceStats.kaikki.lines+=1;
  if(!line) continue;
  let record;
  try{ record=JSON.parse(line); }
  catch{
    sourceStats.kaikki.parse_errors+=1;
    continue;
  }
  if(record?.lang_code!=='en') continue;
  const rows=classifyKaikkiProperNamePronunciations(record);
  if(!rows.length) continue;
  sourceStats.kaikki.english_proper_name_records+=1;
  if(!targets.all_targets.has(rows[0].normalized)) continue;
  sourceStats.kaikki.matched_records+=1;
  sourceStats.kaikki.pronunciation_rows_seen+=rows.length;
  const inserted=insertMany(rows);
  sourceStats.kaikki.inserted+=inserted;
  for(const row of rows){
    if(row.locale==='en-US') sourceStats.kaikki.en_us_inserted+=1;
    else if(row.locale==='en') sourceStats.kaikki.generic_en_inserted+=1;
    else if(row.locale==='en-GB') sourceStats.kaikki.en_gb_inserted+=1;
  }
  if(
    progressEvery>0
    &&sourceStats.kaikki.english_proper_name_records%progressEvery===0
  ){
    console.log(
      `  proper-name records ${sourceStats.kaikki.english_proper_name_records.toLocaleString('en-US')} / matched ${sourceStats.kaikki.matched_records.toLocaleString('en-US')}`
    );
  }
}

console.log('\n12C SOURCE EXPANSION: scan full pinned CMUdict directly…');
const cmuLines=createInterface({
  input:createReadStream(cmudictPath),
  crlfDelay:Infinity,
});
for await(const line of cmuLines){
  const entry=parseCmudictEntry(line);
  if(!entry) continue;
  sourceStats.cmudict.rows+=1;
  if(!targets.all_targets.has(entry.normalized)) continue;
  sourceStats.cmudict.matched_rows+=1;
  const row=cmudictEntityPronunciation(entry);
  if(row) sourceStats.cmudict.inserted+=insertMany([row]);
}

if(mobyPath){
  console.log('\n12C SOURCE EXPANSION: scan optional Moby Pronunciator II evidence…');
  const mobyLines=createInterface({
    input:createReadStream(mobyPath),
    crlfDelay:Infinity,
  });
  for await(const line of mobyLines){
    const entry=parseMobyPronunciationLine(line);
    if(!entry) continue;
    sourceStats.moby.rows+=1;
    if(!targets.all_targets.has(entry.normalized)) continue;
    sourceStats.moby.matched_rows+=1;
    const row=mobyEntityPronunciation(entry);
    if(row) sourceStats.moby.inserted+=insertMany([row]);
  }
}else{
  console.log('\n12C SOURCE EXPANSION: Moby file absent; optional source skipped.');
}

sourceDb.exec('ANALYZE;');
meta('schema','rhymelab-entity-pronunciation-source-expansion-v1');
meta('policy',ENTITY_PRONUNCIATION_SOURCE_EXPANSION_POLICY);
meta('kaikki_path',kaikkiPath);
meta('cmudict_path',cmudictPath);
meta('moby_path',mobyPath||'');
meta('composition_max_tokens',compositionMaxTokens);

const sourceCounts=sourceDb.prepare(`
  SELECT
    source_kind,
    COUNT(*) AS rows,
    SUM(runtime_profile_eligible) AS runtime_rows,
    COUNT(DISTINCT normalized) AS surfaces
  FROM pronunciation_evidence
  GROUP BY source_kind
  ORDER BY source_kind
`).all();

function fingerprintIndex(){
  const hash=createHash('sha256');
  for(const row of sourceDb.prepare(`
    SELECT
      normalized,surface,source_kind,locale,notation,raw,tags,
      analysis_status,phonemes,syllable_count,stress,primary_stress,
      rhyme_tail,exact_key,proper_name,runtime_profile_eligible
    FROM pronunciation_evidence
    ORDER BY normalized,source_kind,locale,notation,raw
  `).iterate()){
    hash.update(JSON.stringify(row)).update('\n');
  }
  return hash.digest('hex');
}
const sourceIndexFingerprint=fingerprintIndex();
meta('semantic_fingerprint',sourceIndexFingerprint);

console.log('\n12C SOURCE EXPANSION: audit incremental Entity coverage…');
const acceptedStatements=prepareEntityEnglishEvidenceStatements(englishDb);
const expandedStatements=prepareExpandedSourceLookup(sourceDb);
const baselineTokenCache=new Map();
const unionTokenCache=new Map();
const sourceAnyCache=new Map();

function acceptedExact(normalized){
  return acceptedStatements.pronunciation.get(normalized)||null;
}
function expandedExact(normalized){
  return compactExpandedEvidenceRow(expandedStatements.runtime.get(normalized));
}
function anyExpandedEvidence(normalized){
  if(sourceAnyCache.has(normalized)) return sourceAnyCache.get(normalized);
  const row=compactExpandedEvidenceRow(expandedStatements.any.get(normalized));
  sourceAnyCache.set(normalized,row);
  return row;
}
function unionToken(normalized){
  if(unionTokenCache.has(normalized)) return unionTokenCache.get(normalized);
  const accepted=acceptedExact(normalized);
  const expanded=accepted?null:expandedExact(normalized);
  const value=accepted
    ?{source_kind:accepted.source||'accepted_en_writer',kind:'accepted'}
    :expanded
      ?{source_kind:expanded.source_kind,kind:'expanded'}
      :null;
  unionTokenCache.set(normalized,value);
  return value;
}

const counts={
  names:0,
  preferred_names:0,
  baseline_ready:0,
  baseline_preferred_ready:0,
  expanded_direct_ready:0,
  expanded_preferred_direct_ready:0,
  improved_composition_ready:0,
  improved_preferred_composition_ready:0,
  evidence_only_not_runtime_ready:0,
  unresolved_after_expansion:0,
  preferred_unresolved_after_expansion:0,
};
const incrementalSourceCounts=new Map();
const compositionStrategyCounts=new Map();
const unresolvedReasonCounts=new Map();
const priorityUnresolved=[];

for(const row of entityDb.prepare(`
  SELECT
    n.name_id,n.surface,n.normalized,n.preferred,
    e.qid,e.primary_category,e.popularity_tier,
    e.popularity_percentile,e.popularity_score
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
`).iterate()){
  counts.names+=1;
  const preferred=Boolean(row.preferred);
  if(preferred) counts.preferred_names+=1;

  const baseline=resolveEnglishEntityNameCandidate(row.surface,{
    statements:acceptedStatements,
    tokenCache:baselineTokenCache,
    maxTokens:DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
  });
  if(
    baseline.status==='exact_source_backed'
    ||baseline.status==='bounded_token_composition'
  ){
    counts.baseline_ready+=1;
    if(preferred) counts.baseline_preferred_ready+=1;
    continue;
  }

  const fullNormalized=normalizeSurface(row.surface);
  const direct=expandedExact(fullNormalized);
  if(direct){
    counts.expanded_direct_ready+=1;
    if(preferred) counts.expanded_preferred_direct_ready+=1;
    increment(incrementalSourceCounts,direct.source_kind);
    continue;
  }

  const units=entityPronunciationLookupUnits(row.surface);
  let compositionReady=units.length>0&&units.length<=compositionMaxTokens;
  const compositionSources=new Set();
  if(compositionReady){
    for(const unit of units){
      const resolved=unionToken(unit.normalized);
      if(!resolved){
        compositionReady=false;
        break;
      }
      compositionSources.add(resolved.source_kind);
      increment(compositionStrategyCounts,unit.strategy);
    }
  }
  if(compositionReady){
    counts.improved_composition_ready+=1;
    if(preferred) counts.improved_preferred_composition_ready+=1;
    for(const source of compositionSources) increment(incrementalSourceCounts,source);
    continue;
  }

  const anyEvidence=anyExpandedEvidence(fullNormalized);
  if(anyEvidence) counts.evidence_only_not_runtime_ready+=1;

  counts.unresolved_after_expansion+=1;
  if(preferred) counts.preferred_unresolved_after_expansion+=1;
  const reason=units.length>compositionMaxTokens
    ?'too_many_composition_units'
    :'unresolved_source_units';
  increment(unresolvedReasonCounts,reason);

  if(preferred&&priorityUnresolved.length<30){
    priorityUnresolved.push({
      qid:row.qid,
      surface:row.surface,
      normalized:row.normalized,
      primary_category:row.primary_category,
      popularity_tier:row.popularity_tier,
      popularity_percentile:Number(row.popularity_percentile||0),
      reason,
      units:units.map((unit)=>unit.normalized),
      evidence_only_source:anyEvidence?.source_kind||null,
    });
  }

  if(progressEvery>0&&counts.names%progressEvery===0){
    console.log(
      `  names ${counts.names.toLocaleString('en-US')} / unresolved ${counts.unresolved_after_expansion.toLocaleString('en-US')}`
    );
  }
}

function normalizeSurface(value){
  return String(value??'')
    .normalize('NFKC')
    .replace(/[’ʻʼ]/gu,"'")
    .trim()
    .toLocaleLowerCase('en-US');
}
function increment(map,key,amount=1){
  map.set(key,(map.get(key)||0)+amount);
}
function sortedObject(map){
  return Object.fromEntries(
    [...map.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'en'))
  );
}
function pct(n,d){
  return d?Math.round(n*10000/d)/100:0;
}

const expandedReady=
  counts.baseline_ready
  +counts.expanded_direct_ready
  +counts.improved_composition_ready;
const expandedPreferredReady=
  counts.baseline_preferred_ready
  +counts.expanded_preferred_direct_ready
  +counts.improved_preferred_composition_ready;

const fileInfo=async(path)=>({
  path,
  bytes:(await stat(path)).size,
  sha256:await sha256File(path),
});

const evidence={
  schema:'rhymelab-entity-pronunciation-source-expansion-v1',
  status:'evidence_ready',
  policy:ENTITY_PRONUNCIATION_SOURCE_EXPANSION_POLICY,
  entity_database:entityDbPath,
  english_database:englishDbPath,
  source_index:indexPath,
  source_index_fingerprint:sourceIndexFingerprint,
  inputs:{
    kaikki:await fileInfo(kaikkiPath),
    cmudict:await fileInfo(cmudictPath),
    moby:mobyPath?await fileInfo(mobyPath):null,
  },
  targets:{
    english_names:targets.english_names,
    distinct_names:targets.distinct_names.size,
    distinct_units:targets.distinct_units.size,
    lookup_targets:targets.all_targets.size,
  },
  source_scan:sourceStats,
  source_index_counts:sourceCounts.map((row)=>({
    source_kind:row.source_kind,
    rows:Number(row.rows),
    runtime_rows:Number(row.runtime_rows||0),
    surfaces:Number(row.surfaces),
  })),
  coverage:{
    names:counts.names,
    preferred_names:counts.preferred_names,
    baseline_ready:counts.baseline_ready,
    baseline_ready_pct:pct(counts.baseline_ready,counts.names),
    baseline_preferred_ready:counts.baseline_preferred_ready,
    baseline_preferred_ready_pct:pct(
      counts.baseline_preferred_ready,
      counts.preferred_names,
    ),
    incremental_direct_ready:counts.expanded_direct_ready,
    incremental_preferred_direct_ready:counts.expanded_preferred_direct_ready,
    incremental_improved_composition_ready:counts.improved_composition_ready,
    incremental_preferred_improved_composition_ready:
      counts.improved_preferred_composition_ready,
    expanded_ready:expandedReady,
    expanded_ready_pct:pct(expandedReady,counts.names),
    expanded_preferred_ready:expandedPreferredReady,
    expanded_preferred_ready_pct:pct(
      expandedPreferredReady,
      counts.preferred_names,
    ),
    absolute_ready_gain:expandedReady-counts.baseline_ready,
    preferred_absolute_ready_gain:
      expandedPreferredReady-counts.baseline_preferred_ready,
    evidence_only_not_runtime_ready:counts.evidence_only_not_runtime_ready,
    unresolved_after_expansion:counts.unresolved_after_expansion,
    unresolved_after_expansion_pct:pct(
      counts.unresolved_after_expansion,
      counts.names,
    ),
    preferred_unresolved_after_expansion:
      counts.preferred_unresolved_after_expansion,
  },
  incremental_source_counts:sortedObject(incrementalSourceCounts),
  composition_strategy_counts:sortedObject(compositionStrategyCounts),
  unresolved_reason_counts:sortedObject(unresolvedReasonCounts),
  priority_unresolved_preferred_names:priorityUnresolved,
  g2p_boundary:{
    g2p_executed:false,
    g2p_runtime_promoted:false,
    next_population:
      'unresolved_after_expansion_only',
    benchmark_candidates:[
      'mfa_english_us',
      'deep_phonemizer_en_us',
      'charsiu_multilingual_research_only',
    ],
    rule:
      'Do not G2P the full Entity inventory; benchmark only after source expansion and only against the remaining unresolved population.',
  },
  safeguards:{
    existing_kaikki_reused:true,
    network_downloads:false,
    english_writer_database_mutated:false,
    entity_database_mutated:false,
    source_index_is_sidecar:true,
    generic_wiktionary_en_promoted_to_en_us:false,
    moby_raw_promoted_to_runtime:false,
    generated_g2p_used:false,
  },
};
const semanticFingerprint=createHash('sha256')
  .update(JSON.stringify(evidence))
  .digest('hex');
const report={...evidence,semantic_fingerprint:semanticFingerprint};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');

sourceDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
sourceDb.close();
englishDb.close();
entityDb.close();

console.log('\nPHASE 12C ENTITY PRONUNCIATION SOURCE EXPANSION COMPLETE');
console.log(JSON.stringify({
  status:report.status,
  baseline_ready_pct:report.coverage.baseline_ready_pct,
  expanded_ready_pct:report.coverage.expanded_ready_pct,
  absolute_ready_gain:report.coverage.absolute_ready_gain,
  unresolved_after_expansion:report.coverage.unresolved_after_expansion,
  moby_used:Boolean(mobyPath),
  g2p_executed:false,
  semantic_fingerprint:semanticFingerprint,
  report:reportPath,
},null,2));
