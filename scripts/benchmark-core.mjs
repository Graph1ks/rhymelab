import { createHash } from 'node:crypto';

export const PRIMARY_LABELS = Object.freeze([
  'none',
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
]);
export const RELATION_LABELS = Object.freeze(['none', 'partial', 'strong']);
export const USEFULNESS_LABELS = Object.freeze([0, 1, 2, 3, 4]);

export function benchmarkTaskId(query, candidate, queryIpa = '', candidateIpa = '') {
  const raw = [query, candidate, queryIpa, candidateIpa].map((value) => String(value ?? '').normalize('NFKC').trim()).join('\u241f');
  return createHash('sha256').update(raw).digest('hex').slice(0, 20);
}

export function normalizeReview(input, taskIds = null) {
  const taskId = String(input?.task_id || '').trim();
  if (!taskId) throw new Error('task_id is required');
  if (taskIds && !taskIds.has(taskId)) throw new Error(`Unknown benchmark task: ${taskId}`);

  if (input?.skip === true) {
    return {
      task_id: taskId,
      skip: true,
      primary: null,
      assonance: null,
      consonance: null,
      usefulness: null,
      note: String(input?.note || '').trim().slice(0, 1000),
      reviewed_at: new Date().toISOString(),
    };
  }

  const primary = String(input?.primary || '');
  const assonance = String(input?.assonance || '');
  const consonance = String(input?.consonance || '');
  const usefulness = Number(input?.usefulness);
  if (!PRIMARY_LABELS.includes(primary)) throw new Error(`Invalid primary label: ${primary}`);
  if (!RELATION_LABELS.includes(assonance)) throw new Error(`Invalid assonance label: ${assonance}`);
  if (!RELATION_LABELS.includes(consonance)) throw new Error(`Invalid consonance label: ${consonance}`);
  if (!USEFULNESS_LABELS.includes(usefulness)) throw new Error(`Invalid usefulness label: ${input?.usefulness}`);

  return {
    task_id: taskId,
    skip: false,
    primary,
    assonance,
    consonance,
    usefulness,
    note: String(input?.note || '').trim().slice(0, 1000),
    reviewed_at: new Date().toISOString(),
  };
}

function safeRatio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function relationConfusion(tasks, reviews, relation) {
  let tp = 0, fp = 0, fn = 0, tn = 0, strengthExact = 0, strengthCompared = 0;
  for (const task of tasks) {
    const review = reviews.get(task.id);
    if (!review || review.skip) continue;
    const predicted = (task.engine?.relation_types || []).includes(relation);
    const goldStrength = review[relation];
    const gold = goldStrength !== 'none';
    if (predicted && gold) tp += 1;
    else if (predicted && !gold) fp += 1;
    else if (!predicted && gold) fn += 1;
    else tn += 1;
    if (predicted && gold) {
      strengthCompared += 1;
      const predictedStrength = task.engine?.relations?.find((item) => item.type === relation)?.strength || null;
      if (predictedStrength === goldStrength) strengthExact += 1;
    }
  }
  return {
    tp, fp, fn, tn,
    precision: safeRatio(tp, tp + fp),
    recall: safeRatio(tp, tp + fn),
    f1: (tp + fp && tp + fn) ? safeRatio(2 * tp, 2 * tp + fp + fn) : null,
    false_positive_rate: safeRatio(fp, fp + tn),
    false_negative_rate: safeRatio(fn, fn + tp),
    strength_exact: safeRatio(strengthExact, strengthCompared),
    strength_compared: strengthCompared,
  };
}

function primaryMetrics(tasks, reviews) {
  let compared = 0, exact = 0, predictedPositive = 0, goldPositive = 0, truePositive = 0;
  const confusion = {};
  const observed = [];
  for (const task of tasks) {
    const review = reviews.get(task.id);
    if (!review || review.skip) continue;
    const predicted = task.engine?.primary_type || 'none';
    const gold = review.primary;
    observed.push({ predicted, gold });
    compared += 1;
    if (predicted === gold) exact += 1;
    if (predicted !== 'none') predictedPositive += 1;
    if (gold !== 'none') goldPositive += 1;
    if (predicted !== 'none' && gold !== 'none') truePositive += 1;
    confusion[predicted] ||= {};
    confusion[predicted][gold] = (confusion[predicted][gold] || 0) + 1;
  }
  const perClass = {};
  for (const label of PRIMARY_LABELS.filter((value) => value !== 'none')) {
    let tp = 0, fp = 0, fn = 0;
    for (const row of observed) {
      if (row.predicted === label && row.gold === label) tp += 1;
      else if (row.predicted === label && row.gold !== label) fp += 1;
      else if (row.predicted !== label && row.gold === label) fn += 1;
    }
    perClass[label] = {
      tp, fp, fn,
      precision: safeRatio(tp, tp + fp),
      recall: safeRatio(tp, tp + fn),
      f1: (tp + fp && tp + fn) ? safeRatio(2 * tp, 2 * tp + fp + fn) : null,
    };
  }
  return {
    compared,
    exact_accuracy: safeRatio(exact, compared),
    rhyme_precision: safeRatio(truePositive, predictedPositive),
    rhyme_recall_within_sample: safeRatio(truePositive, goldPositive),
    per_class: perClass,
    confusion,
  };
}

