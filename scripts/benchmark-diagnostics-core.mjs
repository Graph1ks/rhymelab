const RELATION_TYPES = Object.freeze(['assonance', 'consonance']);

function safeRatio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function relationPrediction(task, type) {
  const relation = (task?.engine?.relations || []).find((item) => item?.type === type);
  if (relation) return relation.strength || 'partial';
  if ((task?.engine?.relation_types || []).includes(type)) return 'partial';
  return 'none';
}

function confidenceWeight(value) {
  if (value === 'high') return 2;
  if (value === 'medium') return 1;
  return 0;
}

function dcg(items) {
  return items.reduce((sum, item, index) => sum + ((2 ** item.usefulness) - 1) / Math.log2(index + 2), 0);
}

function rankingDiagnostic(query, rows) {
  const ranked = rows
    .filter((row) => row.engine.overall_rank != null)
    .sort((a, b) => a.engine.overall_rank - b.engine.overall_rank);
  if (ranked.length < 2) return null;

  const ideal = [...ranked].sort((a, b) => b.reference.usefulness - a.reference.usefulness || a.engine.overall_rank - b.engine.overall_rank);
  const idealDcg = dcg(ideal);
  let comparablePairs = 0;
  let concordantPairs = 0;
  const discordantPairs = [];
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      const a = ranked[i];
      const b = ranked[j];
      if (a.reference.usefulness === b.reference.usefulness) continue;
      comparablePairs += 1;
      if (a.reference.usefulness > b.reference.usefulness) {
        concordantPairs += 1;
      } else {
        discordantPairs.push({
          usefulness_gap: b.reference.usefulness - a.reference.usefulness,
          higher_engine_rank: {
            rank: a.engine.overall_rank,
            word: a.candidate.word,
            ipa: a.candidate.ipa,
            engine_primary: a.engine.primary,
            reference_primary: a.reference.primary,
            usefulness: a.reference.usefulness,
          },
          lower_engine_rank: {
            rank: b.engine.overall_rank,
            word: b.candidate.word,
            ipa: b.candidate.ipa,
            engine_primary: b.engine.primary,
            reference_primary: b.reference.primary,
            usefulness: b.reference.usefulness,
          },
        });
      }
    }
  }

  discordantPairs.sort((a, b) => b.usefulness_gap - a.usefulness_gap || a.higher_engine_rank.rank - b.higher_engine_rank.rank);
  return {
    query,
    ranked_tasks: ranked.length,
    ndcg: idealDcg ? Number((dcg(ranked) / idealDcg).toFixed(4)) : null,
    pairwise_concordance: safeRatio(concordantPairs, comparablePairs),
    comparable_pairs: comparablePairs,
    discordant_pairs: discordantPairs.slice(0, 8),
    ranking: ranked.map((row) => ({
      rank: row.engine.overall_rank,
      candidate: row.candidate.word,
      ipa: row.candidate.ipa,
      engine_primary: row.engine.primary,
      reference_primary: row.reference.primary,
      usefulness: row.reference.usefulness,
      confidence: row.reference.confidence,
    })),
  };
}

function diagnosticRow(task, review) {
  const predictedPrimary = task?.engine?.primary_type || 'none';
  const predictedAssonance = relationPrediction(task, 'assonance');
  const predictedConsonance = relationPrediction(task, 'consonance');
  const referenceAssonance = review?.assonance || 'none';
  const referenceConsonance = review?.consonance || 'none';
  const assonancePresenceMismatch = (predictedAssonance !== 'none') !== (referenceAssonance !== 'none');
  const consonancePresenceMismatch = (predictedConsonance !== 'none') !== (referenceConsonance !== 'none');
  const assonanceStrengthMismatch = !assonancePresenceMismatch && predictedAssonance !== referenceAssonance;
  const consonanceStrengthMismatch = !consonancePresenceMismatch && predictedConsonance !== referenceConsonance;
  const primaryMismatch = predictedPrimary !== review.primary;
  const relationMismatch = assonancePresenceMismatch || consonancePresenceMismatch || assonanceStrengthMismatch || consonanceStrengthMismatch;
  const usefulness = Number(review?.usefulness ?? 0);
  const priorityScore = (primaryMismatch ? 4 : 0)
    + (assonancePresenceMismatch ? 3 : 0)
    + (consonancePresenceMismatch ? 3 : 0)
    + (assonanceStrengthMismatch ? 1 : 0)
    + (consonanceStrengthMismatch ? 1 : 0)
    + confidenceWeight(review?.confidence)
    + (usefulness >= 3 ? 1 : 0);

  return {
    task_id: task.id,
    query: {
      word: task?.query?.word || '',
      ipa: task?.query?.ipa || '',
      phenomena: task?.query?.phenomena || [],
    },
    candidate: {
      word: task?.candidate?.word || '',
      ipa: task?.candidate?.ipa || '',
      usage_rank: task?.candidate?.usage_rank ?? null,
      lexicon_layer: task?.candidate?.lexicon_layer ?? null,
      historical: task?.candidate?.historical ?? null,
    },
    engine: {
      primary: predictedPrimary,
      primary_score: task?.engine?.primary_score ?? null,
      rhyme_tier: task?.engine?.rhyme_tier ?? null,
      overall_rank: task?.engine?.overall_rank ?? null,
      syllable_distance: task?.engine?.syllable_distance ?? null,
      assonance: predictedAssonance,
      consonance: predictedConsonance,
      relations: task?.engine?.relations || [],
      components: task?.engine?.components || null,
      sampling_categories: task?.engine?.sampling_categories || [],
    },
    reference: {
      primary: review.primary,
      assonance: referenceAssonance,
      consonance: referenceConsonance,
      usefulness,
      confidence: review?.confidence ?? null,
      reference_set: review?.reference_set ?? null,
      reviewer_source: review?.reviewer_source ?? null,
      note: review?.note || '',
    },
    mismatch: {
      primary: primaryMismatch,
      assonance_presence: assonancePresenceMismatch,
      assonance_strength: assonanceStrengthMismatch,
      consonance_presence: consonancePresenceMismatch,
      consonance_strength: consonanceStrengthMismatch,
      any_relation: relationMismatch,
      any: primaryMismatch || relationMismatch,
    },
    priority_score: priorityScore,
  };
}

