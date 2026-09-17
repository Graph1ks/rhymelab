import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { computeBenchmarkMetrics, normalizeReview } from '../scripts/benchmark-core.mjs';

export const DEFAULT_BENCHMARK_QUEUE = resolve('data/local/benchmark/de-v1-queue.json');
export const DEFAULT_BENCHMARK_REVIEWS = resolve('data/local/benchmark/de-v1-reviews.json');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function rowSource(review, documentSource) {
  if (review?.reviewer_source) return review.reviewer_source;
  if (documentSource === 'external_model_reference') return 'external_model_reference';
  return 'local_manual';
}

export async function loadBenchmarkState(queuePath = DEFAULT_BENCHMARK_QUEUE, reviewsPath = DEFAULT_BENCHMARK_REVIEWS) {
  const queue = await readJson(queuePath);
  const reviews = await readJson(reviewsPath);
  const reviewMap = new Map((reviews.reviews || []).map((review) => [review.task_id, review]));
  const nextTask = (queue.tasks || []).find((task) => !reviewMap.has(task.id)) || null;
  return {
    queue,
    reviews,
    summary: computeBenchmarkMetrics(queue, reviews),
    next_task: nextTask,
  };
}

export async function saveBenchmarkReview(input, queuePath = DEFAULT_BENCHMARK_QUEUE, reviewsPath = DEFAULT_BENCHMARK_REVIEWS) {
  const queue = await readJson(queuePath);
  const reviews = await readJson(reviewsPath);
  const taskIds = new Set((queue.tasks || []).map((task) => task.id));
  const normalized = {
    ...normalizeReview(input, taskIds),
    confidence: null,
    reviewer_source: 'local_manual',
  };
  const byTask = new Map((reviews.reviews || []).map((review) => [review.task_id, review]));
  byTask.set(normalized.task_id, normalized);
  const rows = [...byTask.values()];
  const sources = new Set(rows.map((review) => rowSource(review, reviews.label_source)));
  const labelSource = sources.size > 1 ? 'mixed' : (sources.values().next().value || 'local_manual');
  const next = {
    ...reviews,
    label_source: labelSource,
    updated_at: new Date().toISOString(),
    reviews: rows,
  };
  await mkdir(dirname(reviewsPath), { recursive: true });
  await writeFile(reviewsPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return normalized;
}
