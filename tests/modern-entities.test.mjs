import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';

const expectedPreferred = {
  Spotify: 'ˈspɔtɪfaɪ̯',
  Twitter: 'ˈtvɪtɐ',
  YouTube: 'ˈjuːtuːp',
  TikTok: 'ˈtɪktɔk',
  Instagram: 'ˈɪnstəɡʁam',
  Netflix: 'ˈnɛtflɪks',
};

test('modern entity lexicon is unique and pronunciation-backed', async () => {
  const source = JSON.parse(await readFile('data/supplemental/modern-entities.json', 'utf8'));
  assert.equal(source.schema, 'rhymelab-modern-entities-v1');
  assert.ok(Array.isArray(source.entries));
  assert.ok(source.entries.length >= 20);

  const normalized = new Set();
  for (const entry of source.entries) {
    assert.ok(entry.word);
    assert.ok(entry.kind);
    const key = entry.word.normalize('NFKC').toLocaleLowerCase('de-DE');
    assert.equal(normalized.has(key), false, `duplicate modern entity: ${entry.word}`);
    normalized.add(key);
    assert.ok(Array.isArray(entry.pronunciations) && entry.pronunciations.length > 0, `missing pronunciation: ${entry.word}`);
    assert.equal(entry.pronunciations.filter((p) => p.preferred).length, 1, `expected one preferred pronunciation: ${entry.word}`);
    for (const pronunciation of entry.pronunciations) {
      const analysis = analyzeGermanIpa(pronunciation.ipa);
      assert.ok(analysis.syllableCount >= 1, `invalid pronunciation: ${entry.word}`);
      assert.ok(analysis.exactTailKey, `missing rhyme key: ${entry.word}`);
    }
  }

  for (const [word, ipa] of Object.entries(expectedPreferred)) {
    const entry = source.entries.find((candidate) => candidate.word === word);
    assert.ok(entry, `missing required modern entity: ${word}`);
    assert.equal(entry.pronunciations.find((p) => p.preferred)?.ipa, ipa, `unexpected preferred pronunciation: ${word}`);
  }
});