export function buildBenchmarkDiagnostics(queue, reviewDocument) {
  if (!queue || !Array.isArray(queue.tasks)) throw new Error('Benchmark queue with tasks is required');
  if (!reviewDocument || !Array.isArray(reviewDocument.reviews)) throw new Error('Benchmark review document with reviews is required');

  const reviews = new Map(reviewDocument.reviews.map((row) => [String(row.task_id), row]));
  const missingReviewIds = [];
  const skippedTaskIds = [];
  const rows = [];
  for (const task of queue.tasks) {
    const review = reviews.get(String(task.id));
    if (!review) {
      missingReviewIds.push(String(task.id));
      continue;
    }
    if (review.skip) {
      skippedTaskIds.push(String(task.id));
      continue;
    }
    rows.push(diagnosticRow(task, review));
  }

  const mismatches = rows.filter((row) => row.mismatch.any);
  mismatches.sort((a, b) => b.priority_score - a.priority_score
    || String(a.reference.confidence).localeCompare(String(b.reference.confidence))
    || a.query.word.localeCompare(b.query.word, 'de')
    || a.candidate.word.localeCompare(b.candidate.word, 'de'));

  const byQuery = new Map();
  for (const row of rows) {
    if (!byQuery.has(row.query.word)) byQuery.set(row.query.word, []);
    byQuery.get(row.query.word).push(row);
  }

  const queryDiagnostics = [...byQuery.entries()].map(([query, queryRows]) => {
    const primaryMismatches = queryRows.filter((row) => row.mismatch.primary).length;
    const relationMismatches = queryRows.filter((row) => row.mismatch.any_relation).length;
    return {
      query,
      tasks: queryRows.length,
      primary_mismatches: primaryMismatches,
      relation_mismatches: relationMismatches,
      primary_accuracy: safeRatio(queryRows.length - primaryMismatches, queryRows.length),
      mean_usefulness: queryRows.length
        ? Number((queryRows.reduce((sum, row) => sum + row.reference.usefulness, 0) / queryRows.length).toFixed(3))
        : null,
      ranking: rankingDiagnostic(query, queryRows),
    };
  }).sort((a, b) => a.primary_accuracy - b.primary_accuracy
    || (a.ranking?.pairwise_concordance ?? 1) - (b.ranking?.pairwise_concordance ?? 1)
    || a.query.localeCompare(b.query, 'de'));

  const primaryMismatchCount = rows.filter((row) => row.mismatch.primary).length;
  const assonancePresenceMismatchCount = rows.filter((row) => row.mismatch.assonance_presence).length;
  const consonancePresenceMismatchCount = rows.filter((row) => row.mismatch.consonance_presence).length;
  const assonanceStrengthMismatchCount = rows.filter((row) => row.mismatch.assonance_strength).length;
  const consonanceStrengthMismatchCount = rows.filter((row) => row.mismatch.consonance_strength).length;

  const primaryConfusion = {};
  for (const row of rows) {
    primaryConfusion[row.engine.primary] ||= {};
    primaryConfusion[row.engine.primary][row.reference.primary] = (primaryConfusion[row.engine.primary][row.reference.primary] || 0) + 1;
  }

  const problemRankingQueries = queryDiagnostics
    .filter((row) => row.ranking && (row.ranking.ndcg < 0.95 || row.ranking.pairwise_concordance < 0.8))
    .sort((a, b) => (a.ranking?.pairwise_concordance ?? 1) - (b.ranking?.pairwise_concordance ?? 1)
      || (a.ranking?.ndcg ?? 1) - (b.ranking?.ndcg ?? 1));

  return {
    schema: 'rhymelab-benchmark-diagnostics-v1',
    benchmark_version: queue.benchmark_version || null,
    language: queue.language || null,
    queue_fingerprint: reviewDocument.queue_fingerprint || null,
    generated_at: new Date().toISOString(),
    summary: {
      total_queue_tasks: queue.tasks.length,
      reviewed_usable_tasks: rows.length,
      missing_reviews: missingReviewIds.length,
      skipped_tasks: skippedTaskIds.length,
      primary_mismatches: primaryMismatchCount,
      primary_exact_accuracy: safeRatio(rows.length - primaryMismatchCount, rows.length),
      assonance_presence_mismatches: assonancePresenceMismatchCount,
      assonance_strength_only_mismatches: assonanceStrengthMismatchCount,
      consonance_presence_mismatches: consonancePresenceMismatchCount,
      consonance_strength_only_mismatches: consonanceStrengthMismatchCount,
      tasks_with_any_mismatch: mismatches.length,
      queries_with_ranking_attention: problemRankingQueries.length,
    },
    primary_confusion: primaryConfusion,
    query_diagnostics: queryDiagnostics,
    ranking_attention: problemRankingQueries,
    prioritized_mismatches: mismatches,
    missing_review_task_ids: missingReviewIds,
    skipped_task_ids: skippedTaskIds,
  };
}
