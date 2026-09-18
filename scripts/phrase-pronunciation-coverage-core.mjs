export const PHRASE_PRONUNCIATION_COVERAGE_REPORT_SCHEMA =
  'rhymelab-phrase-pronunciation-coverage-report-v1';
export const PHRASE_PRONUNCIATION_COVERAGE_RANKING_POLICY =
  'single-blocker-modern-first-v1';

const tableExists = (db, name) => Boolean(db.prepare(
  "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?",
).get(name));

function requireTables(db) {
  for (const name of [
    'phrase',
    'phrase_token',
    'phrase_token_pronunciation_resolution',
    'phrase_pronunciation',
  ]) {
    if (!tableExists(db, name)) {
      throw new Error(
        'Phrase pronunciation coverage analysis requires table ' + name
        + '; run npm run phrase:pronunciation first',
      );
    }
  }
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedCountObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) =>
      Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0]), 'de')
    ),
  );
}

function phraseTypes(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function pct(value) {
  return Number((Number(value || 0) * 100).toFixed(2));
}

function coverage(ready, total) {
  return total ? ready / total : 0;
}

function compareBlockers(a, b) {
  return (
    b.singleBlockerModernPhraseCount - a.singleBlockerModernPhraseCount
    || b.singleBlockerPhraseCount - a.singleBlockerPhraseCount
    || b.modernPhraseCount - a.modernPhraseCount
    || b.phraseCount - a.phraseCount
    || b.tokenOccurrences - a.tokenOccurrences
    || a.normalized.localeCompare(b.normalized, 'de')
  );
}

export function analyzePhrasePronunciationCoverage(db, { topLimit = 100 } = {}) {
  requireTables(db);

  const phrases = db.prepare([
    'SELECT phrase_id,canonical,modern_eligible,phrase_types_json,historical_state',
    ' FROM phrase ORDER BY phrase_id',
  ].join('')).all();

  const readyRows = db.prepare(
    'SELECT DISTINCT phrase_id FROM phrase_pronunciation WHERE eligible=1 ORDER BY phrase_id',
  ).all();
  const readyIds = new Set(readyRows.map((row) => row.phrase_id));
  const phraseById = new Map(phrases.map((row) => [row.phrase_id, row]));

  const unresolvedRows = db.prepare([
    'SELECT r.phrase_id,r.token_index,r.normalized,t.surface',
    ' FROM phrase_token_pronunciation_resolution r',
    ' JOIN phrase_token t ON t.phrase_id=r.phrase_id AND t.token_index=r.token_index',
    " WHERE r.status<>'resolved_preferred'",
    ' ORDER BY r.phrase_id,r.token_index,r.normalized',
  ].join('')).all();

  const blockedByPhrase = new Map();
  const tokenStats = new Map();

  for (const row of unresolvedRows) {
    const phrase = phraseById.get(row.phrase_id);
    if (!phrase) continue;

    let blocked = blockedByPhrase.get(row.phrase_id);
    if (!blocked) {
      blocked = {
        phraseId: row.phrase_id,
        canonical: phrase.canonical,
        modernEligible: Boolean(phrase.modern_eligible),
        unresolvedNormalized: new Set(),
      };
      blockedByPhrase.set(row.phrase_id, blocked);
    }
    blocked.unresolvedNormalized.add(row.normalized);

    let token = tokenStats.get(row.normalized);
    if (!token) {
      token = {
        normalized: row.normalized,
        tokenOccurrences: 0,
        phraseIds: new Set(),
        modernPhraseIds: new Set(),
        singleBlockerPhraseCount: 0,
        singleBlockerModernPhraseCount: 0,
        surfaceCounts: new Map(),
        phraseTypeCounts: new Map(),
        historicalStateCounts: new Map(),
      };
      tokenStats.set(row.normalized, token);
    }

    token.tokenOccurrences += 1;
    token.phraseIds.add(row.phrase_id);
    if (phrase.modern_eligible) token.modernPhraseIds.add(row.phrase_id);
    increment(token.surfaceCounts, row.surface || row.normalized);
    for (const type of phraseTypes(phrase.phrase_types_json)) {
      increment(token.phraseTypeCounts, type);
    }
    increment(token.historicalStateCounts, phrase.historical_state || 'unknown');
  }

  let oneDistinctBlockerPhrases = 0;
  let oneDistinctBlockerModernPhrases = 0;
  for (const blocked of blockedByPhrase.values()) {
    if (blocked.unresolvedNormalized.size !== 1) continue;
    oneDistinctBlockerPhrases += 1;
    if (blocked.modernEligible) oneDistinctBlockerModernPhrases += 1;
    const [normalized] = blocked.unresolvedNormalized;
    const token = tokenStats.get(normalized);
    if (!token) continue;
    token.singleBlockerPhraseCount += 1;
    if (blocked.modernEligible) token.singleBlockerModernPhraseCount += 1;
  }

  const blockers = [...tokenStats.values()].map((token) => ({
    normalized: token.normalized,
    tokenOccurrences: token.tokenOccurrences,
    phraseCount: token.phraseIds.size,
    modernPhraseCount: token.modernPhraseIds.size,
    singleBlockerPhraseCount: token.singleBlockerPhraseCount,
    singleBlockerModernPhraseCount: token.singleBlockerModernPhraseCount,
    surfaceCounts: sortedCountObject(token.surfaceCounts),
    phraseTypeCounts: sortedCountObject(token.phraseTypeCounts),
    historicalStateCounts: sortedCountObject(token.historicalStateCounts),
  })).sort(compareBlockers);

  const totalPhrases = phrases.length;
  const modernPhrases = phrases.filter((row) => row.modern_eligible).length;
  const readyPhrases = readyIds.size;
  const readyModernPhrases = phrases.filter(
    (row) => row.modern_eligible && readyIds.has(row.phrase_id),
  ).length;
  const blockedPhrases = blockedByPhrase.size;
  const blockedModernPhrases = [...blockedByPhrase.values()].filter(
    (row) => row.modernEligible,
  ).length;
  const otherIneligiblePhrases = Math.max(0, totalPhrases - readyPhrases - blockedPhrases);
  const otherIneligibleModernPhrases = Math.max(
    0,
    modernPhrases - readyModernPhrases - blockedModernPhrases,
  );

  const requestedLimits = [1, 5, 10, 20, 50, 100, 250];
  const limits = [...new Set(
    requestedLimits.filter((limit) => limit <= blockers.length).concat(
      blockers.length ? [Math.min(blockers.length, Math.max(1, Number(topLimit) || 100))] : [],
    ),
  )].sort((a, b) => a - b);

  const unlockCurve = limits.map((limit) => {
    const selected = new Set(blockers.slice(0, limit).map((row) => row.normalized));
    let resolutionUnblockedPhrases = 0;
    let resolutionUnblockedModernPhrases = 0;
    for (const blocked of blockedByPhrase.values()) {
      if (![...blocked.unresolvedNormalized].every((token) => selected.has(token))) continue;
      resolutionUnblockedPhrases += 1;
      if (blocked.modernEligible) resolutionUnblockedModernPhrases += 1;
    }
    return {
      topNormalizedTokens: limit,
      resolutionUnblockedPhrases,
      resolutionUnblockedModernPhrases,
      projectedReadyPhrasesUpperBound: readyPhrases + resolutionUnblockedPhrases,
      projectedReadyModernPhrasesUpperBound:
        readyModernPhrases + resolutionUnblockedModernPhrases,
      projectedPhraseCoverageUpperBoundPct: pct(
        coverage(readyPhrases + resolutionUnblockedPhrases, totalPhrases),
      ),
      projectedModernPhraseCoverageUpperBoundPct: pct(
        coverage(
          readyModernPhrases + resolutionUnblockedModernPhrases,
          modernPhrases,
        ),
      ),
    };
  });

  return {
    schema: PHRASE_PRONUNCIATION_COVERAGE_REPORT_SCHEMA,
    rankingPolicy: PHRASE_PRONUNCIATION_COVERAGE_RANKING_POLICY,
    note:
      'Unlock counts are resolution-only upper bounds; every proposed pronunciation still requires source-backed review and successful IPA analysis.',
    totalPhrases,
    modernPhrases,
    readyPhrases,
    readyModernPhrases,
    phraseCoveragePct: pct(coverage(readyPhrases, totalPhrases)),
    modernPhraseCoveragePct: pct(coverage(readyModernPhrases, modernPhrases)),
    unresolvedTokenOccurrences: unresolvedRows.length,
    distinctUnresolvedNormalizedTokens: blockers.length,
    blockedPhrases,
    blockedModernPhrases,
    oneDistinctBlockerPhrases,
    oneDistinctBlockerModernPhrases,
    otherIneligiblePhrases,
    otherIneligibleModernPhrases,
    topBlockers: blockers.slice(0, Math.max(0, Number(topLimit) || 100)),
    unlockCurve,
  };
}
