#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findRhymes } from '../src/local-engine.mjs';

const root = process.cwd();
const dbPath = resolve(process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');
const manifestPath = resolve('data/de/publish/manifest.json');
const buildReportPath = resolve('data/local/build-report.json');
const sourceSnapshotPath = resolve('data/de/source-snapshot.json');

const exists = async (path) => {
  try { await access(path); return true; } catch { return false; }
};
const mib = (bytes) => Number((Number(bytes || 0) / 1024 / 1024).toFixed(2));
const run = (command, args) => spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
const git = (...args) => {
  const result = run('git', args);
  return result.status === 0 ? result.stdout.trim() : null;
};
const scalar = (db, sql, ...args) => Number(Object.values(db.prepare(sql).get(...args) || { value: 0 })[0] || 0);
const textScalar = (db, sql, ...args) => String(Object.values(db.prepare(sql).get(...args) || { value: '' })[0] || '');

function testSummary(output = '') {
  const summary = { tests: 0, pass: 0, fail: 0, skipped: 0, cancelled: 0 };
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:#|ℹ)?\s*(tests|pass|fail|skipped|cancelled)\s+(\d+)\s*$/i);
    if (match) summary[match[1].toLowerCase()] = Number(match[2]);
  }
  if (!summary.tests) {
    const topLevel = output.split(/\r?\n/).filter((line) => /^(?:ok|not ok)\s+\d+\s+-\s+/.test(line.trim()));
    summary.tests = topLevel.length;
    summary.pass = topLevel.filter((line) => /^ok\s+/.test(line.trim())).length;
    summary.fail = topLevel.filter((line) => /^not ok\s+/.test(line.trim())).length;
  }
  return summary;
}

async function runTests() {
  const files = (await readdir(resolve('tests')))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => `tests/${name}`);
  const result = run(process.execPath, ['--test', ...files]);
  const output = `${result.stdout}\n${result.stderr}`;
  const summary = testSummary(output);
  return {
    ok: result.status === 0 && summary.tests > 0 && summary.fail === 0,
    files: files.length,
    ...summary,
    exit_code: result.status,
    failure_excerpt: result.status === 0 && summary.tests > 0 ? null : output.trim().slice(-4000),
  };
}

function sourceGuard() {
  const result = run(process.execPath, ['scripts/check-source.mjs']);
  return {
    ok: result.status === 0,
    exit_code: result.status,
    summary: (result.stdout || result.stderr || '').trim().split(/\r?\n/).at(-1) || null,
  };
}

async function deploymentGuard() {
  const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
  const forbiddenFiles = [
    'wrangler.json', 'wrangler.jsonc', 'wrangler.toml',
    'scripts/deploy.mjs', '.github/workflows/ci.yml',
  ];
  const presentForbiddenFiles = [];
  for (const file of forbiddenFiles) if (await exists(resolve(file))) presentForbiddenFiles.push(file);
  const scripts = packageJson.scripts || {};
  const suspiciousScripts = Object.entries(scripts)
    .filter(([name, command]) => /deploy|remote|wrangler|cloudflare|\bd1\b|\br2\b/i.test(`${name} ${command}`))
    .map(([name, command]) => ({ name, command }));
  const suspiciousDependencies = Object.keys({ ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) })
    .filter((name) => /cloudflare|wrangler/i.test(name));
  return {
    ok: !presentForbiddenFiles.length && !suspiciousScripts.length && !suspiciousDependencies.length,
    present_forbidden_files: presentForbiddenFiles,
    suspicious_scripts: suspiciousScripts,
    suspicious_dependencies: suspiciousDependencies,
  };
}

async function readJsonIfPresent(path) {
  if (!await exists(path)) return null;
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return { parse_error: true }; }
}

function queryPlan(db, sql, ...args) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map((row) => row.detail).join(' | ');
}

