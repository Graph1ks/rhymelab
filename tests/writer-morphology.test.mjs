import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WRITER_MORPHOLOGY_POLICY,
  chooseAttestedRightHead,
  leftLexemeVariants,
  rightHeadSplitCandidates,
} from '../src/writer-morphology.mjs';

function attested(...entries) {
  return new Map(entries.map(([normalized, lemma = normalized, pos = 'noun', usageRank = 10000]) => [
    normalized,
    { normalized, surface: normalized, lemma, pos, usage_rank: usageRank },
  ]));
}

function whole(surface, lemma, partOfSpeech) {
  return { surface, normalized: surface.toLocaleLowerCase('de-DE'), lemma, partOfSpeech };
}

test('left-side variants expose common German linking-material analyses deterministically', () => {
  const arbeits = leftLexemeVariants('arbeits').map((entry) => entry.normalized);
  const kirchen = leftLexemeVariants('kirchen').map((entry) => entry.normalized);
  const ausnahms = leftLexemeVariants('ausnahms').map((entry) => entry.normalized);

  assert.ok(arbeits.includes('arbeit'));
  assert.ok(kirchen.includes('kirche'));
  assert.ok(ausnahms.includes('ausnahme'));
});

test('Arbeitsweise resolves to conservative right-head lemma family weise', () => {
  const lexicon = attested(
    ['arbeit', 'Arbeit', 'noun', 200],
    ['weise', 'Weise', 'noun', 691],
  );
  const evidence = chooseAttestedRightHead(
    whole('Arbeitsweise', 'Arbeitsweise', 'noun'),
    lexicon,
  );

  assert.equal(evidence.policy, WRITER_MORPHOLOGY_POLICY);
  assert.equal(evidence.status, 'attested_right_head_candidate');
  assert.equal(evidence.familyKey, 'right:weise');
  assert.equal(evidence.split.leftRaw, 'arbeits');
  assert.equal(evidence.leftEvidence.normalized, 'arbeit');
  assert.equal(evidence.leftEvidence.linker, 's');
  assert.equal(evidence.rightHead.normalized, 'weise');
  assert.equal(evidence.rightHead.familyLemma, 'weise');
  assert.equal(evidence.constructionRule, null);
});

test('productive German adverbial -weise uses explicit construction evidence', () => {
  const lexicon = attested(
    ['schätzung', 'Schätzung', 'noun', 9000],
    ['weise', 'Weise', 'noun', 691],
  );
  const evidence = chooseAttestedRightHead(
    whole('schätzungsweise', 'schätzungsweise', 'adv'),
    lexicon,
  );

  assert.equal(evidence.status, 'attested_right_head_candidate');
  assert.equal(evidence.familyKey, 'right:weise');
  assert.equal(evidence.constructionRule, 'de-adverbial-weise-v1');
  assert.equal(evidence.source, 'local_hot_explicit_construction_evidence');
  assert.equal(evidence.split.leftRaw, 'schätzungs');
  assert.equal(evidence.leftEvidence.normalized, 'schätzung');
  assert.equal(evidence.checks.headPartOfSpeechCompatible, false);
  assert.equal(evidence.checks.explicitConstructionRule, 'de-adverbial-weise-v1');
});

test('ordinary non-adverb forms ending near -weise do not receive the adverbial construction rule', () => {
  const lexicon = attested(
    ['ver', 'ver', 'name', 1000],
    ['weise', 'Weise', 'noun', 691],
  );
  const evidence = chooseAttestedRightHead(
    whole('Verweise', 'Verweis', 'noun'),
    lexicon,
  );

  assert.equal(evidence.status, 'unresolved');
  assert.equal(evidence.familyKey, null);
});

test('Sonderpreise keeps Preise as the right head and never invents Sonderp + Reise', () => {
  const lexicon = attested(
    ['sonder', 'sonder', 'adj', 10000],
    ['preise', 'Preis', 'noun', 1447],
    ['reise', 'Reise', 'noun', 1387],
  );
  const evidence = chooseAttestedRightHead(
    whole('Sonderpreise', 'Sonderpreis', 'noun'),
    lexicon,
  );

  assert.equal(evidence.familyKey, 'right:preis');
  assert.equal(evidence.split.leftRaw, 'sonder');
  assert.equal(evidence.rightHead.normalized, 'preise');
});

