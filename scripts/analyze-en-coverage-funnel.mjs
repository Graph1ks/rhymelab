#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createGunzip, gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import {
  classifyWiktionaryRecordHistory,
  classifyWiktionaryIpaLocale,
  decodeMsgpack,
  isWriterCandidateSurface,
  normalizeEnglishSurface,
  parseCmudictSurface,
  parseEsdbLine,
  parseWordfreqCBpack,
  readJson,
} from './en-writer-source-core.mjs';
import {
  isEnglishPublishSurface,
  lexicalEvidenceForHeadword,
  lexicalEvidenceForListedForms,
  wiktionaryPronunciationEvidence,
} from './en-publish-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}
const registryPath=resolve(argValue('--registry','sources/en/phase12b-sources-v1.json'));
const registry=await readJson(registryPath);
const rawDir=resolve(argValue('--raw-dir',registry.local_raw_directory||'data/raw/en/phase12b-20260918'));
const publishDir=resolve(argValue('--publish','data/local/en-publish-v1'));
const enDbPath=resolve(argValue('--en-db','data/local/rhymelab-en-v1.sqlite'));
const deDbPath=resolve(argValue('--de-db','data/local/rhymelab-v5.sqlite'));
const sourceDiagnosticsPath=resolve(argValue('--source-diagnostics',registry.diagnostics_report||'data/local/en-source-diagnostics-v1.json'));
const outPath=resolve(argValue('--out','data/local/en-coverage-audit-v1-report.json'));
const candidatesOutPath=resolve(argValue('--candidates-out','data/local/en-coverage-candidates-v1.jsonl'));
const stratifiedOutPath=resolve(argValue('--stratified-out','data/local/en-coverage-stratified-sample-v1.json'));
const previousAudit=await safeJson(outPath);
const sampleLimit=Math.max(10,Math.min(500,Number.parseInt(argValue('--sample-limit','100'),10)||100));
const checkpoints=[1000,5000,10000,25000,50000,100000,150000,250000,500000];

const sourceList=Array.isArray(registry.sources)?registry.sources:Object.values(registry.sources||{});
const byPrefix=(prefix)=>sourceList.find((source)=>String(source.source_id||'').startsWith(prefix));
const kaikki=byPrefix('enwiktionary-kaikki');
const cmu=byPrefix('cmudict-en-us');
const esdbSource=byPrefix('esdb-scowl');
const wordfreqSource=byPrefix('wordfreq-en');
if(!kaikki||!cmu||!esdbSource||!wordfreqSource) throw new Error('English source registry missing Kaikki, CMUdict, ESDB or wordfreq.');
const sourcePath=(source)=>resolve(rawDir,source.local_filename);

function pct(n,d){return d?Number((100*n/d).toFixed(2)):0;}
function percentile(sorted,p){
  if(!sorted.length) return null;
  const i=Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*p)));
  return sorted[i];
}
function addReason(map,key){
  map.set(key,(map.get(key)||0)+1);
}
function reasonDistribution(map){
  return [...map.entries()].map(([reason,count])=>({reason,count}))
    .sort((a,b)=>b.count-a.count||a.reason.localeCompare(b.reason,'en'));
}
function safeJson(path){
  return readFile(path,'utf8').then(JSON.parse).catch(()=>null);
}

console.log('12B6 coverage audit: decode wordfreq universe…');
const wordfreqDecoded=decodeMsgpack(gunzipSync(await readFile(sourcePath(wordfreqSource))));
const wordfreqRows=parseWordfreqCBpack(wordfreqDecoded);
const broadRanked=[];
const broadSeen=new Set();
const ranked=[];
const seen=new Set();
for(const row of wordfreqRows){
  const normalized=normalizeEnglishSurface(row.word);
  if(isWriterCandidateSurface(normalized)&&!broadSeen.has(normalized)){
    broadSeen.add(normalized);
    broadRanked.push({surface:row.word,normalized,zipf:Number.isFinite(row.zipf)?row.zipf:null});
  }
  if(!isEnglishPublishSurface(normalized)||seen.has(normalized)) continue;
  seen.add(normalized);
  ranked.push({
    rank:ranked.length+1,
    surface:row.word,
    normalized,
    zipf:Number.isFinite(row.zipf)?row.zipf:null,
    strict_publish_surface:true,
  });
}
const tracked=new Map(ranked.map((row)=>[row.normalized,{
  ...row,
  lexical_headword:false,
  lexical_listed_form:false,
  wikt_ipa:false,
  wikt_us_ipa:false,
  wikt_gb_ipa:false,
  wikt_unqualified_ipa:false,
  cmudict:false,
  esdb:false,
  esdb_current:false,
  esdb_invalid:false,
  current_lexical_evidence:false,
  historical_lexical_evidence:false,
  proper_name_evidence:false,
  common_lexical_evidence:false,
  relation_kinds:new Set(),
  lemma_candidates:new Set(),
  lexical_tags:new Set(),
  publish:null,
}]));

