import { mergeOptions } from './kaikki-resolver-lib.mjs';

const sortedUnique = (values) => [...new Set((values || []).map((value) => String(value)).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'de'));

function normalizedAnalysis(option) {
  return {
    analysisKey: String(option.resolutionKey),
    lemma: String(option.lemma),
    normalizedLemma: String(option.normalizedLemma),
    pos: String(option.pos || 'unknown'),
    homographNo: Number(option.homographNo || 1),
    confidence: Number(option.confidence || 0),
    gender: option.gender ?? null,
    isProper: Boolean(option.isProper),
    isObsolete: Boolean(option.isObsolete),
    historicalOnly: Boolean(option.historicalOnly),
    styleTags: sortedUnique(option.styleTags),
    formFeatures: sortedUnique(option.formFeatures),
    matchKinds: sortedUnique(option.matchKinds || [option.matchKind]),
    sourceRecordKeys: sortedUnique(option.sourceRecordKeys || [option.sourceRecordKey]),
    candidateIpas: sortedUnique(option.candidateIpas),
  };
}

export function normalizeWriterLexicalAnalyses(options = []) {
  return mergeOptions(options)
    .map(normalizedAnalysis)
    .sort((a, b) => b.confidence - a.confidence
      || a.analysisKey.localeCompare(b.analysisKey, 'de'));
}

export function compatibilityAnalysis(analyses = []) {
  const rows = [...analyses].sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0)
    || String(a.analysisKey || a.resolutionKey || '').localeCompare(
      String(b.analysisKey || b.resolutionKey || ''),
      'de',
    ));
  return rows[0] || null;
}

export function compactWriterLexicalAnalyses(options = []) {
  return normalizeWriterLexicalAnalyses(options).map((analysis) => {
    const row = {
      k: analysis.analysisKey,
      l: analysis.lemma,
      nl: analysis.normalizedLemma,
      p: analysis.pos,
      h: analysis.homographNo,
      c: analysis.confidence,
      mk: analysis.matchKinds,
      sr: analysis.sourceRecordKeys,
      st: analysis.styleTags,
      ff: analysis.formFeatures,
    };
    if (analysis.gender) row.g = analysis.gender;
    if (analysis.isProper) row.ip = 1;
    if (analysis.isObsolete) row.io = 1;
    if (analysis.historicalOnly) row.ho = 1;
    if (analysis.candidateIpas.length) row.ci = analysis.candidateIpas;
    return row;
  });
}

export function resolveWriterFamilyConsensus(evidenceRows = []) {
  const byFamily = new Map();
  for (const row of evidenceRows) {
    const familyKey = row?.familyKey == null ? null : String(row.familyKey);
    if (!familyKey) continue;
    const analysisKey = String(row.analysisKey || row.resolutionKey || '');
    if (!byFamily.has(familyKey)) byFamily.set(familyKey, new Set());
    if (analysisKey) byFamily.get(familyKey).add(analysisKey);
  }

  const supportedFamilies = [...byFamily.entries()]
    .map(([familyKey, analysisKeys]) => ({
      familyKey,
      analysisKeys: [...analysisKeys].sort((a, b) => a.localeCompare(b, 'de')),
    }))
    .sort((a, b) => a.familyKey.localeCompare(b.familyKey, 'de'));

  if (supportedFamilies.length === 0) {
    return {
      status: 'unresolved',
      familyKey: null,
      supportedFamilies,
    };
  }

  if (supportedFamilies.length === 1) {
    return {
      status: 'resolved_converged',
      familyKey: supportedFamilies[0].familyKey,
      supportedFamilies,
    };
  }

  return {
    status: 'ambiguous_conflict',
    familyKey: null,
    supportedFamilies,
  };
}
