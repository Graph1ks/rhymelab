import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCEPTED_PHRASE_MOSAIC_ANCHOR_FINGERPRINT,
  compoundRightEdgeComponent,
  normalizeUnifiedLanguageBasis,
  normalizeUnifiedResultLanguage,
  normalizeUnifiedResultScope,
  rightEdgeQueryToken,
  unifiedWriterCapabilities,
} from '../src/unified-writer-search.mjs';

test('unified Writer normalizes language bases deterministically', () => {
  assert.equal(normalizeUnifiedLanguageBasis('de'), 'de');
  assert.equal(normalizeUnifiedLanguageBasis('EN'), 'en');
  assert.equal(normalizeUnifiedLanguageBasis('both'), 'both');
  assert.equal(normalizeUnifiedLanguageBasis('unsupported'), 'de');
  assert.equal(normalizeUnifiedLanguageBasis(''), 'de');
});

test('unified Writer normalizes result language independently from query language', () => {
  assert.equal(normalizeUnifiedResultLanguage('de', 'en'), 'de');
  assert.equal(normalizeUnifiedResultLanguage('EN', 'de'), 'en');
  assert.equal(normalizeUnifiedResultLanguage('both', 'de'), 'both');
  assert.equal(normalizeUnifiedResultLanguage('', 'en'), 'en');
  assert.equal(normalizeUnifiedResultLanguage('unsupported', 'de'), 'de');
});

test('unified Writer accepts an explicitly transported nested compound right edge', () => {
  assert.equal(compoundRightEdgeComponent({
    queryPronunciation: {
      method: 'client_token_chain',
      rightEdgeComponent: 'Abende',
      components: ['Eins', 'Zwei', 'Drei', 'Vier', 'Murmeltierabende'],
    },
  }), 'Abende');
});

test('unified Writer extracts source-backed compound right-edge components only for compound resolver methods', () => {
  assert.equal(compoundRightEdgeComponent({
    queryPronunciation: {
      method: 'client_source_reference_compound_right_edge',
      components: ['Alt', 'Kassen', 'Verwaltungs', 'Anker'],
    },
  }), 'Anker');
  assert.equal(compoundRightEdgeComponent({
    queryPronunciation: {
      method: 'client_mixed_reference_compound_right_edge',
      components: ['Growth', 'Hormon', 'Producer'],
    },
  }), 'Producer');
  assert.equal(compoundRightEdgeComponent({
    queryPronunciation: {
      method: 'client_token_chain',
      components: ['holy', 'night'],
    },
  }), '');
});

test('unified Writer exposes the lexical right edge of multi-token queries', () => {
  assert.equal(rightEdgeQueryToken('Eins Zwei Drei Vier Murmeltiere abends'), 'abends');
  assert.equal(rightEdgeQueryToken('  holy   night  '), 'night');
  assert.equal(rightEdgeQueryToken('Abends'), 'Abends');
});

test('unified Writer normalizes result scope deterministically', () => {
  assert.equal(normalizeUnifiedResultScope('all'), 'all');
  assert.equal(normalizeUnifiedResultScope('WORDS'), 'words');
  assert.equal(normalizeUnifiedResultScope('phrases'), 'phrases');
  assert.equal(normalizeUnifiedResultScope('entities'), 'entities');
  assert.equal(normalizeUnifiedResultScope('other'), 'all');
});

test('English capability is explicit and never silently emulated', () => {
  const capabilities = unifiedWriterCapabilities();

  assert.equal(capabilities.languages.en.available, false);
  assert.equal(capabilities.languages.en.wordWriter, false);
  assert.equal(capabilities.languages.en.phraseMosaic, false);
  assert.equal(capabilities.languages.en.entityRhymes, false);
  assert.equal(
    capabilities.languages.en.reason,
    'english_database_unavailable',
  );
  assert.equal(capabilities.bases.en, false);
  assert.equal(capabilities.acceptedPhraseAnchorFingerprint,
    ACCEPTED_PHRASE_MOSAIC_ANCHOR_FINGERPRINT);
});

test('missing phrase database cannot claim Phrase/Mosaic availability', () => {
  const fakeWriterDb = {};
  const capabilities = unifiedWriterCapabilities({ writerDb: fakeWriterDb });

  assert.equal(capabilities.languages.de.available, true);
  assert.equal(capabilities.languages.de.wordWriter, true);
  assert.equal(capabilities.languages.de.phraseMosaic, false);
  assert.equal(
    capabilities.languages.de.phraseReason,
    'phrase_database_unavailable',
  );
  assert.equal(capabilities.bases.de, true);
  assert.equal(capabilities.bases.both, true);
});
