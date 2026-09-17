const POLICY_ORDER = Object.freeze([
  'engine_rank',
  'current_sample_reconstruction',
  'score_first',
  'score_band_0_02',
  'score_band_0_05',
]);

function safeRatio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function mean(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(4)) : null;
}

function dcg(rows) {
  return rows.reduce((sum, row, index) => sum + ((2 ** row.usefulness) - 1) / Math.log2(index + 2), 0);
}

function score(task) {
  return Number(task?.engine?.primary_score ?? 0);
}

function tier(task) {
  const value = Number(task?.engine?.rhyme_tier);
  return Number.isFinite(value) ? value : 99;
}

function syllableDistance(task) {
  const value = Number(task?.engine?.syllable_distance);
  return Number.isFinite(value) ? value : 99;
}

function usageRank(task) {
  const value = Number(task?.candidate?.usage_rank);
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function lexicalCompare(a, b) {
  return String(a?.candidate?.word || '').localeCompare(String(b?.candidate?.word || ''), 'de');
}

function compareUsageFirst(a, b) {
  return tier(a) - tier(b)
    || syllableDistance(a) - syllableDistance(b)
    || Number(usageRank(a) === Number.MAX_SAFE_INTEGER) - Number(usageRank(b) === Number.MAX_SAFE_INTEGER)
    || usageRank(a) - usageRank(b)
    || score(b) - score(a)
    || lexicalCompare(a, b);
}

function compareScoreFirst(a, b) {
  return tier(a) - tier(b)
    || syllableDistance(a) - syllableDistance(b)
    || score(b) - score(a)
    || Number(usageRank(a) === Number.MAX_SAFE_INTEGER) - Number(usageRank(b) === Number.MAX_SAFE_INTEGER)
    || usageRank(a) - usageRank(b)
    || lexicalCompare(a, b);
}

function compareScoreBand(a, b, width) {
  const bucketA = Math.floor((score(a) + 1e-9) / width);
  const bucketB = Math.floor((score(b) + 1e-9) / width);
  return tier(a) - tier(b)
    || syllableDistance(a) - syllableDistance(b)
    || bucketB - bucketA
    || Number(usageRank(a) === Number.MAX_SAFE_INTEGER) - Number(usageRank(b) === Number.MAX_SAFE_INTEGER)
    || usageRank(a) - usageRank(b)
    || score(b) - score(a)
    || lexicalCompare(a, b);
}

function rowsForPolicy(rows, policy) {
  const copy = [...rows];
  if (policy === 'engine_rank') {
    return copy.sort((a, b) => Number(a.task.engine.overall_rank) - Number(b.task.engine.overall_rank));
  }
  if (policy === 'current_sample_reconstruction') return copy.sort((a, b) => compareUsageFirst(a.task, b.task));
  if (policy === 'score_first') return copy.sort((a, b) => compareScoreFirst(a.task, b.task));
  if (policy === 'score_band_0_02') return copy.sort((a, b) => compareScoreBand(a.task, b.task, 0.02));
  if (policy === 'score_band_0_05') return copy.sort((a, b) => compareScoreBand(a.task, b.task, 0.05));
  throw new Error(`Unknown ranking policy: ${policy}`);
}

function metricsForRows(rows, policy) {
  const ranked = rowsForPolicy(rows, policy);
  const ideal = [...rows].sort((a, b) => b.usefulness - a.usefulness || Number(a.task.engine.overall_rank) - Number(b.task.engine.overall_rank));
  const idealDcg = dcg(ideal);
  let comparablePairs = 0;
  let concordantPairs = 0;
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      if (ranked[i].usefulness === ranked[j].usefulness) continue;
      comparablePairs += 1;
      if (ranked[i].usefulness > ranked[j].usefulness) concordantPairs += 1;
    }
  }
  return {
    ranked_tasks: ranked.length,
    ndcg: idealDcg ? Number((dcg(ranked) / idealDcg).toFixed(4)) : null,
    pairwise_concordance: safeRatio(concordantPairs, comparablePairs),
    comparable_pairs: comparablePairs,
    top: ranked.slice(0, 8).map((row, index) => ({
      rank: index + 1,
      word: row.task.candidate.word,
      engine_rank: row.task.engine.overall_rank,
      primary: row.task.engine.primary_type || 'none',
      primary_score: row.task.engine.primary_score,
      usage_rank: row.task.candidate.usage_rank ?? null,
      usefulness: row.usefulness,
      confidence: row.review.confidence ?? null,
    })),
  };
}

export function buildRankingExperiment(queue, reviews) {
  if (!queue || !Array.isArray(queue.tasks)) throw new Error('Benchmark queue with tasks is required');
  if (!reviews || !Array.isArray(reviews.reviews)) throw new Error('Benchmark reviews with rows are required');
  const reviewById = new Map(reviews.reviews.map((review) => [String(review.task_id), review]));
  const byQuery = new Map();
  for (const task of queue.tasks) {
    if (task?.engine?.overall_rank == null) continue;
    const review = reviewById.get(String(task.id));
    if (!review || review.skip) continue;
    const query = String(task?.query?.word || '');
    if (!byQuery.has(query)) byQuery.set(query, []);
    byQuery.get(query).push({ task, review, usefulness: Number(review.usefulness ?? 0) });
  }

  const perQuery = [...byQuery.entries()].map(([query, rows]) => ({
    query,
    policies: Object.fromEntries(POLICY_ORDER.map((policy) => [policy, metricsForRows(rows, policy)])),
  })).sort((a, b) => a.query.localeCompare(b.query, 'de'));

  const aggregate = Object.fromEntries(POLICY_ORDER.map((policy) => {
    const ndcgValues = perQuery.map((row) => row.policies[policy].ndcg);
    const pairwiseValues = perQuery.map((row) => row.policies[policy].pairwise_concordance);
    return [policy, {
      mean_ndcg: mean(ndcgValues),
      mean_pairwise_concordance: mean(pairwiseValues),
    }];
  }));

  const baseline = aggregate.engine_rank;
  for (const policy of POLICY_ORDER) {
    aggregate[policy].delta_vs_engine_rank = {
      mean_ndcg: aggregate[policy].mean_ndcg == null || baseline.mean_ndcg == null
        ? null : Number((aggregate[policy].mean_ndcg - baseline.mean_ndcg).toFixed(4)),
      mean_pairwise_concordance: aggregate[policy].mean_pairwise_concordance == null || baseline.mean_pairwise_concordance == null
        ? null : Number((aggregate[policy].mean_pairwise_concordance - baseline.mean_pairwise_concordance).toFixed(4)),
    };
  }

  const challengers = POLICY_ORDER.filter((policy) => policy !== 'engine_rank')
    .map((policy) => ({ policy, ...aggregate[policy] }))
    .sort((a, b) => (b.mean_pairwise_concordance ?? -1) - (a.mean_pairwise_concordance ?? -1)
      || (b.mean_ndcg ?? -1) - (a.mean_ndcg ?? -1));

  return {
    schema: 'rhymelab-benchmark-ranking-experiment-v1',
    benchmark_version: queue.benchmark_version || null,
    language: queue.language || null,
    generated_at: new Date().toISOString(),
    scope: 'counterfactual ranking of the already-sampled reviewed tasks only; no retrieval, labels, runtime scorer or database are changed',
    policies: POLICY_ORDER,
    aggregate,
    best_challenger: challengers[0] || null,
    per_query: perQuery,
  };
}
