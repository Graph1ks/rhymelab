import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import {
  createWriterAnchorStorage,
  insertWriterCandidateSuffixRows,
} from '../scripts/writer-anchor-materialization-v5-core.mjs';
import { createWriterMorphologyEvidenceStorage } from '../scripts/writer-morphology-materialization-v5-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function hotRow(id, publishOrder, surface, normalized, ipa, usageRank) {
  const analysis = analyzeGermanIpa(ipa);
  return {
    id,
    publishOrder,
    surface,
    normalized,
    ipa: analysis.ipa,
    vowelKey: analysis.vowelKey,
    syllables: analysis.syllableCount,
    usageRank,
  };
}

test('writer-v5 owner equivalence runner passes a compact indexed fixture', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'rhymelab-writer-v5-equivalence-'));
  const dbPath = join(temp, 'v5.sqlite');
  const planPath = join(temp, 'plan.json');
  const outPath = join(temp, 'report.json');
  const db = new DatabaseSync(dbPath);

  try {
    db.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE hot(
        id INTEGER PRIMARY KEY,
        publish_order INTEGER NOT NULL,
        surface TEXT NOT NULL,
        normalized TEXT NOT NULL,
        ipa TEXT NOT NULL,
        vowel_key TEXT NOT NULL,
        syllable_count INTEGER NOT NULL,
        usage_rank INTEGER,
        pronunciation_preferred INTEGER NOT NULL,
        historical INTEGER NOT NULL,
        pronunciation_rank INTEGER NOT NULL
      );
      CREATE TABLE form_analysis(
        form_id INTEGER NOT NULL,
        analysis_key TEXT NOT NULL,
        PRIMARY KEY(form_id,analysis_key)
      );
    `);
    const meta = db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
    for (const [key, value] of Object.entries({
      schema: 'rhymelab-local-db-v5',
      language: 'de',
      writer_anchor_policy: 'de-right-edge-anchors-v1',
      writer_anchor_storage: 'compact-primary-key-v2',
      writer_morphology_policy: 'de-attested-right-head-v4',
      writer_morphology_storage: 'positive-evidence-compact-v2',
    })) meta.run(key, value);

    createWriterAnchorStorage(db);
    createWriterMorphologyEvidenceStorage(db);

    const rows = [
      hotRow(1, 1, 'Arbeitsweise', 'arbeitsweise', 'ˈaʁbaɪ̯t͡sˌvaɪ̯zə', 1000),
      hotRow(2, 2, 'Hochzeitsreise', 'hochzeitsreise', 'ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə', 2000),
      hotRow(3, 3, 'Verweise', 'verweise', 'fɛɐ̯ˈvaɪ̯zə', 3000),
    ];
    const insertHot = db.prepare(`
      INSERT INTO hot(
        id,publish_order,surface,normalized,ipa,vowel_key,syllable_count,usage_rank,
        pronunciation_preferred,historical,pronunciation_rank
      ) VALUES(?,?,?,?,?,?,?,?,1,0,1)
    `);
    for (const row of rows) {
      insertHot.run(
        row.id,
        row.publishOrder,
        row.surface,
        row.normalized,
        row.ipa,
        row.vowelKey,
        row.syllables,
        row.usageRank,
      );
      insertWriterCandidateSuffixRows(db, row.id, row.ipa);
    }
    db.prepare('INSERT INTO form_analysis(form_id,analysis_key) VALUES(?,?)').run(3, 'verweisen-verb');
  } finally {
    db.close();
  }

  const plan = {
    schema: 'rhymelab-de-writer-page-plan-v2',
    language: 'de',
    version: 'fixture',
    sampling: {
      candidate_pool: 800,
      include_historical: false,
      include_variants: false,
    },
    queries: [{ word: 'Arbeitsweise' }],
    morphology_regressions: [{
      id: 'verweise-no-false-weise-family',
      word: 'Verweise',
      expected_family: null,
    }],
  };
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  try {
    const run = spawnSync(process.execPath, [
      '--no-warnings',
      'scripts/benchmark-writer-v5-equivalence.mjs',
      '--db', dbPath,
      '--plan', planPath,
      '--out', outPath,
      '--iterations', '1',
    ], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const report = JSON.parse(await readFile(outPath, 'utf8'));
    assert.equal(report.status, 'ok');
    assert.deepEqual(report.retrieval.missing_queries, []);
    assert.deepEqual(report.retrieval.mismatch_queries, []);
    assert.equal(report.retrieval.protected_arbeitsweise_hochzeitsreise, true);
    assert.equal(report.retrieval.sample_query_plan_uses_primary_key, true);
    assert.deepEqual(report.morphology.failure_ids, []);
    assert.equal(report.morphology.regressions[0].analysisPresent, true);
    assert.equal(report.morphology.regressions[0].pass, true);
    assert.equal(report.accepted_runtime_rewired, false);
    assert.equal(report.writer_runtime_rewired, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