function duplicateAudit(db) {
  const normalizedIpaGroups = scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT normalized, ipa
      FROM hot
      GROUP BY normalized, ipa
      HAVING COUNT(*) > 1
    )
  `);
  const normalizedIpaRowsBeyondFirst = scalar(db, `
    SELECT COALESCE(SUM(c - 1), 0) FROM (
      SELECT COUNT(*) AS c
      FROM hot
      GROUP BY normalized, ipa
      HAVING c > 1
    )
  `);
  const exactSurfaceIpaGroups = scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT surface, ipa
      FROM hot
      GROUP BY surface, ipa
      HAVING COUNT(*) > 1
    )
  `);
  const exactSurfaceIpaRowsBeyondFirst = scalar(db, `
    SELECT COALESCE(SUM(c - 1), 0) FROM (
      SELECT COUNT(*) AS c
      FROM hot
      GROUP BY surface, ipa
      HAVING c > 1
    )
  `);
  const normalizedCrossSurfaceIpaGroups = scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT normalized, ipa
      FROM hot
      GROUP BY normalized, ipa
      HAVING COUNT(DISTINCT surface) > 1
    )
  `);
  const normalizedCollisionGroups = scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT normalized
      FROM hot
      GROUP BY normalized
      HAVING COUNT(DISTINCT surface) > 1
    )
  `);

  const normalizedIpaSamples = db.prepare(`
    SELECT
      normalized,
      ipa,
      COUNT(*) AS row_count,
      COUNT(DISTINCT surface) AS surface_count,
      GROUP_CONCAT(DISTINCT surface) AS surfaces,
      GROUP_CONCAT(DISTINCT COALESCE(lemma, '')) AS lemmas,
      GROUP_CONCAT(DISTINCT COALESCE(pos, '')) AS parts_of_speech
    FROM hot
    GROUP BY normalized, ipa
    HAVING COUNT(*) > 1
    ORDER BY row_count DESC, normalized
    LIMIT 20
  `).all();

  const normalizationCollisionSamples = db.prepare(`
    SELECT
      normalized,
      COUNT(DISTINCT surface) AS surface_count,
      COUNT(*) AS row_count,
      GROUP_CONCAT(DISTINCT surface) AS surfaces,
      MIN(usage_rank) AS best_usage_rank
    FROM hot
    GROUP BY normalized
    HAVING COUNT(DISTINCT surface) > 1
    ORDER BY surface_count DESC, row_count DESC, normalized
    LIMIT 20
  `).all();

  return {
    exact_surface_ipa_groups: exactSurfaceIpaGroups,
    exact_surface_ipa_rows_beyond_first: exactSurfaceIpaRowsBeyondFirst,
    normalized_ipa_groups: normalizedIpaGroups,
    normalized_ipa_rows_beyond_first: normalizedIpaRowsBeyondFirst,
    normalized_ipa_cross_surface_groups: normalizedCrossSurfaceIpaGroups,
    normalized_form_collision_groups: normalizedCollisionGroups,
    normalized_ipa_samples: normalizedIpaSamples,
    normalized_form_collision_samples: normalizationCollisionSamples,
  };
}

function pronunciationVariantAudit(db, columns) {
  const formsMultipleIpa = scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT publish_order
      FROM hot
      GROUP BY publish_order
      HAVING COUNT(DISTINCT ipa) > 1
    )
  `);
  const normalizedMultipleIpa = scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT normalized
      FROM hot
      GROUP BY normalized
      HAVING COUNT(DISTINCT ipa) > 1
    )
  `);
  const maxIpaPerForm = scalar(db, `
    SELECT COALESCE(MAX(c), 0) FROM (
      SELECT COUNT(DISTINCT ipa) AS c
      FROM hot
      GROUP BY publish_order
    )
  `);
  const examples = db.prepare(`
    SELECT
      publish_order,
      surface,
      normalized,
      MIN(usage_rank) AS usage_rank,
      COUNT(DISTINCT ipa) AS pronunciation_count,
      GROUP_CONCAT(DISTINCT ipa) AS ipas
    FROM hot
    GROUP BY publish_order, surface, normalized
    HAVING COUNT(DISTINCT ipa) > 1
    ORDER BY CASE WHEN MIN(usage_rank) IS NULL THEN 1 ELSE 0 END, MIN(usage_rank), surface
    LIMIT 20
  `).all();

  const focus = {};
  for (const normalized of ['liebe', 'leben', 'musik']) {
    focus[normalized] = db.prepare(`
      SELECT surface, ipa, usage_rank, lemma, pos, syllable_count, stress,
             exact_key, multisyllable_key, vowel_key, vowel_family, coda_key, coda_class
      FROM hot
      WHERE normalized = ?
      ORDER BY usage_rank IS NULL, usage_rank, surface, ipa
      LIMIT 30
    `).all(normalized);
  }

  const has = (name) => columns.includes(name);
  return {
    forms_with_multiple_ipa: formsMultipleIpa,
    normalized_forms_with_multiple_ipa: normalizedMultipleIpa,
    max_ipa_variants_per_surface_form: maxIpaPerForm,
    examples,
    focus_words: focus,
    metadata_capabilities: {
      locale_stored: has('locale'),
      dialect_stored: has('dialect'),
      pronunciation_source_stored: has('pronunciation_source'),
      pronunciation_tags_stored: has('pronunciation_tags'),
      confidence_stored: has('pronunciation_confidence'),
    },
  };
}

