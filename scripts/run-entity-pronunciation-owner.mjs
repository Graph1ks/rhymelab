#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
let entityDbPath = 'data/local/rhymelab-entities-v1.sqlite';
let coverageReportPath = 'data/local/entity-pronunciation-coverage-report.json';
let ownerReportPath = 'data/local/entity-pronunciation-owner-report.json';
let forcePronunciation = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--entities') entityDbPath = args[++i] || entityDbPath;
  else if (arg === '--coverage-report') coverageReportPath = args[++i] || coverageReportPath;
  else if (arg === '--report') ownerReportPath = args[++i] || ownerReportPath;
  else if (arg === '--force-pronunciation') forcePronunciation = true;
}

entityDbPath = resolve(entityDbPath);
coverageReportPath = resolve(coverageReportPath);
ownerReportPath = resolve(ownerReportPath);
await mkdir(dirname(ownerReportPath), { recursive: true });

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function runStep(label, script, stepArgs = []) {
  console.error('');
  console.error('[entity-pronunciation:owner] ' + label);
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', script, ...stepArgs],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(label + ' failed with exit code ' + result.status);
  }
}

function runtimeState(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON;');
    const rows = db.prepare(
      "SELECT key,value FROM meta WHERE key IN ("
      + "'schema',"
      + "'entity_pronunciation_build_state',"
      + "'entity_phonetic_runtime_fingerprint',"
      + "'entity_phonetic_analyses',"
      + "'entity_rhyme_anchors'"
      + ")"
    ).all();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } finally {
    db.close();
  }
}

console.error('[entity-pronunciation:owner] one-command owner workflow');

if (!(await exists(entityDbPath))) {
  runStep(
    '1/4 materializing accepted Entity catalog',
    'scripts/materialize-entity-catalog-v1.mjs',
    ['--out', entityDbPath],
  );
} else {
  console.error('[entity-pronunciation:owner] 1/4 Entity DB exists; preserving it');
}

let state = runtimeState(entityDbPath);
if (state.schema !== 'rhymelab-entity-catalog-v1') {
  throw new Error('Unexpected Entity DB schema: ' + (state.schema || 'missing'));
}

const pronunciationComplete = state.entity_pronunciation_build_state === 'complete'
  && Boolean(state.entity_phonetic_runtime_fingerprint)
  && Number(state.entity_phonetic_analyses || 0) > 0
  && Number(state.entity_rhyme_anchors || 0) > 0;

if (forcePronunciation || !pronunciationComplete) {
  runStep(
    '2/4 building/resuming conservative DE pronunciation runtime',
    'scripts/materialize-entity-pronunciations.mjs',
    ['--entities', entityDbPath],
  );
  state = runtimeState(entityDbPath);
} else {
  console.error(
    '[entity-pronunciation:owner] 2/4 pronunciation runtime already complete; skipping rebuild'
    + ' · fingerprint ' + state.entity_phonetic_runtime_fingerprint,
  );
}

runStep(
  '3/4 fetching/verifying pinned source-backed pronunciation probe data',
  'scripts/fetch-entity-pronunciation-sources.mjs',
);

runStep(
  '4/4 computing category/tier/preferred coverage and source-recovery probe',
  'scripts/diagnose-entity-pronunciation-coverage.mjs',
  ['--entities', entityDbPath, '--report', coverageReportPath],
);

const coverage = JSON.parse(await readFile(coverageReportPath, 'utf8'));
const report = {
  schema: 'rhymelab-entity-pronunciation-owner-report-v1',
  status: 'ok',
  entity_database: entityDbPath,
  runtime_state: runtimeState(entityDbPath),
  coverage_report: coverageReportPath,
  overall: coverage.overall,
  source_probe: coverage.source_probe,
  coverage_by_category: coverage.coverage_by_category,
  coverage_by_category_tier: coverage.coverage_by_category_tier,
  priority_unresolved_preferred_names: coverage.priority_unresolved_preferred_names,
  semantic_fingerprint: coverage.semantic_fingerprint,
  next_decision_basis: [
    'prioritize source-backed pronunciation enrichment by category tier and preferred-name gaps',
    'treat CMUdict full-token matches as en-US source candidates only until English phonology/runtime acceptance',
    'do not mass-generate de-DE IPA for remaining proper names',
  ],
};

await writeFile(ownerReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.error('');
console.error('[entity-pronunciation:owner] COMPLETE');
console.error('  owner report     ' + ownerReportPath);
console.error('  coverage report  ' + coverageReportPath);
console.error(
  '  DE name runtime coverage        ' + coverage.overall.runtime_ready_name_pct + '%',
);
console.error(
  '  preferred-name runtime coverage ' + coverage.overall.runtime_ready_preferred_name_pct + '%',
);
console.error(
  '  entity any-name coverage        ' + coverage.overall.entities_with_any_runtime_name_pct + '%',
);
console.error(
  '  CMUdict full-match candidates   '
  + Number(coverage.source_probe.unresolved_full_token_match || 0).toLocaleString(),
);
console.error(
  '  CMUdict candidates remain probe-only; no en-US pronunciation is mislabeled as de-DE.',
);
