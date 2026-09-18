import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  computePhraseCatalogFingerprint,
  extractWiktextractPhrase,
  normalizePhraseText,
  registerPhraseSnapshot,
  registerPhraseSource,
  tokenizePhrase,
} from '../scripts/phrase-catalog-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const wiktextractFixture = fileURLToPath(new URL(
  './fixtures/phrase-wiktextract.jsonl',
  import.meta.url,
));
const newsFixture = fileURLToPath(new URL(
  './fixtures/phrase-leipzig-news-sentences.txt',
  import.meta.url,
));
const webFixture = fileURLToPath(new URL(
  './fixtures/phrase-leipzig-web-sentences.txt',
  import.meta.url,
));
const wikipediaFixture = fileURLToPath(new URL(
  './fixtures/phrase-leipzig-wikipedia-sentences.txt',
  import.meta.url,
));

function runBuild({ dbPath, reportPath }) {
  return spawnSync(process.execPath, [
    '--no-warnings',
    'scripts/build-de-phrase-catalog.mjs',
    '--wiktextract', wiktextractFixture,
    '--wiktionary-snapshot', 'fixture-2026-09-01',
    '--leipzig-sentences', `deu_news_2024_1M=${newsFixture}`,
    '--leipzig-sentences', `deu-de_web_2021_1M=${webFixture}`,
    '--leipzig-sentences', `deu_wikipedia_2021_1M=${wikipediaFixture}`,
    '--out', dbPath,
    '--report', reportPath,
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
}

test('phrase tokenizer preserves deterministic token boundaries without inventing pronunciation', () => {
  const tokens = tokenizePhrase('Ende gut, alles gut!');
  assert.deepEqual(
    tokens.map((token) => [token.surface, token.normalized, token.charStart, token.charEnd]),
    [
      ['Ende', 'ende', 0, 4],
      ['gut', 'gut', 5, 8],
      ['alles', 'alles', 10, 15],
      ['gut', 'gut', 16, 19],
    ],
  );
  assert.equal(normalizePhraseText('  Auf   diese Weise '), 'auf diese weise');
});

test('Wiktextract phrase mapping keeps source-backed type and historical evidence separate', () => {
  const current = extractWiktextractPhrase({
    word: 'ins kalte Wasser springen',
    lang_code: 'de',
    pos: 'phrase',
    senses: [{ tags: ['colloquial'], categories: ['Redewendungen (Deutsch)'] }],
  });
  assert.ok(current);
  assert.equal(current.modernEligible, 1);
  assert.equal(current.historicalState, 'current_or_unmarked');
  assert.ok(current.phraseTypes.includes('idiom'));
  assert.ok(current.phraseTypes.includes('phrase'));

  const historical = extractWiktextractPhrase({
    word: 'mit Fug und Recht',
    lang_code: 'de',
    pos: 'phrase',
    tags: ['dated'],
    senses: [{ categories: ['Redewendungen (Deutsch)'] }],
  });
  assert.ok(historical);
  assert.equal(historical.modernEligible, 0);
  assert.equal(historical.historicalState, 'historical_only');

  const mixed = extractWiktextractPhrase({
    word: 'auf lange Sicht',
    lang_code: 'de',
    pos: 'phrase',
    senses: [{ tags: ['dated'] }, { tags: [] }],
  });
  assert.equal(mixed.historicalState, 'mixed');
  assert.equal(mixed.modernEligible, 1);

  assert.equal(extractWiktextractPhrase({
    word: 'Arbeitsweise',
    lang_code: 'de',
    pos: 'noun',
  }), null);
});

test('Phase 11B1 builder creates deterministic provenance catalog and Leipzig commonness evidence', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'rhymelab-phrase-v1-'));
  const dbPath = join(temp, 'phrases.sqlite');
  const reportPath = join(temp, 'report.json');
  const secondDbPath = join(temp, 'phrases-second.sqlite');
  const secondReportPath = join(temp, 'report-second.json');

  try {
    const first = runBuild({ dbPath, reportPath });
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.schema, 'rhymelab-phrase-catalog-build-report-v1');
    assert.equal(report.catalog_schema, 'rhymelab-phrase-catalog-v1');
    assert.equal(report.status, 'ok');
    assert.equal(report.runtime_rewired, false);
    assert.equal(report.phrase_pronunciation_generated, false);
    assert.equal(report.mosaic_index_generated, false);
    assert.equal(report.phrase_ranking_generated, false);
    assert.equal(report.stats.phrases, 6);
    assert.equal(report.stats.modernEligiblePhrases, 5);
    assert.equal(report.stats.historicalOnlyPhrases, 1);
    assert.equal(report.stats.mixedHistoricalPhrases, 1);
    assert.equal(report.stats.attestations, 6);
    assert.equal(report.stats.tokens, 20);
    assert.equal(report.stats.unresolvedTokens, 20);
    assert.equal(report.stats.usageEvidenceRows, 9);
    assert.equal(report.leipzig.length, 3);

    const db = new DatabaseSync(dbPath);
    try {
      const meta = Object.fromEntries(
        db.prepare('SELECT key,value FROM meta').all().map((row) => [row.key, row.value]),
      );
      assert.equal(meta.schema, 'rhymelab-phrase-catalog-v1');
      assert.equal(meta.catalog_fingerprint, report.catalog_fingerprint);

      const sources = db.prepare('SELECT source_id,license_id FROM phrase_source ORDER BY source_id').all()
        .map((row) => ({ source_id: row.source_id, license_id: row.license_id }));
      assert.deepEqual(sources, [
        { source_id: 'dewiktionary-kaikki-raw', license_id: 'Wiktionary-CC-BY-SA+GFDL' },
        { source_id: 'leipzig-corpora', license_id: 'CC-BY' },
      ]);

      const historical = db.prepare(`
        SELECT historical_state,modern_eligible
        FROM phrase
        WHERE normalized='mit fug und recht'
      `).get();
      assert.equal(historical.historical_state, 'historical_only');
      assert.equal(historical.modern_eligible, 0);

      const mixed = db.prepare(`
        SELECT historical_state,modern_eligible
        FROM phrase
        WHERE normalized='auf lange sicht'
      `).get();
      assert.equal(mixed.historical_state, 'mixed');
      assert.equal(mixed.modern_eligible, 1);

      const sourceBacked = db.prepare(`
        SELECT phrase_types_json
        FROM phrase
        WHERE normalized='auf diese weise'
      `).get();
      const types = JSON.parse(sourceBacked.phrase_types_json);
      assert.ok(types.includes('idiom'));
      assert.ok(types.includes('figurative_expression'));
      assert.ok(types.includes('phrase'));

      const aufDieseNews = db.prepare(`
        SELECT u.occurrence_count,u.sentence_count,u.policy
        FROM phrase_usage_evidence u
        JOIN phrase p ON p.phrase_id=u.phrase_id
        JOIN phrase_snapshot s ON s.snapshot_id=u.snapshot_id
        WHERE p.normalized='auf diese weise'
          AND s.snapshot_label='deu_news_2024_1M'
      `).get();
      assert.equal(aufDieseNews.occurrence_count, 3);
      assert.equal(aufDieseNews.sentence_count, 2);
      assert.equal(aufDieseNews.policy, 'leipzig-exact-token-sequence-v1');

      const historicalUsage = db.prepare(`
        SELECT COUNT(*) AS c
        FROM phrase_usage_evidence u
        JOIN phrase p ON p.phrase_id=u.phrase_id
        WHERE p.normalized='mit fug und recht'
      `).get();
      assert.equal(Number(historicalUsage.c), 0);

      const unresolved = db.prepare(`
        SELECT lexical_state,COUNT(*) AS c
        FROM phrase_token
        GROUP BY lexical_state
      `).get();
      assert.equal(unresolved.lexical_state, 'unresolved');
      assert.equal(Number(unresolved.c), 20);

      const frozenBeforeRegister = computePhraseCatalogFingerprint(db);
      registerPhraseSource(db, {
        source_id: 'fixture-register-only',
        name: 'Fixture register-only source',
        role: 'register_context_evidence',
        homepage_url: null,
        license_id: 'CC0-1.0',
        license_url: null,
        attribution: null,
        redistribution_policy: 'fixture',
      });
      registerPhraseSnapshot(db, {
        snapshot_id: 'snapshot:fixture-register-only',
        source_id: 'fixture-register-only',
        snapshot_label: 'fixture-register-only:dipl',
        artifact_path: null,
        artifact_sha256: 'fixture-register-sha',
        upstream_url: null,
        evidence_year: 2026,
        genre: 'register_fixture',
        country: 'DE',
        metadata: { layer: 'dipl' },
      });
      const frozenAfterRegister = computePhraseCatalogFingerprint(db);
      assert.equal(frozenAfterRegister, frozenBeforeRegister);
      assert.equal(frozenAfterRegister, report.catalog_fingerprint);
    } finally {
      db.close();
    }

    const second = runBuild({ dbPath: secondDbPath, reportPath: secondReportPath });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondReport = JSON.parse(await readFile(secondReportPath, 'utf8'));
    assert.equal(secondReport.catalog_fingerprint, report.catalog_fingerprint);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
