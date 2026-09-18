import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePhraseMosaicDiversity,
  findDiversityRow,
  repetitionExposure,
  PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_POLICY,
} from '../scripts/phrase-mosaic-diversity-diagnostics-core.mjs';

function row({
  rank,
  windowId,
  phraseId,
  canonical,
  type = 'family',
  score = 0.8,
}) {
  return {
    writerPageRank: rank,
    windowId,
    phraseId,
    canonical,
    score: {
      type,
      overall: score,
    },
  };
}

function rankedFixture() {
  return {
    schema: 'rhymelab-phrase-mosaic-ranking-candidate-v2',
    policy: 'de-phrase-writer-utility-v2-phonetic-guard-candidate',
    rankingFingerprint: 'fixture-ranking',
    candidates: [
      row({ rank: 1, windowId: 'w1', phraseId: 'p1', canonical: 'bei Seite' }),
      row({ rank: 2, windowId: 'w2', phraseId: 'p1', canonical: 'bei Seite' }),
      row({ rank: 3, windowId: 'w3', phraseId: 'p2', canonical: 'Bei   Seite' }),
      row({ rank: 4, windowId: 'w4', phraseId: 'p3', canonical: 'an Seite' }),
      row({ rank: null, windowId: 'diag', phraseId: 'pd', canonical: 'bei Seite' }),
      row({ rank: 5, windowId: 'w5', phraseId: 'p4', canonical: 'bei Reise' }),
    ],
    writerPageCandidates: [
      row({ rank: 1, windowId: 'w1', phraseId: 'p1', canonical: 'bei Seite' }),
      row({ rank: 2, windowId: 'w2', phraseId: 'p1', canonical: 'bei Seite' }),
      row({ rank: 3, windowId: 'w3', phraseId: 'p2', canonical: 'Bei   Seite' }),
      row({ rank: 4, windowId: 'w4', phraseId: 'p3', canonical: 'an Seite' }),
      row({ rank: 5, windowId: 'w5', phraseId: 'p4', canonical: 'bei Reise' }),
    ],
  };
}

test('11E3 diversity diagnostic measures duplicates, heads, families and lexical frames without suppression', () => {
  const ranked = rankedFixture();
  const before = JSON.stringify(ranked);
  const diagnostic = analyzePhraseMosaicDiversity(ranked, { topLimits: [3, 5] });

  assert.equal(diagnostic.policy, PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_POLICY);
  assert.equal(diagnostic.readOnly, true);
  assert.equal(diagnostic.suppressionImplemented, false);
  assert.equal(diagnostic.writerPageCandidateCount, 5);
  assert.deepEqual(diagnostic.topLimits, [3, 5]);

  const top5 = diagnostic.top['5'];
  assert.equal(top5.exactCanonical.excessMembershipCount, 1);
  assert.equal(top5.normalizedCanonical.excessMembershipCount, 2);
  assert.equal(top5.lexicalHead.groups[0].key, 'seite');
  assert.equal(top5.lexicalHead.groups[0].count, 4);
  assert.equal(top5.phraseFamily.groups[0].key, 'p1');
  assert.equal(top5.phraseFamily.groups[0].count, 2);
  assert.ok(top5.lexicalFrame.repeatedGroupCount >= 2);

  assert.equal(JSON.stringify(ranked), before);
});

test('11E3 diversity diagnostic uses only accepted Writer-page candidates and is deterministic', () => {
  const ranked = rankedFixture();
  const first = analyzePhraseMosaicDiversity(ranked);
  const second = analyzePhraseMosaicDiversity(ranked);

  assert.equal(first.writerPageCandidateCount, 5);
  assert.equal(first.top['50'].rows.some((entry) => entry.windowId === 'diag'), false);
  assert.equal(first.diagnosticFingerprint, second.diagnosticFingerprint);
  assert.equal(first.inflectionIdentity.available, false);
});

test('11E3 diagnostic exposes repetition membership for protected-result inspection', () => {
  const diagnostic = analyzePhraseMosaicDiversity(rankedFixture(), { topLimits: [5] });
  const first = findDiversityRow(diagnostic, { windowId: 'w1', limit: 5 });
  const exposure = repetitionExposure(first);

  assert.equal(first.canonical, 'bei Seite');
  assert.equal(exposure.exposed, true);
  assert.ok(exposure.clusterKinds.includes('exact_canonical'));
  assert.ok(exposure.clusterKinds.includes('normalized_canonical'));
  assert.ok(exposure.clusterKinds.includes('lexical_head'));
  assert.ok(exposure.clusterKinds.includes('phrase_family'));
  assert.ok(exposure.clusterKinds.includes('lexical_frame'));

  const missing = repetitionExposure(
    findDiversityRow(diagnostic, { canonical: 'nicht vorhanden', limit: 5 }),
  );
  assert.deepEqual(missing, { exposed: false, clusterKinds: [] });
});
