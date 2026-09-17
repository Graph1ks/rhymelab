import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkTaskId } from '../scripts/benchmark-core.mjs';
import { buildBlindBenchmarkExport } from '../scripts/benchmark-handoff-core.mjs';
import { compareBenchmarkRefresh } from '../scripts/benchmark-refresh-core.mjs';

function task(queryWord, queryIpa, candidateWord, candidateIpa) {
  return {
    id: benchmarkTaskId(queryWord, candidateWord, queryIpa, candidateIpa),
    query: { word: queryWord, ipa: queryIpa },
    candidate: { word: candidateWord, ipa: candidateIpa },
    engine: {},
  };
}

function queue(tasks) {
  return {
    schema: 'rhymelab-de-human-benchmark-queue-v1',
    benchmark_version: 'de-human-rhyme-v1',
    language: 'de',
    tasks,
  };
}

test('benchmark refresh reuses all labels when task and IPA universe is unchanged', () => {
  const baseQueue = queue([
    task('Haus', 'haʊ̯s', 'Maus', 'maʊ̯s'),
    task('Liebe', 'ˈliːbə', 'Diebe', 'ˈdiːbə'),
  ]);
  const baselineBlind = buildBlindBenchmarkExport(baseQueue);
  const reference = {
    schema: 'rhymelab-benchmark-reference-v1',
    labels: baseQueue.tasks.map((row) => ({ task_id: row.id })),
  };
  const { report, blindDelta } = compareBenchmarkRefresh(baselineBlind, queue([...baseQueue.tasks]), reference);
  assert.equal(report.fingerprint_unchanged, true);
  assert.equal(report.counts.unchanged, 2);
  assert.equal(report.counts.same_pair_changed_ipa, 0);
  assert.equal(report.counts.new, 0);
  assert.equal(report.counts.removed, 0);
  assert.equal(report.counts.delta_requires_reference, 0);
  assert.equal(report.counts.reusable_reference_labels, 2);
  assert.equal(report.relabel_required, false);
  assert.equal(blindDelta.task_count, 0);
});

test('benchmark refresh isolates changed IPA and new tasks without relabeling unchanged tasks', () => {
  const oldHaus = task('Haus', 'haʊ̯s', 'Maus', 'maʊ̯s');
  const oldYoutube = task('YouTube', 'ˈjuːtjuːbə', 'Tube', 'tjuːbə');
  const removed = task('Feuer', 'ˈfɔɪ̯ɐ', 'teuer', 'ˈtɔɪ̯ɐ');
  const baselineQueue = queue([oldHaus, oldYoutube, removed]);
  const baselineBlind = buildBlindBenchmarkExport(baselineQueue);
  const changedYoutube = task('YouTube', 'ˈjuːtuːp', 'Tube', 'tjuːbə');
  const added = task('Instagram', 'ˈɪnstəɡʁam', 'Telegram', 'ˈteːləɡʁam');
  const freshQueue = queue([oldHaus, changedYoutube, added]);
  const reference = {
    schema: 'rhymelab-benchmark-reference-v1',
    labels: baselineQueue.tasks.map((row) => ({ task_id: row.id })),
  };

  const { report, blindDelta } = compareBenchmarkRefresh(baselineBlind, freshQueue, reference);
  assert.equal(report.fingerprint_unchanged, false);
  assert.equal(report.counts.unchanged, 1);
  assert.equal(report.counts.same_pair_changed_ipa, 1);
  assert.equal(report.counts.new, 1);
  assert.equal(report.counts.removed, 1);
  assert.equal(report.counts.delta_requires_reference, 2);
  assert.equal(report.counts.reusable_reference_labels, 1);
  assert.equal(report.relabel_required, true);
  assert.equal(report.changed_ipa[0].old_task_id, oldYoutube.id);
  assert.equal(report.changed_ipa[0].new_task_id, changedYoutube.id);
  assert.equal(blindDelta.task_count, 2);
  assert.deepEqual(new Set(blindDelta.tasks.map((row) => row.task_id)), new Set([changedYoutube.id, added.id]));
});
