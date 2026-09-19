#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ACCEPTED_ENGLISH_DB_FINGERPRINT,
  ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  englishWriterDatabaseState,
  openEnglishWriterDb,
  readEnglishProductAcceptanceMarker,
} from '../src/english-writer-runtime.mjs';
import { getPhonologyProfile } from './phonology-profiles.mjs';
import {
  DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
  ENTITY_ENGLISH_EVIDENCE_POLICY,
  auditEntityEnglishPronunciationEvidence,
} from './entity-english-pronunciation-core.mjs';

export const ACCEPTED_DE_ENTITY_RUNTIME_FINGERPRINT=
  '38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}

const entityDbPath=resolve(argValue('--entities','data/local/rhymelab-entities-v1.sqlite'));
const englishDbPath=resolve(argValue('--en-db',DEFAULT_ENGLISH_WRITER_DB_PATH));
const englishMarkerPath=resolve(
  argValue('--en-marker',DEFAULT_ENGLISH_PRODUCT_MARKER_PATH),
);
const entityOwnerReportPath=resolve(
  argValue('--entity-owner-report','data/local/entity-pronunciation-owner-report.json'),
);
const reportPath=resolve(
  argValue(
    '--out',
    'data/local/entity-multilingual-pronunciation-evidence-v1-report.json',
  ),
);
const maxTokens=Math.max(
  1,
  Math.min(
    12,
    Number(argValue('--max-tokens',DEFAULT_ENTITY_ENGLISH_MAX_TOKENS))
      ||DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
  ),
);

