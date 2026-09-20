import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openWriterDb } from './experimental-writer-db.mjs';
import {
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  openEnglishWriterDb,
} from './english-writer-runtime.mjs';
import { openPhraseBrowserDb } from './phrase-browser-store.mjs';
import { openEntityWriterDb } from './entity-writer-runtime.mjs';

export const GENERATED_OPTIN_RUNTIME_SCHEMA='rhymelab-generated-optin-runtime-v1';
export const GENERATED_OPTIN_REPORT_SCHEMA='rhymelab-generated-base-parity-v1';
export const GENERATED_OPTIN_REPORT_POLICY='canonical-schema-opt-in-generated-overlay-v1';
export const GENERATED_OPTIN_MARKER_SCHEMA='rhymelab-generated-optin-runtime-enabled-v1';
export const GENERATED_OPTIN_RUNTIME_POLICY='explicit-checkbox-generated-overlay-v1';

export const DEFAULT_GENERATED_OPTIN_REPORT_PATH=resolve(
  'data/local/pronunciation-base-parity-v1-report.json',
);
export const DEFAULT_GENERATED_OPTIN_MARKER_PATH=resolve(
  'data/local/generated-optin-runtime-enabled-v1.json',
);
export const DEFAULT_GENERATED_WRITER_DB_PATH=resolve(
  'data/local/rhymelab-v5-generated-optin.sqlite',
);
export const DEFAULT_GENERATED_ENGLISH_DB_PATH=resolve(
  'data/local/rhymelab-en-v1-generated-optin.sqlite',
);
export const DEFAULT_GENERATED_PHRASE_DB_PATH=resolve(
  'data/local/rhymelab-phrases-v1-generated-optin.sqlite',
);
export const DEFAULT_GENERATED_ENTITY_DB_PATH=resolve(
  'data/local/rhymelab-entities-v1-generated-optin.sqlite',
);

const DOMAINS=Object.freeze(['de','en','phrases','entities']);

function fail(reason,report=null){
  return {
    accepted:false,
    reason,
    report,
  };
}

function sameResolvedPath(left,right){
  if(!left||!right)return false;
  return resolve(String(left))===resolve(String(right));
}

export function validateGeneratedOptinReport(report,{
  writerPath=DEFAULT_GENERATED_WRITER_DB_PATH,
  englishPath=DEFAULT_GENERATED_ENGLISH_DB_PATH,
  phrasePath=DEFAULT_GENERATED_PHRASE_DB_PATH,
  entityPath=DEFAULT_GENERATED_ENTITY_DB_PATH,
}={}){
  if(!report||typeof report!=='object')return fail('generated_optin_report_invalid',report);
  if(report.schema!==GENERATED_OPTIN_REPORT_SCHEMA){
    return fail('generated_optin_report_schema_mismatch',report);
  }
  if(report.policy!==GENERATED_OPTIN_REPORT_POLICY){
    return fail('generated_optin_report_policy_mismatch',report);
  }
  if(report.status!=='ok')return fail('generated_optin_report_not_ok',report);
  if(Number(report.unclassified_active)!==0){
    return fail('generated_optin_report_unclassified_active',report);
  }

  const contract=report.owner_contract||{};
  if(contract.generated_results_class!=='second_class'
    ||contract.default_search_included!==false
    ||contract.user_opt_in_required!==true
    ||contract.canonical_databases_mutated!==false){
    return fail('generated_optin_report_owner_contract_mismatch',report);
  }

  for(const domain of DOMAINS){
    if(report.parity?.[domain]?.exact_schema_match!==true){
      return fail('generated_optin_report_schema_parity_'+domain,report);
    }
  }

  const phrase=report.materialized?.phrases||{};
  const sourceSurface=Number(phrase.source_surface_rows||0);
  const represented=Number(phrase.source_surface_rows_represented_by_canonical_composition||0);
  const deferred=Number(phrase.source_surface_rows_parity_deferred||0);
  if(sourceSurface!==represented+deferred){
    return fail('generated_optin_report_phrase_balance_mismatch',report);
  }
  if(deferred>0&&phrase.parity_deferred_reason!=='blocked_by_intentionally_non_active_token_dependency'){
    return fail('generated_optin_report_phrase_deferral_reason_mismatch',report);
  }

  const expectedOutputs={
    de:writerPath,
    en:englishPath,
    phrases:phrasePath,
    entities:entityPath,
  };
  for(const [domain,path] of Object.entries(expectedOutputs)){
    if(!sameResolvedPath(report.outputs?.[domain],path)){
      return fail('generated_optin_report_output_path_'+domain+'_mismatch',report);
    }
  }

  return {
    accepted:true,
    reason:null,
    report,
    activeEspeakAB:Number(report.active_espeak_ab||0),
    deferredTotal:Number(report.deferred?.total||0),
    phraseSurfaceRows:sourceSurface,
    phraseSurfaceRepresented:represented,
    phraseSurfaceDeferred:deferred,
    semanticFingerprint:String(report.semantic_fingerprint||''),
  };
}

