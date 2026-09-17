import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPronunciationVariants } from '../scripts/pronunciation-policy.mjs';

function ranked(variants) {
  return rankPronunciationVariants(variants).map((v) => ({
    ipa: v.ipa,
    preferred: v.preferred,
    eligible: v.eligible,
    flags: v.flags,
    locale: v.locale,
    register: v.register,
  }));
}

test('standard Musik pronunciation outranks marked Austrian and colloquial variants', () => {
  const result = ranked([
    { ipa: 'muˈziːk', evidenceCount: 1, sourceOrder: 0 },
    { ipa: 'muˈsɪk', tags: ['Austrian German'], evidenceCount: 1, sourceOrder: 1 },
    { ipa: 'ˈmʊzɪk', rawTags: ['bundesdeutsch, umgangssprachlich'], evidenceCount: 1, sourceOrder: 2 },
  ]);
  assert.equal(result[0].ipa, 'muˈziːk');
  assert.equal(result[0].preferred, true);
  const austrian = result.find((v) => v.ipa === 'muˈsɪk');
  const colloquial = result.find((v) => v.ipa === 'ˈmʊzɪk');
  assert.equal(austrian.locale, 'de-AT');
  assert.ok(austrian.flags.includes('regional'));
  assert.equal(colloquial.register, 'colloquial');
  assert.equal(austrian.preferred, false);
  assert.equal(colloquial.preferred, false);
});

test('repeated untagged source evidence outranks one-off alternatives', () => {
  const result = rankPronunciationVariants([
    { ipa: 'iːɐ̯', evidenceCount: 3, sourceOrder: 0 },
    { ipa: 'ˈɔɪ̯ɐ', evidenceCount: 1, sourceOrder: 1 },
    { ipa: 'ɔɪ̯ç', evidenceCount: 1, sourceOrder: 2 },
  ]);
  assert.equal(result[0].ipa, 'iːɐ̯');
  assert.equal(result[0].preferred, true);
});

test('connected-speech IPA is preserved but never preferred', () => {
  const result = rankPronunciationVariants([
    { ipa: 'eːɐ̯', evidenceCount: 1, sourceOrder: 0 },
    { ipa: 'ɐ', evidenceCount: 1, sourceOrder: 1 },
    { ipa: 'ˈvas‿ɐ', evidenceCount: 1, sourceOrder: 2 },
  ]);
  const connected = result.find((v) => v.ipa === 'ˈvas‿ɐ');
  assert.equal(result[0].ipa, 'eːɐ̯');
  assert.equal(connected.eligible, false);
  assert.equal(connected.preferred, false);
  assert.ok(connected.flags.includes('connected_speech'));
});

test('context-specific pronunciation remains available but loses default priority', () => {
  const result = rankPronunciationVariants([
    { ipa: 'daˈbaɪ̯', evidenceCount: 1, sourceOrder: 0 },
    { ipa: 'ˈdaːbaɪ̯', rawTags: ['demonstrativ'], evidenceCount: 1, sourceOrder: 1 },
  ]);
  assert.equal(result[0].ipa, 'daˈbaɪ̯');
  assert.equal(result[0].preferred, true);
  assert.ok(result[1].flags.includes('context_specific'));
});