console.log(`12B6 coverage audit: load ${tracked.size.toLocaleString('en-US')} ranked wordfreq candidate surfaces and published rows…`);
const manifest=JSON.parse(await readFile(join(publishDir,'manifest.json'),'utf8'));
if(manifest.schema!=='rhymelab-en-publish-v1') throw new Error(`Unexpected publish schema: ${manifest.schema}`);

let published=0;
let publishedRanked=0;
let defaultEligible=0;
let defaultRanked=0;
let analyzedAny=0;
let analyzedEnUs=0;
let rankedPronunciationVariants=0;
const publishRanks=[];
const defaultRanks=[];
const publishEligibilityReasons=new Map();
const publishByNormalized=new Map();

for(const fileInfo of manifest.files||[]){
  const text=await readFile(join(publishDir,fileInfo.file),'utf8');
  for(const line of text.split(/\r?\n/u)){
    if(!line) continue;
    const row=JSON.parse(line);
    published+=1;
    publishByNormalized.set(row.normalized,row);
    const rank=Number.isInteger(row.usage?.rank)?row.usage.rank:null;
    if(rank!==null){publishedRanked+=1;publishRanks.push(rank);}
    if(row.eligibility?.default_eligible){
      defaultEligible+=1;
      if(rank!==null){defaultRanked+=1;defaultRanks.push(rank);}
    } else {
      const reasons=row.eligibility?.exclusion_reasons||[];
      if(reasons.length) for(const reason of reasons) addReason(publishEligibilityReasons,String(reason));
      else addReason(publishEligibilityReasons,'non_default_unspecified');
    }
    if((row.pronunciations||[]).some((p)=>p.analysis_status==='ok')) analyzedAny+=1;
    if(row.eligibility?.analyzed_en_us) analyzedEnUs+=1;
    if(rank!==null) rankedPronunciationVariants+=(row.pronunciations||[]).length;
    const meta=tracked.get(row.normalized);
    if(meta) meta.publish=row;
  }
}

console.log('12B6 coverage audit: scan CMUdict exact coverage…');
const cmuLines=createInterface({input:createReadStream(sourcePath(cmu)),crlfDelay:Infinity});
for await(const line of cmuLines){
  const normalized=parseCmudictSurface(line);
  const meta=tracked.get(normalized);
  if(meta) meta.cmudict=true;
}

console.log('12B6 coverage audit: scan ESDB/SCOWL rescue evidence…');
const esdbLines=createInterface({input:createReadStream(sourcePath(esdbSource)),crlfDelay:Infinity});
for await(const line of esdbLines){
  const parsed=parseEsdbLine(line);
  if(!parsed) continue;
  for(const form of parsed.forms||[]){
    const normalized=normalizeEnglishSurface(form);
    const meta=tracked.get(normalized);
    if(!meta) continue;
    meta.esdb=true;
    if(parsed.invalid) meta.esdb_invalid=true;
    if(!parsed.invalid&&!parsed.archaic) meta.esdb_current=true;
  }
}

