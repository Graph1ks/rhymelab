#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { benchmarkTaskId } from './benchmark-core.mjs';
import { getPhonologyProfile } from './phonology-profiles.mjs';
import { openRhymeDb, findRhymes, getWord, RHYME_TYPES } from '../src/local-engine.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}
const planPath = resolve(argValue('--plan', 'benchmarks/de-v1/plan.json'));
const dbPath = resolve(argValue('--db', process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite'));
const queuePath = resolve(argValue('--out', 'data/local/benchmark/de-v1-queue.json'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-reviews.json'));

const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (plan.schema !== 'rhymelab-de-benchmark-plan-v1') throw new Error(`Unexpected benchmark plan schema: ${plan.schema}`);
if (plan.language !== 'de') throw new Error(`This builder currently expects a German plan, got ${plan.language}`);

const sampling = plan.sampling || {};
const perCategory = Math.max(1, Number(sampling.per_category || 3));
const topOverall = Math.max(0, Number(sampling.top_overall || 5));
const maxTasksPerQuery = Math.max(perCategory, Number(sampling.max_tasks_per_query || 26));
const candidateLimit = Math.max(1, Math.min(250, Number(sampling.candidate_limit || 250)));
const candidatePool = Math.max(1, Math.min(800, Number(sampling.candidate_pool || 800)));

function relationSnapshot(row) {
  return (row.relations || []).map((relation) => ({
    type: relation.type,
    strength: relation.strength,
    score: relation.score,
    components: relation.components,
  }));
}

function taskFromResult(queryResult, row, overallRank, phenomena, samplingCategories) {
  const query = queryResult.query;
  return {
    id: benchmarkTaskId(query.surface, row.word, query.preferredIpa || '', row.ipa || ''),
    query: {
      word: query.surface,
      ipa: query.preferredIpa || '',
      syllables: query.syllableCount,
      phenomena,
    },
    candidate: {
      word: row.word,
      normalized: row.normalized,
      ipa: row.ipa,
      syllables: row.syllableCount,
      usage_rank: row.usageRank,
      historical: row.historical,
      lexicon_layer: row.lexiconLayer,
    },
    engine: {
      primary_type: row.primaryType || null,
      primary_score: row.score,
      rhyme_tier: row.rhymeTier,
      syllable_distance: row.syllableDistance,
      relation_types: row.relationTypes || [],
      relations: relationSnapshot(row),
      components: row.components,
      overall_rank: overallRank,
      sampling_categories: [...samplingCategories],
    },
  };
}

function taskFromAnchor(profile, query, candidate, phenomena) {
  const queryAnalysis = profile.analyzeIpa(query.preferredIpa);
  const candidateAnalysis = profile.analyzeIpa(candidate.preferredIpa);
  const score = profile.scoreAnalyses(queryAnalysis, candidateAnalysis);
  const primaryType = score.type === 'weak' ? null : score.type;
  const relations = ['assonance','consonance'].flatMap((type) => {
    const relation = score.relations?.[type];
    return relation?.matched ? [{ type, strength: relation.strength, score: relation.score, components: relation.components }] : [];
  });
  return {
    id: benchmarkTaskId(query.surface, candidate.surface, query.preferredIpa || '', candidate.preferredIpa || ''),
    query: {
      word: query.surface,
      ipa: query.preferredIpa || '',
      syllables: query.syllableCount,
      phenomena,
    },
    candidate: {
      word: candidate.surface,
      normalized: candidate.normalized,
      ipa: candidate.preferredIpa || '',
      syllables: candidate.syllableCount,
      usage_rank: candidate.usageRank,
      historical: candidate.historical,
      lexicon_layer: candidate.lexiconLayer,
    },
    engine: {
      primary_type: primaryType,
      primary_score: Number(score.overall.toFixed(4)),
      rhyme_tier: null,
      syllable_distance: Math.abs(Number(candidate.syllableCount || 0) - Number(query.syllableCount || 0)),
      relation_types: score.relationTypes || [],
      relations,
      components: {
        vowel: Number(score.vowel.toFixed(4)),
        coda: Number(score.coda.toFixed(4)),
        stress: Number(score.stress.toFixed(4)),
        syllable: Number(score.syllable.toFixed(4)),
        onset: Number((score.onset ?? 0).toFixed(4)),
        consonance: Number(score.consonance.toFixed(4)),
      },
      overall_rank: null,
      sampling_categories: ['anchor'],
    },
  };
}

const db = openRhymeDb(dbPath);
const tasks = [];
const missingQueries = [];
const missingAnchorPairs = [];
const querySummaries = [];
try {
  for (const queryPlan of plan.queries || []) {
    const word = String(queryPlan.word || '').trim();
    if (!word) continue;
    const result = findRhymes(db, word, {
      limit: candidateLimit,
      poolLimit: candidatePool,
      includeVariants: sampling.include_variants === true,
      includeHistorical: sampling.include_historical === true,
      type: 'all',
      ensureTypeCoverage: true,
      coverageFloor: 20,
    });
    if (!result) {
      missingQueries.push(word);
      continue;
    }

    const byNormalized = new Map();
    const overallRank = new Map(result.results.map((row, index) => [row.normalized, index + 1]));
    const add = (row, category) => {
      if (!row || byNormalized.size >= maxTasksPerQuery) return;
      const existing = byNormalized.get(row.normalized);
      if (existing) {
        existing.categories.add(category);
        return;
      }
      byNormalized.set(row.normalized, { row, categories: new Set([category]) });
    };

    for (const row of result.results.slice(0, topOverall)) add(row, 'overall_top');
    for (const category of RHYME_TYPES) {
      let count = 0;
      for (const row of result.groups?.[category] || []) {
        add(row, category);
        count += 1;
        if (count >= perCategory || byNormalized.size >= maxTasksPerQuery) break;
      }
      if (byNormalized.size >= maxTasksPerQuery) break;
    }

    const queryTasks = [...byNormalized.values()].map(({ row, categories }) => taskFromResult(
      result,
      row,
      overallRank.get(row.normalized) || null,
      Array.isArray(queryPlan.phenomena) ? queryPlan.phenomena : [],
      categories,
    ));
    tasks.push(...queryTasks);
    querySummaries.push({
      query: word,
      tasks: queryTasks.length,
      available_by_type: result.selection?.availableByType || {},
      sampled_by_type: Object.fromEntries(RHYME_TYPES.map((type) => [type, queryTasks.filter((task) => task.engine.sampling_categories.includes(type)).length])),
    });
  }

  const profile = getPhonologyProfile(plan.language);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  for (const anchor of plan.anchor_pairs || []) {
    const query = getWord(db, anchor.query);
    const candidate = getWord(db, anchor.candidate);
    if (!query || !candidate) {
      missingAnchorPairs.push({ query: anchor.query, candidate: anchor.candidate });
      continue;
    }
    const anchorTask = taskFromAnchor(profile, query, candidate, Array.isArray(anchor.phenomena) ? anchor.phenomena : ['anchor']);
    const existing = taskById.get(anchorTask.id);
    if (existing) {
      if (!existing.engine.sampling_categories.includes('anchor')) existing.engine.sampling_categories.push('anchor');
      existing.query.phenomena = [...new Set([...(existing.query.phenomena || []), ...(anchorTask.query.phenomena || [])])];
    } else {
      tasks.push(anchorTask);
      taskById.set(anchorTask.id, anchorTask);
    }
  }
} finally {
  db.close();
}

// Blind review order: stable task IDs are deliberately used as a deterministic
// pseudo-random order so the reviewer does not simply see engine rank order.
tasks.sort((a, b) => a.id.localeCompare(b.id, 'en'));

const queue = {
  schema: 'rhymelab-de-human-benchmark-queue-v1',
  benchmark_version: plan.version,
  language: plan.language,
  generated_at: new Date().toISOString(),
  source_plan: planPath,
  database: dbPath,
  review_order: 'stable_task_id_hash_not_engine_rank',
  sampling: {
    per_category: perCategory,
    top_overall: topOverall,
    max_tasks_per_query: maxTasksPerQuery,
    candidate_limit: candidateLimit,
    candidate_pool: candidatePool,
    include_historical: sampling.include_historical === true,
    include_variants: sampling.include_variants === true,
  },
  categories: [...RHYME_TYPES, 'anchor'],
  query_count: querySummaries.length,
  anchor_pair_count: (plan.anchor_pairs || []).length,
  missing_queries: missingQueries,
  missing_anchor_pairs: missingAnchorPairs,
  task_count: tasks.length,
  query_summaries: querySummaries,
  tasks,
};

await mkdir(dirname(queuePath), { recursive: true });
await writeFile(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');
try {
  const existingReviews = JSON.parse(await readFile(reviewsPath, 'utf8'));
  if (existingReviews.schema !== 'rhymelab-de-human-benchmark-reviews-v1' || existingReviews.benchmark_version !== plan.version) {
    throw new Error(`Existing review file is incompatible with ${plan.version}: ${reviewsPath}`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  await writeFile(reviewsPath, JSON.stringify({
    schema: 'rhymelab-de-human-benchmark-reviews-v1',
    benchmark_version: plan.version,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reviews: [],
  }, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({
  schema: queue.schema,
  benchmark_version: queue.benchmark_version,
  query_count: queue.query_count,
  anchor_pair_count: queue.anchor_pair_count,
  missing_queries: queue.missing_queries,
  missing_anchor_pairs: queue.missing_anchor_pairs,
  task_count: queue.task_count,
  review_order: queue.review_order,
  queue: queuePath,
  reviews: reviewsPath,
  review_url: 'http://127.0.0.1:3030/benchmark',
}, null, 2));
