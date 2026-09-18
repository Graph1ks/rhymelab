#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createGunzip, gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import {
  decodeMsgpack,
  normalizeEnglishSurface,
  parseEsdbLine,
  parseWordfreqCBpack,
  readJson,
} from './en-writer-source-core.mjs';
import {
  EN_PUBLISH_POLICY,
  EN_PUBLISH_SCHEMA,
  cmudictPronunciationEvidence,
  compactEnglishAnalysis,
  determineEnglishPublishEligibility,
  finalizeEsdbEvidence,
  isEnglishPublishSurface,
  lexicalEvidenceForHeadword,
  lexicalEvidenceForListedForms,
  mergeEsdbEvidence,
  parseCmudictPronunciationLine,
  wiktionaryPronunciationEvidence,
} from './en-publish-core.mjs';
import { analyzeEnglishPronunciation } from './english-phonology.mjs';

const args=process.argv.slice(2);
let registryPath='sources/en/phase12b-sources-v1.json';
let rawDir=null;
let outDir='data/local/en-publish-v1';
let bootstrapReportPath=null;
let shardSize=1000;
let progressEvery=250000;
for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--registry') registryPath=args[++i]||registryPath;
  else if(arg==='--raw-dir') rawDir=args[++i]||rawDir;
  else if(arg==='--out') outDir=args[++i]||outDir;
  else if(arg==='--bootstrap-report') bootstrapReportPath=args[++i]||bootstrapReportPath;
  else if(arg==='--shard-size') shardSize=Math.max(1,Number.parseInt(args[++i]||'',10)||shardSize);
  else if(arg==='--progress-every') progressEvery=Math.max(0,Number.parseInt(args[++i]||'',10)||0);
}

registryPath=resolve(registryPath);
const registry=await readJson(registryPath);
rawDir=resolve(rawDir||registry.local_raw_directory||'data/raw/en/phase12b-20260918');
outDir=resolve(outDir);
bootstrapReportPath=resolve(bootstrapReportPath||registry.bootstrap_report||'data/local/en-source-bootstrap-v1-report.json');

const sources=Object.values(registry.sources||[]);
const sourceByPrefix=(prefix)=>sources.find((source)=>String(source.source_id||'').startsWith(prefix));
const kaikkiSource=sourceByPrefix('enwiktionary-kaikki');
const cmuSource=sourceByPrefix('cmudict-en-us');
const esdbSource=sourceByPrefix('esdb-scowl');
const wordfreqSource=sourceByPrefix('wordfreq-en');
if(!kaikkiSource||!cmuSource||!esdbSource||!wordfreqSource) throw new Error('English source registry is incomplete.');

const sourcePath=(source)=>resolve(rawDir,source.local_filename);
const kaikkiPath=sourcePath(kaikkiSource);
const cmuPath=sourcePath(cmuSource);
const esdbPath=sourcePath(esdbSource);
const wordfreqPath=sourcePath(wordfreqSource);

function sha256(text){return createHash('sha256').update(text).digest('hex');}
function historicalEvidence(evidence){
  const h=evidence?.history||{};
  if(typeof h.historical_only==='boolean') return h.historical_only;
  return Boolean(h.archaic||h.obsolete||h.historical||h.dated);
}
function stringSet(value){return [...value].sort((a,b)=>String(a).localeCompare(String(b),'en'));}

console.log('12B4: load CMUdict exact pronunciation variants…');
const cmudict=new Map();
let cmudictRows=0;
const cmuLines=createInterface({input:createReadStream(cmuPath),crlfDelay:Infinity});
for await(const line of cmuLines){
  const parsed=parseCmudictPronunciationLine(line);
  if(!parsed||!isEnglishPublishSurface(parsed.normalized)) continue;
  cmudictRows+=1;
  let values=cmudict.get(parsed.normalized);
  if(!values){values=[];cmudict.set(parsed.normalized,values);}
  if(!values.some((item)=>item.phones===parsed.phones)) values.push(parsed);
}

console.log('12B4: load ESDB/SCOWL lexical evidence…');
const esdb=new Map();
let esdbParsedRows=0;
const esdbLines=createInterface({input:createReadStream(esdbPath),crlfDelay:Infinity});
for await(const line of esdbLines){
  const parsed=parseEsdbLine(line);
  if(!parsed) continue;
  esdbParsedRows+=1;
  for(const form of parsed.forms||[]){
    const normalized=normalizeEnglishSurface(form);
    if(!isEnglishPublishSurface(normalized)) continue;
    esdb.set(normalized,mergeEsdbEvidence(esdb.get(normalized),parsed));
  }
}

