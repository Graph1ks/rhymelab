import { createHash } from 'node:crypto';
import {
  normalizePhraseText,
  tokenizePhrase,
} from './phrase-catalog-core.mjs';

export const PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_SCHEMA =
  'rhymelab-phrase-mosaic-diversity-diagnostics-v1';
export const PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_POLICY =
  'de-phrase-channel-diversity-diagnostic-v1';
export const PHRASE_MOSAIC_DIVERSITY_TOP_LIMITS = Object.freeze([10, 20, 50]);

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function rounded(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(digits));
}

function exactCanonicalKey(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function stableCandidateId(candidate) {
  return String(candidate?.windowId || candidate?.phraseId || candidate?.canonical || '');
}

function candidateKeys(candidate) {
  const exactCanonical = exactCanonicalKey(candidate?.canonical);
  const normalizedCanonical = normalizePhraseText(candidate?.canonical);
  const tokens = tokenizePhrase(candidate?.canonical).map((token) => token.normalized);
  const lexicalHead = tokens.length ? tokens[tokens.length - 1] : null;
  const phraseFamily = String(candidate?.phraseId || '') || null;
  const lexicalFrames = [];

  if (tokens.length >= 2) {
    lexicalFrames.push(
      'prefix_without_final_token:' + tokens.slice(0, -1).join('\u001f'),
    );
    lexicalFrames.push(
      'suffix_without_initial_token:' + tokens.slice(1).join('\u001f'),
    );
  }

  return {
    exactCanonical: exactCanonical || null,
    normalizedCanonical: normalizedCanonical || null,
    lexicalHead,
    phraseFamily,
    lexicalFrames,
  };
}

function buildGroupMap(candidates, keySelector, { multiple = false } = {}) {
  const groups = new Map();

  for (const candidate of candidates) {
    const selected = keySelector(candidate);
    const keys = multiple
      ? (Array.isArray(selected) ? selected : [])
      : [selected];

    for (const rawKey of keys) {
      const key = String(rawKey || '');
      if (!key) continue;
      const group = groups.get(key) || [];
      group.push(candidate);
      groups.set(key, group);
    }
  }

  return groups;
}

function summarizeGroups(groups, candidateCount) {
  const repeated = [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      count: rows.length,
      writerPageRanks: rows
        .map((row) => Number(row.writerPageRank || 0))
        .filter(Boolean)
        .sort((a, b) => a - b),
      windowIds: rows.map((row) => String(row.windowId || '')).filter(Boolean),
      phraseIds: [...new Set(rows.map((row) => String(row.phraseId || '')).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b)),
      canonicals: [...new Set(rows.map((row) => String(row.canonical || '')).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'de')),
    }))
    .sort((a, b) =>
      b.count - a.count
      || String(a.key).localeCompare(String(b.key), 'de')
    );

  const repeatedMembershipCount = repeated.reduce((sum, group) => sum + group.count, 0);
  const excessMembershipCount = repeated.reduce((sum, group) => sum + group.count - 1, 0);
  const maxGroupSize = repeated.length ? repeated[0].count : 0;

  return {
    repeatedGroupCount: repeated.length,
    repeatedMembershipCount,
    excessMembershipCount,
    maxGroupSize,
    maxGroupShare: candidateCount ? rounded(maxGroupSize / candidateCount) : 0,
    groups: repeated,
  };
}

function groupSize(groups, key) {
  if (!key) return 0;
  return Number(groups.get(key)?.length || 0);
}

function frameMemberships(groups, keys) {
  return (keys || []).map((key) => ({
    key,
    size: groupSize(groups, key),
  })).filter((entry) => entry.size > 1);
}

