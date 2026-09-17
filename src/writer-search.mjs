import {
  RHYME_TYPES,
  findRhymes,
  resultTypes,
} from './local-engine.mjs';
import {
  WRITER_RANKING_POLICY,
  rankWriterRecommendedResults,
} from './writer-ranking-policy.mjs';

function clampLimit(value, fallback = 250, max = 250) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function groupsFor(results) {
  const groups = Object.fromEntries(RHYME_TYPES.map((type) => [type, []]));
  for (const result of results) {
    for (const type of resultTypes(result)) groups[type].push(result);
  }
  return groups;
}

export function findWriterRhymes(db, word, options = {}) {
  const limit = clampLimit(options.limit, 250, 250);
  const base = findRhymes(db, word, {
    ...options,
    limit: 250,
    // Writer ranking is itself a list-level policy. Do not pre-interleave buckets,
    // otherwise lexical diversity can only reorder an already distorted candidate page.
    ensureTypeCoverage: false,
  });
  if (!base) return null;

  const ranked = rankWriterRecommendedResults(base.results, base.query, {
    limit: base.results.length,
  });
  const results = ranked.slice(0, limit);

  return {
    ...base,
    selection: {
      ...base.selection,
      mode: 'writer_ranked',
      limit,
      coverageFloorPerType: 0,
    },
    rankingPolicy: WRITER_RANKING_POLICY,
    ranking: 'deterministic phonetic relevance + lexical novelty/commonness utility + greedy lexical diversity; rhyme relation and phonetic score remain unchanged',
    results,
    groups: groupsFor(results),
  };
}
