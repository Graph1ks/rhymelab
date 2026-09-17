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

test('left-side variants expose common German linking-material analyses deterministically', () => {
  const arbeits = leftLexemeVariants('arbeits').map((entry) => entry.normalized);
  const kirchen = leftLexemeVariants('kirchen').map((entry) => entry.normalized);
  const ausnahms = leftLexemeVariants('ausnahms').map((entry) => entry.normalized);

  assert.ok(arbeits.includes('arbeit'));
  assert.ok(kirchen.includes('kirche'));
  assert.ok(ausnahms.includes('ausnahme'));
});

test('Arbeitsweise resolves to the attested right-head family weise', () => {
  const lexicon = attested(
    ['arbeit', 'Arbeit'],
    ['weise', 'Weise'],
  );
  const evidence = chooseAttestedRightHead('Arbeitsweise', lexicon);

  assert.equal(evidence.policy, WRITER_MORPHOLOGY_POLICY);
  assert.equal(evidence.status, 'attested_right_head_candidate');
  assert.equal(evidence.familyKey, 'right:weise');
  assert.equal(evidence.split.leftRaw, 'arbeits');
  assert.equal(evidence.leftEvidence.normalized, 'arbeit');
  assert.equal(evidence.leftEvidence.linker, 's');
  assert.equal(evidence.rightHead.normalized, 'weise');
});

test('Sonderpreise does not split into false Sonderp + reise when Preise is attested', () => {
  const lexicon = attested(
    ['sonder', 'sonder', 'adj'],
    ['preise', 'Preis'],
    ['reise', 'Reise'],
  );
  const evidence = chooseAttestedRightHead('Sonderpreise', lexicon);

  assert.equal(evidence.familyKey, 'right:preise');
  assert.equal(evidence.split.leftRaw, 'sonder');
  assert.equal(evidence.rightHead.normalized, 'preise');
});

test('rightmost lexical head wins over a longer nested attested compound', () => {
  const lexicon = attested(
    ['roh', 'roh', 'adj'],
    ['rohstoff', 'Rohstoff'],
    ['stoffpreise', 'Stoffpreis'],
    ['preise', 'Preis'],
  );
  const evidence = chooseAttestedRightHead('Rohstoffpreise', lexicon);

  assert.equal(evidence.familyKey, 'right:preise');
  assert.equal(evidence.split.leftRaw, 'rohstoff');
});

test('unresolved words stay explicitly unresolved instead of inventing morphology', () => {
  const lexicon = attested(['reise', 'Reise']);
  const evidence = chooseAttestedRightHead('Sonderpreise', lexicon);

  assert.equal(evidence.status, 'unresolved');
  assert.equal(evidence.familyKey, null);
});

test('candidate generation keeps the right side lexical and bounded', () => {
  const candidates = rightHeadSplitCandidates('Arbeitsweise');
  assert.ok(candidates.some((entry) => entry.right === 'weise'));
  assert.ok(candidates.every((entry) => entry.leftRaw.length >= 3));
  assert.ok(candidates.every((entry) => entry.right.length >= 5));
});
