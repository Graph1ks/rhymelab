import { buildBlindBenchmarkExport } from './benchmark-handoff-core.mjs';

export const BENCHMARK_REFRESH_REPORT_SCHEMA = 'rhymelab-benchmark-refresh-report-v1';
export const BENCHMARK_REFRESH_BLIND_SCHEMA = 'rhymelab-benchmark-refresh-blind-v1';

const normalizeText = (value) => String(value ?? '').normalize('NFKC').trim();
const normalizeWord = (value) => normalizeText(value).toLocaleLowerCase('de-DE');

function pairKey(task) {
  return `${normalizeWord(task?.query?.word)}\u241f${normalizeWord(task?.candidate?.word)}`;
}

function canonicalTask(task) {
  return {
    task_id: String(task?.task_id ?? task?.id ?? ''),
    query: {
      word: normalizeText(task?.query?.word),
      ipa: normalizeText(task?.query?.ipa),
    },
    candidate: {
      word: normalizeText(task?.candidate?.word),
      ipa: normalizeText(task?.candidate?.ipa),
    },
  };
}

function groupByPair(tasks) {
  const map = new Map();
  for (const task of tasks) {
    const key = pairKey(task);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  return map;
}

function publicTask(task) {
  return canonicalTask(task);
}

export function compareBenchmarkRefresh(baselineBlind, freshQueue, referenceDocument = null) {
  if (baselineBlind?.schema !== 'rhymelab-benchmark-blind-v1') {
    throw new Error(`Unexpected baseline blind schema: ${baselineBlind?.schema || 'missing'}`);
  }
  if (!Array.isArray(baselineBlind.tasks)) throw new Error('Baseline blind export has no tasks');
  if (!freshQueue || !Array.isArray(freshQueue.tasks)) throw new Error('Fresh benchmark queue has no tasks');
  if (baselineBlind.benchmark_version !== freshQueue.benchmark_version) {
    throw new Error(`Benchmark version mismatch: ${baselineBlind.benchmark_version} != ${freshQueue.benchmark_version}`);
  }
  if (baselineBlind.language !== freshQueue.language) {
    throw new Error(`Benchmark language mismatch: ${baselineBlind.language} != ${freshQueue.language}`);
  }

  const freshBlind = buildBlindBenchmarkExport(freshQueue);
  const baselineTasks = baselineBlind.tasks.map(canonicalTask);
  const freshTasks = freshBlind.tasks.map(canonicalTask);
  const baselineById = new Map(baselineTasks.map((task) => [task.task_id, task]));
  const freshById = new Map(freshTasks.map((task) => [task.task_id, task]));
  const baselineByPair = groupByPair(baselineTasks);
  const freshByPair = groupByPair(freshTasks);

  const unchanged = [];
  const changedIpa = [];
  const newTasks = [];
  const ambiguousPairMatches = [];

  for (const fresh of freshTasks) {
    const exact = baselineById.get(fresh.task_id);
    if (exact) {
      unchanged.push(publicTask(fresh));
      continue;
    }
    const matches = baselineByPair.get(pairKey(fresh)) || [];
    if (matches.length === 1) {
      const previous = matches[0];
      changedIpa.push({
        old_task_id: previous.task_id,
        new_task_id: fresh.task_id,
        query: { word: fresh.query.word, old_ipa: previous.query.ipa, new_ipa: fresh.query.ipa },
        candidate: { word: fresh.candidate.word, old_ipa: previous.candidate.ipa, new_ipa: fresh.candidate.ipa },
      });
    } else if (matches.length > 1) {
      ambiguousPairMatches.push({ current: publicTask(fresh), baseline_candidates: matches.map(publicTask) });
    } else {
      newTasks.push(publicTask(fresh));
    }
  }

  const changedOldIds = new Set(changedIpa.map((row) => row.old_task_id));
  const ambiguousOldIds = new Set(ambiguousPairMatches.flatMap((row) => row.baseline_candidates.map((task) => task.task_id)));
  const removed = baselineTasks
    .filter((old) => !freshById.has(old.task_id) && !changedOldIds.has(old.task_id) && !ambiguousOldIds.has(old.task_id) && !freshByPair.has(pairKey(old)))
    .map(publicTask);

  const referenceLabels = Array.isArray(referenceDocument?.labels) ? referenceDocument.labels : [];
  const labelsById = new Map(referenceLabels.map((label) => [String(label?.task_id || ''), label]));
  const reusableLabelIds = unchanged.filter((task) => labelsById.has(task.task_id)).map((task) => task.task_id);
  const missingReusableLabels = unchanged.filter((task) => !labelsById.has(task.task_id)).map((task) => task.task_id);

  const deltaTasks = [
    ...changedIpa.map((row) => freshById.get(row.new_task_id)).filter(Boolean),
    ...newTasks.map((task) => freshById.get(task.task_id)).filter(Boolean),
    ...ambiguousPairMatches.map((row) => freshById.get(row.current.task_id)).filter(Boolean),
  ];

  const report = {
    schema: BENCHMARK_REFRESH_REPORT_SCHEMA,
    benchmark_version: freshQueue.benchmark_version,
    language: freshQueue.language,
    baseline_queue_fingerprint: baselineBlind.queue_fingerprint,
    refreshed_queue_fingerprint: freshBlind.queue_fingerprint,
    fingerprint_unchanged: baselineBlind.queue_fingerprint === freshBlind.queue_fingerprint,
    baseline_task_count: baselineTasks.length,
    refreshed_task_count: freshTasks.length,
    counts: {
      unchanged: unchanged.length,
      same_pair_changed_ipa: changedIpa.length,
      new: newTasks.length,
      removed: removed.length,
      ambiguous_pair_match: ambiguousPairMatches.length,
      delta_requires_reference: deltaTasks.length,
      reusable_reference_labels: reusableLabelIds.length,
      unchanged_tasks_missing_reference_label: missingReusableLabels.length,
    },
    relabel_required: deltaTasks.length > 0,
    recommendation: deltaTasks.length
      ? 'Reuse unchanged reference labels and request blind labels only for delta tasks.'
      : 'No second blind reference pass is required; the accepted reference labels remain task/IPA compatible.',
    changed_ipa: changedIpa,
    new_tasks: newTasks,
    removed_tasks: removed,
    ambiguous_pair_matches: ambiguousPairMatches,
    reusable_reference_task_ids: reusableLabelIds,
    unchanged_tasks_missing_reference_label_ids: missingReusableLabels,
  };

  const blindDelta = {
    schema: BENCHMARK_REFRESH_BLIND_SCHEMA,
    benchmark_version: freshQueue.benchmark_version,
    language: freshQueue.language,
    baseline_queue_fingerprint: baselineBlind.queue_fingerprint,
    full_queue_fingerprint: freshBlind.queue_fingerprint,
    generated_at: new Date().toISOString(),
    task_count: deltaTasks.length,
    rubric: freshBlind.rubric,
    requested_output: {
      schema: 'rhymelab-benchmark-refresh-reference-v1',
      benchmark_version: freshQueue.benchmark_version,
      language: freshQueue.language,
      baseline_queue_fingerprint: baselineBlind.queue_fingerprint,
      full_queue_fingerprint: freshBlind.queue_fingerprint,
      evaluator: { type: 'language_model', name: 'fill-in-evaluator-name' },
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
    tasks: deltaTasks.map(publicTask),
  };

  return { report, blindDelta, freshBlind };
}
