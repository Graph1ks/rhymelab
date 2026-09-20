import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  GENERATED_BASE_PARITY_POLICY,
  GENERATED_BASE_PARITY_SCHEMA,
  activeGeneratedRow,
  assertSameSqliteSchema,
  deferredBucket,
  jsonSortedUnique,
  phraseDependencyBucket,
  resolveMaterializationResume,
  scopeClass,
  sqliteSchemaFingerprint,
} from '../scripts/pronunciation-base-parity-core.mjs';

test('base-parity policy keeps only resolved eSpeak A/B active',()=>{
  assert.equal(GENERATED_BASE_PARITY_SCHEMA,'rhymelab-generated-base-parity-v1');
  assert.equal(GENERATED_BASE_PARITY_POLICY,'canonical-schema-opt-in-generated-overlay-v1');
  assert.equal(activeGeneratedRow({
    final_status:'resolved',final_method:'espeak_ng',quality_tier:'A',
  }),true);
  assert.equal(activeGeneratedRow({
    final_status:'resolved',final_method:'espeak_ng',quality_tier:'B',
  }),true);
  assert.equal(activeGeneratedRow({
    final_status:'resolved',final_method:'client_rules',quality_tier:'C',
  }),false);
  assert.equal(activeGeneratedRow({
    final_status:'unresolved',final_method:null,quality_tier:'U',
  }),false);
});

test('deferred buckets preserve client B/C/D and unresolved U',()=>{
  assert.equal(deferredBucket({
    final_status:'resolved',final_method:'client_source_reference_compound',quality_tier:'B',
  }),'client_B_source_backed');
  assert.equal(deferredBucket({
    final_status:'resolved',final_method:'client_rules',quality_tier:'C',
  }),'client_C_rules');
  assert.equal(deferredBucket({
    final_status:'resolved',final_method:'client_grapheme_fallback',quality_tier:'D',
  }),'client_D_grapheme');
  assert.equal(deferredBucket({
    final_status:'unresolved',quality_tier:'U',
  }),'U_unresolved');
});

test('phrase dependency buckets distinguish safe deferral from parity defects',()=>{
  assert.equal(phraseDependencyBucket(null),'missing_backfill_dependency');
  assert.equal(phraseDependencyBucket({
    decision:'admit',final_status:'resolved',final_method:'espeak_ng',quality_tier:'A',
  }),'active_espeak_ab_token_missing_from_writer');
  assert.equal(phraseDependencyBucket({
    decision:'review',final_status:'pending',final_method:null,quality_tier:null,
  }),'admission_review');
  assert.equal(phraseDependencyBucket({
    decision:'reject_noise',final_status:'pending',final_method:null,quality_tier:null,
  }),'admission_reject_noise');
  assert.equal(phraseDependencyBucket({
    decision:'admit',final_status:'resolved',final_method:'client_rules',quality_tier:'C',
  }),'client_C_rules');
  assert.equal(phraseDependencyBucket({
    decision:'admit',final_status:'unresolved',final_method:null,quality_tier:'U',
  }),'U_unresolved');
});


test('base-parity JSON list serialization accepts Sets and other iterables',()=>{
  assert.equal(jsonSortedUnique(new Set(['beta','alpha','beta'])),'["alpha","beta"]');
  assert.equal(jsonSortedUnique(['z','a','z']),'["a","z"]');
  assert.equal(jsonSortedUnique('solo'),'["solo"]');
  assert.equal(jsonSortedUnique(null),'[]');
});

test('materialization resume preserves only completed earlier domains',()=>{
  assert.deepEqual(resolveMaterializationResume('de'),{
    resume_from:'de',
    preserve:[],
    rebuild:['de','en','phrases','entities'],
  });
  assert.deepEqual(resolveMaterializationResume('en'),{
    resume_from:'en',
    preserve:['de'],
    rebuild:['en','phrases','entities'],
  });
  assert.throws(()=>resolveMaterializationResume('bogus'),/Invalid --resume-from stage/u);
});

test('scope classification keeps domain ownership explicit',()=>{
  assert.deepEqual(scopeClass([
    'de_wiktionary_headword_source_minus_accepted',
    'entity_de_no_source_pronunciation',
  ]),{
    deWord:true,
    enWord:false,
    phraseSurface:false,
    entity:true,
  });
  assert.deepEqual(scopeClass([
    'phrase_unresolved_token',
    'phrase_surface_unresolved',
  ]),{
    deWord:true,
    enWord:false,
    phraseSurface:true,
    entity:false,
  });
});

test('schema parity requires exact same persistent sqlite schema',()=>{
  const base=new DatabaseSync(':memory:');
  const augmented=new DatabaseSync(':memory:');
  try{
    const schema=`
      CREATE TABLE hot(id INTEGER PRIMARY KEY, surface TEXT NOT NULL);
      CREATE INDEX idx_hot_surface ON hot(surface);
    `;
    base.exec(schema);
    augmented.exec(schema);
    assert.equal(
      assertSameSqliteSchema(base,augmented,'fixture'),
      sqliteSchemaFingerprint(base),
    );
    augmented.exec('CREATE TABLE generated_extra(id INTEGER PRIMARY KEY);');
    assert.throws(
      ()=>assertSameSqliteSchema(base,augmented,'fixture'),
      /schema parity failed/u,
    );
  }finally{
    base.close();
    augmented.close();
  }
});

test('TEMP work tables do not break persistent schema parity',()=>{
  const base=new DatabaseSync(':memory:');
  const augmented=new DatabaseSync(':memory:');
  try{
    base.exec('CREATE TABLE item(id INTEGER PRIMARY KEY,value TEXT);');
    augmented.exec('CREATE TABLE item(id INTEGER PRIMARY KEY,value TEXT);');
    augmented.exec('CREATE TEMP TABLE work(id INTEGER PRIMARY KEY);');
    assert.doesNotThrow(()=>assertSameSqliteSchema(base,augmented,'fixture'));
  }finally{
    base.close();
    augmented.close();
  }
});
