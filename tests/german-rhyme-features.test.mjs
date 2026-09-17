import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import { coarseCodaClass, consonantSimilarity, featureVectorForAnalysis, scoreGermanRhymeAnalyses, vowelSimilarity } from '../scripts/german-rhyme-features.mjs';

test('German vowel similarity respects height/backness/rounding and length', () => {
  assert.equal(vowelSimilarity('iː', 'iː'), 1);
  assert.ok(vowelSimilarity('iː', 'ɪ') > vowelSimilarity('iː', 'ɔ'));
  assert.ok(vowelSimilarity('yː', 'iː') > vowelSimilarity('yː', 'a'));
});

test('German consonant similarity treats voicing pairs as close', () => {
  assert.ok(consonantSimilarity('t', 'd') > consonantSimilarity('t', 'm'));
  assert.ok(consonantSimilarity('k', 'g') > consonantSimilarity('k', 's'));
});

test('perfect tails remain perfect regardless of onset and do not duplicate as sound relations', () => {
  const score = scoreGermanRhymeAnalyses(analyzeGermanIpa('[haʊ̯s]'), analyzeGermanIpa('[maʊ̯s]'));
  assert.equal(score.overall, 1);
  assert.equal(score.type, 'perfect');
  assert.deepEqual(score.relationTypes, []);
});

test('primary-stressed onset is excluded but later-syllable onset stays in rhyme domain', () => {
  const liebe = analyzeGermanIpa('[ˈliːbə]');
  const triebe = analyzeGermanIpa('[ˈtʁiːbə]');
  const vector = featureVectorForAnalysis(liebe);
  assert.equal(vector.version, 'de-phon-v3');
  assert.deepEqual(vector.rhyme[0].onset, []);
  assert.equal(vector.rhyme[1].onset[0].symbol, 'b');
  const score = scoreGermanRhymeAnalyses(liebe, triebe);
  assert.equal(score.overall, 1);
  assert.equal(score.type, 'multisyllabic_perfect');
});

test('open-syllable slants do not become near-perfect from matching empty codas', () => {
  const liebe = analyzeGermanIpa('[ˈliːbə]');
  const solide = analyzeGermanIpa('[zoˈliːdə]');
  const score = scoreGermanRhymeAnalyses(liebe, solide);
  assert.ok(score.overall < 0.95, `Liebe/solide was inflated to ${score.overall}`);
  assert.ok(score.overall > 0.80, `Liebe/solide should remain a strong slant: ${score.overall}`);
  assert.notEqual(score.type, 'multisyllabic_perfect');
});

test('a strong same-vowel near-coda pair outranks a distant pair', () => {
  const licht = analyzeGermanIpa('[lɪçt]');
  const blick = analyzeGermanIpa('[blɪk]');
  const sonne = analyzeGermanIpa('[ˈzɔnə]');
  const near = scoreGermanRhymeAnalyses(licht, blick);
  const far = scoreGermanRhymeAnalyses(licht, sonne);
  assert.ok(near.overall > far.overall, `${near.overall} should exceed ${far.overall}`);
  assert.ok(near.vowel > 0.95);
});

test('monosyllabic family classification requires an exact coda anchor', () => {
  const anchored = scoreGermanRhymeAnalyses(analyzeGermanIpa('[kɪnt]'), analyzeGermanIpa('[mɪt]'));
  const unanchored = scoreGermanRhymeAnalyses(analyzeGermanIpa('[haʊ̯s]'), analyzeGermanIpa('[baʊ̯m]'));
  assert.equal(anchored.type, 'family');
  assert.equal(anchored.codaAnchor, true);
  assert.notEqual(unanchored.type, 'family');
  assert.equal(unanchored.codaAnchor, false);
});

test('weak-vowel primary candidates do not become slant from consonants alone', () => {
  const score = scoreGermanRhymeAnalyses(analyzeGermanIpa('[naxt]'), analyzeGermanIpa('[zuːxt]'));
  assert.equal(score.type, 'weak');
  assert.ok(score.vowel < 0.45);
});

test('assonance is an independent relation and can coexist with a primary slant class', () => {
  const score = scoreGermanRhymeAnalyses(analyzeGermanIpa('[ˈliːbə]'), analyzeGermanIpa('[ˈmiːtə]'));
  assert.ok(['multisyllabic_slant','family','slant'].includes(score.type));
  assert.ok(score.relationTypes.includes('assonance'));
  assert.equal(score.relations.assonance.strength, 'strong');
});

test('reduced post-stress nuclei retain partial German assonance', () => {
  const score = scoreGermanRhymeAnalyses(analyzeGermanIpa('[ˈliːbə]'), analyzeGermanIpa('[ˈbliːbn̩]'));
  assert.equal(score.relationTypes.includes('assonance'), true);
  assert.equal(score.relations.assonance.strength, 'partial');
  assert.ok(score.relations.assonance.components.vowelSequence >= 0.84);
});

test('a shared first stressed vowel alone does not make multisyllabic assonance', () => {
  const score = scoreGermanRhymeAnalyses(analyzeGermanIpa('[ˈhɪt͡səˌfʁaɪ̯]'), analyzeGermanIpa('[ˈɪnˌhaːbɐ]'));
  assert.equal(score.relationTypes.includes('assonance'), false);
  assert.ok(score.relations.assonance.components.vowelSequence < 0.84);
});

test('same stressed vowel with different consonants is assonance', () => {
  const score = scoreGermanRhymeAnalyses(analyzeGermanIpa('[haʊ̯s]'), analyzeGermanIpa('[baʊ̯m]'));
  assert.ok(score.relationTypes.includes('assonance'));
});

test('ɔɪ parsing no longer creates bogus modern-word assonance', () => {
  const score = scoreGermanRhymeAnalyses(analyzeGermanIpa('[ˈspɔtɪfaɪ̯]'), analyzeGermanIpa('[ˈnɔɪ̯ə]'));
  assert.equal(score.relationTypes.includes('assonance'), false);
});

test('same consonant skeleton with contrasting vowels is consonance even without a primary rhyme', () => {
  const score = scoreGermanRhymeAnalyses(analyzeGermanIpa('[haʊ̯s]'), analyzeGermanIpa('[bɪs]'));
  assert.equal(score.type, 'weak');
  assert.ok(score.relationTypes.includes('consonance'));
  assert.equal(score.relations.consonance.strength, 'strong');
});

test('coarse coda classes bucket phonologically related final consonants', () => {
  assert.equal(coarseCodaClass(['t']), coarseCodaClass(['d']));
  assert.equal(coarseCodaClass(['k']), coarseCodaClass(['g']));
  assert.notEqual(coarseCodaClass(['t']), coarseCodaClass(['m']));
});
