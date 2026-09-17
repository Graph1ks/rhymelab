import { access, readFile } from 'node:fs/promises';
import { benchmarkQueueFingerprint } from './benchmark-handoff-core.mjs';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function loadRuntimeCandidateReferenceAssets(queuePath, reviewsPath) {
  const [queueExists, reviewsExists] = await Promise.all([
    exists(queuePath),
    exists(reviewsPath),
  ]);

  if (!queueExists && !reviewsExists) {
    return {
      status: 'unavailable_invariance_only',
      queue: null,
      reviews: null,
      queueFingerprint: null,
      reviewByTaskId: new Map(),
    };
  }

  if (queueExists !== reviewsExists) {
    throw new Error(
      'Runtime-candidate reference assets are incomplete: queue and reviews must either both exist or both be absent.',
    );
  }

  const queue = JSON.parse(await readFile(queuePath, 'utf8'));
  const reviews = JSON.parse(await readFile(reviewsPath, 'utf8'));

  if (queue.schema !== 'rhymelab-de-human-benchmark-queue-v1') {
    throw new Error(`Unexpected queue schema: ${queue.schema}`);
  }
  if (reviews.schema !== 'rhymelab-de-human-benchmark-reviews-v1') {
    throw new Error(`Unexpected review schema: ${reviews.schema}`);
  }

  const queueFingerprint = benchmarkQueueFingerprint(queue);
  if (reviews.queue_fingerprint && reviews.queue_fingerprint !== queueFingerprint) {
    throw new Error('Review file queue fingerprint does not match refreshed queue');
  }

  return {
    status: 'available',
    queue,
    reviews,
    queueFingerprint,
    reviewByTaskId: new Map(
      (reviews.reviews || [])
        .filter((row) => !row.skip)
        .map((row) => [String(row.task_id), row]),
    ),
  };
}
