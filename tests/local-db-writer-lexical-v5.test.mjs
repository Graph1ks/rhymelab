import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import { coarseCodaClass } from '../scripts/german-rhyme-features.mjs';
import { augmentPublishRowV3 } from '../scripts/writer-lexical-publish-v3-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(await readFile(
  new URL('./fixtures/writer-lexical-v3-options.json', import.meta.url),
  'utf8',
));

function compactPronunciation(ipa) {
  const analysis = analyzeGermanIpa(ipa);
  const final = analysis.syllables.at(-1);
  const row = {
    i: analysis.ipa,
    ph: analysis.canonicalPhonemes,
    sc: analysis.syllableCount,
    st: analysis.stressPattern,
    ps: analysis.primaryStressSyllable,
    rt: analysis.stressedTail,
    ft: analysis.finalTail,
    v: analysis.vowelSequence,
    c: analysis.consonantSequence,
    e: analysis.exactTailKey,
    vk: analysis.vowelKey,
    vf: analysis.vowelFamilyKey,
    ck: analysis.codaKey || '',
    cc: coarseCodaClass(final?.coda || []),
    rs: analysis.stressedSyllableCount,
    pr: 1,
    pf: 1,
    el: 1,
    ev: 1,
    so: 0,
    tg: [],
    rg: [],
    fg: [],
  };
  if (analysis.multisyllableKey) row.m = analysis.multisyllableKey;
  return row;
}

test('local DB builder stores publish-v3 lexical analyses in normalized v5 form_analysis rows', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'rhymelab-writer-v5-'));
  const publishDir = join(temp, 'publish-v3');
  const dbPath = join(temp, 'rhymelab-v5.sqlite');
  const reportPath = join(temp, 'build-report-v5.json');
  const rankingPath = join(temp, 'usage.tsv');
  const supplementalPath = join(temp, 'supplemental.json');

  try {
    await mkdir(publishDir, { recursive: true });
    let row = {
      ...fixture.base_row,
      u: 1,
      r: [compactPronunciation('ˈʃtuːfn̩ˌvaɪ̯zə')],
    };
    row = augmentPublishRowV3(row, fixture.options);

    const shardFile = 'shard-000001.jsonl';
    await writeFile(join(publishDir, shardFile), `${JSON.stringify(row)}\n`, 'utf8');
    await writeFile(join(publishDir, 'manifest.json'), `${JSON.stringify({
      schema: 'rhymelab-de-publish-v3',
      generated_at: 'fixture',
      pronunciation_source: 'fixture',
      pronunciation_policy: 'fixture',
      lexical_history_policy: 'fixture',
      files: [{ file: shardFile }],
      rhyme_ready_forms: 1,
      pronunciations: 1,
      preferred_pronunciations: 1,
      historical_forms: 0,
      lexical_analyses: row.a.length,
      forms_with_multiple_lexical_analyses: 1,
    }, null, 2)}\n`, 'utf8');
    await writeFile(
      rankingPath,
      'rank\tform\tnormalized_form\tusage_score\tcombined_count\tsource_count\n1\tstufenweise\tstufenweise\t1\t10\t1\n',
      'utf8',
    );
    await writeFile(supplementalPath, '{"entries":[]}\n', 'utf8');

    const run = spawnSync(process.execPath, [
      '--no-warnings',
      'scripts/build-local-db.mjs',
      '--publish', publishDir,
      '--out', dbPath,
      '--report', reportPath,
      '--ranking', rankingPath,
      '--supplemental', supplementalPath,
    ], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });

    assert.equal(run.status, 0, run.stderr || run.stdout);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.schema, 'rhymelab-local-db-build-v5');
    assert.equal(report.writer_lexical_model.schema, 'rhymelab-local-db-v5');
    assert.equal(report.writer_lexical_model.analysis_rows, 2);
    assert.equal(report.writer_lexical_model.base_forms_with_multiple_analyses, 1);

    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const meta = Object.fromEntries(
        db.prepare('SELECT key,value FROM meta').all().map((entry) => [entry.key, entry.value]),
      );
      assert.equal(meta.schema, 'rhymelab-local-db-v5');
      assert.equal(meta.publish_schema, 'rhymelab-de-publish-v3');
      assert.equal(Number(meta.writer_lexical_analysis_rows), 2);

      const hot = db.prepare(`
        SELECT surface,lemma,pos
        FROM hot
        WHERE publish_order=1 AND pronunciation_preferred=1
      `).get();
      assert.equal(hot.surface, 'stufenweise');
      assert.equal(hot.lemma, fixture.expected.compatibility_lemma);
      assert.equal(hot.pos, fixture.expected.compatibility_pos);

      const analyses = db.prepare(`
        SELECT analysis_key,pos,source_record_keys
        FROM form_analysis
        WHERE form_id=1
        ORDER BY analysis_key
      `).all();
      assert.deepEqual(analyses.map((entry) => entry.analysis_key), fixture.expected.analysis_keys);
      assert.deepEqual(
        JSON.parse(analyses.find((entry) => entry.analysis_key === 'adj-key').source_record_keys),
        fixture.expected.adj_source_record_keys,
      );
    } finally {
      db.close();
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
