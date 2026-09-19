import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entityG2pOrthographyBucket,
  groupProperNameReferences,
  selectProperNameTokenBenchmarkCases,
} from '../scripts/entity-g2p-benchmark-core.mjs';

test('proper-name G2P benchmark selects unique token controls from explicit proper-name IPA only',()=>{
  const refs=groupProperNameReferences([
    {
      evidence_id:1,
      normalized:'céline',
      surface:'Céline',
      source_kind:'wiktionary_kaikki_proper_name',
      locale:'en-US',
      notation:'ipa',
      raw:'/seɪˈliːn/',
    },
    {
      evidence_id:2,
      normalized:'dion',
      surface:'Dion',
      source_kind:'wiktionary_kaikki_proper_name',
      locale:'en-US',
      notation:'ipa',
      raw:'/diˈɑn/',
    },
    {
      evidence_id:3,
      normalized:'céline',
      surface:'Céline',
      source_kind:'wiktionary_kaikki_proper_name',
      locale:'en-US',
      notation:'ipa',
      raw:'/səˈliːn/',
    },
  ]);

  const rows=[
    {
      name_id:10,
      qid:'Q1',
      surface:'Céline Dion',
      primary_category:'person.musician',
      popularity_tier:'A',
      popularity_percentile:1,
    },
    {
      name_id:11,
      qid:'Q2',
      surface:'Céline',
      primary_category:'person.actor',
      popularity_tier:'A',
      popularity_percentile:0.9,
    },
  ];

  const result=selectProperNameTokenBenchmarkCases(rows,refs,{
    targetSize:10,
    perCategory:10,
  });

  assert.equal(result.cases.length,2);
  assert.equal(result.distinct_normalized,2);
  assert.equal(new Set(result.cases.map((row)=>row.normalized)).size,2);
  assert.deepEqual(
    result.cases.map((row)=>row.normalized),
    ['céline','dion'],
  );
  assert.equal(result.cases[0].control_source,'wiktionary_kaikki_proper_name');
  assert.equal(result.cases[0].references.length,2);
  assert.equal(result.cases[0].context.entity_surface,'Céline Dion');
});

test('proper-name G2P orthography buckets expose difficult name spellings',()=>{
  assert.equal(entityG2pOrthographyBucket('Björk'),'non_ascii');
  assert.equal(entityG2pOrthographyBucket("O'Connor"),'apostrophe');
  assert.equal(entityG2pOrthographyBucket('Cher'),'very_short');
  assert.equal(entityG2pOrthographyBucket('Madonna'),'short');
  assert.equal(entityG2pOrthographyBucket('Metallica'),'medium');
  assert.equal(entityG2pOrthographyBucket('Schwarzenegger'),'long');
});
