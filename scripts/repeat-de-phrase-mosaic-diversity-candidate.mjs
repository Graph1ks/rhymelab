#!/usr/bin/env node
import { readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
let runs = 3;
let reportPath = 'data/local/phrase-mosaic-diversity-v1-repeatability-report.json';
const forwarded = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];

  if (arg === '--runs') {
    runs = Math.max(2, Number(args[++i] || 3));
    continue;
  }

  if (arg === '--report') {
    reportPath = args[++i] || reportPath;
    continue;
  }

  forwarded.push(arg);
}

reportPath = resolve(reportPath);

function stableSummary(report) {
  return {
    suite_v2_ranking_fingerprint: report.suite_v2_ranking_fingerprint,
    suite_v2_ranking_fingerprint_matches:
      report.suite_v2_ranking_fingerprint_matches,
    suite_diagnostic_baseline_fingerprint:
      report.suite_diagnostic_baseline_fingerprint,
    suite_diagnostic_baseline_fingerprint_matches:
      report.suite_diagnostic_baseline_fingerprint_matches,
    suite_diversity_candidate_fingerprint:
      report.suite_diversity_candidate_fingerprint,
    aggregate: report.aggregate,
    per_query: (report.queries || []).map((entry) => ({
      word: entry.word,
      status: entry.status,
      v2RankingFingerprint: entry.v2RankingFingerprint,
      diagnosticFingerprint: entry.diagnosticFingerprint,
      diversityFingerprint: entry.diversityFingerprint,
      writerPageCandidateCount: entry.writerPageCandidateCount,
      diversifiedWriterPageCandidateCount:
        entry.diversifiedWriterPageCandidateCount,
      suppressedCandidateCount: entry.suppressedCandidateCount,
      suppressionReasonCounts: entry.suppressionReasonCounts,
      top20Changed: entry.top20?.changed ?? null,
      beforeFrameMaxGroupSize:
        entry.top20?.beforeFrameMaxGroupSize ?? null,
      afterFrameMaxGroupSize:
        entry.top20?.afterFrameMaxGroupSize ?? null,
      protected: entry.protected,
    })),
  };
}

const runner = resolve('scripts/diagnose-de-phrase-mosaic-diversity-candidate.mjs');
const tempDir = await mkdtemp(join(tmpdir(), 'rhymelab-11e3-repeatability-'));
const reports = [];

try {
  for (let i = 0; i < runs; i += 1) {
    const runPath = join(tempDir, 'run-' + String(i + 1) + '.json');
    const result = spawnSync(
      process.execPath,
      ['--no-warnings', runner, ...forwarded, '--report', runPath],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    if (result.status !== 0) {
      throw new Error(
        'Repeatability run ' + String(i + 1) + ' failed\n'
        + String(result.stdout || '')
        + String(result.stderr || ''),
      );
    }

    reports.push(JSON.parse(await readFile(runPath, 'utf8')));
  }

  const stable = reports.map(stableSummary);
  const baseline = JSON.stringify(stable[0]);
  const mismatches = stable
    .map((entry, index) => ({
      run: index + 1,
      matchesFirst: JSON.stringify(entry) === baseline,
    }))
    .filter((entry) => !entry.matchesFirst);

  const fingerprints = reports.map((report, index) => ({
    run: index + 1,
    suiteV2RankingFingerprint: report.suite_v2_ranking_fingerprint,
    suiteDiagnosticBaselineFingerprint:
      report.suite_diagnostic_baseline_fingerprint,
    suiteDiversityCandidateFingerprint:
      report.suite_diversity_candidate_fingerprint,
  }));

  const allProtectedChecksPass = reports.every(
    (report) => report.aggregate?.all_protected_checks_pass === true,
  );
  const baselineGatesPass = reports.every(
    (report) =>
      report.suite_v2_ranking_fingerprint_matches === true
      && report.suite_diagnostic_baseline_fingerprint_matches === true,
  );
  const repeatable = mismatches.length === 0
    && allProtectedChecksPass
    && baselineGatesPass;

  const output = {
    schema: 'rhymelab-phrase-mosaic-diversity-v1-repeatability-report',
    status: repeatable ? 'ok' : 'failed',
    built_at: new Date().toISOString(),
    runs,
    repeatable,
    baseline_gates_pass: baselineGatesPass,
    all_protected_checks_pass: allProtectedChecksPass,
    mismatches,
    fingerprints,
    aggregate: reports[0]?.aggregate || null,
    decision_gate: {
      repeatability_pass: repeatable,
      runtime_integration_allowed: false,
      next_step: repeatable
        ? 'accept_11e3_then_open_11e4_runtime_api_ui_integration'
        : 'inspect_repeatability_mismatch_before_accepting_11e3',
    },
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    report: reportPath,
    repeatable,
    runs,
    fingerprints,
    mismatches,
    all_protected_checks_pass: allProtectedChecksPass,
    baseline_gates_pass: baselineGatesPass,
  }, null, 2));

  if (!repeatable) process.exitCode = 1;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
