import { createHash } from 'node:crypto';
import { normalizeReview, PRIMARY_LABELS, RELATION_LABELS, USEFULNESS_LABELS } from './benchmark-core.mjs';

export const BLIND_EXPORT_SCHEMA = 'rhymelab-benchmark-blind-v1';
export const REFERENCE_LABEL_SCHEMA = 'rhymelab-benchmark-reference-v1';
export const REVIEW_CONFIDENCE = Object.freeze(['high', 'medium', 'low']);

function canonicalTask(task) {
  return {
    task_id: String(task?.id || ''),
    query: {
      word: String(task?.query?.word || ''),
      ipa: String(task?.query?.ipa || ''),
    },
    candidate: {
      word: String(task?.candidate?.word || ''),
      ipa: String(task?.candidate?.ipa || ''),
    },
  };
}

function stableFingerprintPayload(queue) {
  const tasks = (queue?.tasks || []).map(canonicalTask).sort((a, b) => a.task_id.localeCompare(b.task_id));
  return {
    benchmark_version: queue?.benchmark_version || null,
    language: queue?.language || null,
    tasks,
  };
}

export function benchmarkQueueFingerprint(queue) {
  return createHash('sha256').update(JSON.stringify(stableFingerprintPayload(queue))).digest('hex');
}

export function buildBlindBenchmarkExport(queue) {
  if (!queue || !Array.isArray(queue.tasks)) throw new Error('Benchmark queue with tasks is required');
  const fingerprint = benchmarkQueueFingerprint(queue);
  return {
    schema: BLIND_EXPORT_SCHEMA,
    benchmark_version: queue.benchmark_version || null,
    language: queue.language || null,
    queue_fingerprint: fingerprint,
    task_count: queue.tasks.length,
    generated_at: new Date().toISOString(),
    rubric: {
      primary: {
        labels: PRIMARY_LABELS,
        definitions: {
          none: 'No convincing primary rhyme relationship.',
          multisyllabic_perfect: 'Exact stressed rhyme domain across two or more rhyme syllables.',
          perfect: 'Exact stressed rhyme tail for a single rhyme syllable.',
          multisyllabic_slant: 'Clearly strong multisyllabic near rhyme, but not exact.',
          family: 'Recognizably close phonological rhyme family, looser than multisyllabic slant.',
          slant: 'Loose but still defensible near rhyme.',
        },
      },
      assonance: {
        labels: RELATION_LABELS,
        definitions: {
          none: 'Vowel overlap is incidental or insufficient.',
          partial: 'Meaningful vowel agreement exists, but the relevant vowel pattern is incomplete or weaker.',
          strong: 'Stressed nucleus and relevant vowel pattern align clearly enough to form an obvious vowel-driven relation.',
        },
      },
      consonance: {
        labels: RELATION_LABELS,
        definitions: {
          none: 'Consonant overlap is incidental or insufficient.',
          partial: 'Recognizably similar consonant structure, but not a full strong match.',
          strong: 'Clearly matching consonant skeleton/sequence with meaningful vowel contrast.',
        },
      },
      songwriting_usefulness: {
        labels: USEFULNESS_LABELS,
        definitions: {
          0: 'Wrong or unusable suggestion.',
          1: 'Very weak; only situationally useful.',
          2: 'Usable.',
          3: 'Strong.',
          4: 'Excellent or obvious result.',
        },
      },
      relation_duplicate_policy: 'If the pair is an exact perfect rhyme, label Assonance and Consonance as none so sound relations measure additional information rather than restating exact rhyme.',
      uncertainty_policy: 'Use ambiguous=true instead of forcing a label when pronunciation or classification is genuinely too uncertain. Otherwise provide confidence high, medium, or low.',
    },
    requested_output: {
      schema: REFERENCE_LABEL_SCHEMA,
      benchmark_version: queue.benchmark_version || null,
      language: queue.language || null,
      queue_fingerprint: fingerprint,
      evaluator: {
        type: 'language_model',
        name: 'fill-in-evaluator-name',
      },
      labels: [{
        task_id: 'copy-from-task',
        primary: 'one primary label',
        assonance: 'none|partial|strong',
        consonance: 'none|partial|strong',
        usefulness: 'integer 0..4',
        confidence: 'high|medium|low',
        ambiguous: false,
        note: 'optional concise rationale',
      }],
    },
    tasks: queue.tasks.map(canonicalTask),
  };
}