console.log('12B4: load wordfreq ordering evidence…');
const wordfreqDecoded=decodeMsgpack(gunzipSync(await readFile(wordfreqPath)));
const wordfreqRows=parseWordfreqCBpack(wordfreqDecoded);
const wordfreq=new Map();
for(const item of wordfreqRows){
  const normalized=normalizeEnglishSurface(item.word);
  if(!isEnglishPublishSurface(normalized)||wordfreq.has(normalized)) continue;
  wordfreq.set(normalized,{rank:wordfreq.size+1,zipf:item.zipf});
}

const records=new Map();
let englishEntries=0;
let malformedLines=0;
let candidateHeadwordEntries=0;
let listedFormsConsidered=0;
let listedFormsRetained=0;
let wiktionaryPronunciationEvidenceRows=0;
let wiktionaryPronunciationAnalyses=0;
let wiktionaryPronunciationAnalysisFailures=0;

function ensureRecord(evidence){
  let record=records.get(evidence.normalized);
  if(!record){
    record={
      surface:evidence.surface,
      normalized:evidence.normalized,
      surface_variants:new Set(),
      poses:new Set(),
      tags:new Set(),
      lemmas:new Set(),
      relation_kinds:new Set(),
      evidence_kinds:new Set(),
      lexical_current_evidence:0,
      lexical_historical_evidence:0,
      proper_name_evidence:0,
      common_lexical_evidence:0,
      pronunciations:new Map(),
      cmudict_added:false,
      esdb:null,
      usage:null,
    };
    records.set(evidence.normalized,record);
  }
  return record;
}

function addLexicalEvidence(record,evidence){
  record.surface_variants.add(evidence.surface);
  if(evidence.pos&&evidence.pos!=='unknown') record.poses.add(evidence.pos);
  for(const value of evidence.tags||[]) record.tags.add(value);
  for(const value of evidence.lemma_candidates||[]) record.lemmas.add(value);
  for(const value of evidence.relation_kinds||[]) record.relation_kinds.add(value);
  record.evidence_kinds.add(evidence.evidence_kind);
  if(evidence.proper_name) record.proper_name_evidence+=1;
  else record.common_lexical_evidence+=1;
  if(historicalEvidence(evidence)) record.lexical_historical_evidence+=1;
  else record.lexical_current_evidence+=1;
}

function addPronunciationEvidence(record,evidence){
  if(!evidence?.raw) return;
  const key=`${evidence.source}\u0000${evidence.notation}\u0000${evidence.raw}`;
  let item=record.pronunciations.get(key);
  if(!item){
    item={
      source:evidence.source,
      notation:evidence.notation,
      raw:evidence.raw,
      locales:new Set(),
      locale_status:evidence.locale_status,
      tags:new Set(),
      evidence_count:0,
      analysis:null,
      analysis_status:'unresolved',
    };
    record.pronunciations.set(key,item);
  }
  for(const locale of evidence.locales||[]) item.locales.add(locale);
  for(const tag of evidence.tags||[]) item.tags.add(tag);
  item.evidence_count+=1;
  if(item.analysis_status==='unresolved'){
    try{
      const locale=item.locales.size===1?[...item.locales][0]:null;
      const analysis=analyzeEnglishPronunciation(item.raw,{notation:item.notation,locale,source:item.source});
      item.analysis=compactEnglishAnalysis(analysis);
      item.analysis_status='ok';
      if(item.source==='wiktionary') wiktionaryPronunciationAnalyses+=1;
    }catch{
      item.analysis_status='unsupported_or_unparseable';
      if(item.source==='wiktionary') wiktionaryPronunciationAnalysisFailures+=1;
    }
  }
}

function addCmudict(record){
  if(record.cmudict_added) return;
  record.cmudict_added=true;
  for(const parsed of cmudict.get(record.normalized)||[]){
    addPronunciationEvidence(record,cmudictPronunciationEvidence(parsed));
  }
}