function dcg(items) {
  return items.reduce((sum, item, index) => sum + ((2 ** item.relevance) - 1) / Math.log2(index + 2), 0);
}

function rankingMetrics(tasks, reviews) {
  const byQuery = new Map();
  for (const task of tasks) {
    const review = reviews.get(task.id);
    if (!review || review.skip || task.engine?.overall_rank == null) continue;
    const query = task.query?.word || '';
    if (!byQuery.has(query)) byQuery.set(query, []);
    byQuery.get(query).push({
      rank: Number(task.engine.overall_rank),
      relevance: Number(review.usefulness),
    });
  }
  const perQuery = [];
  for (const [query, rows] of byQuery) {
    if (rows.length < 2) continue;
    const predicted = [...rows].sort((a, b) => a.rank - b.rank);
    const ideal = [...rows].sort((a, b) => b.relevance - a.relevance || a.rank - b.rank);
    const idealDcg = dcg(ideal);
    let comparablePairs = 0, concordantPairs = 0;
    for (let i = 0; i < predicted.length; i += 1) {
      for (let j = i + 1; j < predicted.length; j += 1) {
        if (predicted[i].relevance === predicted[j].relevance) continue;
        comparablePairs += 1;
        if (predicted[i].relevance > predicted[j].relevance) concordantPairs += 1;
      }
    }
    perQuery.push({
      query,
      reviewed: rows.length,
      ndcg: idealDcg ? Number((dcg(predicted) / idealDcg).toFixed(4)) : null,
      pairwise_concordance: safeRatio(concordantPairs, comparablePairs),
      comparable_pairs: comparablePairs,
    });
  }
  const average = (key) => {
    const values = perQuery.map((row) => row[key]).filter((value) => value != null);
    return values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null;
  };
  return {
    queries_compared: perQuery.length,
    mean_ndcg: average('ndcg'),
    mean_pairwise_concordance: average('pairwise_concordance'),
    per_query: perQuery,
  };
}

function phenomenonMetrics(tasks, reviews) {
  const phenomena = new Set(tasks.flatMap((task) => task.query?.phenomena || []));
  const out = {};
  for (const phenomenon of [...phenomena].sort()) {
    const subset = tasks.filter((task) => (task.query?.phenomena || []).includes(phenomenon));
    let reviewed = 0, exact = 0, usefulnessTotal = 0;
    for (const task of subset) {
      const review = reviews.get(task.id);
      if (!review || review.skip) continue;
      reviewed += 1;
      if ((task.engine?.primary_type || 'none') === review.primary) exact += 1;
      usefulnessTotal += Number(review.usefulness || 0);
    }
    out[phenomenon] = {
      reviewed,
      primary_exact_accuracy: safeRatio(exact, reviewed),
      mean_usefulness: reviewed ? Number((usefulnessTotal / reviewed).toFixed(3)) : null,
      assonance: relationConfusion(subset, reviews, 'assonance'),
      consonance: relationConfusion(subset, reviews, 'consonance'),
    };
  }
  return out;
}

export function computeBenchmarkMetrics(queue, reviewDocument) {
  const tasks = Array.isArray(queue?.tasks) ? queue.tasks : [];
  const reviewRows = Array.isArray(reviewDocument?.reviews) ? reviewDocument.reviews : [];
  const reviews = new Map(reviewRows.map((row) => [row.task_id, row]));
  const completed = tasks.filter((task) => reviews.has(task.id)).length;
  const skipped = tasks.filter((task) => reviews.get(task.id)?.skip === true).length;
  const usableReviewed = completed - skipped;
  return {
    schema: 'rhymelab-de-human-benchmark-report-v1',
    benchmark_version: queue?.benchmark_version || null,
    queue_generated_at: queue?.generated_at || null,
    total_tasks: tasks.length,
    reviewed_tasks: completed,
    usable_reviewed_tasks: usableReviewed,
    skipped_tasks: skipped,
    pending_tasks: Math.max(0, tasks.length - completed),
    completion_pct: tasks.length ? Number((100 * completed / tasks.length).toFixed(2)) : 0,
    primary: primaryMetrics(tasks, reviews),
    assonance: relationConfusion(tasks, reviews, 'assonance'),
    consonance: relationConfusion(tasks, reviews, 'consonance'),
    ranking: rankingMetrics(tasks, reviews),
    by_phenomenon: phenomenonMetrics(tasks, reviews),
    scope_note: 'Recall metrics are measured within the sampled benchmark candidate universe, not against every form in the database.',
  };
}
