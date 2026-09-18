import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyWiktionaryHistory,
  classifyWiktionaryRecordHistory,
  classifyWiktionaryIpaLocale,
  decodeMsgpack,
  isExplicitProperNameRecord,
  isSingleTokenSurface,
  isWriterCandidateSurface,
  normalizeEnglishSurface,
  parseCmudictSurface,
  parseEsdbLine,
  parseWordfreqCBpack,
} from '../scripts/en-writer-source-core.mjs';

test('English source normalization is deterministic and conservative', () => {
  assert.equal(normalizeEnglishSurface('  Don’t  '), "don't");
  assert.equal(isSingleTokenSurface('ice-cold'), true);
  assert.equal(isSingleTokenSurface('ice cold'), false);
  assert.equal(isWriterCandidateSurface("rock'n'roll"), true);
  assert.equal(isWriterCandidateSurface('1234'), false);
});

test('Wiktionary history and pronunciation tags stay source-driven', () => {
  assert.deepEqual(classifyWiktionaryHistory(['archaic', 'formal']), {
    archaic: true,
    obsolete: false,
    historical: false,
    dated: false,
  });
  assert.deepEqual(classifyWiktionaryIpaLocale({ ipa: '/tɛst/', tags: ['General-American'] }).us, true);
  assert.deepEqual(classifyWiktionaryIpaLocale({ ipa: '/tɛst/', tags: ['Received-Pronunciation'] }).uk, true);
  assert.deepEqual(classifyWiktionaryIpaLocale({ ipa: '/tɛst/', tags: ['phonemic'] }).unqualified, true);
});


test('Wiktionary historical-only requires no current lexical sense', () => {
  const mixed = classifyWiktionaryRecordHistory({
    word: 'test',
    pos: 'noun',
    senses: [
      { glosses: ['current sense'] },
      { glosses: ['older sense'], tags: ['archaic'] },
    ],
  });
  assert.equal(mixed.archaic, true);
  assert.equal(mixed.historical_only, false);
  assert.equal(mixed.current_sense_count, 1);
  assert.equal(mixed.historical_sense_count, 1);

  const oldOnly = classifyWiktionaryRecordHistory({
    word: 'olde',
    pos: 'adjective',
    senses: [
      { tags: ['archaic'] },
      { tags: ['obsolete'] },
    ],
  });
  assert.equal(oldOnly.historical_only, true);
  assert.equal(oldOnly.current_sense_count, 0);
  assert.equal(oldOnly.historical_sense_count, 2);

  const recordWide = classifyWiktionaryRecordHistory({
    word: 'historic-form',
    tags: ['obsolete'],
    senses: [{ glosses: ['only sense'] }],
  });
  assert.equal(recordWide.historical_only, true);
});


test('sense-level proper-name tags do not poison a common lexical record', () => {
  assert.equal(isExplicitProperNameRecord({
    word:'college',
    pos:'noun',
    senses:[
      { glosses:['an institution of higher education'] },
      { glosses:['a named college'], tags:['proper-noun'] },
    ],
  }), false);

  assert.equal(isExplicitProperNameRecord({
    word:'London',
    pos:'name',
    senses:[{ glosses:['a city'] }],
  }), true);

  assert.equal(isExplicitProperNameRecord({
    word:'Example',
    pos:'noun',
    tags:['proper-name'],
    senses:[{ glosses:['a named entity'] }],
  }), true);
});

test('CMUdict alternate pronunciations normalize to the base surface', () => {
  assert.equal(parseCmudictSurface('WORD(2)  W ER1 D'), 'word');
  assert.equal(parseCmudictSurface(';;; comment'), null);
});

test('ESDB/SCOWL source-master lines expose spelling, inflection and variant evidence', () => {
  const standard = parseEsdbLine('60 US: A: color <n>: colors');
  assert.equal(standard.size, 60);
  assert.equal(standard.region, 'US');
  assert.deepEqual(standard.forms, ['color', 'colors']);
  assert.equal(standard.archaic, false);

  const archaic = parseEsdbLine('85 GB: B@: colour <n>: colours');
  assert.equal(archaic.archaic, true);
  assert.equal(archaic.variants[0].level, 7);
});

test('minimal MessagePack decoder supports wordfreq cBpack v1 structure', () => {
  const packed = Buffer.from([
    0x92,
    0x82,
    0xa6, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74,
    0xa2, 0x63, 0x42,
    0xa7, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e,
    0x01,
    0x91, 0xa3, 0x74, 0x68, 0x65,
  ]);
  const decoded = decodeMsgpack(packed);
  assert.deepEqual(decoded[0], { format: 'cB', version: 1 });
  assert.deepEqual(parseWordfreqCBpack(decoded), [{ word: 'the', bucketIndex: 0, zipf: 9 }]);
});
