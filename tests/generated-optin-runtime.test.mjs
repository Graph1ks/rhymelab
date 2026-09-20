import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  GENERATED_OPTIN_MARKER_SCHEMA,
  GENERATED_OPTIN_REPORT_POLICY,
  GENERATED_OPTIN_REPORT_SCHEMA,
  GENERATED_OPTIN_RUNTIME_POLICY,
  selectGeneratedOptinDatabases,
  validateGeneratedOptinAcceptanceMarker,
  validateGeneratedOptinReport,
} from '../src/generated-optin-runtime.mjs';
import {
  unifiedWriterCapabilities,
} from '../src/unified-writer-search.mjs';

function reportFixture(paths){
  return {
    schema:GENERATED_OPTIN_REPORT_SCHEMA,
    policy:GENERATED_OPTIN_REPORT_POLICY,
    status:'ok',
    owner_contract:{
      generated_results_class:'second_class',
      default_search_included:false,
      user_opt_in_required:true,
      canonical_databases_mutated:false,
    },
    outputs:{
      de:paths.writerPath,
      en:paths.englishPath,
      phrases:paths.phrasePath,
      entities:paths.entityPath,
    },
    active_espeak_ab:3365814,
    unclassified_active:0,
    deferred:{total:2538},
    materialized:{
      phrases:{
        source_surface_rows:8070,
        source_surface_rows_represented_by_canonical_composition:7967,
        source_surface_rows_parity_deferred:103,
        parity_deferred_reason:'blocked_by_intentionally_non_active_token_dependency',
      },
    },
    parity:{
      de:{exact_schema_match:true},
      en:{exact_schema_match:true},
      phrases:{exact_schema_match:true},
      entities:{exact_schema_match:true},
    },
    semantic_fingerprint:'a'.repeat(64),
  };
}

test('generated opt-in report gate accepts only the exact base-parity contract',()=>{
  const paths={
    writerPath:resolve('tmp/de.sqlite'),
    englishPath:resolve('tmp/en.sqlite'),
    phrasePath:resolve('tmp/phrases.sqlite'),
    entityPath:resolve('tmp/entities.sqlite'),
  };
  const report=reportFixture(paths);
  const state=validateGeneratedOptinReport(report,paths);
  assert.equal(state.accepted,true);
  assert.equal(state.activeEspeakAB,3365814);
  assert.equal(state.phraseSurfaceRepresented,7967);
  assert.equal(state.phraseSurfaceDeferred,103);

  const defaultOn=structuredClone(report);
  defaultOn.owner_contract.default_search_included=true;
  assert.equal(
    validateGeneratedOptinReport(defaultOn,paths).reason,
    'generated_optin_report_owner_contract_mismatch',
  );

  const badSchema=structuredClone(report);
  badSchema.parity.entities.exact_schema_match=false;
  assert.equal(
    validateGeneratedOptinReport(badSchema,paths).reason,
    'generated_optin_report_schema_parity_entities',
  );

  const badPhraseBalance=structuredClone(report);
  badPhraseBalance.materialized.phrases.source_surface_rows_parity_deferred=102;
  assert.equal(
    validateGeneratedOptinReport(badPhraseBalance,paths).reason,
    'generated_optin_report_phrase_balance_mismatch',
  );
});

test('generated runtime acceptance marker is bound to the parity report fingerprint',()=>{
  const parityFingerprint='b'.repeat(64);
  const marker={
    schema:GENERATED_OPTIN_MARKER_SCHEMA,
    status:'accepted',
    policy:GENERATED_OPTIN_RUNTIME_POLICY,
    parity_report_fingerprint:parityFingerprint,
    acceptance_report_fingerprint:'c'.repeat(64),
  };
  assert.equal(
    validateGeneratedOptinAcceptanceMarker(marker,parityFingerprint).accepted,
    true,
  );
  assert.equal(
    validateGeneratedOptinAcceptanceMarker(marker,'d'.repeat(64)).reason,
    'generated_optin_acceptance_marker_parity_fingerprint_mismatch',
  );
  assert.equal(
    validateGeneratedOptinAcceptanceMarker({
      ...marker,
      acceptance_report_fingerprint:'bad',
    },parityFingerprint).reason,
    'generated_optin_acceptance_marker_report_fingerprint_invalid',
  );
});

test('runtime selection is canonical by default and fail-closed when opt-in is unavailable',()=>{
  const canonical={writerDb:{id:'canonical'},generatedOverlay:false};
  const unavailable={available:false,reason:'missing'};
  const off=selectGeneratedOptinDatabases(canonical,unavailable,false);
  assert.equal(off.available,true);
  assert.equal(off.mode,'canonical');
  assert.equal(off.databases,canonical);

  const onUnavailable=selectGeneratedOptinDatabases(canonical,unavailable,true);
  assert.equal(onUnavailable.available,false);
  assert.equal(onUnavailable.databases,null);

  const generatedDatabases={writerDb:{id:'generated'},generatedOverlay:true};
  const on=selectGeneratedOptinDatabases(
    canonical,
    {available:true,databases:generatedDatabases},
    true,
  );
  assert.equal(on.available,true);
  assert.equal(on.mode,'generated_optin');
  assert.equal(on.databases,generatedDatabases);
});

test('accepted generated overlay can use its rebuilt phrase fingerprint without changing canonical gate',()=>{
  const phraseDb=new DatabaseSync(':memory:');
  try{
    phraseDb.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
      INSERT INTO meta(key,value) VALUES('phrase_mosaic_retrieval_v2_fingerprint','generated-overlay-fingerprint');
      CREATE TABLE phrase(id INTEGER);
      CREATE TABLE phrase_pronunciation(id INTEGER);
      CREATE TABLE phrase_mosaic_window(id INTEGER);
      CREATE TABLE phrase_mosaic_retrieval_anchor(id INTEGER);
      CREATE TABLE phrase_mosaic_retrieval_v2_anchor(id INTEGER);
    `);

    const canonical=unifiedWriterCapabilities({
      writerDb:{},
      phraseDb,
      generatedOverlay:false,
    });
    assert.equal(canonical.languages.de.phraseMosaic,false);
    assert.equal(canonical.languages.de.phraseReason,'phrase_runtime_fingerprint_mismatch');

    const generated=unifiedWriterCapabilities({
      writerDb:{},
      phraseDb,
      generatedOverlay:true,
    });
    assert.equal(generated.languages.de.phraseMosaic,true);
    assert.equal(generated.languages.de.phraseReason,null);
    assert.equal(generated.generatedOverlay,true);
  }finally{
    phraseDb.close();
  }
});
