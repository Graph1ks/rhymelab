import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveBenchmarkReview } from '../src/benchmark-store.mjs';

test('manual benchmark edits preserve mixed provenance after external reference import', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rhymelab-benchmark-store-'));
  const queuePath = join(dir, 'queue.json');
  const reviewsPath = join(dir, 'reviews.json');
  try {
    await writeFile(queuePath, JSON.stringify({
      tasks: [
        { id: 'a' },
        { id: 'b' },
      ],
    }), 'utf8');
    await writeFile(reviewsPath, JSON.stringify({
      schema: 'rhymelab-de-human-benchmark-reviews-v1',
      benchmark_version: 'de-human-rhyme-v1',
      label_source: 'external_model_reference',
      reviews: [
        {
          task_id: 'a', skip: false, primary: 'perfect', assonance: 'none', consonance: 'none', usefulness: 4,
          reviewer_source: 'external_model_reference', confidence: 'high', reviewed_at: new Date().toISOString(), note: '',
        },
      ],
    }), 'utf8');

    const saved = await saveBenchmarkReview({
      task_id: 'b', primary: 'slant', assonance: 'partial', consonance: 'none', usefulness: 2, note: 'manual spot check',
    }, queuePath, reviewsPath);

    assert.equal(saved.reviewer_source, 'local_manual');
    assert.equal(saved.confidence, null);
    const next = JSON.parse(await readFile(reviewsPath, 'utf8'));
    assert.equal(next.label_source, 'mixed');
    assert.equal(next.reviews.length, 2);
    assert.equal(next.reviews.find((row) => row.task_id === 'a').reviewer_source, 'external_model_reference');
    assert.equal(next.reviews.find((row) => row.task_id === 'b').reviewer_source, 'local_manual');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