console.log('12B6 coverage audit: stream Wiktionary once for ranked-word funnel classification…');
let englishEntries=0;
const kaikkiLines=createInterface({input:createReadStream(sourcePath(kaikki)).pipe(createGunzip()),crlfDelay:Infinity});
for await(const line of kaikkiLines){
  if(!line) continue;
  let entry;
  try{entry=JSON.parse(line);}catch{continue;}
  if(entry?.lang_code!=='en') continue;
  englishEntries+=1;

  const head=lexicalEvidenceForHeadword(entry);
  if(head){
    const meta=tracked.get(head.normalized);
    if(meta){
      meta.lexical_headword=true;
      const history=classifyWiktionaryRecordHistory(entry);
      if(history.historical_only) meta.historical_lexical_evidence=true;
      else meta.current_lexical_evidence=true;
      if(head.proper_name) meta.proper_name_evidence=true;
      else meta.common_lexical_evidence=true;
      for(const kind of head.relation_kinds||[]) meta.relation_kinds.add(kind);
      for(const lemma of head.lemma_candidates||[]) meta.lemma_candidates.add(lemma);
      for(const tag of head.tags||[]) meta.lexical_tags.add(String(tag).toLocaleLowerCase('en-US'));
      for(const sound of entry.sounds||[]){
        const evidence=wiktionaryPronunciationEvidence(sound);
        if(!evidence) continue;
        meta.wikt_ipa=true;
        const locale=classifyWiktionaryIpaLocale(sound);
        if(locale.us) meta.wikt_us_ipa=true;
        if(locale.uk) meta.wikt_gb_ipa=true;
        if(locale.unqualified) meta.wikt_unqualified_ipa=true;
      }
    }
  }

  for(const evidence of lexicalEvidenceForListedForms(entry)){
    const meta=tracked.get(evidence.normalized);
    if(!meta) continue;
    meta.lexical_listed_form=true;
    if(evidence.proper_name) meta.proper_name_evidence=true;
    else meta.common_lexical_evidence=true;
    for(const kind of evidence.relation_kinds||[]) meta.relation_kinds.add(kind);
    for(const lemma of evidence.lemma_candidates||[]) meta.lemma_candidates.add(lemma);
    for(const tag of evidence.tags||[]) meta.lexical_tags.add(String(tag).toLocaleLowerCase('en-US'));
  }

  if(englishEntries%500000===0) console.log(`  English entries ${englishEntries.toLocaleString('en-US')}`);
}

function analyzedLemmaCandidates(meta){
  return [...meta.lemma_candidates].filter((lemma)=>publishByNormalized.get(lemma)?.eligibility?.analyzed_en_us);
}

function regularInflectionShape(surface,lemma){
  if(!surface||!lemma||surface===lemma) return null;
  if(surface===`${lemma}s`||surface===`${lemma}'s`) return 's_suffix';
  if(surface===`${lemma}es`) return 'es_suffix';
  if(lemma.endsWith('y')&&surface===`${lemma.slice(0,-1)}ies`) return 'y_to_ies';
  if(surface===`${lemma}ed`) return 'ed_suffix';
  if(lemma.endsWith('e')&&surface===`${lemma}d`) return 'e_to_ed';
  if(lemma.endsWith('y')&&surface===`${lemma.slice(0,-1)}ied`) return 'y_to_ied';
  if(surface===`${lemma}ing`) return 'ing_suffix';
  if(lemma.endsWith('e')&&!lemma.endsWith('ee')&&surface===`${lemma.slice(0,-1)}ing`) return 'drop_e_ing';
  if(lemma.endsWith('ie')&&surface===`${lemma.slice(0,-2)}ying`) return 'ie_to_ying';
  return null;
}

function morphologyRecovery(meta){
  const candidates=[];
  for(const lemma of analyzedLemmaCandidates(meta)){
    const shape=regularInflectionShape(meta.normalized,lemma);
    if(shape) candidates.push({lemma,shape});
  }
  return candidates;
}

