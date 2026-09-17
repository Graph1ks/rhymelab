import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactWriterLexicalAnalyses,
  compatibilityAnalysis,
  normalizeWriterLexicalAnalyses,
  resolveWriterFamilyConsensus,
} from '../scripts/writer-lexical-model-core.mjs';

function option({
  key,
  lemma = 'stufenweise',
  normalizedLemma = lemma.toLocaleLowerCase('de-DE'),
  pos,
  confidence = 0.98,
  sourceRecordKey,
  matchKind = 'headword',
  styleTags = [],
  formFeatures = [],
}) {
  return {
    resolutionKey: key,
    lemma,
    normalizedLemma,
    pos,
    homographNo: 1,
    confidence,
    sourceRecordKey,
    matchKind,
    gender: null,
    isProper: false,
    isObsolete: false,
    historicalOnly: false,
    styleTags,
    formFeatures,
    candidateIpas: [],
  };
}

test('multi-analysis normalization preserves equal-confidence adjective and adverb analyses', () => {
  const analyses = normalizeWriterLexicalAnalyses([
    option({ key: 'adj-key', pos: 'adj', sourceRecordKey: 'source:adj' }),
    option({ key: 'adv-key', pos: 'adv', sourceRecordKey: 'source:adv' }),
  ]);

  assert.equal(analyses.length, 2);
  assert.deepEqual(analyses.map((row) => row.pos).sort(), ['adj', 'adv']);
  assert.deepEqual(analyses.map((row) => row.analysisKey), ['adj-key', 'adv-key']);
});

test('repeated evidence for one resolution merges provenance deterministically', () => {
  const first = option({
    key: 'noun-key',
    lemma: 'Arbeitsweise',
    normalizedLemma: 'arbeitsweise',
    pos: 'noun',
    sourceRecordKey: 'source:b',
    matchKind: 'headword',
    styleTags: ['rare'],
  });
  const second = option({
    key: 'noun-key',
    lemma: 'Arbeitsweise',
    normalizedLemma: 'arbeitsweise',
    pos: 'noun',
    sourceRecordKey: 'source:a',
    matchKind: 'form_of',
    formFeatures: ['singular'],
  });

  const forward = normalizeWriterLexicalAnalyses([first, second]);
  const reverse = normalizeWriterLexicalAnalyses([second, first]);

  assert.deepEqual(forward, reverse);
  assert.equal(forward.length, 1);
  assert.deepEqual(forward[0].sourceRecordKeys, ['source:a', 'source:b']);
  assert.deepEqual(forward[0].matchKinds, ['form_of', 'headword']);
  assert.deepEqual(forward[0].styleTags, ['rare']);
  assert.deepEqual(forward[0].formFeatures, ['singular']);
});

test('compatibility projection keeps old deterministic confidence and analysis-key tie break', () => {
  const analyses = normalizeWriterLexicalAnalyses([
    option({ key: 'z-key', pos: 'adv', confidence: 0.98, sourceRecordKey: 'source:z' }),
    option({ key: 'a-key', pos: 'adj', confidence: 0.98, sourceRecordKey: 'source:a' }),
    option({ key: 'lower-confidence', pos: 'noun', confidence: 0.94, sourceRecordKey: 'source:n' }),
  ]);

  const selected = compatibilityAnalysis(analyses);
  assert.equal(selected.analysisKey, 'a-key');
  assert.equal(selected.pos, 'adj');
});

test('compact analysis output is deterministic under input reordering', () => {
  const rows = [
    option({ key: 'adv-key', pos: 'adv', sourceRecordKey: 'source:adv' }),
    option({ key: 'adj-key', pos: 'adj', sourceRecordKey: 'source:adj' }),
  ];

  assert.deepEqual(
    compactWriterLexicalAnalyses(rows),
    compactWriterLexicalAnalyses([...rows].reverse()),
  );
});

test('family consensus resolves when multiple analyses converge on one family', () => {
  const result = resolveWriterFamilyConsensus([
    { analysisKey: 'adj-key', familyKey: 'right:weise' },
    { analysisKey: 'adv-key', familyKey: 'right:weise' },
  ]);

  assert.equal(result.status, 'resolved_converged');
  assert.equal(result.familyKey, 'right:weise');
  assert.deepEqual(result.supportedFamilies, [{
    familyKey: 'right:weise',
    analysisKeys: ['adj-key', 'adv-key'],
  }]);
});

test('family consensus refuses to guess across conflicting source-supported analyses', () => {
  const result = resolveWriterFamilyConsensus([
    { analysisKey: 'analysis-a', familyKey: 'right:weise' },
    { analysisKey: 'analysis-b', familyKey: 'right:reise' },
  ]);

  assert.equal(result.status, 'ambiguous_conflict');
  assert.equal(result.familyKey, null);
  assert.deepEqual(result.supportedFamilies.map((row) => row.familyKey), ['right:reise', 'right:weise']);
});

test('family consensus remains unresolved when no analysis supports a family', () => {
  const result = resolveWriterFamilyConsensus([
    { analysisKey: 'analysis-a', familyKey: null },
    { analysisKey: 'analysis-b', familyKey: null },
  ]);

  assert.equal(result.status, 'unresolved');
  assert.equal(result.familyKey, null);
  assert.deepEqual(result.supportedFamilies, []);
});
