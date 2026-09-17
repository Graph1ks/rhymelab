import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkTaskId, computeBenchmarkMetrics, normalizeReview } from '../scripts/benchmark-core.mjs';

test('benchmark task ids are deterministic and pronunciation-sensitive', () => {
  const a = benchmarkTaskId('Haus', 'Baum', 'haʊs', 'baʊm');
  const b = benchmarkTaskId('Haus', 'Baum', 'haʊs', 'baʊm');
  const c = benchmarkTaskId('Haus', 'Baum', 'haʊs', 'baːm');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('benchmark review validation accepts complete labels and rejects invalid values', () => {
  const taskIds = new Set(['task-1']);
  const review = normalizeReview({
    task_id: 'task-1',
    primary: 'slant',
    assonance: 'strong',
    consonance: 'none',
    usefulness: 3,
    note: 'usable',
  }, taskIds);
  assert.equal(review.primary, 'slant');
  assert.equal(review.assonance, 'strong');
  assert.equal(review.usefulness, 3);
  assert.throws(() => normalizeReview({ task_id:'task-1', primary:'banana', assonance:'none', consonance:'none', usefulness:2 }, taskIds));
  assert.throws(() => normalizeReview({ task_id:'missing', skip:true }, taskIds));
});

test('benchmark metrics separate primary rhyme, relations and ranking quality', () => {
  const queue = {
    benchmark_version: 'test-v1',
    generated_at: '2026-01-01T00:00:00.000Z',
    tasks: [
      { id:'a', query:{word:'Haus'}, engine:{primary_type:'perfect',relation_types:[],relations:[],overall_rank:1} },
      { id:'b', query:{word:'Haus'}, engine:{primary_type:'slant',relation_types:['assonance'],relations:[{type:'assonance',strength:'strong'}],overall_rank:2} },
      { id:'c', query:{word:'Haus'}, engine:{primary_type:null,relation_types:['consonance'],relations:[{type:'consonance',strength:'partial'}],overall_rank:3} },
      { id:'d', query:{word:'Haus'}, engine:{primary_type:'family',relation_types:[],relations:[],overall_rank:4} },
    ],
  };
  const reviews = {
    reviews: [
      {task_id:'a',skip:false,primary:'perfect',assonance:'none',consonance:'none',usefulness:4},
      {task_id:'b',skip:false,primary:'slant',assonance:'strong',consonance:'none',usefulness:3},
      {task_id:'c',skip:false,primary:'none',assonance:'none',consonance:'strong',usefulness:2},
      {task_id:'d',skip:false,primary:'none',assonance:'partial',consonance:'none',usefulness:0},
    ],
  };
  const report = computeBenchmarkMetrics(queue, reviews);
  assert.equal(report.reviewed_tasks, 4);
  assert.equal(report.primary.exact_accuracy, 0.75);
  assert.equal(report.assonance.precision, 1);
  assert.equal(report.assonance.recall, 0.5);
  assert.equal(report.consonance.precision, 1);
  assert.equal(report.consonance.recall, 1);
  assert.ok(report.ranking.mean_ndcg > 0.9);
});
