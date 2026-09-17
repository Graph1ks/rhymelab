import { normalizeReview } from './benchmark-core.mjs';
import { benchmarkQueueFingerprint, REVIEW_CONFIDENCE } from './benchmark-handoff-core.mjs';

export const BENCHMARK_REFRESH_REFERENCE_SCHEMA = 'rhymelab-benchmark-refresh-reference-v1';

function normalizeExternalLabel(label, taskIds, referenceSet) {
  const taskId = String(label?.task_id || '').trim();
  if (!taskId) throw new Error('Reference label task_id is required');
  if (!taskIds.has(taskId)) throw new Error(`Unknown reference task: ${taskId}`);
  const confidence = label?.confidence == null ? null : String(label.confidence);
  if (confidence != null && !REVIEW_CONFIDENCE.includes(confidence)) {
    throw new Error(`Invalid confidence for ${taskId}: ${confidence}`);
  }
  const normalized = label?.ambiguous === true
    ? normalizeReview({ task_id: taskId, skip: true, note: label?.note || 'Marked ambiguous by external evaluator' }, taskIds)
    : normalizeReview(label, taskIds);
  return {
    ...normalized,
    confidence,
    reviewer_source: 'external_model_reference',
    reference_set: referenceSet,
  };
}

function evaluatorSummary(baseline, refresh) {
  const a = baseline?.evaluator || null;
  const b = refresh?.evaluator || null;
  if (JSON.stringify(a) === JSON.stringify(b)) return a;
  return { type: 'mixed_external_reference', baseline: a, refresh: b };
}

export function mergeBenchmarkRefreshReferences(queue, baselineReference, refreshReference) {
  if (!queue || !Array.isArray(queue.tasks)) throw new Error('Fresh benchmark queue with tasks is required');
  if (queue.schema !== 'rhymelab-de-human-benchmark-queue-v1') throw new Error(`Unexpected fresh queue schema: ${queue.schema || 'missing'}`);
  if (baselineReference?.schema !== 'rhymelab-benchmark-reference-v1') {
    throw new Error(`Unexpected baseline reference schema: ${baselineReference?.schema || 'missing'}`);
  }
  if (refreshReference?.schema !== BENCHMARK_REFRESH_REFERENCE_SCHEMA) {
    throw new Error(`Unexpected refresh reference schema: ${refreshReference?.schema || 'missing'}`);
  }
  for (const document of [baselineReference, refreshReference]) {
    if (document.benchmark_version !== queue.benchmark_version) {
      throw new Error(`Benchmark version mismatch: ${document.benchmark_version} != ${queue.benchmark_version}`);
    }
    if (document.language !== queue.language) {
      throw new Error(`Benchmark language mismatch: ${document.language} != ${queue.language}`);
    }
  }

  const freshFingerprint = benchmarkQueueFingerprint(queue);
  if (refreshReference.full_queue_fingerprint !== freshFingerprint) {
    throw new Error('Refresh reference does not match the current refreshed queue fingerprint');
  }
  if (refreshReference.baseline_queue_fingerprint !== baselineReference.queue_fingerprint) {
    throw new Error('Refresh reference baseline fingerprint does not match the baseline reference');
  }

  const taskIds = new Set(queue.tasks.map((task) => String(task.id)));
  const baselineLabels = Array.isArray(baselineReference.labels) ? baselineReference.labels : [];
  const refreshLabels = Array.isArray(refreshReference.labels) ? refreshReference.labels : [];
  const baselineById = new Map();
  for (const label of baselineLabels) {
    const taskId = String(label?.task_id || '').trim();
    if (!taskId) throw new Error('Baseline reference contains a label without task_id');
    if (baselineById.has(taskId)) throw new Error(`Duplicate baseline reference label: ${taskId}`);
    baselineById.set(taskId, label);
  }
  const refreshById = new Map();
  for (const label of refreshLabels) {
    const taskId = String(label?.task_id || '').trim();
    if (!taskId) throw new Error('Refresh reference contains a label without task_id');
    if (refreshById.has(taskId)) throw new Error(`Duplicate refresh reference label: ${taskId}`);
    if (!taskIds.has(taskId)) throw new Error(`Refresh reference contains task not present in refreshed queue: ${taskId}`);
    if (baselineById.has(taskId)) throw new Error(`Refresh reference attempts to replace reusable baseline task: ${taskId}`);
    refreshById.set(taskId, label);
  }

  const reusableIds = [...taskIds].filter((taskId) => baselineById.has(taskId));
  const deltaIds = [...taskIds].filter((taskId) => !baselineById.has(taskId));
  const missingDelta = deltaIds.filter((taskId) => !refreshById.has(taskId));
  const unexpectedRefresh = [...refreshById.keys()].filter((taskId) => !deltaIds.includes(taskId));
  if (missingDelta.length) throw new Error(`Refresh reference is incomplete: ${missingDelta.length} refreshed task(s) missing`);
  if (unexpectedRefresh.length) throw new Error(`Refresh reference contains ${unexpectedRefresh.length} non-delta task(s)`);

  const reviews = queue.tasks.map((task) => {
    const taskId = String(task.id);
    if (baselineById.has(taskId)) return normalizeExternalLabel(baselineById.get(taskId), taskIds, 'baseline_reused');
    return normalizeExternalLabel(refreshById.get(taskId), taskIds, 'refresh_delta');
  });
  const confidence = Object.fromEntries(REVIEW_CONFIDENCE.map((value) => [value, 0]));
  let ambiguous = 0;
  for (const review of reviews) {
    if (review.skip) ambiguous += 1;
    if (review.confidence) confidence[review.confidence] += 1;
  }

  return {
    reviewDocument: {
      schema: 'rhymelab-de-human-benchmark-reviews-v1',
      benchmark_version: queue.benchmark_version,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      label_source: 'external_model_reference',
      evaluator: evaluatorSummary(baselineReference, refreshReference),
      queue_fingerprint: freshFingerprint,
      merged_reference_provenance: {
        baseline_queue_fingerprint: baselineReference.queue_fingerprint,
        refreshed_queue_fingerprint: freshFingerprint,
        reused_baseline_labels: reusableIds.length,
        refresh_delta_labels: deltaIds.length,
      },
      reviews,
    },
    importSummary: {
      queue_tasks: taskIds.size,
      reused_baseline_labels: reusableIds.length,
      refresh_delta_labels: deltaIds.length,
      labels_imported: reviews.length,
      ambiguous_skipped: ambiguous,
      confidence,
      complete: reviews.length === taskIds.size,
    },
  };
}