function orthographicVariantRecovery(meta){
  if(!meta.relation_kinds.has('alt_of')) return [];
  const surfaceKey=meta.normalized.replace(/[-']/gu,'');
  return analyzedLemmaCandidates(meta)
    .filter((lemma)=>lemma.replace(/[-']/gu,'')===surfaceKey)
    .map((lemma)=>({lemma,kind:'punctuation_only_variant'}));
}

function possessiveRecovery(meta){
  const surface=meta.normalized;
  let base=null;
  if(surface.endsWith("'s")&&surface.length>2) base=surface.slice(0,-2);
  else if(surface.endsWith("s'")&&surface.length>2) base=surface.slice(0,-1);
  if(!base) return [];
  const row=publishByNormalized.get(base);
  if(!row?.eligibility?.analyzed_en_us) return [];
  return [{lemma:base,kind:'possessive_surface'}];
}

function deterministicScore(seed,row){
  return createHash('sha256').update(`${seed}\u0000${row.rank}\u0000${row.normalized}\u0000${row.status}`).digest('hex');
}

function publishedLocaleGap(row){
  const pronunciations=row?.pronunciations||[];
  const analyzed=pronunciations.filter((p)=>p.analysis_status==='ok'&&p.analysis);
  if(!analyzed.length) return 'only_unresolved_or_unparseable';
  const hasGb=analyzed.some((p)=>Array.isArray(p.locales)&&p.locales.includes('en-GB'));
  const hasUnprofiled=analyzed.some((p)=>!Array.isArray(p.locales)||p.locales.length===0);
  if(hasGb&&hasUnprofiled) return 'analyzed_en_gb_and_unprofiled_no_en_us';
  if(hasGb) return 'analyzed_en_gb_no_en_us';
  if(hasUnprofiled) return 'analyzed_unprofiled_no_en_us';
  return 'analyzed_other_non_us';
}

function classify(meta){
  if(meta.publish){
    if(meta.publish.eligibility?.default_eligible) return 'default_eligible';
    const reasons=meta.publish.eligibility?.exclusion_reasons||[];
    if(reasons.includes('no_analyzed_en_us_pronunciation')) return 'published_no_analyzed_en_us_pronunciation';
    if(reasons.includes('historical_only')) return 'published_historical_only';
    if(reasons.includes('explicit_proper_name_only')) return 'published_explicit_proper_name_only';
    if(reasons.includes('esdb_invalid_variant')) return 'published_esdb_invalid';
    return reasons.length?`published_${reasons.join('+')}`:'published_non_default_other';
  }
  if(!meta.strict_publish_surface) return 'not_strict_publish_surface';
  if(!meta.lexical_headword&&!meta.lexical_listed_form){
    if(meta.cmudict&&possessiveRecovery(meta).length) return 'possessive_with_cmudict_and_analyzed_en_us_base';
    if(meta.esdb_current&&meta.cmudict) return 'non_wiktionary_esdb_current_plus_cmudict';
    if(meta.esdb&&meta.cmudict) return 'non_wiktionary_esdb_plus_cmudict';
    if(meta.cmudict) return 'non_wiktionary_cmudict_only';
    if(meta.esdb_current) return 'non_wiktionary_esdb_current_only';
    if(meta.esdb) return 'non_wiktionary_esdb_only';
    return 'not_wiktionary_lexical_candidate';
  }
  if(!meta.wikt_ipa&&!meta.cmudict){
    const ortho=orthographicVariantRecovery(meta);
    if(ortho.length) return 'orthographic_variant_with_analyzed_en_us_lemma';
    const formRelation=meta.relation_kinds.has('form_of')||meta.relation_kinds.has('listed_form_of');
    if(formRelation&&morphologyRecovery(meta).length) return 'regular_inflection_shape_with_analyzed_en_us_lemma';
    if(formRelation&&analyzedLemmaCandidates(meta).length) return 'form_of_with_analyzed_en_us_lemma';
    if(formRelation) return 'form_of_without_analyzed_en_us_lemma';
    return 'no_source_backed_pronunciation';
  }
  return 'unexpected_source_backed_publish_gap';
}

const classified=ranked.map((row)=>{
  const meta=tracked.get(row.normalized);
  return {...meta,status:classify(meta)};
});

function reviewRow(row){
  return {
    rank:row.rank,
    surface:row.surface,
    normalized:row.normalized,
    zipf:row.zipf,
    status:row.status,
    lexical_headword:row.lexical_headword,
    lexical_listed_form:row.lexical_listed_form,
    wiktionary_ipa:row.wikt_ipa,
    wiktionary_us_ipa:row.wikt_us_ipa,
    wiktionary_gb_ipa:row.wikt_gb_ipa,
    wiktionary_unqualified_ipa:row.wikt_unqualified_ipa,
    cmudict:row.cmudict,
    esdb:row.esdb,
    esdb_current:row.esdb_current,
    esdb_invalid:row.esdb_invalid,
    relation_kinds:[...row.relation_kinds].sort(),
    lemma_candidates:[...row.lemma_candidates].sort(),
    analyzed_en_us_lemma_candidates:analyzedLemmaCandidates(row),
    morphology_recovery_candidates:morphologyRecovery(row),
    orthographic_variant_recovery_candidates:orthographicVariantRecovery(row),
    possessive_recovery_candidates:possessiveRecovery(row),
    lexical_tags:[...row.lexical_tags].sort(),
    published_locale_gap:row.status==='published_no_analyzed_en_us_pronunciation'?publishedLocaleGap(row.publish):null,
    publish_exclusion_reasons:row.publish?.eligibility?.exclusion_reasons||[],
  };
}

const checkpointReport=checkpoints.map((topN)=>{
  const slice=classified.slice(0,Math.min(topN,classified.length));
  const reasons=new Map();
  let wiktLexical=0;
  let strictSurface=0;
  let sourcePron=0;
  let publishedCount=0;
  let analyzedUs=0;
  let defaultCount=0;
  const localeGaps=new Map();
  let esdbCmuLexicalRescue=0;
  let morphologyShapeRescue=0;
  let orthographicVariantRescue=0;
  let possessiveRescue=0;
  for(const row of slice){
    addReason(reasons,row.status);
    if(row.lexical_headword||row.lexical_listed_form) wiktLexical+=1;
    if(row.strict_publish_surface) strictSurface+=1;
    if(row.wikt_ipa||row.cmudict) sourcePron+=1;
    if(row.publish) publishedCount+=1;
    if(row.publish?.eligibility?.analyzed_en_us) analyzedUs+=1;
    if(row.publish?.eligibility?.default_eligible) defaultCount+=1;
    if(row.status==='published_no_analyzed_en_us_pronunciation') addReason(localeGaps,publishedLocaleGap(row.publish));
    if(row.status==='non_wiktionary_esdb_current_plus_cmudict'||row.status==='non_wiktionary_esdb_plus_cmudict') esdbCmuLexicalRescue+=1;
    if(row.status==='regular_inflection_shape_with_analyzed_en_us_lemma') morphologyShapeRescue+=1;
    if(row.status==='orthographic_variant_with_analyzed_en_us_lemma') orthographicVariantRescue+=1;
    if(row.status==='possessive_with_cmudict_and_analyzed_en_us_base') possessiveRescue+=1;
  }
  return {
    top_n_requested:topN,
    available_ranked_surfaces:slice.length,
    strict_publish_surface:{count:strictSurface,pct:pct(strictSurface,slice.length)},
    wiktionary_lexical:{count:wiktLexical,pct:pct(wiktLexical,slice.length)},
    source_backed_pronunciation:{count:sourcePron,pct:pct(sourcePron,slice.length)},
    published:{count:publishedCount,pct:pct(publishedCount,slice.length)},
    analyzed_en_us:{count:analyzedUs,pct:pct(analyzedUs,slice.length)},
    default_eligible:{count:defaultCount,pct:pct(defaultCount,slice.length)},
    rescue_opportunities:{
      esdb_plus_cmudict_non_wiktionary:esdbCmuLexicalRescue,
      regular_inflection_shape_with_analyzed_en_us_lemma:morphologyShapeRescue,
      orthographic_variant_with_analyzed_en_us_lemma:orthographicVariantRescue,
      possessive_with_cmudict_and_analyzed_en_us_base:possessiveRescue,
      published_no_en_us_locale_breakdown:reasonDistribution(localeGaps),
    },
    losses:reasonDistribution(reasons).filter((item)=>item.reason!=='default_eligible'),
  };
});

const allReasons=new Map();
for(const row of classified) addReason(allReasons,row.status);
const missingHighFrequency=classified
  .filter((row)=>row.status!=='default_eligible')
  .slice(0,sampleLimit)
  .map(reviewRow);

const byLoss={};
for(const {reason} of reasonDistribution(allReasons)){
  if(reason==='default_eligible') continue;
  byLoss[reason]=classified.filter((row)=>row.status===reason).slice(0,Math.min(30,sampleLimit)).map((row)=>({
    rank:row.rank,surface:row.surface,zipf:row.zipf,
  }));
}


const reviewSeed='phase12b6-stratified-v1';
const rankBands=[
  {label:'1-10k',min:1,max:10000},
  {label:'10k-25k',min:10001,max:25000},
  {label:'25k-50k',min:25001,max:50000},
  {label:'50k-100k',min:50001,max:100000},
  {label:'100k-150k',min:100001,max:150000},
  {label:'150k-250k',min:150001,max:250000},
  {label:'250k-tail',min:250001,max:Number.MAX_SAFE_INTEGER},
];
const reviewStatuses=[
  'not_wiktionary_lexical_candidate',
  'no_source_backed_pronunciation',
  'published_no_analyzed_en_us_pronunciation',
  'regular_inflection_shape_with_analyzed_en_us_lemma',
  'orthographic_variant_with_analyzed_en_us_lemma',
  'possessive_with_cmudict_and_analyzed_en_us_base',
  'non_wiktionary_esdb_current_plus_cmudict',
  'non_wiktionary_cmudict_only',
  'form_of_with_analyzed_en_us_lemma',
  'form_of_without_analyzed_en_us_lemma',
  'published_explicit_proper_name_only',
];
const stratifiedCells=[];
for(const band of rankBands){
  for(const status of reviewStatuses){
    const rows=classified
      .filter((row)=>row.rank>=band.min&&row.rank<=band.max&&row.status===status)
      .map((row)=>({row,score:deterministicScore(`${reviewSeed}|${band.label}|${status}`,row)}))
      .sort((a,b)=>a.score.localeCompare(b.score))
      .slice(0,8)
      .map(({row})=>reviewRow(row));
    if(rows.length) stratifiedCells.push({
      rank_band:band.label,
      status,
      population:classified.filter((row)=>row.rank>=band.min&&row.rank<=band.max&&row.status===status).length,
      sample:rows,
    });
  }
}
const stratifiedSample={
  schema:'rhymelab-en-coverage-stratified-sample-v1',
  seed:reviewSeed,
  source_publish_fingerprint:manifest.semantic_fingerprint,
  sample_per_status_band:8,
  rank_bands:rankBands,
  cells:stratifiedCells,
};

async function sqliteSummary(path,kind){
  try{await access(path);}catch{return {available:false,path};}
  const bytes=(await stat(path)).size;
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    if(kind==='de'){
      const forms=Number(db.prepare('SELECT COUNT(*) AS c FROM hot WHERE pronunciation_preferred=1').get().c);
      const ranked=Number(db.prepare('SELECT COUNT(*) AS c FROM hot WHERE pronunciation_preferred=1 AND usage_rank IS NOT NULL').get().c);
      const pronunciations=Number(db.prepare('SELECT COUNT(*) AS c FROM hot').get().c);
      let anchors=null,morphology=null;
      try{anchors=Number(db.prepare('SELECT COUNT(*) AS c FROM writer_anchor').get().c);}catch{}
      try{morphology=Number(db.prepare('SELECT COUNT(*) AS c FROM writer_morphology_evidence').get().c);}catch{}
      return {
        available:true,path,bytes,mib:Number((bytes/1024/1024).toFixed(2)),
        forms,ranked_forms:ranked,unranked_forms:forms-ranked,ranked_share_pct:pct(ranked,forms),
        pronunciations,writer_anchor_rows:anchors,writer_morphology_evidence_rows:morphology,
      };
    }
    const forms=Number(db.prepare('SELECT COUNT(*) AS c FROM en_form').get().c);
    const rankedForms=Number(db.prepare('SELECT COUNT(*) AS c FROM en_form WHERE wordfreq_rank IS NOT NULL').get().c);
    const defaultForms=Number(db.prepare('SELECT COUNT(*) AS c FROM en_form WHERE default_eligible=1').get().c);
    const defaultRanked=Number(db.prepare('SELECT COUNT(*) AS c FROM en_form WHERE default_eligible=1 AND wordfreq_rank IS NOT NULL').get().c);
    const pronunciations=Number(db.prepare('SELECT COUNT(*) AS c FROM en_pronunciation').get().c);
    return {
      available:true,path,bytes,mib:Number((bytes/1024/1024).toFixed(2)),
      forms,ranked_forms:rankedForms,unranked_forms:forms-rankedForms,ranked_share_pct:pct(rankedForms,forms),
      default_forms:defaultForms,default_ranked_forms:defaultRanked,default_unranked_forms:defaultForms-defaultRanked,
      default_ranked_share_pct:pct(defaultRanked,defaultForms),pronunciations,
    };
  }finally{db.close();}
}

const [deDb,enDb,sourceDiagnostics]=await Promise.all([
  sqliteSummary(deDbPath,'de'),
  sqliteSummary(enDbPath,'en'),
  safeJson(sourceDiagnosticsPath),
]);

function checkpointMap(report){
  return new Map((report?.wordfreq_universe?.checkpoints||[]).map((row)=>[row.top_n_requested,row]));
}
function previousComparison(){
  if(!previousAudit||previousAudit.schema!=='rhymelab-en-coverage-audit-v1') return null;
  const previous=checkpointMap(previousAudit);
  const checkpoint_deltas=checkpointReport.map((row)=>{
    const old=previous.get(row.top_n_requested);
    if(!old) return {top_n:row.top_n_requested,previous_available:false};
    return {
      top_n:row.top_n_requested,
      published_delta:row.published.count-old.published.count,
      analyzed_en_us_delta:row.analyzed_en_us.count-old.analyzed_en_us.count,
      default_eligible_delta:row.default_eligible.count-old.default_eligible.count,
      source_backed_pronunciation_delta:row.source_backed_pronunciation.count-old.source_backed_pronunciation.count,
    };
  });
  return {
    previous_publish_fingerprint:previousAudit.sources?.publish_fingerprint??null,
    current_publish_fingerprint:manifest.semantic_fingerprint,
    fingerprints_changed:(previousAudit.sources?.publish_fingerprint??null)!==manifest.semantic_fingerprint,
    published_surfaces_delta:published-(previousAudit.publish_funnel?.published_surfaces??published),
    default_eligible_surfaces_delta:defaultEligible-(previousAudit.publish_funnel?.default_eligible_surfaces??defaultEligible),
    ranked_published_surfaces_delta:publishedRanked-(previousAudit.publish_funnel?.ranked_published_surfaces??publishedRanked),
    ranked_default_surfaces_delta:defaultRanked-(previousAudit.publish_funnel?.ranked_default_surfaces??defaultRanked),
    checkpoint_deltas,
  };
}

publishRanks.sort((a,b)=>a-b);
defaultRanks.sort((a,b)=>a-b);
const rawKaikkiBytes=(await stat(sourcePath(kaikki))).size;
const report={
  schema:'rhymelab-en-coverage-audit-v1',
  generated_at:new Date().toISOString(),
  purpose:'Quantify the English lexical/pronunciation funnel and compare ranked/unranked runtime scale with the accepted German Writer.',
  sources:{
    publish_schema:manifest.schema,
    publish_fingerprint:manifest.semantic_fingerprint,
    kaikki_gzip_bytes:rawKaikkiBytes,
    source_diagnostics_schema:sourceDiagnostics?.schema||null,
  },
  source_universe:{
    english_entries_scanned:englishEntries,
    broad_writer_candidate_surfaces:sourceDiagnostics?.wiktionary?.single_token_writer_candidate_surfaces??null,
    distinct_headwords:sourceDiagnostics?.wiktionary?.distinct_headwords??null,
    note:'Broad candidate surfaces use the earlier diagnostic policy and are intentionally wider than the strict publish surface policy.',
  },
  publish_funnel:{
    published_surfaces:published,
    published_share_of_broad_candidates_pct:sourceDiagnostics?.wiktionary?.single_token_writer_candidate_surfaces
      ?pct(published,sourceDiagnostics.wiktionary.single_token_writer_candidate_surfaces):null,
    surfaces_with_any_analyzed_pronunciation:analyzedAny,
    surfaces_with_analyzed_en_us:analyzedEnUs,
    default_eligible_surfaces:defaultEligible,
    ranked_published_surfaces:publishedRanked,
    unranked_published_surfaces:published-publishedRanked,
    ranked_published_share_pct:pct(publishedRanked,published),
    ranked_default_surfaces:defaultRanked,
    unranked_default_surfaces:defaultEligible-defaultRanked,
    ranked_default_share_pct:pct(defaultRanked,defaultEligible),
    publish_rank_distribution:{
      min:publishRanks[0]??null,
      median:percentile(publishRanks,0.5),
      p90:percentile(publishRanks,0.9),
      p99:percentile(publishRanks,0.99),
      max:publishRanks.at(-1)??null,
    },
    default_rank_distribution:{
      min:defaultRanks[0]??null,
      median:percentile(defaultRanks,0.5),
      p90:percentile(defaultRanks,0.9),
      p99:percentile(defaultRanks,0.99),
      max:defaultRanks.at(-1)??null,
    },
    non_default_exclusion_reasons:reasonDistribution(publishEligibilityReasons),
  },
  wordfreq_universe:{
    decoded_rows:wordfreqRows.length,
    distinct_single_token_candidate_surfaces:ranked.length,
    broad_distinct_single_token_candidate_surfaces:broadRanked.length,
    strict_publish_surface_candidates:ranked.length,
    excluded_by_strict_surface_policy:broadRanked.length-ranked.length,
    checkpoints:checkpointReport,
    overall_status_distribution:reasonDistribution(allReasons),
    highest_ranked_non_default_or_missing:missingHighFrequency,
    examples_by_loss_reason:byLoss,
  },
  runtime_comparison:{
    german:deDb,
    english:enDb,
    warning:'German v5 contains mature Writer anchor/morphology materializations; English v1 is still a lean candidate DB. File size is not an apples-to-apples lexical coverage metric.',
  },
  comparison_to_previous_audit:previousComparison(),
  review_artifacts:{
    candidates_jsonl:candidatesOutPath,
    stratified_sample_json:stratifiedOutPath,
    stratified_sample_schema:stratifiedSample.schema,
  },
  diagnosis_hints:{
    pronunciation_bottleneck:
      'If top-N Wiktionary lexical coverage is high but source-backed pronunciation/publish coverage drops sharply, pronunciation acquisition/composition is the primary bottleneck.',
    form_composition_bottleneck:
      'Treat regular_inflection_shape_with_analyzed_en_us_lemma as a bounded composition candidate only; arbitrary form_of relations are not pronunciation inheritance because semantic/form relations can be non-phonological.',
    lexical_rescue_bottleneck:
      'non_wiktionary_esdb_current_plus_cmudict is strong independent lexical+pronunciation evidence that can potentially expand publish coverage without G2P.',
    possessive_rescue:
      'Possessive forms with exact CMUdict pronunciation plus an analyzed en-US base are a separate high-confidence surface-recovery class, not generic lexical invention.',
    orthographic_variant_priority:
      'Punctuation-only alt_of recovery must be classified before generic form_of morphology so dont/thats-like surfaces are not mislabeled as ordinary inflection.',
    locale_bottleneck:
      'A large published_no_analyzed_en_us bucket means source pronunciation exists but cannot enter the default en-US profile under current provenance/analyzer rules.',
    lexical_bottleneck:
      'A large not_wiktionary_lexical_candidate bucket among high-frequency words indicates source/normalization/lexical eligibility gaps rather than phonology gaps.',
  },
};

await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(candidatesOutPath),{recursive:true});
await mkdir(dirname(stratifiedOutPath),{recursive:true});
await writeFile(candidatesOutPath,classified.map((row)=>JSON.stringify(reviewRow(row))).join('\n')+'\n');
await writeFile(stratifiedOutPath,JSON.stringify(stratifiedSample,null,2)+'\n');
await writeFile(outPath,JSON.stringify(report,null,2)+'\n');

console.log('\nPHASE 12B6 ENGLISH COVERAGE AUDIT COMPLETE');
console.log(JSON.stringify({
  schema:report.schema,
  broad_writer_candidate_surfaces:report.source_universe.broad_writer_candidate_surfaces,
  published_surfaces:published,
  default_eligible_surfaces:defaultEligible,
  ranked_published_surfaces:publishedRanked,
  unranked_published_surfaces:published-publishedRanked,
  ranked_default_surfaces:defaultRanked,
  unranked_default_surfaces:defaultEligible-defaultRanked,
  wordfreq_candidate_surfaces:ranked.length,
  top_10000:checkpointReport.find((x)=>x.top_n_requested===10000),
  top_50000:checkpointReport.find((x)=>x.top_n_requested===50000),
  top_100000:checkpointReport.find((x)=>x.top_n_requested===100000),
  german_runtime:deDb,
  english_runtime:enDb,
  highest_ranked_missing_examples:missingHighFrequency.slice(0,25),
  comparison_to_previous_audit:report.comparison_to_previous_audit,
  review_artifacts:report.review_artifacts,
  report:outPath,
},null,2));