console.log('12B4: stream English Wiktionary and materialize pronunciation-backed lexical rows…');
const kaikkiLines=createInterface({input:createReadStream(kaikkiPath).pipe(createGunzip()),crlfDelay:Infinity});
for await(const line of kaikkiLines){
  if(!line) continue;
  let entry;
  try{entry=JSON.parse(line);}catch{malformedLines+=1;continue;}
  if(entry?.lang_code!=='en') continue;
  englishEntries+=1;

  const headEvidence=lexicalEvidenceForHeadword(entry);
  if(headEvidence){
    candidateHeadwordEntries+=1;
    const sounds=(entry.sounds||[]).map(wiktionaryPronunciationEvidence).filter(Boolean);
    const needsRecord=sounds.length>0||cmudict.has(headEvidence.normalized)||records.has(headEvidence.normalized);
    if(needsRecord){
      const record=ensureRecord(headEvidence);
      addLexicalEvidence(record,headEvidence);
      for(const sound of sounds){
        wiktionaryPronunciationEvidenceRows+=1;
        addPronunciationEvidence(record,sound);
      }
    }
  }

  for(const formEvidence of lexicalEvidenceForListedForms(entry)){
    listedFormsConsidered+=1;
    if(!cmudict.has(formEvidence.normalized)&&!records.has(formEvidence.normalized)) continue;
    const record=ensureRecord(formEvidence);
    addLexicalEvidence(record,formEvidence);
    listedFormsRetained+=1;
  }

  if(progressEvery>0&&englishEntries%progressEvery===0){
    console.log(`  English entries ${englishEntries.toLocaleString('en-US')} / publish candidates ${records.size.toLocaleString('en-US')}`);
  }
}

let cmudictPronunciationVariants=0;
for(const record of records.values()){
  addCmudict(record);
  record.esdb=finalizeEsdbEvidence(esdb.get(record.normalized));
  record.usage=wordfreq.get(record.normalized)||null;
  cmudictPronunciationVariants+=[...record.pronunciations.values()].filter((item)=>item.source==='cmudict').length;
}

const finalized=[];
let defaultEligible=0;
let analyzedEnUs=0;
let historicalOnly=0;
let properNames=0;
let esdbMatched=0;
let wordfreqMatched=0;
let pronunciationVariants=0;
let analyzedVariants=0;
let unresolvedPronunciationVariants=0;
let enUsVariants=0;
let enGbVariants=0;
let unprofiledVariants=0;

for(const record of records.values()){
  const pronunciations=[...record.pronunciations.values()].map((item)=>{
    const locales=stringSet(item.locales);
    pronunciationVariants+=1;
    if(item.analysis){analyzedVariants+=1;}else{unresolvedPronunciationVariants+=1;}
    if(locales.includes('en-US')) enUsVariants+=1;
    if(locales.includes('en-GB')) enGbVariants+=1;
    if(!locales.length) unprofiledVariants+=1;
    return {
      source:item.source,
      notation:item.notation,
      raw:item.raw,
      locales,
      locale_status:locales.length?'qualified':'source_attested_unprofiled',
      tags:stringSet(item.tags),
      evidence_count:item.evidence_count,
      analysis_status:item.analysis_status,
      analysis:item.analysis,
    };
  }).sort((a,b)=>{
    const ap=a.locales.includes('en-US')?0:a.locales.includes('en-GB')?1:2;
    const bp=b.locales.includes('en-US')?0:b.locales.includes('en-GB')?1:2;
    return ap-bp||a.source.localeCompare(b.source,'en')||a.raw.localeCompare(b.raw,'en');
  });
  const policyRecord={...record,pronunciations};
  const eligibility=determineEnglishPublishEligibility(policyRecord);
  if(!eligibility.source_backed_publishable) continue;
  if(eligibility.default_eligible) defaultEligible+=1;
  if(eligibility.analyzed_en_us) analyzedEnUs+=1;
  if(eligibility.historical_only) historicalOnly+=1;
  if(eligibility.proper_name_only) properNames+=1;
  if(record.esdb) esdbMatched+=1;
  if(record.usage) wordfreqMatched+=1;

  finalized.push({
    surface:record.surface,
    normalized:record.normalized,
    surface_variants:stringSet(record.surface_variants),
    lexical:{
      poses:stringSet(record.poses),
      lemmas:stringSet(record.lemmas),
      relation_kinds:stringSet(record.relation_kinds),
      tags:stringSet(record.tags),
      evidence_kinds:stringSet(record.evidence_kinds),
      current_evidence_count:record.lexical_current_evidence,
      historical_evidence_count:record.lexical_historical_evidence,
      proper_name_evidence_count:record.proper_name_evidence,
      common_lexical_evidence_count:record.common_lexical_evidence,
      proper_name_only:eligibility.proper_name_only,
    },
    pronunciations,
    esdb:record.esdb,
    usage:record.usage,
    eligibility,
  });
}

finalized.sort((a,b)=>a.normalized.localeCompare(b.normalized,'en')||a.surface.localeCompare(b.surface,'en'));

