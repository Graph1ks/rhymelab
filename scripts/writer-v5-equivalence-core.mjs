import { resolveWriterFamilyConsensus } from './writer-lexical-model-core.mjs';

export function median(values = []) {
  const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
}

export function compareOrderedIds(expected = [], actual = []) {
  const left = expected.map(Number);
  const right = actual.map(Number);
  const length = Math.max(left.length, right.length);
  let firstMismatchIndex = null;
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      firstMismatchIndex = index;
      break;
    }
  }
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return {
    equal: firstMismatchIndex == null,
    expectedCount: left.length,
    actualCount: right.length,
    firstMismatchIndex,
    expectedAtMismatch: firstMismatchIndex == null ? null : (left[firstMismatchIndex] ?? null),
    actualAtMismatch: firstMismatchIndex == null ? null : (right[firstMismatchIndex] ?? null),
    onlyExpected: left.filter((id) => !rightSet.has(id)),
    onlyActual: right.filter((id) => !leftSet.has(id)),
  };
}

export function materializedMorphologySummary(analysisKeys = [], positiveRows = []) {
  const positiveByAnalysis = new Map(
    positiveRows.map((row) => [String(row.analysis_key ?? row.analysisKey ?? ''), row]),
  );
  const evidence = analysisKeys.map((value) => {
    const analysisKey = String(value?.analysis_key ?? value?.analysisKey ?? value ?? '');
    const stored = positiveByAnalysis.get(analysisKey);
    if (!stored) return { analysisKey, status: 'unresolved', familyKey: null };
    return {
      analysisKey,
      status: 'attested_right_head_candidate',
      familyKey: stored.family_key ?? stored.familyKey ?? null,
      constructionRule: stored.construction_rule ?? stored.constructionRule ?? null,
    };
  });
  const consensus = resolveWriterFamilyConsensus(evidence);
  const supportRows = positiveRows.filter(
    (row) => consensus.familyKey && String(row.family_key ?? row.familyKey ?? '') === consensus.familyKey,
  );
  const supportConstructionRules = [...new Set(
    supportRows.map((row) => row.construction_rule ?? row.constructionRule ?? null),
  )].sort((a, b) => String(a).localeCompare(String(b), 'de'));
  return {
    analysisCount: analysisKeys.length,
    storedPositiveCount: positiveRows.length,
    consensus,
    supportConstructionRules,
  };
}

export function evaluateMorphologyRegression(regression, summary) {
  const expectedFamily = regression?.expected_family ?? null;
  const expectedConstructionRule = regression?.expected_construction_rule ?? null;
  const actualFamily = summary?.consensus?.familyKey ?? null;
  const supportedFamilies = summary?.consensus?.supportedFamilies || [];

  // Negative regressions are intentionally stricter than just `familyKey === null`:
  // conflicting positive false splits must not pass merely because consensus refuses to guess.
  const familyPass = expectedFamily == null
    ? supportedFamilies.length === 0
    : actualFamily === expectedFamily;

  let constructionPass = true;
  if (expectedFamily != null) {
    const rules = summary?.supportConstructionRules || [];
    if (expectedConstructionRule == null) constructionPass = rules.length === 1 && rules[0] == null;
    else constructionPass = rules.length === 1 && rules[0] === expectedConstructionRule;
  }

  return {
    pass: familyPass && constructionPass,
    familyPass,
    constructionPass,
    expectedFamily,
    actualFamily,
    expectedConstructionRule,
    actualConstructionRules: summary?.supportConstructionRules || [],
    consensusStatus: summary?.consensus?.status || null,
    supportedFamilies,
  };
}
