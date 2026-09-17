#!/usr/bin/env node
import { resolve } from 'node:path';
import { findRhymes, openRhymeDb, PRIMARY_RHYME_TYPES, RHYME_TYPES, SOUND_RELATION_TYPES } from '../src/local-engine.mjs';
import { getPhonologyProfile } from './phonology-profiles.mjs';

const dbPath = resolve(process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');
const probes = ['Liebe','Haus','Nacht','Zeit','Leben','Musik','Herz','Welt','Mann','Frau','Kind','Traum','Licht','Hand','Wort','Feuer','Wasser','Himmel','Straße','schön','hitzefrei'];
const aggregateAvailable = Object.fromEntries(RHYME_TYPES.map((type) => [type, 0]));
const aggregateReturned = Object.fromEntries(RHYME_TYPES.map((type) => [type, 0]));
const examples = Object.fromEntries(RHYME_TYPES.map((type) => [type, []]));
const samples = {};
let foundQueries = 0;

const profile = getPhonologyProfile('de');
function directScore(a, b) {
  return profile.scoreAnalyses(profile.analyzeIpa(a), profile.analyzeIpa(b));
}
const hitzefreiInhaber = directScore('[ˈhɪt͡səˌfʁaɪ̯]', '[ˈɪnˌhaːbɐ]');
const hausBaum = directScore('[haʊ̯s]', '[baʊ̯m]');
const hausBis = directScore('[haʊ̯s]', '[bɪs]');
const regression = {
  hitzefrei_inhaber_not_assonance: !(hitzefreiInhaber.relationTypes || []).includes('assonance'),
  haus_baum_assonance: (hausBaum.relationTypes || []).includes('assonance'),
  haus_bis_consonance: (hausBis.relationTypes || []).includes('consonance'),
  perfect_rhyme_does_not_duplicate_as_sound_relation: !(directScore('[haʊ̯s]', '[maʊ̯s]').relationTypes || []).length,
};

const db = openRhymeDb(dbPath);
try {
  for (const word of probes) {
    const result = findRhymes(db, word, { limit: 250, poolLimit: 800, ensureTypeCoverage: true, coverageFloor: 20, type: 'all' });
    if (!result) { samples[word] = { found: false }; continue; }
    foundQueries += 1;
    const available = result.selection?.availableByType || {};
    const returned = result.selection?.returnedByType || {};
    for (const type of RHYME_TYPES) {
      aggregateAvailable[type] += Number(available[type] || 0);
      aggregateReturned[type] += Number(returned[type] || 0);
      for (const item of result.groups?.[type] || []) {
        if (examples[type].length >= 8) break;
        if (!examples[type].some((example) => example.word === item.word && example.query === word)) {
          const relation = (item.relations || []).find((entry) => entry.type === type);
          examples[type].push({ word:item.word, score:relation?.score ?? item.score, strength:relation?.strength ?? null, primary_type:item.primaryType, query:word });
        }
      }
    }
    samples[word] = {
      found:true,
      selection_mode:result.selection?.mode || null,
      coverage_floor_per_type:result.selection?.coverageFloorPerType ?? null,
      available_by_type:available,
      returned_by_type:returned,
    };
  }
} finally { db.close(); }

const starvedTypes = RHYME_TYPES.filter((type) => aggregateAvailable[type] > 0 && aggregateReturned[type] === 0);
const unobservedTypes = RHYME_TYPES.filter((type) => aggregateAvailable[type] === 0);
const missingRelations = SOUND_RELATION_TYPES.filter((type) => aggregateAvailable[type] === 0);
const ok = foundQueries > 0
  && starvedTypes.length === 0
  && missingRelations.length === 0
  && Object.values(regression).every(Boolean);

console.log(JSON.stringify({
  schema:'rhymelab-rhyme-class-relation-audit-v2',
  model:'exclusive_primary_rhyme_plus_independent_sound_relations',
  ok,
  database:dbPath,
  phonology:{analyzer:profile.analyzerVersion,scorer:profile.scorerVersion,relation_policy:profile.relationPolicyVersion},
  probes,
  found_queries:foundQueries,
  primary_rhyme_types:PRIMARY_RHYME_TYPES,
  sound_relation_types:SOUND_RELATION_TYPES,
  expected_categories:RHYME_TYPES,
  aggregate_available_by_type:aggregateAvailable,
  aggregate_returned_by_type:aggregateReturned,
  starved_types:starvedTypes,
  unobserved_types:unobservedTypes,
  missing_sound_relations:missingRelations,
  regression,
  examples,
  samples,
}, null, 2));
