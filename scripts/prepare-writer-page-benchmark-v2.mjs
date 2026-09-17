#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { openRhymeDb, findRhymes } from '../src/local-engine.mjs';
import { findWriterRhymes } from '../src/writer-search.mjs';
import {
  WRITER_PAGE_QUEUE_SCHEMA,
  WRITER_PAGE_REVIEW_SCHEMA,
  queueFingerprint,
  reviewTaskId,
} from './writer-page-benchmark-core.mjs';

const args = process.argv.slice(2);
let planPath = 'benchmarks/de-writer-v2/plan.json';
let dbPath = process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite';
let queuePath = process.env.RHYMELAB_WRITER_PAGE_QUEUE || 'data/local/benchmark/de-writer-v2-queue.json';
let blindPath = process.env.RHYMELAB_WRITER_PAGE_BLIND || 'data/local/benchmark/de-writer-v2-blind.json';
let templatePath = process.env.RHYMELAB_WRITER_PAGE_REVIEW_TEMPLATE || 'data/local/benchmark/de-writer-v2-review-template.json';
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--plan') planPath = args[++index] || planPath;
  else if (args[index] === '--db') dbPath = args[++index] || dbPath;
  else if (args[index] === '--queue') queuePath = args[++index] || queuePath;
  else if (args[index] === '--blind') blindPath = args[++index] || blindPath;
  else if (args[index] === '--template') templatePath = args[++index] || templatePath;
}
planPath = resolve(planPath);
dbPath = resolve(dbPath);
queuePath = resolve(queuePath);
blindPath = resolve(blindPath);
templatePath = resolve(templatePath);

const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (plan.schema !== 'rhymelab-de-writer-page-plan-v2') throw new Error(`Unexpected writer-page plan schema: ${plan.schema}`);
const depth = Math.max(20, Math.min(100, Number(plan?.sampling?.review_candidate_depth) || 40));
const poolLimit = Math.max(50, Math.min(800, Number(plan?.sampling?.candidate_pool) || 800));

const db = openRhymeDb(dbPath);
const tasks = [];
try {
  for (const queryPlan of plan.queries || []) {
    const query = queryPlan.word;
    const writer = findWriterRhymes(db, query, {
      limit: depth,
      poolLimit,
      includeVariants: plan?.sampling?.include_variants === true,
      includeHistorical: plan?.sampling?.include_historical === true,
      type: 'all',
      ensureTypeCoverage: false,
    });
    const legacy = findRhymes(db, query, {
      limit: depth,
      poolLimit,
      includeVariants: plan?.sampling?.include_variants === true,
      includeHistorical: plan?.sampling?.include_historical === true,
      type: 'all',
      ensureTypeCoverage: false,
    });
    if (!writer || !legacy) continue;

    const union = new Map();
    const add = (row, source, rank) => {
      const key = String(row.normalized || row.word).toLocaleLowerCase('de-DE');
      const current = union.get(key) || {
        word: row.word,
        ipa: row.ipa,
        writerRank: null,
        legacyRank: null,
      };
      if (source === 'writer') current.writerRank = rank;
      else current.legacyRank = rank;
      union.set(key, current);
    };
    writer.results.slice(0, depth).forEach((row, index) => add(row, 'writer', index + 1));
    legacy.results.slice(0, depth).forEach((row, index) => add(row, 'legacy', index + 1));

    for (const candidate of union.values()) {
      tasks.push({
        id: reviewTaskId(query, candidate.word),
        query,
        candidate: candidate.word,
        queryIpa: writer.query?.preferredIpa || null,
        candidateIpa: candidate.ipa || null,
        writerRank: candidate.writerRank,
        legacyRank: candidate.legacyRank,
        phenomena: queryPlan.phenomena || [],
      });
    }
  }
} finally {
  db.close();
}

tasks.sort((a, b) => a.id.localeCompare(b.id));
const fingerprint = queueFingerprint(tasks);
const queue = {
  schema: WRITER_PAGE_QUEUE_SCHEMA,
  generatedAt: new Date().toISOString(),
  planVersion: plan.version,
  database: dbPath,
  reviewCandidateDepth: depth,
  fingerprint,
  taskCount: tasks.length,
  tasks,
};
const blindTasks = tasks.map(({ id, query, candidate, queryIpa, candidateIpa }) => ({
  id,
  query,
  candidate,
  queryIpa,
  candidateIpa,
}));
const blind = {
  schema: 'rhymelab-writer-page-blind-v2',
  generatedAt: queue.generatedAt,
  planVersion: plan.version,
  fingerprint,
  rubric: {
    songwriting_usefulness: {
      0: 'not useful as a rhyme continuation for the query',
      1: 'weak or highly situational',
      2: 'usable with constraints',
      3: 'good writing option',
      4: 'excellent writing option',
    },
    instruction: 'Judge the candidate as a practical rhyme-writing option for the query. Consider phonetic fit and lexical usefulness. Do not try to reproduce an engine ranking.',
  },
  tasks: blindTasks,
};
const template = {
  schema: WRITER_PAGE_REVIEW_SCHEMA,
  queueFingerprint: fingerprint,
  reviewer: null,
  reviewSource: 'independent_human_review',
  reviews: blindTasks.map(({ id, query, candidate }) => ({
    id,
    query,
    candidate,
    songwriting_usefulness: null,
    notes: null,
  })),
};

for (const output of [queuePath, blindPath, templatePath]) await mkdir(dirname(output), { recursive: true });
await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
await writeFile(blindPath, `${JSON.stringify(blind, null, 2)}\n`, 'utf8');
await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
console.log(`tasks=${tasks.length}`);
console.log(`fingerprint=${fingerprint}`);
console.log(`queue=${queuePath}`);
console.log(`blind=${blindPath}`);
console.log(`review_template=${templatePath}`);