await rm(outDir,{recursive:true,force:true});
await mkdir(outDir,{recursive:true});
const files=[];
const semanticHash=createHash('sha256');
let normalizedBytes=0;
for(let offset=0;offset<finalized.length;offset+=shardSize){
  const block=finalized.slice(offset,offset+shardSize);
  const lines=block.map((row,index)=>{
    const materialized={publish_order:offset+index+1,...row};
    const json=JSON.stringify(materialized);
    semanticHash.update(json).update('\n');
    return json;
  });
  const data=`${lines.join('\n')}\n`;
  const file=`shard-${String(Math.floor(offset/shardSize)+1).padStart(6,'0')}.jsonl`;
  await writeFile(join(outDir,file),data,'utf8');
  const bytes=Buffer.byteLength(data);
  normalizedBytes+=bytes;
  files.push({
    file,
    items:block.length,
    first_publish_order:offset+1,
    last_publish_order:offset+block.length,
    bytes,
    sha256:sha256(data),
  });
}

let bootstrapReport=null;
try{bootstrapReport=JSON.parse(await readFile(bootstrapReportPath,'utf8'));}catch{}

const manifest={
  schema:EN_PUBLISH_SCHEMA,
  policy:EN_PUBLISH_POLICY,
  generated_at:new Date().toISOString(),
  status:'owner_build_required',
  purpose:'source-backed English lexical/pronunciation publish layer before runtime DB materialization',
  source_registry:registry.id,
  source_snapshots:{
    kaikki:kaikkiSource.source_id,
    cmudict:cmuSource.source_id,
    esdb:esdbSource.source_id,
    wordfreq:wordfreqSource.source_id,
  },
  bootstrap_artifacts:bootstrapReport?.artifacts||null,
  phonology:{
    analyzer:'en-pron-v1-candidate',
    scorer:'en-phon-v1-candidate',
    default_locale:'en-US',
    preserve_en_gb:true,
    unqualified_ipa_policy:'preserve_as_source_attested_unprofiled_not_silently_en_US',
  },
  counts:{
    english_entries_scanned:englishEntries,
    malformed_json_lines:malformedLines,
    candidate_headword_entries:candidateHeadwordEntries,
    listed_forms_considered:listedFormsConsidered,
    listed_forms_retained:listedFormsRetained,
    published_surfaces:finalized.length,
    default_eligible_surfaces:defaultEligible,
    analyzed_en_us_surfaces:analyzedEnUs,
    historical_only_surfaces:historicalOnly,
    explicit_proper_name_only_surfaces:properNames,
    esdb_matched_surfaces:esdbMatched,
    wordfreq_matched_surfaces:wordfreqMatched,
    pronunciation_variants:pronunciationVariants,
    analyzed_pronunciation_variants:analyzedVariants,
    unresolved_pronunciation_variants:unresolvedPronunciationVariants,
    cmudict_pronunciation_variants:cmudictPronunciationVariants,
    wiktionary_pronunciation_evidence_rows:wiktionaryPronunciationEvidenceRows,
    wiktionary_pronunciation_analyses:wiktionaryPronunciationAnalyses,
    wiktionary_pronunciation_analysis_failures:wiktionaryPronunciationAnalysisFailures,
    en_us_variants:enUsVariants,
    en_gb_variants:enGbVariants,
    source_attested_unprofiled_variants:unprofiledVariants,
    cmudict_rows_loaded:cmudictRows,
    esdb_rows_parsed:esdbParsedRows,
    wordfreq_distinct_surfaces:wordfreq.size,
  },
  lexical_cut:{
    requirement:'Wiktionary lexical evidence plus at least one source-backed pronunciation from Wiktionary or exact CMUdict match',
    listed_form_requirement:'listed Wiktionary form retained only when exact CMUdict pronunciation exists or the same normalized surface is already pronunciation-backed as a headword',
    final_writer_row_count_frozen:false,
  },
  eligibility_policy:{
    default_profile:'en-US',
    requires_analyzed_en_us_pronunciation:true,
    excludes_historical_only:true,
    excludes_explicit_proper_name_only_surfaces:true,
    excludes_esdb_invalid_variant:true,
    uncommon_or_esdb_archaic_alone_is_evidence_not_automatic_exclusion:true,
  },
  safeguards:{
    g2p_used:false,
    english_runtime_materialized:false,
    product_en_enabled:false,
    german_runtime_mutated:false,
  },
  shard_size:shardSize,
  shards:files.length,
  normalized_bytes:normalizedBytes,
  semantic_fingerprint:semanticHash.digest('hex'),
  files,
};
await writeFile(join(outDir,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');

console.log('\nPHASE 12B4 ENGLISH PUBLISH LAYER COMPLETE');
console.log(JSON.stringify({
  schema:manifest.schema,
  published_surfaces:finalized.length,
  default_eligible_surfaces:defaultEligible,
  analyzed_en_us_surfaces:analyzedEnUs,
  pronunciation_variants:pronunciationVariants,
  unresolved_pronunciation_variants:unresolvedPronunciationVariants,
  semantic_fingerprint:manifest.semantic_fingerprint,
  output:outDir,
},null,2));