export function validateGeneratedOptinAcceptanceMarker(
  marker,
  parityReportFingerprint,
){
  if(!marker||typeof marker!=='object'){
    return {accepted:false,reason:'generated_optin_acceptance_marker_invalid',marker};
  }
  if(marker.schema!==GENERATED_OPTIN_MARKER_SCHEMA){
    return {accepted:false,reason:'generated_optin_acceptance_marker_schema_mismatch',marker};
  }
  if(marker.status!=='accepted'){
    return {accepted:false,reason:'generated_optin_acceptance_marker_not_accepted',marker};
  }
  if(marker.policy!==GENERATED_OPTIN_RUNTIME_POLICY){
    return {accepted:false,reason:'generated_optin_acceptance_marker_policy_mismatch',marker};
  }
  if(String(marker.parity_report_fingerprint||'')!==String(parityReportFingerprint||'')){
    return {accepted:false,reason:'generated_optin_acceptance_marker_parity_fingerprint_mismatch',marker};
  }
  if(!/^[a-f0-9]{64}$/u.test(String(marker.acceptance_report_fingerprint||''))){
    return {accepted:false,reason:'generated_optin_acceptance_marker_report_fingerprint_invalid',marker};
  }
  return {accepted:true,reason:null,marker};
}

export function readGeneratedOptinAcceptanceMarker(
  markerPath=DEFAULT_GENERATED_OPTIN_MARKER_PATH,
  parityReportFingerprint='',
){
  const path=resolve(markerPath);
  if(!existsSync(path)){
    return {
      accepted:false,
      reason:'generated_optin_acceptance_marker_missing',
      marker:null,
      path,
    };
  }
  let marker;
  try{marker=JSON.parse(readFileSync(path,'utf8'));}
  catch{
    return {
      accepted:false,
      reason:'generated_optin_acceptance_marker_invalid_json',
      marker:null,
      path,
    };
  }
  return {
    ...validateGeneratedOptinAcceptanceMarker(marker,parityReportFingerprint),
    path,
  };
}

export function readGeneratedOptinReport(
  reportPath=DEFAULT_GENERATED_OPTIN_REPORT_PATH,
  paths={},
){
  const path=resolve(reportPath);
  if(!existsSync(path))return fail('generated_optin_report_missing');
  let report;
  try{report=JSON.parse(readFileSync(path,'utf8'));}
  catch{return fail('generated_optin_report_invalid_json');}
  return {
    ...validateGeneratedOptinReport(report,paths),
    path,
  };
}

function closeQuietly(db){
  try{db?.close();}catch{}
}

export function selectGeneratedOptinDatabases(
  canonicalDatabases,
  generatedRuntime,
  enabled=false,
){
  if(enabled!==true){
    return {
      available:true,
      mode:'canonical',
      databases:canonicalDatabases,
      reason:null,
    };
  }
  if(!generatedRuntime?.available||!generatedRuntime?.databases){
    return {
      available:false,
      mode:'generated_optin',
      databases:null,
      reason:generatedRuntime?.reason||'generated_optin_runtime_unavailable',
    };
  }
  return {
    available:true,
    mode:'generated_optin',
    databases:generatedRuntime.databases,
    reason:null,
  };
}