function auditDatabase(db, dbBytes) {
  const quickCheck = textScalar(db, 'PRAGMA quick_check');
  const columns = db.prepare("PRAGMA table_info('hot')").all().map((row) => String(row.name));
  const indexes = db.prepare("PRAGMA index_list('hot')").all().map((row) => String(row.name)).sort();
  const expectedIndexes = [
    'idx_hot_coda', 'idx_hot_exact', 'idx_hot_multi', 'idx_hot_normalized',
    'idx_hot_slant', 'idx_hot_usage', 'idx_hot_vowel',
  ];
  const missingIndexes = expectedIndexes.filter((name) => !indexes.includes(name));

  const rows = scalar(db, 'SELECT COUNT(*) FROM hot');
  const forms = scalar(db, 'SELECT COUNT(DISTINCT publish_order) FROM hot');
  const normalizedForms = scalar(db, 'SELECT COUNT(DISTINCT normalized) FROM hot');
  const usageRankedForms = scalar(db, 'SELECT COUNT(DISTINCT publish_order) FROM hot WHERE usage_rank IS NOT NULL');
  const uniqueIpas = scalar(db, 'SELECT COUNT(DISTINCT ipa) FROM hot');

  const invalid = {
    empty_surface: scalar(db, "SELECT COUNT(*) FROM hot WHERE surface='' OR normalized=''"),
    empty_ipa: scalar(db, "SELECT COUNT(*) FROM hot WHERE ipa=''"),
    empty_phonemes: scalar(db, "SELECT COUNT(*) FROM hot WHERE phonemes=''"),
    empty_exact_key: scalar(db, "SELECT COUNT(*) FROM hot WHERE exact_key=''"),
    empty_vowel_key: scalar(db, "SELECT COUNT(*) FROM hot WHERE vowel_key=''"),
    bad_syllable_count: scalar(db, 'SELECT COUNT(*) FROM hot WHERE syllable_count < 1'),
    bad_primary_stress: scalar(db, 'SELECT COUNT(*) FROM hot WHERE primary_stress < 1 OR primary_stress > syllable_count'),
    bad_stress_length: scalar(db, 'SELECT COUNT(*) FROM hot WHERE LENGTH(stress) != syllable_count'),
    bad_rhyme_syllables: scalar(db, 'SELECT COUNT(*) FROM hot WHERE rhyme_syllables < 1 OR rhyme_syllables > syllable_count'),
    bad_usage_rank: scalar(db, 'SELECT COUNT(*) FROM hot WHERE usage_rank IS NOT NULL AND usage_rank < 1'),
  };
  const invalidTotal = Object.values(invalid).reduce((sum, value) => sum + value, 0);
  const duplicates = duplicateAudit(db);
  const pronunciationVariants = pronunciationVariantAudit(db, columns);

  const noUsageRows = scalar(db, 'SELECT COUNT(*) FROM hot WHERE usage_rank IS NULL');
  const noLemmaRows = scalar(db, 'SELECT COUNT(*) FROM hot WHERE lemma IS NULL');
  const noPosRows = scalar(db, 'SELECT COUNT(*) FROM hot WHERE pos IS NULL');

  return {
    ok: quickCheck === 'ok' && !missingIndexes.length && invalidTotal === 0 && duplicates.exact_surface_ipa_groups === 0,
    sqlite_mib: mib(dbBytes),
    bytes_per_pronunciation: rows ? Number((dbBytes / rows).toFixed(2)) : null,
    integrity_check: quickCheck,
    rows,
    forms,
    normalized_forms: normalizedForms,
    usage_ranked_forms: usageRankedForms,
    unique_ipa_strings: uniqueIpas,
    coverage: {
      usage_ranked_forms_pct: forms ? Number((usageRankedForms / forms * 100).toFixed(2)) : 0,
      rows_without_usage_rank: noUsageRows,
      rows_without_lemma: noLemmaRows,
      rows_without_pos: noPosRows,
    },
    duplicates,
    pronunciation_variants: pronunciationVariants,
    invalid,
    invalid_total: invalidTotal,
    indexes: {
      expected: expectedIndexes,
      present: indexes,
      missing: missingIndexes,
    },
    query_plans: {
      word: queryPlan(db, 'SELECT id FROM hot WHERE normalized=? LIMIT 20', 'liebe'),
      exact: queryPlan(db, 'SELECT id FROM hot WHERE exact_key=? ORDER BY usage_rank LIMIT 20', 'x'),
      slant: queryPlan(db, 'SELECT id FROM hot WHERE vowel_family=? AND coda_class=? ORDER BY usage_rank LIMIT 20', 'x', 'y'),
    },
  };
}

