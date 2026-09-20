#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createGunzip, gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import {
  cleanIpa,
  mergeOptions,
  normalizeGerman,
  optionsForHeadword,
  optionsForListedForms,
} from './kaikki-resolver-lib.mjs';
import { analyzeGermanIpa } from './german-ipa.mjs';
import { coarseCodaClass } from './german-rhyme-features.mjs';
import {
  determineEnglishPublishEligibility,
  finalizeEsdbEvidence,
  isEnglishPublishSurface,
  lexicalEvidenceForHeadword,
  lexicalEvidenceForListedForms,
  mergeEsdbEvidence,
} from './en-publish-core.mjs';
import {
  decodeMsgpack,
  normalizeEnglishSurface,
  parseEsdbLine,
  parseWordfreqCBpack,
  readJson,
} from './en-writer-source-core.mjs';
import { analyzeEnglishPronunciation } from './english-phonology.mjs';
import { englishCoarseCodaClass } from './en-writer-db-core.mjs';
import { materializePhrasePronunciations } from './phrase-pronunciation-core.mjs';
import {
  materializePhraseMosaicWindows,
} from './phrase-mosaic-window-core.mjs';
import {
  materializePhraseMosaicRetrievalAnchors,
} from './phrase-mosaic-retrieval-core.mjs';
import {
  materializePhraseMosaicRetrievalV2Anchors,
} from './phrase-mosaic-retrieval-v2-core.mjs';
import {
  analyzeEntityPronunciation,
  entityRetrievalAnchors,
} from './entity-pronunciation-core.mjs';
import {
  GENERATED_BASE_PARITY_POLICY,
  GENERATED_BASE_PARITY_SCHEMA,
  assertSameSqliteSchema,
  deferredBucket,
  jsonSortedUnique,
  resolveMaterializationResume,
  sqliteSchemaFingerprint,
} from './pronunciation-base-parity-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}
function intArg(flag,fallback,min=1,max=1_000_000){
  const value=Number.parseInt(String(argValue(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(value)?value:fallback));
}

const workPath=resolve(argValue('--work','data/local/pronunciation-backfill-v2.sqlite'));
const deBasePath=resolve(argValue('--de-base','data/local/rhymelab-v5.sqlite'));
const enBasePath=resolve(argValue('--en-base','data/local/rhymelab-en-v1.sqlite'));
const phraseBasePath=resolve(argValue('--phrase-base','data/local/rhymelab-phrases-v1.sqlite'));
const entityBasePath=resolve(argValue('--entity-base','data/local/rhymelab-entities-v1.sqlite'));
const deOutPath=resolve(argValue('--de-out','data/local/rhymelab-v5-generated-optin.sqlite'));
const enOutPath=resolve(argValue('--en-out','data/local/rhymelab-en-v1-generated-optin.sqlite'));
const phraseOutPath=resolve(argValue('--phrase-out','data/local/rhymelab-phrases-v1-generated-optin.sqlite'));
const entityOutPath=resolve(argValue('--entity-out','data/local/rhymelab-entities-v1-generated-optin.sqlite'));
const reportPath=resolve(argValue('--report','data/local/pronunciation-base-parity-v1-report.json'));
const deferredPath=resolve(argValue('--deferred-tsv','data/local/pronunciation-backfill-v2-deferred.tsv'));
const deUsagePath=resolve(argValue('--de-usage','data/de/usage/de-usage.tsv'));
const deKaikkiPath=resolve(argValue('--de-kaikki','data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz'));
const enRegistryPath=resolve(argValue('--en-registry','sources/en/phase12b-sources-v1.json'));
const enRawDirArg=argValue('--en-raw-dir',null);
const progressEvery=intArg('--progress-every',50000,1000,1_000_000);
const resumePlan=resolveMaterializationResume(argValue('--resume-from','de'));

for(const path of [workPath,deBasePath,enBasePath,phraseBasePath,entityBasePath,deUsagePath,deKaikkiPath,enRegistryPath]){
  if(!existsSync(path))throw new Error('Required input is missing: '+path);
}
for(const path of [deOutPath,enOutPath,phraseOutPath,entityOutPath,reportPath,deferredPath]){
  await mkdir(dirname(path),{recursive:true});
}
const outputByStage=new Map([
  ['de',deOutPath],
  ['en',enOutPath],
  ['phrases',phraseOutPath],
  ['entities',entityOutPath],
]);
for(const stage of resumePlan.rebuild){
  await rm(outputByStage.get(stage),{force:true});
}
console.log(
  '[base-parity] resume-from='+resumePlan.resume_from+
  ' preserve='+(resumePlan.preserve.join(',')||'none')+
  ' rebuild='+resumePlan.rebuild.join(',')
);

const workDb=new DatabaseSync(workPath,{readOnly:true});
workDb.exec('PRAGMA query_only=ON;');
const workMeta=(key)=>workDb.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
const sourceFingerprint=workMeta('source_fingerprint');
if(!sourceFingerprint)throw new Error('Backfill source fingerprint is missing.');

const activeWhere=`
  a.decision='admit'
  AND w.final_status='resolved'
  AND w.final_method='espeak_ng'
  AND w.quality_tier IN ('A','B')
`;
const activeCount=Number(workDb.prepare(`
  SELECT COUNT(*) AS c FROM work_item w JOIN admission a USING(item_id)
  WHERE ${activeWhere}
`).get()?.c||0);
if(activeCount!==3_365_814){
  console.warn('[base-parity] active eSpeak A/B count='+activeCount.toLocaleString('en-US')+' (owner snapshot was 3,365,814)');
}

const deTargetSql=`
  SELECT w.*,
    EXISTS(
      SELECT 1 FROM source_ref sr
      WHERE sr.item_id=w.item_id AND sr.scope='phrase_unresolved_token'
    ) AS phrase_token
  FROM work_item w
  JOIN admission a USING(item_id)
  WHERE ${activeWhere}
    AND w.language='de'
    AND EXISTS(
      SELECT 1 FROM source_ref sr
      WHERE sr.item_id=w.item_id
        AND sr.scope IN (
          'de_usage_source_minus_accepted',
          'de_wiktionary_headword_source_minus_accepted',
          'de_listed_form_source_minus_accepted',
          'phrase_unresolved_token'
        )
    )
  ORDER BY w.item_id
`;
const enTargetSql=`
  SELECT w.*
  FROM work_item w
  JOIN admission a USING(item_id)
  WHERE ${activeWhere}
    AND w.language='en'
    AND EXISTS(
      SELECT 1 FROM source_ref sr
      WHERE sr.item_id=w.item_id
        AND sr.scope='en_wiktionary_lexical_source_minus_accepted'
    )
  ORDER BY w.item_id
`;
const deferredRows=[];
for(const row of workDb.prepare(`
  SELECT w.* FROM work_item w JOIN admission a USING(item_id)
  WHERE a.decision='admit'
    AND NOT (
      w.final_status='resolved'
      AND w.final_method='espeak_ng'
      AND w.quality_tier IN ('A','B')
    )
  ORDER BY w.item_id
`).iterate()){
  const bucket=deferredBucket(row);
  if(bucket)deferredRows.push({...row,bucket});
}

function tsvCell(value){
  return String(value??'').replaceAll('\t',' ').replaceAll('\r',' ').replaceAll('\n',' ');
}
await writeFile(
  deferredPath,
  [
    ['item_id','language','surface','normalized','bucket','quality_tier','final_method','client_status','last_error']
      .join('\t'),
    ...deferredRows.map((row)=>[
      row.item_id,row.language,row.surface,row.normalized,row.bucket,row.quality_tier,
      row.final_method,row.client_status,row.last_error,
    ].map(tsvCell).join('\t')),
  ].join('\n')+'\n',
  'utf8',
);

async function cloneBase(input,output){
  await rm(output,{force:true});
  const source=new DatabaseSync(input,{readOnly:true});
  try{
    source.exec("VACUUM INTO '"+output.replaceAll("'","''")+"'");
  }finally{
    source.close();
  }
  const cloned=new DatabaseSync(output,{readOnly:true});
  try{
    const check=cloned.prepare('PRAGMA quick_check').all();
    if(check.length!==1||String(check[0]?.quick_check||'').toLowerCase()!=='ok'){
      throw new Error('SQLite clone quick_check failed for '+output+': '+JSON.stringify(check));
    }
  }finally{
    cloned.close();
  }
}

function parseTsvHeader(line){
  const names=String(line||'').replace(/^\uFEFF/u,'').split('\t');
  return Object.fromEntries(names.map((name,index)=>[name,index]));
}
const jsonSorted=jsonSortedUnique;
function sha(value){return createHash('sha256').update(String(value)).digest('hex')}

function reuseAugmented(label,basePath,augPath){
  if(!existsSync(augPath)){
    throw new Error(
      'Cannot resume past '+label+': expected completed augmented database is missing: '+augPath
    );
  }
  const db=new DatabaseSync(augPath,{readOnly:true});
  try{
    const check=db.prepare('PRAGMA quick_check').all();
    if(check.length!==1||String(check[0]?.quick_check||'').toLowerCase()!=='ok'){
      throw new Error(label+' resume quick_check failed: '+JSON.stringify(check));
    }
  }finally{
    db.close();
  }
  const parity=verifyParity(label,basePath,augPath);
  console.log('[base-parity] reusing completed '+label+' output: '+augPath);
  return {
    resumed:true,
    reused_existing_augmented_db:true,
    exact_schema_match:parity.exact_schema_match,
    schema_fingerprint:parity.schema_fingerprint,
  };
}

async function buildGerman(){
  await cloneBase(deBasePath,deOutPath);
  const db=new DatabaseSync(deOutPath);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  db.exec(`
    CREATE TEMP TABLE generated_de_target(
      item_id INTEGER PRIMARY KEY,
      normalized TEXT NOT NULL UNIQUE,
      surface TEXT NOT NULL,
      ipa TEXT NOT NULL,
      raw_ipa TEXT,
      quality_tier TEXT NOT NULL,
      quality_reason TEXT,
      engine TEXT,
      engine_version TEXT,
      phrase_token INTEGER NOT NULL,
      usage_rank INTEGER,
      usage_score REAL,
      usage_count INTEGER,
      usage_source_count INTEGER
    );
    CREATE TEMP TABLE generated_de_option(
      item_id INTEGER NOT NULL,
      option_json TEXT NOT NULL
    );
    CREATE INDEX temp.idx_generated_de_option_item ON generated_de_option(item_id);
  `);
  const insertTarget=db.prepare(`
    INSERT INTO temp.generated_de_target(
      item_id,normalized,surface,ipa,raw_ipa,quality_tier,quality_reason,engine,engine_version,phrase_token
    ) VALUES(?,?,?,?,?,?,?,?,?,?)
  `);
  let targetCount=0;
  const targetByNormalized=new Map();
  db.exec('BEGIN');
  try{
    for(const row of workDb.prepare(deTargetSql).iterate()){
      insertTarget.run(
        Number(row.item_id),row.normalized,row.surface,row.ipa,row.raw_ipa||null,
        row.quality_tier,row.quality_reason||null,row.engine||null,row.engine_version||null,
        Number(row.phrase_token||0),
      );
      targetByNormalized.set(String(row.normalized),Number(row.item_id));
      targetCount+=1;
    }
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{};throw error}
  console.log('[base-parity:de] targets='+targetCount.toLocaleString('en-US'));

  const updateUsage=db.prepare(`
    UPDATE temp.generated_de_target
    SET usage_rank=?,usage_score=?,usage_count=?,usage_source_count=?
    WHERE item_id=?
  `);
  const usageLines=createInterface({input:createReadStream(deUsagePath),crlfDelay:Infinity});
  let header=null;
  for await(const line of usageLines){
    if(!line)continue;
    if(!header){header=parseTsvHeader(line);continue;}
    const cells=line.split('\t');
    const normalized=String(cells[header.normalized_form]||'');
    const itemId=targetByNormalized.get(normalized);
    if(!itemId)continue;
    updateUsage.run(
      Number.parseInt(cells[header.rank]||'',10),
      header.usage_score===undefined?null:Number(cells[header.usage_score]||0),
      header.combined_count===undefined?null:Number(cells[header.combined_count]||0),
      header.source_count===undefined?null:Number(cells[header.source_count]||0),
      itemId,
    );
  }

  const insertOption=db.prepare('INSERT INTO temp.generated_de_option(item_id,option_json) VALUES(?,?)');
  const source=createReadStream(deKaikkiPath);
  const input=deKaikkiPath.endsWith('.gz')?source.pipe(createGunzip()):source;
  const lines=createInterface({input,crlfDelay:Infinity});
  let raw=0,matchedOptions=0;
  db.exec('BEGIN');
  try{
    for await(const line of lines){
      raw+=1;
      if(!line)continue;
      let entry;try{entry=JSON.parse(line)}catch{continue}
      if(entry?.lang_code!=='de'||!entry?.word)continue;

      const headItemId=targetByNormalized.get(normalizeGerman(entry.word));
      if(headItemId){
        for(const option of optionsForHeadword(entry)){
          insertOption.run(headItemId,JSON.stringify(option));
          matchedOptions+=1;
        }
      }

      const matchedListed=new Set();
      for(const form of Array.isArray(entry.forms)?entry.forms:[]){
        const surface=String(form?.form??'').normalize('NFKC').trim();
        if(!surface)continue;
        const normalized=normalizeGerman(surface);
        if(targetByNormalized.has(normalized))matchedListed.add(normalized);
      }
      if(matchedListed.size){
        for(const listed of optionsForListedForms(entry,matchedListed)){
          const itemId=targetByNormalized.get(listed.candidateNormalized);
          if(!itemId)continue;
          insertOption.run(itemId,JSON.stringify(listed.option));
          matchedOptions+=1;
        }
      }

      if(raw%progressEvery===0){
        db.exec('COMMIT');db.exec('BEGIN');
        console.log('[base-parity:de-source] raw='+raw.toLocaleString('en-US')+' options='+matchedOptions.toLocaleString('en-US'));
      }
    }
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{};throw error}
  finally{lines.close();input.destroy()}

  db.exec(`
    CREATE TEMP TABLE generated_de_current AS
    SELECT
      t.item_id,
      h.publish_order,h.surface AS current_surface,
      h.usage_rank AS current_usage_rank,h.usage_score AS current_usage_score,
      h.usage_count AS current_usage_count,h.usage_source_count AS current_usage_source_count,
      h.lemma AS current_lemma,h.pos AS current_pos,h.gender AS current_gender,
      h.historical AS current_historical,h.lexical_tags AS current_lexical_tags,
      h.lexicon_layer AS current_lexicon_layer,h.entity_kind AS current_entity_kind
    FROM generated_de_target t
    LEFT JOIN hot h ON h.id=(
      SELECT h2.id FROM hot h2
      WHERE h2.normalized=t.normalized
      ORDER BY h2.pronunciation_preferred DESC,h2.pronunciation_eligible DESC,h2.pronunciation_rank,h2.id
      LIMIT 1
    );
    CREATE INDEX temp.idx_generated_de_current_item ON generated_de_current(item_id);
  `);

  const maxOrder=Number(db.prepare('SELECT COALESCE(MAX(publish_order),0) AS v FROM hot').get()?.v||0);
  let nextOrder=maxOrder;
  const insertHot=db.prepare(`
    INSERT INTO hot(
      publish_order,surface,normalized,usage_rank,usage_score,usage_count,usage_source_count,
      lemma,pos,gender,lexicon_layer,entity_kind,historical,lexical_tags,
      ipa,phonemes,syllable_count,stress,primary_stress,rhyme_tail,final_tail,vowels,consonants,
      exact_key,multisyllable_key,vowel_key,vowel_family,coda_key,coda_class,rhyme_syllables,
      pronunciation_rank,pronunciation_preferred,pronunciation_eligible,pronunciation_evidence,
      pronunciation_source_order,pronunciation_source,pronunciation_tags,pronunciation_raw_tags,
      pronunciation_flags,locale,dialect,pronunciation_register
    ) VALUES(${Array(42).fill('?').join(',')})
  `);
  const shiftExisting=db.prepare(`
    UPDATE hot
    SET pronunciation_preferred=0,pronunciation_rank=pronunciation_rank+1
    WHERE publish_order=?
  `);
  const insertAnalysis=db.prepare(`
    INSERT OR IGNORE INTO form_analysis(
      form_id,analysis_key,lemma,normalized_lemma,pos,homograph_no,confidence,gender,
      is_proper,is_obsolete,historical_only,style_tags,form_features,match_kinds,
      source_record_keys,candidate_ipas
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const targetRows=db.prepare(`
    SELECT t.*,c.publish_order,c.current_surface,c.current_usage_rank,c.current_usage_score,
           c.current_usage_count,c.current_usage_source_count,c.current_lemma,c.current_pos,
           c.current_gender,c.current_historical,c.current_lexical_tags,c.current_lexicon_layer,
           c.current_entity_kind
    FROM generated_de_target t
    JOIN generated_de_current c USING(item_id)
    ORDER BY t.item_id
  `);
  const optionIterator=db.prepare(
    'SELECT item_id,option_json FROM temp.generated_de_option ORDER BY item_id'
  ).iterate()[Symbol.iterator]();
  let optionCursor=optionIterator.next();
  function optionsForItem(itemId){
    const values=[];
    while(!optionCursor.done&&Number(optionCursor.value.item_id)<itemId)optionCursor=optionIterator.next();
    while(!optionCursor.done&&Number(optionCursor.value.item_id)===itemId){
      values.push(JSON.parse(optionCursor.value.option_json));
      optionCursor=optionIterator.next();
    }
    return values;
  }

  let inserted=0,overlaid=0,newAnalyses=0,done=0;
  db.exec('BEGIN');
  try{
    for(const row of targetRows.iterate()){
      const merged=mergeOptions(optionsForItem(Number(row.item_id)));
      const preferred=merged[0]||null;
      const historical=merged.length>0&&merged.every((item)=>item.historicalOnly)?1:0;
      const tags=[...new Set(merged.flatMap((item)=>item.styleTags||[]))].sort();
      const current=Number.isInteger(Number(row.publish_order))&&Number(row.publish_order)>0;
      let publishOrder;
      let surface;
      let lemma;
      let pos;
      let gender;
      let lexicalTags;
      let historicalFlag;
      let lexiconLayer;
      let entityKind;
      if(current){
        publishOrder=Number(row.publish_order);
        surface=row.current_surface;
        lemma=row.current_lemma??preferred?.lemma??row.surface;
        pos=row.current_pos??(preferred?.pos&&preferred.pos!=='unknown'?preferred.pos:null);
        gender=row.current_gender??preferred?.gender??null;
        lexicalTags=row.current_lexical_tags||JSON.stringify(tags);
        historicalFlag=Number(row.current_historical||0);
        lexiconLayer=row.current_lexicon_layer||'dictionary';
        entityKind=row.current_entity_kind??null;
        shiftExisting.run(publishOrder);
        overlaid+=1;
      }else{
        publishOrder=++nextOrder;
        surface=row.surface;
        lemma=preferred?.lemma??row.surface;
        pos=preferred?.pos&&preferred.pos!=='unknown'?preferred.pos:null;
        gender=preferred?.gender??null;
        lexicalTags=JSON.stringify(tags);
        historicalFlag=historical;
        lexiconLayer=merged.length?'dictionary':'modern';
        entityKind=merged.length?null:(Number(row.phrase_token)?'phrase_token':'generated_gap');
        inserted+=1;
      }

      const analysis=analyzeGermanIpa(cleanIpa(row.ipa));
      const final=analysis.syllables.at(-1);
      insertHot.run(
        publishOrder,surface,row.normalized,
        row.usage_rank??row.current_usage_rank??null,
        row.usage_score??row.current_usage_score??null,
        row.usage_count??row.current_usage_count??null,
        row.usage_source_count??row.current_usage_source_count??null,
        lemma,pos,gender,lexiconLayer,entityKind,historicalFlag,lexicalTags,
        analysis.ipa,analysis.canonicalPhonemes,analysis.syllableCount,analysis.stressPattern,
        analysis.primaryStressSyllable,analysis.stressedTail,analysis.finalTail,
        analysis.vowelSequence,analysis.consonantSequence,analysis.exactTailKey,
        analysis.multisyllableKey,analysis.vowelKey,analysis.vowelFamilyKey,
        analysis.codaKey||'',coarseCodaClass(final?.coda||[]),analysis.stressedSyllableCount,
        1,1,1,1,999,'eSpeak-NG Backfill V2',
        '[]','[]','["generated","secondary_opt_in"]','de-DE',null,null,
      );

      for(const option of merged){
        const info=insertAnalysis.run(
          publishOrder,option.resolutionKey,option.lemma,option.normalizedLemma,option.pos,
          Number(option.homographNo||1),Number(option.confidence||0),option.gender??null,
          option.isProper?1:0,option.isObsolete?1:0,option.historicalOnly?1:0,
          jsonSorted(option.styleTags,'de'),jsonSorted(option.formFeatures,'de'),
          jsonSorted(option.matchKinds||[option.matchKind],'de'),
          jsonSorted(option.sourceRecordKeys,'de'),jsonSorted(option.candidateIpas,'de'),
        );
        newAnalyses+=Number(info.changes||0);
      }

      done+=1;
      if(done%progressEvery===0){
        db.exec('COMMIT');db.exec('BEGIN');
        console.log('[base-parity:de-write] '+done.toLocaleString('en-US')+'/'+targetCount.toLocaleString('en-US'));
      }
    }
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{};throw error}

  targetByNormalized.clear();
  db.exec('PRAGMA optimize;');
  db.close();

  const writerReport=resolve(dirname(reportPath),'writer-materialization-generated-optin-v5-report.json');
  const child=spawnSync(
    process.execPath,
    ['--no-warnings','scripts/materialize-writer-v5.mjs','--db',deOutPath,'--report',writerReport],
    {stdio:'inherit'},
  );
  if(child.status!==0)throw new Error('Writer-v5 parity materialization failed with exit '+child.status);

  return {
    targets:targetCount,
    inserted,
    overlaid,
    lexical_analyses_added:newAnalyses,
    writer_report:writerReport,
  };
}

function historicalEvidence(evidence){
  const h=evidence?.history||{};
  if(typeof h.historical_only==='boolean')return h.historical_only;
  return Boolean(h.archaic||h.obsolete||h.historical||h.dated);
}

async function buildEnglish(){
  await cloneBase(enBasePath,enOutPath);
  const db=new DatabaseSync(enOutPath);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  db.exec(`
    CREATE TEMP TABLE generated_en_target(
      item_id INTEGER PRIMARY KEY,
      normalized TEXT NOT NULL UNIQUE,
      surface TEXT NOT NULL,
      ipa TEXT NOT NULL,
      raw_ipa TEXT,
      quality_tier TEXT NOT NULL,
      quality_reason TEXT,
      engine TEXT,
      engine_version TEXT,
      wordfreq_rank INTEGER,
      wordfreq_zipf REAL
    );
    CREATE TEMP TABLE generated_en_evidence(
      item_id INTEGER NOT NULL,
      evidence_json TEXT NOT NULL
    );
    CREATE INDEX temp.idx_generated_en_evidence_item ON generated_en_evidence(item_id);
    CREATE TEMP TABLE generated_en_esdb(
      item_id INTEGER NOT NULL,
      evidence_json TEXT NOT NULL
    );
    CREATE INDEX temp.idx_generated_en_esdb_item ON generated_en_esdb(item_id);
  `);
  const insertTarget=db.prepare(`
    INSERT INTO temp.generated_en_target(
      item_id,normalized,surface,ipa,raw_ipa,quality_tier,quality_reason,engine,engine_version
    ) VALUES(?,?,?,?,?,?,?,?,?)
  `);
  const targetByNormalized=new Map();
  let targetCount=0;
  db.exec('BEGIN');
  try{
    for(const row of workDb.prepare(enTargetSql).iterate()){
      insertTarget.run(
        Number(row.item_id),row.normalized,row.surface,row.ipa,row.raw_ipa||null,
        row.quality_tier,row.quality_reason||null,row.engine||null,row.engine_version||null,
      );
      targetByNormalized.set(String(row.normalized),Number(row.item_id));
      targetCount+=1;
    }
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{};throw error}
  console.log('[base-parity:en] targets='+targetCount.toLocaleString('en-US'));

  const registry=await readJson(enRegistryPath);
  const rawDir=resolve(enRawDirArg||registry.local_raw_directory||'data/raw/en/phase12b-20260918');
  const sources=Object.values(registry.sources||[]);
  const sourceByPrefix=(prefix)=>sources.find((source)=>String(source.source_id||'').startsWith(prefix));
  const kaikkiSource=sourceByPrefix('enwiktionary-kaikki');
  const esdbSource=sourceByPrefix('esdb-scowl');
  const wordfreqSource=sourceByPrefix('wordfreq-en');
  if(!kaikkiSource||!esdbSource||!wordfreqSource)throw new Error('English source registry incomplete.');
  const kaikkiPath=resolve(rawDir,kaikkiSource.local_filename);
  const esdbPath=resolve(rawDir,esdbSource.local_filename);
  const wordfreqPath=resolve(rawDir,wordfreqSource.local_filename);

  const insertEvidence=db.prepare('INSERT INTO temp.generated_en_evidence(item_id,evidence_json) VALUES(?,?)');
  const input=createReadStream(kaikkiPath).pipe(createGunzip());
  const lines=createInterface({input,crlfDelay:Infinity});
  let raw=0,matchedEvidence=0;
  db.exec('BEGIN');
  try{
    for await(const line of lines){
      raw+=1;
      if(!line)continue;
      let entry;try{entry=JSON.parse(line)}catch{continue}
      if(entry?.lang_code!=='en')continue;
      const evidences=[
        lexicalEvidenceForHeadword(entry),
        ...lexicalEvidenceForListedForms(entry),
      ].filter(Boolean);
      for(const evidence of evidences){
        const itemId=targetByNormalized.get(evidence.normalized);
        if(!itemId)continue;
        insertEvidence.run(itemId,JSON.stringify(evidence));
        matchedEvidence+=1;
      }
      if(raw%progressEvery===0){
        db.exec('COMMIT');db.exec('BEGIN');
        console.log('[base-parity:en-kaikki] raw='+raw.toLocaleString('en-US')+' evidence='+matchedEvidence.toLocaleString('en-US'));
      }
    }
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{};throw error}
  finally{lines.close();input.destroy()}

  const insertEsdb=db.prepare('INSERT INTO temp.generated_en_esdb(item_id,evidence_json) VALUES(?,?)');
  const esdbLines=createInterface({input:createReadStream(esdbPath),crlfDelay:Infinity});
  db.exec('BEGIN');
  try{
    let parsedRows=0;
    for await(const line of esdbLines){
      const parsed=parseEsdbLine(line);
      if(!parsed)continue;
      parsedRows+=1;
      const seenItems=new Set();
      for(const surface of parsed.forms||[]){
        const normalized=normalizeEnglishSurface(surface);
        const itemId=targetByNormalized.get(normalized);
        if(!itemId||seenItems.has(itemId))continue;
        seenItems.add(itemId);
        insertEsdb.run(itemId,JSON.stringify(parsed));
      }
      if(parsedRows%progressEvery===0){
        db.exec('COMMIT');db.exec('BEGIN');
        console.log('[base-parity:en-esdb] rows='+parsedRows.toLocaleString('en-US'));
      }
    }
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{};throw error}

  const updateWordfreq=db.prepare(`
    UPDATE temp.generated_en_target SET wordfreq_rank=?,wordfreq_zipf=? WHERE item_id=?
  `);
  const decoded=decodeMsgpack(gunzipSync(await readFile(wordfreqPath)));
  const wordRows=parseWordfreqCBpack(decoded);
  const seen=new Set();
  let rank=0;
  for(const item of wordRows){
    const normalized=normalizeEnglishSurface(item.word);
    if(!normalized||!isEnglishPublishSurface(normalized)||seen.has(normalized))continue;
    seen.add(normalized);
    rank+=1;
    const itemId=targetByNormalized.get(normalized);
    if(itemId)updateWordfreq.run(rank,Number(item.zipf),itemId);
  }

  db.exec(`
    CREATE TEMP TABLE generated_en_current AS
    SELECT t.item_id,
           f.id AS current_id,
           f.historical_only AS current_historical_only,
           f.proper_name_only AS current_proper_name_only,
           f.esdb_invalid AS current_esdb_invalid
    FROM generated_en_target t
    LEFT JOIN en_form f ON f.normalized=t.normalized;
    CREATE INDEX temp.idx_generated_en_current_item ON generated_en_current(item_id);
  `);

  const updateExisting=db.prepare(`
    UPDATE en_form
    SET analyzed_en_us=1,default_eligible=?,exclusion_reasons=?
    WHERE id=?
  `);
  const maxId=Number(db.prepare('SELECT COALESCE(MAX(id),0) AS v FROM en_form').get()?.v||0);
  let nextId=maxId;
  const insertForm=db.prepare(`
    INSERT INTO en_form(
      id,surface,normalized,surface_variants,poses,lemmas,relation_kinds,lexical_tags,evidence_kinds,
      current_evidence_count,historical_evidence_count,proper_name_evidence_count,common_lexical_evidence_count,
      historical_only,proper_name_only,analyzed_en_us,default_eligible,exclusion_reasons,
      esdb_min_size,esdb_regions,esdb_pos_classes,esdb_archaic,esdb_uncommon,esdb_invalid,
      wordfreq_rank,wordfreq_zipf
    ) VALUES(${Array(26).fill('?').join(',')})
  `);
  const insertPron=db.prepare(`
    INSERT INTO en_pronunciation(
      form_id,source,notation,raw,locales,locale_us,locale_gb,source_attested_unprofiled,tags,evidence_count,
      analysis_status,phonemes,syllable_count,stress,primary_stress,rhyme_tail,final_tail,exact_key,
      multisyllable_key,vowel_key,vowel_family,coda_key,coda_class,rhyme_syllables,rhotic,default_profile_eligible
    ) VALUES(${Array(26).fill('?').join(',')})
  `);
  const targetRows=db.prepare(`
    SELECT t.*,c.current_id,c.current_historical_only,c.current_proper_name_only,c.current_esdb_invalid
    FROM generated_en_target t
    JOIN generated_en_current c USING(item_id)
    ORDER BY t.item_id
  `);

  const evidenceIterator=db.prepare(
    'SELECT item_id,evidence_json FROM temp.generated_en_evidence ORDER BY item_id'
  ).iterate()[Symbol.iterator]();
  let evidenceCursor=evidenceIterator.next();
  function evidenceForItem(itemId){
    const values=[];
    while(!evidenceCursor.done&&Number(evidenceCursor.value.item_id)<itemId)evidenceCursor=evidenceIterator.next();
    while(!evidenceCursor.done&&Number(evidenceCursor.value.item_id)===itemId){
      values.push(JSON.parse(evidenceCursor.value.evidence_json));
      evidenceCursor=evidenceIterator.next();
    }
    return values;
  }
  const esdbIterator=db.prepare(
    'SELECT item_id,evidence_json FROM temp.generated_en_esdb ORDER BY item_id'
  ).iterate()[Symbol.iterator]();
  let esdbCursor=esdbIterator.next();
  function esdbForItem(itemId){
    const values=[];
    while(!esdbCursor.done&&Number(esdbCursor.value.item_id)<itemId)esdbCursor=esdbIterator.next();
    while(!esdbCursor.done&&Number(esdbCursor.value.item_id)===itemId){
      values.push(JSON.parse(esdbCursor.value.evidence_json));
      esdbCursor=esdbIterator.next();
    }
    return values;
  }

  let inserted=0,overlaid=0,matchedRecords=0,done=0;
  db.exec('BEGIN');
  try{
    for(const row of targetRows.iterate()){
      const evidences=evidenceForItem(Number(row.item_id));
      const record={
        surface:evidences[0]?.surface||row.surface,
        normalized:row.normalized,
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
        esdb:null,
        usage:Number.isInteger(Number(row.wordfreq_rank))
          ?{rank:Number(row.wordfreq_rank),zipf:Number(row.wordfreq_zipf)}
          :null,
        pronunciations:[],
      };
      for(const evidence of evidences){
        record.surface_variants.add(evidence.surface);
        if(evidence.pos&&evidence.pos!=='unknown')record.poses.add(evidence.pos);
        for(const value of evidence.tags||[])record.tags.add(value);
        for(const value of evidence.lemma_candidates||[])record.lemmas.add(value);
        for(const value of evidence.relation_kinds||[])record.relation_kinds.add(value);
        record.evidence_kinds.add(evidence.evidence_kind);
        if(evidence.proper_name)record.proper_name_evidence+=1;
        else record.common_lexical_evidence+=1;
        if(historicalEvidence(evidence))record.lexical_historical_evidence+=1;
        else record.lexical_current_evidence+=1;
      }
      if(evidences.length)matchedRecords+=1;
      if(!record.surface_variants.size)record.surface_variants.add(row.surface);
      for(const parsed of esdbForItem(Number(row.item_id))){
        record.esdb=mergeEsdbEvidence(record.esdb,parsed);
      }
      record.esdb=finalizeEsdbEvidence(record.esdb);

      const analysis=analyzeEnglishPronunciation(cleanIpa(row.ipa),{
        notation:'ipa',locale:'en-US',source:'espeak_ng_generated_secondary',
      });
      record.pronunciations=[{analysis,locales:['en-US']}];

      let formId;
      let defaultEligible;
      if(Number.isInteger(Number(row.current_id))&&Number(row.current_id)>0){
        formId=Number(row.current_id);
        const reasons=[];
        if(Number(row.current_historical_only))reasons.push('historical_only');
        if(Number(row.current_proper_name_only))reasons.push('explicit_proper_name_only');
        if(Number(row.current_esdb_invalid))reasons.push('esdb_invalid_variant');
        defaultEligible=reasons.length===0;
        updateExisting.run(defaultEligible?1:0,JSON.stringify(reasons),formId);
        overlaid+=1;
      }else{
        const eligibility=determineEnglishPublishEligibility(record);
        formId=++nextId;
        defaultEligible=Boolean(eligibility.default_eligible);
        const esdb=record.esdb||{};
        insertForm.run(
          formId,record.surface,row.normalized,
          jsonSorted(record.surface_variants),jsonSorted(record.poses),jsonSorted(record.lemmas),
          jsonSorted(record.relation_kinds),jsonSorted(record.tags),jsonSorted(record.evidence_kinds),
          Number(record.lexical_current_evidence||0),Number(record.lexical_historical_evidence||0),
          Number(record.proper_name_evidence||0),Number(record.common_lexical_evidence||0),
          eligibility.historical_only?1:0,eligibility.proper_name_only?1:0,1,
          defaultEligible?1:0,JSON.stringify(eligibility.exclusion_reasons||[]),
          Number.isInteger(esdb.min_size)?esdb.min_size:null,
          jsonSorted(esdb.regions),jsonSorted(esdb.pos_classes),
          esdb.archaic?1:0,esdb.uncommon?1:0,esdb.invalid?1:0,
          Number.isInteger(record.usage?.rank)?record.usage.rank:null,
          Number.isFinite(record.usage?.zipf)?record.usage.zipf:null,
        );
        inserted+=1;
      }

      const codaClass=englishCoarseCodaClass(analysis.codaKey||'');
      insertPron.run(
        formId,'espeak_ng_generated_secondary','ipa',row.raw_ipa||row.ipa,
        '["en-US"]',1,0,0,'["generated","secondary_opt_in"]',1,
        'ok',analysis.canonicalPhonemes,analysis.syllableCount,analysis.stressPattern,
        analysis.primaryStressSyllable,analysis.stressedTail,analysis.finalTail,analysis.exactTailKey,
        analysis.multisyllableKey||null,analysis.vowelKey,analysis.vowelFamilyKey,
        analysis.codaKey||'',codaClass,analysis.stressedSyllableCount,analysis.rhotic?1:0,
        defaultEligible?1:0,
      );

      done+=1;
      if(done%progressEvery===0){
        db.exec('COMMIT');db.exec('BEGIN');
        console.log('[base-parity:en-write] '+done.toLocaleString('en-US')+'/'+targetCount.toLocaleString('en-US'));
      }
    }
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{};throw error}

  targetByNormalized.clear();
  db.exec('ANALYZE; PRAGMA optimize;');
  db.close();
  return {
    targets:targetCount,
    inserted,
    overlaid,
    source_records_matched:matchedRecords,
  };
}

async function buildPhrases(){
  await cloneBase(phraseBasePath,phraseOutPath);
  const phraseDb=new DatabaseSync(phraseOutPath);
  const writerDb=new DatabaseSync(deOutPath,{readOnly:true});
  phraseDb.exec('PRAGMA foreign_keys=ON;');
  try{
    const pronunciation=materializePhrasePronunciations(phraseDb,writerDb);
    const windows=materializePhraseMosaicWindows(phraseDb);
    const retrieval=materializePhraseMosaicRetrievalAnchors(phraseDb);
    const retrievalV2=materializePhraseMosaicRetrievalV2Anchors(phraseDb);
    const upsert=phraseDb.prepare(`
      INSERT INTO meta(key,value) VALUES(?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `);
    for(const [key,value] of Object.entries({
      phrase_pronunciation_fingerprint:pronunciation.pronunciationFingerprint,
      phrase_mosaic_window_fingerprint:windows.windowFingerprint,
      phrase_mosaic_retrieval_fingerprint:retrieval.anchorFingerprint,
      phrase_mosaic_retrieval_v2_fingerprint:retrievalV2.candidateFingerprint,
    }))if(value!=null)upsert.run(key,String(value));

    const surfaceRefs=workDb.prepare(`
      SELECT sr.item_id,sr.source_key AS phrase_id
      FROM source_ref sr
      JOIN work_item w USING(item_id)
      JOIN admission a USING(item_id)
      WHERE sr.scope='phrase_surface_unresolved'
        AND a.decision='admit'
        AND w.final_status='resolved'
        AND w.final_method='espeak_ng'
        AND w.quality_tier IN ('A','B')
      ORDER BY sr.item_id,sr.source_key
    `).all();
    const eligible=phraseDb.prepare('SELECT 1 AS ok FROM phrase_pronunciation WHERE phrase_id=? AND eligible=1 LIMIT 1');
    const missing=surfaceRefs.filter((row)=>!eligible.get(row.phrase_id));
    if(missing.length){
      const sample=missing.slice(0,20).map((row)=>row.phrase_id).join(', ');
      throw new Error(
        'Phrase base-parity failed: '+missing.length+' generated full-surface phrase rows still cannot be represented by canonical token composition. Sample: '+sample
      );
    }
    phraseDb.exec('ANALYZE; PRAGMA optimize;');
    return {
      source_surface_rows:surfaceRefs.length,
      source_surface_rows_represented_by_canonical_composition:surfaceRefs.length,
      ready_phrases:pronunciation.readyPhrases,
      windows:windows.windows??windows.windowCount??null,
      retrieval_anchors:retrieval.anchorCount??null,
      retrieval_v2_anchors:retrievalV2.anchorCount??null,
    };
  }finally{
    writerDb.close();
    phraseDb.close();
  }
}

async function buildEntities(){
  await cloneBase(entityBasePath,entityOutPath);
  const db=new DatabaseSync(entityOutPath);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  const entityRefSql=`
    SELECT sr.item_id,sr.scope,CAST(sr.source_key AS INTEGER) AS name_id,
           w.language,w.surface,w.ipa,w.raw_ipa,w.quality_tier,w.quality_reason,w.engine,w.engine_version
    FROM source_ref sr
    JOIN work_item w USING(item_id)
    JOIN admission a USING(item_id)
    WHERE sr.scope IN ('entity_de_no_source_pronunciation','entity_en_no_source_pronunciation')
      AND a.decision='admit'
      AND w.final_status='resolved'
      AND w.final_method='espeak_ng'
      AND w.quality_tier IN ('A','B')
    ORDER BY sr.item_id,sr.source_key
  `;
  const entityTargetCount=Number(workDb.prepare(
    'SELECT COUNT(*) AS c FROM ('+entityRefSql+')'
  ).get()?.c||0);
  const refs=workDb.prepare(entityRefSql);
  const name=db.prepare('SELECT name_id,language,surface FROM entity_name WHERE name_id=?');
  const eligibleExisting=db.prepare(`
    SELECT 1 AS ok FROM entity_pronunciation
    WHERE name_id=? AND locale=?
      AND generated=0
      AND review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
    LIMIT 1
  `);
  const preferredExisting=db.prepare('SELECT 1 AS ok FROM entity_pronunciation WHERE name_id=? AND locale=? AND preferred=1 LIMIT 1');
  const insertPron=db.prepare(`
    INSERT INTO entity_pronunciation(
      name_id,locale,pronunciation_role,ipa,preferred,source_kind,source_record,
      generated,model_id,confidence,review_state
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertAnalysis=db.prepare(`
    INSERT OR REPLACE INTO entity_phonetic_analysis(
      pronunciation_id,analyzer_id,phonemes,syllables,syllable_count,
      primary_stress,secondary_stress,stress_pattern,vowel_sequence,
      consonant_sequence,rhyme_tail,rhyme_signature
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertAnchor=db.prepare(`
    INSERT OR IGNORE INTO entity_rhyme_anchor(
      analyzer_id,channel,anchor_key,pronunciation_id
    ) VALUES(?,?,?,?)
  `);
  let inserted=0,skippedSourceBacked=0;
  db.exec('BEGIN');
  try{
    let index=0;
    for(const row of refs.iterate()){
      index+=1;
      const n=name.get(Number(row.name_id));
      if(!n)throw new Error('Entity source reference points to missing name_id='+row.name_id);
      const language=String(row.language);
      const locale=language==='en'?'en-US':'de-DE';
      if(eligibleExisting.get(Number(row.name_id),locale)){
        skippedSourceBacked+=1;
        continue;
      }
      const analyzed=analyzeEntityPronunciation(row.ipa,language);
      const result=insertPron.run(
        Number(row.name_id),locale,locale,row.ipa,
        preferredExisting.get(Number(row.name_id),locale)?0:1,
        'espeak_ng_generated_secondary',
        JSON.stringify({
          policy:GENERATED_BASE_PARITY_POLICY,
          backfill_item_id:Number(row.item_id),
          quality_tier:row.quality_tier,
          quality_reason:row.quality_reason,
          engine:row.engine,
          engine_version:row.engine_version,
        }),
        1,
        row.engine_version?String(row.engine||'espeak-ng')+' '+String(row.engine_version):String(row.engine||'espeak-ng'),
        null,
        'accepted',
      );
      const pronunciationId=Number(result.lastInsertRowid);
      const a=analyzed.row;
      insertAnalysis.run(
        pronunciationId,analyzed.analyzerId,a.phonemes,a.syllables,a.syllableCount,
        a.primaryStress,a.secondaryStress,a.stressPattern,a.vowelSequence,
        a.consonantSequence,a.rhymeTail,a.rhymeSignature,
      );
      for(const anchor of entityRetrievalAnchors(analyzed.analysis,language)){
        insertAnchor.run(analyzed.analyzerId,anchor.channel,anchor.key,pronunciationId);
      }
      inserted+=1;
      if(index%progressEvery===0){
        db.exec('COMMIT');db.exec('BEGIN');
        console.log('[base-parity:entity] '+index.toLocaleString('en-US')+'/'+entityTargetCount.toLocaleString('en-US'));
      }
    }
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{};throw error}
  db.exec('ANALYZE; PRAGMA optimize;');
  db.close();
  return {targets:entityTargetCount,inserted,skipped_source_backed:skippedSourceBacked};
}

function tableCounts(path,tables){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    return Object.fromEntries(tables.map((table)=>[
      table,
      Number(db.prepare('SELECT COUNT(*) AS c FROM '+table).get()?.c||0),
    ]));
  }finally{db.close()}
}

function verifyParity(label,basePath,augPath){
  const base=new DatabaseSync(basePath,{readOnly:true});
  const aug=new DatabaseSync(augPath,{readOnly:true});
  try{
    const fingerprint=assertSameSqliteSchema(base,aug,label);
    return {
      schema_fingerprint:fingerprint,
      base_schema_fingerprint:sqliteSchemaFingerprint(base),
      augmented_schema_fingerprint:sqliteSchemaFingerprint(aug),
      exact_schema_match:true,
    };
  }finally{base.close();aug.close()}
}

const activeDomainCoverage={
  de_word:Number(workDb.prepare(`
    SELECT COUNT(*) AS c FROM work_item w JOIN admission a USING(item_id)
    WHERE ${activeWhere}
      AND EXISTS(
        SELECT 1 FROM source_ref sr WHERE sr.item_id=w.item_id
        AND sr.scope IN (
          'de_usage_source_minus_accepted',
          'de_wiktionary_headword_source_minus_accepted',
          'de_listed_form_source_minus_accepted',
          'phrase_unresolved_token'
        )
      )
  `).get()?.c||0),
  en_word:Number(workDb.prepare(`
    SELECT COUNT(*) AS c FROM work_item w JOIN admission a USING(item_id)
    WHERE ${activeWhere}
      AND EXISTS(
        SELECT 1 FROM source_ref sr WHERE sr.item_id=w.item_id
        AND sr.scope='en_wiktionary_lexical_source_minus_accepted'
      )
  `).get()?.c||0),
  phrase_surface:Number(workDb.prepare(`
    SELECT COUNT(*) AS c FROM work_item w JOIN admission a USING(item_id)
    WHERE ${activeWhere}
      AND EXISTS(
        SELECT 1 FROM source_ref sr WHERE sr.item_id=w.item_id
        AND sr.scope='phrase_surface_unresolved'
      )
  `).get()?.c||0),
  entity:Number(workDb.prepare(`
    SELECT COUNT(*) AS c FROM work_item w JOIN admission a USING(item_id)
    WHERE ${activeWhere}
      AND EXISTS(
        SELECT 1 FROM source_ref sr WHERE sr.item_id=w.item_id
        AND sr.scope IN ('entity_de_no_source_pronunciation','entity_en_no_source_pronunciation')
      )
  `).get()?.c||0),
};
const unclassifiedActive=Number(workDb.prepare(`
  SELECT COUNT(*) AS c FROM work_item w JOIN admission a USING(item_id)
  WHERE ${activeWhere}
    AND NOT EXISTS(
      SELECT 1 FROM source_ref sr
      WHERE sr.item_id=w.item_id
        AND sr.scope IN (
          'de_usage_source_minus_accepted',
          'de_wiktionary_headword_source_minus_accepted',
          'de_listed_form_source_minus_accepted',
          'phrase_unresolved_token',
          'en_wiktionary_lexical_source_minus_accepted',
          'phrase_surface_unresolved',
          'entity_de_no_source_pronunciation',
          'entity_en_no_source_pronunciation'
        )
    )
`).get()?.c||0);
if(unclassifiedActive){
  throw new Error(
    'Base-parity materialization has '+unclassifiedActive+' active eSpeak A/B items with no canonical domain mapping.'
  );
}

const de=resumePlan.rebuild.includes('de')
  ?await buildGerman()
  :reuseAugmented('German Writer',deBasePath,deOutPath);
const en=resumePlan.rebuild.includes('en')
  ?await buildEnglish()
  :reuseAugmented('English Writer',enBasePath,enOutPath);
const phrases=resumePlan.rebuild.includes('phrases')
  ?await buildPhrases()
  :reuseAugmented('Phrase catalog/runtime',phraseBasePath,phraseOutPath);
const entities=resumePlan.rebuild.includes('entities')
  ?await buildEntities()
  :reuseAugmented('Entity catalog/runtime',entityBasePath,entityOutPath);

const parity={
  de:verifyParity('German Writer',deBasePath,deOutPath),
  en:verifyParity('English Writer',enBasePath,enOutPath),
  phrases:verifyParity('Phrase catalog/runtime',phraseBasePath,phraseOutPath),
  entities:verifyParity('Entity catalog/runtime',entityBasePath,entityOutPath),
};

const report={
  schema:GENERATED_BASE_PARITY_SCHEMA,
  policy:GENERATED_BASE_PARITY_POLICY,
  status:'ok',
  resume:{
    requested_stage:resumePlan.resume_from,
    preserved_completed_domains:resumePlan.preserve,
    rebuilt_domains:resumePlan.rebuild,
  },
  source_fingerprint:sourceFingerprint,
  owner_contract:{
    generated_results_class:'second_class',
    default_search_included:false,
    user_opt_in_required:true,
    canonical_databases_mutated:false,
    base_schema_rule:'generated opt-in databases must have exactly the same SQLite schema as their canonical base database',
    extra_etymology_or_sense_tables:false,
  },
  inputs:{
    work:workPath,
    de_base:deBasePath,
    en_base:enBasePath,
    phrase_base:phraseBasePath,
    entity_base:entityBasePath,
  },
  outputs:{
    de:deOutPath,
    en:enOutPath,
    phrases:phraseOutPath,
    entities:entityOutPath,
    deferred_tsv:deferredPath,
  },
  active_espeak_ab:activeCount,
  active_domain_coverage:activeDomainCoverage,
  unclassified_active:unclassifiedActive,
  deferred:{
    total:deferredRows.length,
    by_bucket:Object.fromEntries(
      [...new Set(deferredRows.map((row)=>row.bucket))].sort().map((bucket)=>[
        bucket,deferredRows.filter((row)=>row.bucket===bucket).length,
      ]),
    ),
  },
  materialized:{de,en,phrases,entities},
  parity,
  counts:{
    de_base:tableCounts(deBasePath,['hot','form_analysis','writer_anchor','writer_morphology_evidence']),
    de_augmented:tableCounts(deOutPath,['hot','form_analysis','writer_anchor','writer_morphology_evidence']),
    en_base:tableCounts(enBasePath,['en_form','en_pronunciation']),
    en_augmented:tableCounts(enOutPath,['en_form','en_pronunciation']),
    phrase_base:tableCounts(phraseBasePath,['phrase','phrase_pronunciation','phrase_mosaic_window','phrase_mosaic_retrieval_anchor','phrase_mosaic_retrieval_v2_anchor']),
    phrase_augmented:tableCounts(phraseOutPath,['phrase','phrase_pronunciation','phrase_mosaic_window','phrase_mosaic_retrieval_anchor','phrase_mosaic_retrieval_v2_anchor']),
    entity_base:tableCounts(entityBasePath,['entity','entity_name','entity_pronunciation','entity_phonetic_analysis','entity_rhyme_anchor']),
    entity_augmented:tableCounts(entityOutPath,['entity','entity_name','entity_pronunciation','entity_phonetic_analysis','entity_rhyme_anchor']),
  },
};
report.semantic_fingerprint=sha(JSON.stringify(report));
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({...report,report:reportPath},null,2));
workDb.close();
