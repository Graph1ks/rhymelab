import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import { coarseCodaClass } from '../scripts/german-rhyme-features.mjs';
import { findRhymes, getStats, getWord, openRhymeDb, searchWords } from '../src/local-engine.mjs';

const root = process.cwd();

function compact(ipa, { rank = 1, preferred = true, eligible = true, tags = [], rawTags = [], flags = [], locale = null, dialect = null, register = null } = {}) {
  const a = analyzeGermanIpa(ipa);
  const final = a.syllables.at(-1);
  const out = {
    i: a.ipa, ph: a.canonicalPhonemes, sc: a.syllableCount, st: a.stressPattern,
    ps: a.primaryStressSyllable, rt: a.stressedTail, ft: a.finalTail,
    v: a.vowelSequence, c: a.consonantSequence, e: a.exactTailKey,
    vk: a.vowelKey, vf: a.vowelFamilyKey, ck: a.codaKey,
    cc: coarseCodaClass(final?.coda || []), rs: a.stressedSyllableCount,
    pr: rank, pf: preferred ? 1 : 0, el: eligible ? 1 : 0, ev: 1, so: rank - 1,
    tg: tags, rg: rawTags, fg: flags,
  };
  if (a.multisyllableKey) out.m = a.multisyllableKey;
  if (locale) out.lo = locale;
  if (dialect) out.di = dialect;
  if (register) out.re = register;
  return out;
}

test('local SQLite build uses preferred pronunciation variants and syllable-first ranking', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rhymelab-local-'));
  const publish = join(dir, 'publish');
  const dbPath = join(dir, 'rhymelab.sqlite');
  const reportPath = join(dir, 'report.json');
  const supplementalPath = join(dir, 'supplemental.json');
  await mkdir(publish, { recursive: true });
  await writeFile(supplementalPath, JSON.stringify({ schema: 'test', entries: [] }), 'utf8');

  const rows = [
    { o: 1, u: 1, s: 100, w: 'Liebe', n: 'liebe', l: 'Liebe', p: 'noun', r: [compact('[ˈliːbə]')] },
    { o: 2, u: 2, s: 95, w: 'Getriebe', n: 'getriebe', l: 'Getriebe', p: 'noun', r: [compact('[ɡəˈtriːbə]')] },
    { o: 3, u: 3, s: 90, w: 'Triebe', n: 'triebe', l: 'Trieb', p: 'noun', r: [compact('[ˈtriːbə]')] },
    { o: 4, u: 4, s: 80, w: 'Musik', n: 'musik', l: 'Musik', p: 'noun', r: [
      compact('[muˈziːk]'),
      compact('[muˈsɪk]', { rank: 2, preferred: false, tags: ['Austrian German'], flags: ['regional'], locale: 'de-AT', dialect: 'Austrian German' }),
    ] },
    { o: 5, u: 5, s: 70, w: 'Blick', n: 'blick', l: 'Blick', p: 'noun', r: [compact('[blɪk]')] },
    { o: 6, u: 6, s: 65, w: 'Arbeitsweise', n: 'arbeitsweise', l: 'Arbeitsweise', p: 'noun', r: [compact('[ˈaʁbaɪ̯t͡sˌvaɪ̯zə]')] },
    { o: 7, u: 7, s: 60, w: 'Eis', n: 'eis', l: 'Eis', p: 'noun', r: [compact('[aɪ̯s]')] },
    { o: 8, u: 8, s: 55, w: 'Ha', n: 'ha', l: 'Ha', p: 'interjection', r: [compact('[haː]')] },
    { o: 9, u: 9, s: 50, w: 'Reise', n: 'reise', l: 'Reise', p: 'noun', r: [compact('[ˈʁaɪ̯zə]')] },
  ];
  const shard = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await writeFile(join(publish, 'shard-000001.jsonl'), shard, 'utf8');
  await writeFile(join(publish, 'manifest.json'), JSON.stringify({
    schema: 'rhymelab-de-publish-v2',
    generated_at: new Date().toISOString(),
    pronunciation_source: 'test', pronunciation_policy: 'de-pron-priority-v1',
    rhyme_ready_forms: rows.length,
    usage_ranked_rhyme_ready_forms: rows.length,
    pronunciations: 10,
    preferred_pronunciations: 9,
    files: [{ file: 'shard-000001.jsonl' }],
  }), 'utf8');

  execFileSync(process.execPath, [
    'scripts/build-local-db.mjs', '--publish', publish, '--out', dbPath, '--report', reportPath,
    '--supplemental', supplementalPath,
  ], { cwd: root, stdio: 'pipe' });

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.language, 'de');
  assert.equal(report.forms, 5);
  assert.equal(report.pronunciations, 6);
  assert.equal(report.preferred_pronunciations, 5);
  assert.equal(report.supplemental_forms, 0);

  const db = openRhymeDb(dbPath);
  try {
    assert.equal(getStats(db).language, 'de');
    assert.equal(getStats(db).forms, 9);
    assert.equal(searchWords(db, 'lie')[0].surface, 'Liebe');
    assert.equal(getWord(db, 'MUSIK').pronunciations.length, 2);
    assert.equal(getWord(db, 'MUSIK').pronunciations[0].preferred, true);

    const rhymes = findRhymes(db, 'Liebe', { limit: 10 });
    const triebe = rhymes.results.find((row) => row.word === 'Triebe');
    const getriebe = rhymes.results.find((row) => row.word === 'Getriebe');
    assert.ok(triebe);
    assert.ok(getriebe);
    assert.equal(triebe.type, 'multisyllabic_perfect');
    assert.equal(triebe.score, 1);
    assert.equal(triebe.syllableCount, 2);
    assert.equal(getriebe.syllableCount, 3);
    assert.ok(rhymes.results.indexOf(triebe) < rhymes.results.indexOf(getriebe), 'same-syllable perfect rhyme should outrank a more common 3-syllable perfect rhyme');

    const preferredMusik = findRhymes(db, 'Musik', { limit: 20 });
    assert.equal(preferredMusik.variantMode, 'preferred');
    assert.equal(preferredMusik.results.some((row) => row.word === 'Blick' && row.score === 1), false);

    const allMusik = findRhymes(db, 'Musik', { limit: 20, includeVariants: true });
    assert.equal(allMusik.variantMode, 'all');
    assert.equal(allMusik.results.some((row) => row.word === 'Blick' && row.score === 1), true);

    const oneSyllableArbeitsweise = findRhymes(db, 'Arbeitsweise', {
      limit: 20,
      syllableFilter: '1',
    });
    assert.ok(oneSyllableArbeitsweise.results.length > 0);
    assert.ok(oneSyllableArbeitsweise.results.every((row) => row.syllableCount === 1));
    assert.ok(
      oneSyllableArbeitsweise.results.some((row) => row.word === 'Eis'),
      'one-syllable Arbeitsweise must retrieve the right-edge /aɪ/ family',
    );
    assert.equal(
      oneSyllableArbeitsweise.results.some((row) => row.word === 'Ha'),
      false,
      'one-syllable Arbeitsweise must not retrieve the primary /a/ family',
    );

    const twoSyllableArbeitsweise = findRhymes(db, 'Arbeitsweise', {
      limit: 20,
      syllableFilter: '2',
    });
    assert.ok(twoSyllableArbeitsweise.results.every((row) => row.syllableCount === 2));
    assert.ok(twoSyllableArbeitsweise.results.some((row) => row.word === 'Reise'));
  } finally {
    db.close();
  }
});