function sampleRhymes(db) {
  const words = ['Liebe', 'Haus', 'Nacht', 'Zeit', 'Leben', 'Musik'];
  const samples = {};
  for (const word of words) {
    try {
      const result = findRhymes(db, word, { limit: 8, poolLimit: 180 });
      samples[word] = result ? {
        found: true,
        ipa: [...new Set(result.query?.pronunciations?.map((p) => p.ipa) || [])].slice(0, 5),
        top: result.results.slice(0, 8).map((item) => ({
          word: item.word,
          type: item.type,
          score: item.score,
          usage_rank: item.usageRank,
        })),
      } : { found: false };
    } catch (error) {
      samples[word] = { found: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const liebe = findRhymes(db, 'Liebe', { limit: 100, poolLimit: 300 });
  const byName = new Map((liebe?.results || []).map((item) => [item.normalized, item]));
  const expectedPerfect = ['triebe', 'diebe', 'hiebe', 'schiebe'];
  const perfectChecks = Object.fromEntries(expectedPerfect.map((name) => {
    const item = byName.get(name);
    return [name, Boolean(item && item.score === 1 && item.type === 'multisyllabic_perfect')];
  }));
  const solide = byName.get('solide');
  const regression = {
    liebe_expected_perfect: perfectChecks,
    liebe_solide_not_perfect: !solide || (solide.score < 1 && !['perfect', 'multisyllabic_perfect'].includes(solide.type)),
    liebe_solide_observed: solide ? { type: solide.type, score: solide.score } : null,
  };
  return {
    ok: Object.values(perfectChecks).every(Boolean) && regression.liebe_solide_not_perfect,
    regression,
    samples,
  };
}

function sourceSnapshotSummary(snapshot) {
  if (!snapshot || snapshot.parse_error) return snapshot;
  return {
    schema: snapshot.schema,
    snapshot_label: snapshot.snapshot_label,
    kaikki: snapshot.kaikki ? {
      code: snapshot.kaikki.code,
      bytes: snapshot.kaikki.bytes,
      sha256: snapshot.kaikki.sha256,
      reused_local_snapshot: snapshot.kaikki.reused_local_snapshot,
      downloaded_at: snapshot.kaikki.downloaded_at,
    } : null,
    leipzig: Array.isArray(snapshot.leipzig) ? snapshot.leipzig.map((item) => ({
      code: item.code,
      bytes: item.bytes,
      sha256: item.sha256,
    })) : [],
  };
}

const generatedAt = new Date().toISOString();
const source = sourceGuard();
const tests = await runTests();
const deployGuard = await deploymentGuard();
const publishManifest = await readJsonIfPresent(manifestPath);
const localBuild = await readJsonIfPresent(buildReportPath);
const sourceSnapshot = await readJsonIfPresent(sourceSnapshotPath);

let database = { ok: false, missing: true, path: dbPath };
let rhymeSmoke = { ok: false, skipped: 'local database missing' };
if (await exists(dbPath)) {
  const dbBytes = (await stat(dbPath)).size;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON;');
    database = { missing: false, path: dbPath, ...auditDatabase(db, dbBytes) };
    rhymeSmoke = sampleRhymes(db);
  } finally {
    db.close();
  }
}

const statusLines = (git('status', '--porcelain=v1', '-uall') || '').split(/\r?\n/).filter(Boolean);
const gates = {
  source_syntax: source.ok,
  tests: tests.ok,
  local_only_guard: deployGuard.ok,
  database_integrity: database.ok,
  rhyme_smoke: rhymeSmoke.ok,
};
const report = {
  schema: 'rhymelab-local-qa-report-v2',
  generated_at: generatedAt,
  status: Object.values(gates).every(Boolean) ? 'ok' : 'attention',
  gates,
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    git_commit: git('rev-parse', 'HEAD'),
    git_branch: git('branch', '--show-current'),
    git_dirty: statusLines.length > 0,
    git_status: statusLines.slice(0, 30),
  },
  source_check: source,
  test_suite: tests,
  local_only_guard: deployGuard,
  source_snapshot: sourceSnapshotSummary(sourceSnapshot),
  publish_manifest: publishManifest ? {
    schema: publishManifest.schema,
    generated_at: publishManifest.generated_at,
    rhyme_ready_forms: publishManifest.rhyme_ready_forms,
    usage_ranked_rhyme_ready_forms: publishManifest.usage_ranked_rhyme_ready_forms,
    dictionary_only_rhyme_ready_forms: publishManifest.dictionary_only_rhyme_ready_forms,
    pronunciations: publishManifest.pronunciations,
    shards: publishManifest.shards,
    normalized_bytes: publishManifest.normalized_bytes,
    usage_lexically_matched_forms: publishManifest.usage_lexically_matched_forms,
    usage_pronunciation_coverage_pct: publishManifest.usage_pronunciation_coverage_pct,
    ipa_normalization_failures: publishManifest.ipa_normalization_failures,
  } : null,
  local_build_report: localBuild,
  database,
  rhyme_smoke: rhymeSmoke,
};

console.log(JSON.stringify(report, null, 2));
