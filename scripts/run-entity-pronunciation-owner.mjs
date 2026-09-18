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
    '1/6 materializing accepted Entity catalog',
    'scripts/materialize-entity-catalog-v1.mjs',
    ['--out', entityDbPath],
  );
} else {
  console.error('[entity-pronunciation:owner] 1/6 Entity DB exists; preserving it');
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
    '2/6 building/resuming conservative DE pronunciation runtime',
    'scripts/materialize-entity-pronunciations.mjs',
    ['--entities', entityDbPath],
  );
  state = runtimeState(entityDbPath);
} else {
  console.error(
    '[entity-pronunciation:owner] 2/6 pronunciation runtime already complete; skipping rebuild'
    + ' · fingerprint ' + state.entity_phonetic_runtime_fingerprint,
  );
}

const baselineRuntimeFingerprint = state.entity_phonetic_runtime_fingerprint || null;

runStep(
  '3/6 fetching/verifying pinned CMUdict source probe',
  'scripts/fetch-entity-pronunciation-sources.mjs',
);

runStep(
  '4/6 fetching/verifying selective Wikidata P898 source evidence',
  'scripts/fetch-qlever-entity-pronunciations.mjs',
);

runStep(
  '5/6 materializing qualified P898 evidence without runtime promotion',
  'scripts/materialize-wikidata-p898-pronunciations.mjs',
  ['--entities', entityDbPath],
);

const afterP898State = runtimeState(entityDbPath);
if (
  baselineRuntimeFingerprint
  && afterP898State.entity_phonetic_runtime_fingerprint !== baselineRuntimeFingerprint
) {
  throw new Error(
    'P898 source-evidence materialization changed the accepted DE runtime fingerprint: '
    + baselineRuntimeFingerprint + ' -> '
    + (afterP898State.entity_phonetic_runtime_fingerprint || 'missing'),
  );
}

runStep(
  '6/6 computing runtime coverage and source-recovery evidence',
  'scripts/diagnose-entity-pronunciation-coverage.mjs',
  ['--entities', entityDbPath, '--report', coverageReportPath],
);

const [coverage, p898] = await Promise.all([
  readFile(coverageReportPath, 'utf8').then(JSON.parse),
  readFile('data/local/entity-wikidata-p898-materialization-report.json', 'utf8').then(JSON.parse),
]);
const report = {
  schema: 'rhymelab-entity-pronunciation-owner-report-v1',
  status: 'ok',
  entity_database: entityDbPath,
  runtime_state: runtimeState(entityDbPath),
  coverage_report: coverageReportPath,
  overall: coverage.overall,
  source_probe: coverage.source_probe,
  wikidata_p898_source_evidence: coverage.wikidata_p898_source_evidence,
  wikidata_p898_materialization: {
    report_schema: p898.schema,
    status: p898.status,
    inserted_pronunciations: p898.inserted_pronunciations,
    names_with_source_evidence: p898.names_with_source_evidence,
    preferred_names_with_source_evidence: p898.preferred_names_with_source_evidence,
    unmapped_rows: p898.unmapped_rows,
    runtime_eligible_rows: p898.runtime_eligible_rows,
    runtime_changed: p898.runtime_changed,
    semantic_fingerprint: p898.semantic_fingerprint,
  },
  coverage_by_category: coverage.coverage_by_category,
  coverage_by_category_tier: coverage.coverage_by_category_tier,
  priority_unresolved_preferred_names: coverage.priority_unresolved_preferred_names,
  semantic_fingerprint: coverage.semantic_fingerprint,
  next_decision_basis: [
    'preserve Wikidata P898 as qualified source-attested evidence until locale/profile promotion is explicitly accepted',
    'treat CMUdict full-token matches as en-US source candidates only until English phonology/runtime acceptance',
    'prioritize multilingual source-backed gaps by category tier and preferred-name impact',
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
  '  Wikidata P898 source rows       '
  + Number(p898.inserted_pronunciations || 0).toLocaleString(),
);
console.error(
  '  P898 preferred names evidenced  '
  + Number(p898.preferred_names_with_source_evidence || 0).toLocaleString(),
);
console.error(
  '  CMUdict full-match candidates   '
  + Number(coverage.source_probe.unresolved_full_token_match || 0).toLocaleString(),
);
console.error(
  '  DE runtime fingerprint          '
  + (afterP898State.entity_phonetic_runtime_fingerprint || 'missing')
  + ' (unchanged)',
);
console.error(
  '  P898 and CMUdict remain source evidence/probes; no generic language evidence is mislabeled as a regional runtime.',
);
