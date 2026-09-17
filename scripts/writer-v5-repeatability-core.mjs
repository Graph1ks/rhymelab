import { createHash } from 'node:crypto';

export const WRITER_V5_REPEATABILITY_SCHEMA = 'rhymelab-writer-v5-repeatability-v1';

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function semanticFingerprint(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function writerResponseFingerprint(response) {
  if (!response || typeof response !== 'object') throw new Error('Writer response is required');
  return semanticFingerprint(response);
}

export function suiteFingerprint(queryFingerprints = []) {
  const canonical = queryFingerprints.map((entry) => ({
    query: String(entry.query || ''),
    fingerprint: String(entry.fingerprint || ''),
  }));
  return semanticFingerprint(canonical);
}

export function evaluateRepeatabilityRuns(runs = []) {
  if (runs.length < 2) {
    return {
      passed: false,
      runCount: runs.length,
      suiteFingerprintsEqual: false,
      mismatches: [{ type: 'insufficient_runs', expectedMinimum: 2, observed: runs.length }],
    };
  }

  const baseline = runs[0];
  const baselineByQuery = new Map(
    (baseline.queryFingerprints || []).map((entry) => [entry.query, entry.fingerprint]),
  );
  const mismatches = [];

  for (const run of runs.slice(1)) {
    const currentByQuery = new Map(
      (run.queryFingerprints || []).map((entry) => [entry.query, entry.fingerprint]),
    );
    const queryNames = [...new Set([...baselineByQuery.keys(), ...currentByQuery.keys()])]
      .sort((a, b) => a.localeCompare(b, 'de'));
    for (const query of queryNames) {
      const expected = baselineByQuery.get(query) || null;
      const observed = currentByQuery.get(query) || null;
      if (expected !== observed) {
        mismatches.push({
          type: 'query_fingerprint_mismatch',
          run: run.run,
          query,
          expected,
          observed,
        });
      }
    }
    if (run.suiteFingerprint !== baseline.suiteFingerprint) {
      mismatches.push({
        type: 'suite_fingerprint_mismatch',
        run: run.run,
        expected: baseline.suiteFingerprint,
        observed: run.suiteFingerprint,
      });
    }
  }

  return {
    passed: mismatches.length === 0,
    runCount: runs.length,
    suiteFingerprintsEqual: runs.every((run) => run.suiteFingerprint === baseline.suiteFingerprint),
    baselineSuiteFingerprint: baseline.suiteFingerprint,
    mismatches,
  };
}
