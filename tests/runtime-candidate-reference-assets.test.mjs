import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRuntimeCandidateReferenceAssets } from '../scripts/runtime-candidate-reference-assets.mjs';

test('runtime candidate reference assets can be fully absent for invariance-only mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhymelab-runtime-ref-'));
  const result = await loadRuntimeCandidateReferenceAssets(
    join(root, 'missing-queue.json'),
    join(root, 'missing-reviews.json'),
  );

  assert.equal(result.status, 'unavailable_invariance_only');
  assert.equal(result.queue, null);
  assert.equal(result.reviews, null);
  assert.equal(result.queueFingerprint, null);
  assert.equal(result.reviewByTaskId.size, 0);
});

test('runtime candidate reference assets reject a partial local reference set', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhymelab-runtime-ref-'));
  const queuePath = join(root, 'queue.json');
  const reviewsPath = join(root, 'missing-reviews.json');
  await writeFile(queuePath, '{}\n', 'utf8');

  await assert.rejects(
    () => loadRuntimeCandidateReferenceAssets(queuePath, reviewsPath),
    /queue and reviews must either both exist or both be absent/,
  );
});