function normalizeReferenceLabel(label, taskIds) {
  const taskId = String(label?.task_id || '').trim();
  if (!taskId) throw new Error('Reference label task_id is required');
  if (!taskIds.has(taskId)) throw new Error(`Unknown reference task: ${taskId}`);
  const confidence = label?.confidence == null ? null : String(label.confidence);
  if (confidence != null && !REVIEW_CONFIDENCE.includes(confidence)) throw new Error(`Invalid confidence for ${taskId}: ${confidence}`);
  const reviewerSource = 'external_model_reference';
  if (label?.ambiguous === true) {
    return {
      ...normalizeReview({ task_id: taskId, skip: true, note: label?.note || 'Marked ambiguous by external evaluator' }, taskIds),
      confidence,
      reviewer_source: reviewerSource,
    };
  }
  return {
    ...normalizeReview(label, taskIds),
    confidence,
    reviewer_source: reviewerSource,
  };
}

export function validateAndBuildImportedReviews(queue, referenceDocument, { requireComplete = true } = {}) {
  if (!queue || !Array.isArray(queue.tasks)) throw new Error('Benchmark queue with tasks is required');
  if (referenceDocument?.schema !== REFERENCE_LABEL_SCHEMA) throw new Error(`Unexpected reference schema: ${referenceDocument?.schema || 'missing'}`);
  if (referenceDocument.benchmark_version !== queue.benchmark_version) throw new Error(`Reference benchmark version mismatch: ${referenceDocument.benchmark_version} != ${queue.benchmark_version}`);
  if (referenceDocument.language !== queue.language) throw new Error(`Reference language mismatch: ${referenceDocument.language} != ${queue.language}`);
  const expectedFingerprint = benchmarkQueueFingerprint(queue);
  if (referenceDocument.queue_fingerprint !== expectedFingerprint) throw new Error('Reference file does not match the current benchmark queue fingerprint');

  const taskIds = new Set(queue.tasks.map((task) => task.id));
  const labels = Array.isArray(referenceDocument.labels) ? referenceDocument.labels : [];
  const seen = new Set();
  const reviews = [];
  for (const label of labels) {
    const taskId = String(label?.task_id || '').trim();
    if (seen.has(taskId)) throw new Error(`Duplicate reference label for task: ${taskId}`);
    seen.add(taskId);
    reviews.push(normalizeReferenceLabel(label, taskIds));
  }
  const missing = [...taskIds].filter((id) => !seen.has(id));
  if (requireComplete && missing.length) throw new Error(`Reference file is incomplete: ${missing.length} benchmark task(s) missing`);

  const confidenceCounts = Object.fromEntries(REVIEW_CONFIDENCE.map((value) => [value, 0]));
  let ambiguous = 0;
  for (const review of reviews) {
    if (review.skip) ambiguous += 1;
    if (review.confidence) confidenceCounts[review.confidence] += 1;
  }
  return {
    reviewDocument: {
      schema: 'rhymelab-de-human-benchmark-reviews-v1',
      benchmark_version: queue.benchmark_version,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      label_source: 'external_model_reference',
      evaluator: referenceDocument.evaluator || null,
      queue_fingerprint: expectedFingerprint,
      reviews,
    },
    importSummary: {
      queue_tasks: taskIds.size,
      labels_imported: reviews.length,
      ambiguous_skipped: ambiguous,
      confidence: confidenceCounts,
      complete: missing.length === 0,
      missing_task_ids: missing,
    },
  };
}