test('rightmost lexical head wins over a longer nested attested compound', () => {
  const lexicon = attested(
    ['roh', 'roh', 'adj', 1000],
    ['rohstoff', 'Rohstoff', 'noun', 2000],
    ['stoffpreise', 'Stoffpreis', 'noun', 3000],
    ['preise', 'Preis', 'noun', 1447],
  );
  const evidence = chooseAttestedRightHead(
    whole('Rohstoffpreise', 'Rohstoffpreis', 'noun'),
    lexicon,
  );

  assert.equal(evidence.familyKey, 'right:preis');
  assert.equal(evidence.split.leftRaw, 'rohstoff');
});

test('Betriebe false substring split is rejected by head POS and lemma evidence', () => {
  const lexicon = attested(
    ['bet', 'beten', 'verb', 317659],
    ['riebe', 'reiben', 'verb', 500000],
  );
  const evidence = chooseAttestedRightHead(
    whole('Betriebe', 'Betrieb', 'noun'),
    lexicon,
  );

  assert.equal(evidence.status, 'unresolved');
  assert.equal(evidence.familyKey, null);
});

test('Bestreben false Best + Reben split is rejected by whole-lemma suffix evidence', () => {
  const lexicon = attested(
    ['best', 'Best', 'name', 7006],
    ['reben', 'Rebe', 'noun', 38974],
  );
  const evidence = chooseAttestedRightHead(
    whole('Bestreben', 'Bestreben', 'noun'),
    lexicon,
  );

  assert.equal(evidence.status, 'unresolved');
  assert.equal(evidence.familyKey, null);
});

test('adjective compounds can use the right-head lemma when POS and lemma boundary agree', () => {
  const lexicon = attested(
    ['deutschland', 'Deutschland', 'name', 123],
    ['weite', 'weit', 'adj', 5125],
  );
  const evidence = chooseAttestedRightHead(
    whole('deutschlandweite', 'deutschlandweit', 'adj'),
    lexicon,
  );

  assert.equal(evidence.status, 'attested_right_head_candidate');
  assert.equal(evidence.familyKey, 'right:weit');
  assert.equal(evidence.split.leftRaw, 'deutschland');
});

test('verbs stay unresolved until explicit deterministic prefix/form-of morphology exists', () => {
  const lexicon = attested(
    ['durch', 'durch', 'prep', 53],
    ['leben', 'leben', 'verb', 206],
  );
  const evidence = chooseAttestedRightHead(
    whole('durchleben', 'durchleben', 'verb'),
    lexicon,
  );

  assert.equal(evidence.status, 'unresolved');
  assert.equal(evidence.familyKey, null);
});

test('proper names stay unresolved rather than being split on coincidental lexemes', () => {
  const lexicon = attested(
    ['roch', 'Roch', 'name', 90000],
    ['ester', 'Ester', 'name', 50000],
  );
  const evidence = chooseAttestedRightHead(
    whole('Rochester', 'Rochester', 'name'),
    lexicon,
  );

  assert.equal(evidence.status, 'unresolved');
  assert.equal(evidence.familyKey, null);
});

test('unresolved words stay explicitly unresolved instead of inventing morphology', () => {
  const lexicon = attested(['reise', 'Reise', 'noun', 1387]);
  const evidence = chooseAttestedRightHead(
    whole('Sonderpreise', 'Sonderpreis', 'noun'),
    lexicon,
  );

  assert.equal(evidence.status, 'unresolved');
  assert.equal(evidence.familyKey, null);
});

test('candidate generation keeps the right side lexical and bounded', () => {
  const candidates = rightHeadSplitCandidates('Arbeitsweise');
  assert.ok(candidates.some((entry) => entry.right === 'weise'));
  assert.ok(candidates.every((entry) => entry.leftRaw.length >= 3));
  assert.ok(candidates.every((entry) => entry.right.length >= 5));
});
