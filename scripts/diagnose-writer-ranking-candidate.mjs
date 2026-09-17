#!/usr/bin/env node
import { resolve } from 'node:path';
import { openRhymeDb } from '../src/local-engine.mjs';
import { findWriterRhymes } from '../src/writer-search.mjs';

const [queryArg = 'Arbeitsweise', candidateArg = 'Hochzeitsreise'] = process.argv.slice(2);
const dbPath = resolve(process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');
const query = String(queryArg).trim();
const candidate = String(candidateArg).trim();

const db = openRhymeDb(dbPath);
try {
  const response = findWriterRhymes(db, query, {
    limit: 250,
    poolLimit: 800,
    includeVariants: false,
    includeHistorical: false,
    type: 'all',
    ensureTypeCoverage: false,
  });

  if (!response) {
    console.error(`query_missing=${query}`);
    process.exitCode = 2;
  } else {
    const wanted = candidate.toLocaleLowerCase('de-DE');
    const row = response.results.find((entry) => String(entry.word || '').toLocaleLowerCase('de-DE') === wanted);
    if (!row) {
      console.error(`candidate_missing=${candidate}`);
      process.exitCode = 3;
    } else {
      const out = {
        query,
        candidate: row.word,
        writerRank: row.writerRank,
        primaryType: row.primaryType,
        rhymeTier: row.rhymeTier,
        score: row.score,
        usageRank: row.usageRank ?? null,
        syllableDistance: row.syllableDistance,
        family: row.writerMorphology?.familyKey || null,
        morphologyStatus: row.writerMorphology?.status || null,
        split: row.writerMorphology?.split || null,
        writer: {
          utility: row.writer?.utility ?? null,
          soundUtility: row.writer?.soundUtility ?? null,
          lexicalPenalty: row.writer?.lexicalPenalty ?? null,
          lexicalNovelty: row.writer?.lexicalNovelty ?? null,
          queryOverlap: row.writer?.queryOverlap ?? null,
          commonness: row.writer?.commonness ?? null,
          baseTier: row.writer?.baseTier ?? null,
          cheapRhymeTierPenalty: row.writer?.cheapRhymeTierPenalty ?? null,
          lexicalSafetyTierPenalty: row.writer?.lexicalSafetyTierPenalty ?? null,
          writerTier: row.writer?.writerTier ?? null,
          effectiveTier: row.writer?.effectiveTier ?? null,
          diversityTierPenalty: row.writer?.diversityTierPenalty ?? null,
          diversifiedScore: row.writer?.diversifiedScore ?? null,
          redundancyPenalty: row.writer?.redundancyPenalty ?? null,
          maxRedundancy: row.writer?.maxRedundancy ?? null,
          lexicalSafety: row.writer?.lexicalSafety || null,
          evidence: row.writer?.evidence || null,
        },
        retrieval: response.writerRetrieval,
      };
      console.log(JSON.stringify(out, null, 2));
    }
  }
} finally {
  db.close();
}