export function openGeneratedOptinRuntime({
  reportPath=DEFAULT_GENERATED_OPTIN_REPORT_PATH,
  acceptanceMarkerPath=DEFAULT_GENERATED_OPTIN_MARKER_PATH,
  requireRuntimeAcceptance=true,
  writerPath=DEFAULT_GENERATED_WRITER_DB_PATH,
  englishPath=DEFAULT_GENERATED_ENGLISH_DB_PATH,
  phrasePath=DEFAULT_GENERATED_PHRASE_DB_PATH,
  entityPath=DEFAULT_GENERATED_ENTITY_DB_PATH,
  englishMarkerPath=DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
}={}){
  const paths={
    writerPath:resolve(writerPath),
    englishPath:resolve(englishPath),
    phrasePath:resolve(phrasePath),
    entityPath:resolve(entityPath),
  };
  const state=readGeneratedOptinReport(reportPath,paths);
  if(!state.accepted){
    return {
      schema:GENERATED_OPTIN_RUNTIME_SCHEMA,
      available:false,
      reason:state.reason,
      reportPath:resolve(reportPath),
      acceptanceMarkerPath:resolve(acceptanceMarkerPath),
      report:state.report||null,
      paths,
      databases:null,
      close(){},
    };
  }

  const marker=requireRuntimeAcceptance
    ?readGeneratedOptinAcceptanceMarker(
        acceptanceMarkerPath,
        state.semanticFingerprint,
      )
    :{accepted:true,reason:null,marker:null,path:resolve(acceptanceMarkerPath)};
  if(!marker.accepted){
    return {
      schema:GENERATED_OPTIN_RUNTIME_SCHEMA,
      available:false,
      reason:marker.reason,
      reportPath:resolve(reportPath),
      acceptanceMarkerPath:resolve(acceptanceMarkerPath),
      report:state.report,
      acceptanceMarker:marker.marker||null,
      paths,
      databases:null,
      close(){},
    };
  }

  for(const path of Object.values(paths)){
    if(!existsSync(path)){
      return {
        schema:GENERATED_OPTIN_RUNTIME_SCHEMA,
        available:false,
        reason:'generated_optin_database_missing',
        missingPath:path,
        reportPath:resolve(reportPath),
        acceptanceMarkerPath:resolve(acceptanceMarkerPath),
        report:state.report,
        paths,
        databases:null,
        close(){},
      };
    }
  }

  let writerDb=null;
  let englishDb=null;
  let phraseDb=null;
  let entityDb=null;
  try{
    writerDb=openWriterDb(paths.writerPath);
    englishDb=openEnglishWriterDb(paths.englishPath,{
      requireProductAcceptance:true,
      markerPath:englishMarkerPath,
    });
    phraseDb=openPhraseBrowserDb(paths.phrasePath);
    entityDb=openEntityWriterDb(paths.entityPath);
  }catch(error){
    closeQuietly(writerDb);
    closeQuietly(englishDb);
    closeQuietly(phraseDb);
    closeQuietly(entityDb);
    return {
      schema:GENERATED_OPTIN_RUNTIME_SCHEMA,
      available:false,
      reason:'generated_optin_database_open_failed',
      error:error instanceof Error?error.message:String(error),
      reportPath:resolve(reportPath),
      acceptanceMarkerPath:resolve(acceptanceMarkerPath),
      report:state.report,
      paths,
      databases:null,
      close(){},
    };
  }

  const databases={
    writerDb,
    englishDb,
    phraseDb,
    entityDb,
    generatedOverlay:true,
  };
  return {
    schema:GENERATED_OPTIN_RUNTIME_SCHEMA,
    available:true,
    reason:null,
    reportPath:resolve(reportPath),
    acceptanceMarkerPath:resolve(acceptanceMarkerPath),
    acceptanceMarker:marker.marker||null,
    report:state.report,
    reportFingerprint:state.semanticFingerprint,
    activeEspeakAB:state.activeEspeakAB,
    deferredTotal:state.deferredTotal,
    phraseSurfaceRows:state.phraseSurfaceRows,
    phraseSurfaceRepresented:state.phraseSurfaceRepresented,
    phraseSurfaceDeferred:state.phraseSurfaceDeferred,
    paths,
    databases,
    close(){
      closeQuietly(writerDb);
      closeQuietly(englishDb);
      closeQuietly(phraseDb);
      closeQuietly(entityDb);
    },
  };
}