function hashJson(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function runEntityOwner(){
  console.error('');
  console.error('[entity:multilingual:evidence] running consolidated Entity owner source gate');
  const result=spawnSync(
    process.execPath,
    [
      '--no-warnings',
      'scripts/run-entity-pronunciation-owner.mjs',
      '--entities',
      entityDbPath,
      '--report',
      entityOwnerReportPath,
    ],
    {stdio:'inherit'},
  );
  if(result.error) throw result.error;
  if(result.status!==0){
    throw new Error(`Entity pronunciation owner workflow failed with exit code ${result.status}`);
  }
}

function entityRuntimeState(db){
  const keys=[
    'schema',
    'popularity_cut_fingerprint',
    'retained_entities',
    'entity_phonetic_runtime',
    'entity_phonetic_analyzer',
    'entity_phonetic_analyses',
    'entity_rhyme_anchors',
    'entity_phonetic_runtime_fingerprint',
    'entity_wikidata_p898_policy',
    'entity_wikidata_p898_rows',
    'entity_wikidata_p898_runtime_eligible',
  ];
  const placeholders=keys.map(()=>'?').join(',');
  const rows=db.prepare(
    `SELECT key,value FROM meta WHERE key IN (${placeholders}) ORDER BY key`
  ).all(...keys);
  return Object.fromEntries(rows.map((row)=>[row.key,row.value]));
}

await mkdir(dirname(reportPath),{recursive:true});
runEntityOwner();

const [entityOwner,englishMarker]=await Promise.all([
  readFile(entityOwnerReportPath,'utf8').then(JSON.parse),
  Promise.resolve(readEnglishProductAcceptanceMarker(englishMarkerPath)),
]);

const entityDb=new DatabaseSync(entityDbPath,{readOnly:true});
entityDb.exec('PRAGMA query_only=ON;');
const englishDb=openEnglishWriterDb(englishDbPath,{
  requireProductAcceptance:true,
  markerPath:englishMarkerPath,
});

try{
  const entityState=entityRuntimeState(entityDb);
  const englishState=englishWriterDatabaseState(englishDb);
  const englishProfile=getPhonologyProfile('en');
  const englishEvidence=auditEntityEnglishPronunciationEvidence(
    entityDb,
    englishDb,
    {maxTokens},
  );

  const checks=[
    {
      id:'entity_owner_workflow_ok',
      pass:entityOwner?.status==='ok',
    },
    {
      id:'entity_population_fingerprint_preserved',
      pass:entityState.popularity_cut_fingerprint
        ==='337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201',
    },
    {
      id:'entity_retained_population_preserved',
      pass:Number(entityState.retained_entities||0)===1077644,
    },
    {
      id:'de_entity_runtime_fingerprint_invariant',
      pass:entityState.entity_phonetic_runtime_fingerprint
        ===ACCEPTED_DE_ENTITY_RUNTIME_FINGERPRINT,
    },
    {
      id:'p898_materialized_as_evidence_only',
      pass:entityOwner?.wikidata_p898_materialization?.status==='ok'
        &&entityOwner?.wikidata_p898_materialization?.runtime_changed===false
        &&Number(entityOwner?.wikidata_p898_materialization?.runtime_eligible_rows||0)===0,
    },
    {
      id:'accepted_english_product_marker',
      pass:englishMarker.accepted===true,
    },
    {
      id:'accepted_english_database_exact',
      pass:englishState.available===true
        &&englishState.semanticFingerprint===ACCEPTED_ENGLISH_DB_FINGERPRINT
        &&englishState.publishFingerprint===ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
    },
    {
      id:'accepted_english_phonology_profile',
      pass:englishProfile.language==='en'
        &&englishProfile.locale==='en-US'
        &&englishProfile.status==='accepted_product_v1',
    },
    {
      id:'english_entity_inventory_present',
      pass:Number(englishEvidence.counts.names||0)>0
        &&Number(englishEvidence.counts.preferred_names||0)>0,
    },
    {
      id:'english_exact_source_backed_recovery_present',
      pass:Number(englishEvidence.counts.exact_source_backed||0)>0,
    },
    {
      id:'english_bounded_composition_recovery_present',
      pass:Number(englishEvidence.counts.bounded_token_composition||0)>0,
    },
    {
      id:'no_generated_g2p',
      pass:englishEvidence.generated_g2p_used===false,
    },
    {
      id:'evidence_audit_read_only',
      pass:englishEvidence.database_mutated===false,
    },
  ];
  const failedChecks=checks.filter((row)=>!row.pass);
  const status=failedChecks.length?'failed':'evidence_ready';

  const evidence={
    schema:'rhymelab-entity-multilingual-pronunciation-evidence-v1',
    status,
    entity_database:entityDbPath,
    english_database:englishDbPath,
    entity_population:{
      retained_entities:Number(entityState.retained_entities||0),
      popularity_cut_fingerprint:entityState.popularity_cut_fingerprint||null,
    },
    frozen_de_runtime:{
      expected_fingerprint:ACCEPTED_DE_ENTITY_RUNTIME_FINGERPRINT,
      actual_fingerprint:entityState.entity_phonetic_runtime_fingerprint||null,
      fingerprint_equal:
        entityState.entity_phonetic_runtime_fingerprint
        ===ACCEPTED_DE_ENTITY_RUNTIME_FINGERPRINT,
      analyzer:entityState.entity_phonetic_analyzer||null,
      analyses:Number(entityState.entity_phonetic_analyses||0),
      rhyme_anchors:Number(entityState.entity_rhyme_anchors||0),
    },
    wikidata_p898:{
      status:entityOwner?.wikidata_p898_materialization?.status||null,
      inserted_pronunciations:
        Number(entityOwner?.wikidata_p898_materialization?.inserted_pronunciations||0),
      names_with_source_evidence:
        Number(entityOwner?.wikidata_p898_materialization?.names_with_source_evidence||0),
      preferred_names_with_source_evidence:
        Number(entityOwner?.wikidata_p898_materialization?.preferred_names_with_source_evidence||0),
      unmapped_rows:Number(entityOwner?.wikidata_p898_materialization?.unmapped_rows||0),
      runtime_eligible_rows:
        Number(entityOwner?.wikidata_p898_materialization?.runtime_eligible_rows||0),
      runtime_changed:
        Boolean(entityOwner?.wikidata_p898_materialization?.runtime_changed),
      semantic_fingerprint:
        entityOwner?.wikidata_p898_materialization?.semantic_fingerprint||null,
    },
    accepted_english_product:{
      marker_accepted:englishMarker.accepted===true,
      database_fingerprint:englishState.semanticFingerprint||null,
      publish_fingerprint:englishState.publishFingerprint||null,
      phonology_profile_status:englishProfile.status,
      analyzer:englishProfile.analyzerVersion,
      scorer:englishProfile.scorerVersion,
    },
    english_entity_evidence:englishEvidence,
    checks,
    failed_checks:failedChecks.map((row)=>row.id),
    safeguards:{
      compact_report:true,
      entity_population_retuned:false,
      german_entity_runtime_mutated_by_new_english_audit:false,
      p898_runtime_promoted:false,
      english_entity_runtime_promoted:false,
      broad_g2p:false,
      external_paid_service_used:false,
    },
    next_decision_basis:[
      'implement one source-backed multilingual Entity pronunciation runtime pass from the accepted evidence channels',
      'preserve the frozen DE Entity runtime fingerprint while adding separate en-US analyses/anchors',
      'promote only locale-qualified P898 rows that pass the matching accepted language analyzer',
      'use exact accepted English Writer/CMUdict evidence and bounded accepted-token composition for en-US names',
      'keep proper-name G2P disabled unless residual high-value gaps later justify a dedicated benchmark',
      'after multilingual pronunciation acceptance, calibrate Entity prominence and diversity inside phonetic quality guards',
    ],
  };
  const semanticFingerprint=hashJson(evidence);
  const report={
    ...evidence,
    semantic_fingerprint:semanticFingerprint,
  };
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');

  console.log('\nPHASE 12C ENTITY MULTILINGUAL PRONUNCIATION EVIDENCE');
  console.log(JSON.stringify({
    status,
    failed_checks:failedChecks.map((row)=>row.id),
    de_runtime_fingerprint:entityState.entity_phonetic_runtime_fingerprint||null,
    p898_rows:report.wikidata_p898.inserted_pronunciations,
    english_names:englishEvidence.counts.names,
    english_preferred_names:englishEvidence.counts.preferred_names,
    english_exact_source_backed:englishEvidence.counts.exact_source_backed,
    english_bounded_composition:englishEvidence.counts.bounded_token_composition,
    english_source_backed_ready_pct:englishEvidence.counts.source_backed_ready_pct,
    english_preferred_ready_pct:englishEvidence.counts.preferred_source_backed_ready_pct,
    semantic_fingerprint:semanticFingerprint,
    report:reportPath,
  },null,2));

  if(status!=='evidence_ready') process.exitCode=1;
}finally{
  englishDb.close();
  entityDb.close();
}
