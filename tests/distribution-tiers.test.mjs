import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

import {
  DISTRIBUTION_TIERS,
  assertDistributionMasterReady,
  buildDistributionCensusReport,
  classifyDistributionObject,
} from '../scripts/distribution-census-core.mjs';

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE surface(
      surface_id INTEGER PRIMARY KEY,language TEXT,normalized TEXT,
      canonical_available INTEGER,generated_available INTEGER,usage_rank INTEGER
    );
    CREATE TABLE pronunciation(
      pronunciation_id INTEGER PRIMARY KEY,surface_id INTEGER,eligible INTEGER,
      canonical_available INTEGER,generated_available INTEGER
    );
    CREATE TABLE surface_role(surface_id INTEGER,role TEXT);
    CREATE TABLE pronunciation_origin(pronunciation_id INTEGER,domain TEXT);

    CREATE TABLE runtime_phrase(
      runtime_phrase_id INTEGER PRIMARY KEY,canonical_available INTEGER,generated_available INTEGER
    );
    CREATE TABLE runtime_phrase_window(runtime_window_id TEXT);
    CREATE TABLE runtime_phrase_usage(runtime_phrase_id INTEGER);
    CREATE TABLE runtime_phrase_attestation(runtime_phrase_id INTEGER);

    CREATE TABLE runtime_entity_identity(entity_id INTEGER PRIMARY KEY);
    CREATE TABLE runtime_entity_category(entity_id INTEGER,category TEXT);
    CREATE TABLE runtime_entity_name(name_id INTEGER PRIMARY KEY);
    CREATE TABLE runtime_entity_pronunciation(product_pronunciation_id INTEGER PRIMARY KEY);
    CREATE TABLE runtime_entity_analysis(product_pronunciation_id INTEGER PRIMARY KEY);
    CREATE TABLE runtime_entity_anchor_occurrence(product_pronunciation_id INTEGER);
    CREATE TABLE runtime_entity_anchor_ranked(product_pronunciation_id INTEGER);
    CREATE TABLE runtime_entity_writer_anchor(serving_pronunciation_id INTEGER);

    CREATE TABLE runtime_target(target_id INTEGER PRIMARY KEY);
    CREATE TABLE runtime_key(key_id INTEGER PRIMARY KEY);
    CREATE TABLE runtime_key_member(key_id INTEGER,target_id INTEGER);
    CREATE TABLE runtime_surface_morphology(surface_id INTEGER PRIMARY KEY);
  `);
  const meta=db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  for(const [key,value] of Object.entries({
    schema:'rhymelab-serving-v1',
    runtime_status:'complete',
    runtime_revision:'runtime-r1',
    runtime_semantic_fingerprint:'runtime-fp',
    product_adapter_schema:'rhymelab-serving-v1-product-adapter-v1',
    product_adapter_status:'complete',
    product_adapter_revision:'product-r1',
    product_adapter_semantic_fingerprint:'product-fp',
  }))meta.run(key,value);

  db.exec(`
    INSERT INTO surface VALUES
      (1,'de','arbeit',1,0,10),
      (2,'en','work',1,0,20),
      (3,'de','neuwort',0,1,NULL),
      (4,'de','phrase text',1,0,NULL);
    INSERT INTO surface_role VALUES
      (1,'lexical'),(2,'lexical'),(3,'lexical'),(4,'phrase');
    INSERT INTO pronunciation VALUES
      (11,1,1,1,0),
      (12,2,1,1,0),
      (13,3,1,0,1),
      (14,4,1,1,0);
    INSERT INTO pronunciation_origin VALUES
      (11,'word'),(12,'word'),(13,'word'),(14,'phrase');

    INSERT INTO runtime_phrase VALUES(101,1,0);
    INSERT INTO runtime_phrase_window VALUES('w1');
    INSERT INTO runtime_phrase_usage VALUES(101);
    INSERT INTO runtime_phrase_attestation VALUES(101);

    INSERT INTO runtime_entity_identity VALUES(201);
    INSERT INTO runtime_entity_category VALUES(201,'person.rapper');
    INSERT INTO runtime_entity_name VALUES(301);
    INSERT INTO runtime_entity_pronunciation VALUES(401);
    INSERT INTO runtime_entity_analysis VALUES(401);
    INSERT INTO runtime_entity_anchor_occurrence VALUES(401);
    INSERT INTO runtime_entity_anchor_ranked VALUES(401);
    INSERT INTO runtime_entity_writer_anchor VALUES(11);

    INSERT INTO runtime_target VALUES(501);
    INSERT INTO runtime_key VALUES(601);
    INSERT INTO runtime_key_member VALUES(601,501);
    INSERT INTO runtime_surface_morphology VALUES(1);
  `);
  return db;
}

test('distribution tier census contract mirrors total product budgets and shipping capabilities',()=>{
  assert.equal(DISTRIBUTION_TIERS.lite.total_product_entries,50000);
  assert.equal(DISTRIBUTION_TIERS.standard.total_product_entries,250000);
  assert.equal(DISTRIBUTION_TIERS.full.total_product_entries,400000);
  assert.equal(DISTRIBUTION_TIERS.lite.word_population,50000);
  assert.equal(DISTRIBUTION_TIERS.standard.word_population,'dynamic_budget_remainder');
  assert.equal(DISTRIBUTION_TIERS.full.word_population,'dynamic_budget_remainder');
  assert.equal(DISTRIBUTION_TIERS.full.generated_only_word_population,0);
  assert.equal(DISTRIBUTION_TIERS.standard.entity_per_category,1000);
  assert.equal(DISTRIBUTION_TIERS.full.entity_per_category,5000);
  assert.equal(DISTRIBUTION_TIERS.lite.features.phrases,false);
  assert.equal(DISTRIBUTION_TIERS.standard.features.entities,true);
  assert.equal(DISTRIBUTION_TIERS.standard.features.generated,false);
  assert.equal(DISTRIBUTION_TIERS.full.features.generated,true);
  assert.equal(DISTRIBUTION_TIERS.full.features.markov,false);
});

test('distribution object classifier separates logical storage families',()=>{
  assert.equal(classifyDistributionObject('runtime_entity_anchor_ranked'),'entities');
  assert.equal(classifyDistributionObject('runtime_phrase_window'),'phrases');
  assert.equal(classifyDistributionObject('runtime_de_candidate'),'words');
  assert.equal(classifyDistributionObject('pronunciation'),'shared_identity');
  assert.equal(classifyDistributionObject('runtime_key_member'),'shared_runtime');
  assert.equal(classifyDistributionObject('meta'),'metadata_build');
});

test('distribution Master readiness fails closed before runtime/product completion',()=>{
  assert.throws(
    ()=>assertDistributionMasterReady({
      schema:'rhymelab-serving-v1',
      runtime_status:'complete',
      product_adapter_status:'building',
      product_adapter_schema:'x',
    }),
    /product_adapter_status must be complete/u,
  );
});

test('distribution census counts Core, Generated, Phrase, Entity and shared runtime closure without mutating source',()=>{
  const db=fixture();
  try{
    const report=buildDistributionCensusReport(db,{sourcePath:'/fixture.sqlite',sourceSizeBytes:1234});
    assert.equal(report.population.core.lexical_surfaces,2);
    assert.equal(report.population.core.word_pronunciations,2);
    assert.equal(report.population.generated_only.lexical_surfaces,1);
    assert.equal(report.population.generated_only.word_pronunciations,1);
    assert.equal(report.population.languages.de.core_lexical_surfaces,1);
    assert.equal(report.population.languages.en.core_lexical_surfaces,1);
    assert.equal(report.population.languages.de.ranked_usage_surfaces,1);
    assert.equal(report.population.languages.en.ranked_usage_surfaces,1);
    assert.equal(report.population.phrases.runtime_rows,1);
    assert.equal(report.population.phrases.windows,1);
    assert.equal(report.population.entities.identities,1);
    assert.equal(report.population.entities.writer_anchors,1);
    assert.equal(report.population.shared_runtime.targets,1);
    assert.equal(report.ranking.status,'frozen');
    assert.equal(report.ranking.policy,'distribution-rank-v1-language-normalized-usage-surface');
    assert.equal(report.projection.status,'plan_required');
    assert.equal(report.next_gate.builder_status,'implemented');
    assert.equal(report.next_gate.master_mutated,false);
  }finally{
    db.close();
  }
});
