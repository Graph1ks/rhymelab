import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

import {
  ENTITY_DERIVED_PRONUNCIATION_SOURCES,
  entityPronunciationOccurrenceEligible,
  entityPronunciationRoutingSql,
  entityPronunciationSourceNeedsLocaleEvidence,
} from '../scripts/entity-pronunciation-routing-core.mjs';

test('Entity label locale is insufficient evidence for derived pronunciation routing',()=>{
  for(const source of ENTITY_DERIVED_PRONUNCIATION_SOURCES){
    assert.equal(entityPronunciationSourceNeedsLocaleEvidence(source),true);
    assert.equal(entityPronunciationOccurrenceEligible({
      sourceKind:source,
      hasCrossLocaleDuplicate:true,
    }),false);
    assert.equal(entityPronunciationOccurrenceEligible({
      sourceKind:source,
      hasCrossLocaleDuplicate:false,
    }),true);
  }
  assert.equal(entityPronunciationOccurrenceEligible({
    sourceKind:'wikidata_p898',
    hasCrossLocaleDuplicate:true,
  }),true);
  assert.equal(entityPronunciationOccurrenceEligible({
    sourceKind:'cmudict_raw_entity',
    hasCrossLocaleDuplicate:true,
  }),true);
});

test('routing SQL rejects only derived pronunciations for same-surface DE/EN Entity labels',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(`
      CREATE TABLE entity_name(
        name_id INTEGER PRIMARY KEY,
        entity_id INTEGER NOT NULL,
        normalized TEXT NOT NULL,
        language TEXT NOT NULL,
        searchable INTEGER NOT NULL
      );
      CREATE INDEX idx_entity_name_language_normalized
        ON entity_name(language,normalized,name_id);
      CREATE TABLE entity_pronunciation(
        pronunciation_id INTEGER PRIMARY KEY,
        name_id INTEGER NOT NULL,
        source_kind TEXT NOT NULL
      );
      INSERT INTO entity_name VALUES
        (1,10,'steve allen','de',1),
        (2,10,'steve allen','en',1),
        (3,11,'deutscher titel','de',1);
      INSERT INTO entity_pronunciation VALUES
        (1,1,'espeak_ng_generated_secondary'),
        (2,1,'wikidata_p898'),
        (3,3,'espeak_ng_generated_secondary');
    `);
    const eligible=entityPronunciationRoutingSql({
      pronunciationAlias:'p',
      nameAlias:'n',
      nameTable:'entity_name',
    });
    const rows=db.prepare(`
      SELECT p.pronunciation_id
      FROM entity_pronunciation p
      JOIN entity_name n USING(name_id)
      WHERE ${eligible}
      ORDER BY p.pronunciation_id
    `).all();
    assert.deepEqual(rows.map((row)=>Number(row.pronunciation_id)),[2,3]);
  }finally{
    db.close();
  }
});