function analyzeCut(candidates) {
  const exactGroups = buildGroupMap(candidates, (candidate) => candidateKeys(candidate).exactCanonical);
  const normalizedGroups = buildGroupMap(
    candidates,
    (candidate) => candidateKeys(candidate).normalizedCanonical,
  );
  const headGroups = buildGroupMap(candidates, (candidate) => candidateKeys(candidate).lexicalHead);
  const familyGroups = buildGroupMap(candidates, (candidate) => candidateKeys(candidate).phraseFamily);
  const frameGroups = buildGroupMap(
    candidates,
    (candidate) => candidateKeys(candidate).lexicalFrames,
    { multiple: true },
  );

  const rows = candidates.map((candidate) => {
    const keys = candidateKeys(candidate);
    return {
      writerPageRank: candidate.writerPageRank ?? null,
      windowId: candidate.windowId ?? null,
      phraseId: candidate.phraseId ?? null,
      canonical: candidate.canonical ?? null,
      phoneticType: candidate.score?.type || null,
      phoneticScore: rounded(candidate.score?.overall || 0),
      keys,
      repeatedClusters: {
        exactCanonical: groupSize(exactGroups, keys.exactCanonical) > 1
          ? { key: keys.exactCanonical, size: groupSize(exactGroups, keys.exactCanonical) }
          : null,
        normalizedCanonical: groupSize(normalizedGroups, keys.normalizedCanonical) > 1
          ? { key: keys.normalizedCanonical, size: groupSize(normalizedGroups, keys.normalizedCanonical) }
          : null,
        lexicalHead: groupSize(headGroups, keys.lexicalHead) > 1
          ? { key: keys.lexicalHead, size: groupSize(headGroups, keys.lexicalHead) }
          : null,
        phraseFamily: groupSize(familyGroups, keys.phraseFamily) > 1
          ? { key: keys.phraseFamily, size: groupSize(familyGroups, keys.phraseFamily) }
          : null,
        lexicalFrames: frameMemberships(frameGroups, keys.lexicalFrames),
      },
    };
  });

  return {
    candidateCount: candidates.length,
    exactCanonical: summarizeGroups(exactGroups, candidates.length),
    normalizedCanonical: summarizeGroups(normalizedGroups, candidates.length),
    lexicalHead: summarizeGroups(headGroups, candidates.length),
    phraseFamily: summarizeGroups(familyGroups, candidates.length),
    lexicalFrame: summarizeGroups(frameGroups, candidates.length),
    rows,
  };
}

export function analyzePhraseMosaicDiversity(rankedResult, {
  topLimits = PHRASE_MOSAIC_DIVERSITY_TOP_LIMITS,
} = {}) {
  const writerPageCandidates = Array.isArray(rankedResult?.writerPageCandidates)
    ? rankedResult.writerPageCandidates
    : [];
  const limits = [...new Set(
    (topLimits || [])
      .map((value) => Math.max(1, Math.floor(Number(value) || 0)))
      .filter(Boolean),
  )].sort((a, b) => a - b);

  const top = {};
  for (const limit of limits) {
    top[String(limit)] = analyzeCut(writerPageCandidates.slice(0, limit));
  }

  const fingerprint = sha256(JSON.stringify({
    schema: PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_SCHEMA,
    policy: PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_POLICY,
    inputRankingSchema: rankedResult?.schema || null,
    inputRankingPolicy: rankedResult?.policy || null,
    inputRankingFingerprint: rankedResult?.rankingFingerprint || null,
    writerPageCandidateCount: writerPageCandidates.length,
    top,
  }));

  return {
    schema: PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_SCHEMA,
    policy: PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_POLICY,
    readOnly: true,
    suppressionImplemented: false,
    inputRankingSchema: rankedResult?.schema || null,
    inputRankingPolicy: rankedResult?.policy || null,
    inputRankingFingerprint: rankedResult?.rankingFingerprint || null,
    writerPageCandidateCount: writerPageCandidates.length,
    topLimits: limits,
    inflectionIdentity: {
      available: false,
      reason: 'accepted_11e2_v2_candidate_payload_has_no_lemma_or_inflection_family_key',
    },
    top,
    diagnosticFingerprint: fingerprint,
  };
}

export function findDiversityRow(diagnostic, {
  canonical = null,
  windowId = null,
  limit = 20,
} = {}) {
  const rows = diagnostic?.top?.[String(limit)]?.rows || [];
  return rows.find((row) => {
    if (windowId && row.windowId === windowId) return true;
    if (canonical && row.canonical === canonical) return true;
    return false;
  }) || null;
}

export function repetitionExposure(row) {
  if (!row) return {
    exposed: false,
    clusterKinds: [],
  };

  const clusterKinds = [];
  if (row.repeatedClusters?.exactCanonical) clusterKinds.push('exact_canonical');
  if (row.repeatedClusters?.normalizedCanonical) clusterKinds.push('normalized_canonical');
  if (row.repeatedClusters?.lexicalHead) clusterKinds.push('lexical_head');
  if (row.repeatedClusters?.phraseFamily) clusterKinds.push('phrase_family');
  if ((row.repeatedClusters?.lexicalFrames || []).length) clusterKinds.push('lexical_frame');

  return {
    exposed: clusterKinds.length > 0,
    clusterKinds,
  };
}
