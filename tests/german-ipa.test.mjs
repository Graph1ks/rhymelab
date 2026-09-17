import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGermanIpa, tokenizeGermanIpa } from '../scripts/german-ipa.mjs';

test('tokenizes German diphthongs and affricates as phonological units', () => {
  assert.deepEqual(tokenizeGermanIpa('[ˈt͡saɪ̯t]'), ['ˈ','t͡s','aɪ̯','t']);
});

test('normalizes the common ɔɪ spelling as one German diphthong nucleus', () => {
  assert.deepEqual(tokenizeGermanIpa('[ˈfɔɪ̯ɐ]'), ['ˈ','f','ɔɪ̯','ɐ']);
  const feuer = analyzeGermanIpa('[ˈfɔɪ̯ɐ]');
  const teuer = analyzeGermanIpa('[ˈtɔɪ̯ɐ]');
  assert.equal(feuer.syllableCount, 2);
  assert.equal(feuer.vowelSequence, 'ɔʏ ɐ');
  assert.equal(feuer.exactTailKey, teuer.exactTailKey);
});

test('analyzes gegangen with primary stress on the second syllable', () => {
  const a = analyzeGermanIpa('[ɡəˈɡaŋən]');
  assert.equal(a.syllableCount, 3);
  assert.equal(a.primaryStressSyllable, 2);
  assert.equal(a.stressPattern, '020');
  assert.ok(a.stressedTail.includes('a'));
});

test('keeps syllabic consonants as rhyme nuclei', () => {
  const a = analyzeGermanIpa('[ˈhaʊ̯sɡəˌʁʏçn̩]');
  assert.equal(a.syllableCount, 4);
  assert.equal(a.primaryStressSyllable, 1);
  assert.ok(a.vowelSequence.includes('n='));
});

test('monosyllables without an explicit mark are treated as primary-stressed', () => {
  const a = analyzeGermanIpa('[ɡɪŋ]');
  assert.equal(a.syllableCount, 1);
  assert.equal(a.stressPattern, '2');
  assert.equal(a.finalTail, 'ɪ ŋ');
});

test('stressed tails retain consonantal onsets of following syllables', () => {
  const liebe = analyzeGermanIpa('[ˈliːbə]');
  const miete = analyzeGermanIpa('[ˈmiːtə]');
  assert.equal(liebe.stressedTail, 'iː . b ə');
  assert.equal(miete.stressedTail, 'iː . t ə');
  assert.notEqual(liebe.exactTailKey, miete.exactTailKey);
});
