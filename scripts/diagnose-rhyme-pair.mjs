#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { getPhonologyProfile } from './phonology-profiles.mjs';

const args = process.argv.slice(2);
const queryWord = String(args[0] || '').trim();
const candidateWord = String(args[1] || '').trim();
const poolLimit = Math.max(1, Math.min(800, Number.parseInt(args[2] || '800', 10) || 800));
const dbPath = resolve(process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');

if (!queryWord || !candidateWord) {
  console.error('Usage: npm run diagnose:rhyme-pair -- <query> <candidate> [poolLimit]');
  process.exit(2);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec('PRAGMA query_only=ON;');

try {
  const language = String(db.prepare("SELECT value FROM meta WHERE key='language'").get()?.value || 'de');
  const profile = getPhonologyProfile(language);
  const queryNormalized = profile.normalizeSurface(queryWord);
  const candidateNormalized = profile.normalizeSurface(candidateWord);

  const queryRows = db.prepare(`
    SELECT * FROM hot
    WHERE normalized=? AND pronunciation_preferred=1
    ORDER BY usage_rank IS NULL, usage_rank, pronunciation_rank, id
    LIMIT 12
  `).all(queryNormalized);
  const candidateRows = db.prepare(`
    SELECT * FROM hot
    WHERE normalized=? AND pronunciation_preferred=1
    ORDER BY usage_rank IS NULL, usage_rank, pronunciation_rank, id
    LIMIT 12
  `).all(candidateNormalized);

  if (!queryRows.length) throw new Error(`Query not found: ${queryWord}`);

  if (!candidateRows.length) {
    console.log(JSON.stringify({
      schema: 'rhymelab-rhyme-pair-diagnostic-v2',
      database: dbPath,
      poolLimit,
      query: queryWord,
      candidate: candidateWord,
      candidateFound: false,
      diagnosis: 'candidate_missing_from_lexicon',
    }, null, 2));
    process.exit(0);
  }

  const candidateIds = new Set(candidateRows.map((row) => row.id));
  const channels = [];
  const order = ' ORDER BY ABS(syllable_count-?), usage_rank IS NULL, usage_rank LIMIT ?';

  function checkChannel(name, sql, params, metadata = {}) {
    const rows = db.prepare(sql).all(...params);
    const matched = rows.filter((row) => candidateIds.has(row.id));
    channels.push({
      name,
      ...metadata,
      returned: rows.length,
      matched: matched.length > 0,
      matchedIds: matched.map((row) => row.id),
    });
  }

  const queryAnalyses = [];
  for (const queryRow of queryRows) {
    let queryAnalysis = null;
    try { queryAnalysis = profile.analyzeIpa(queryRow.ipa); } catch {}
    if (queryAnalysis) queryAnalyses.push({ row: queryRow, analysis: queryAnalysis });

    const suffix = ' AND pronunciation_preferred=1 AND historical=0';
    checkChannel('exact_key', `SELECT id FROM hot WHERE exact_key=?${suffix}${order}`,
      [queryRow.exact_key, queryRow.syllable_count, poolLimit]);

    if (queryRow.multisyllable_key) {
      checkChannel('multisyllable_key', `SELECT id FROM hot WHERE multisyllable_key=?${suffix}${order}`,
        [queryRow.multisyllable_key, queryRow.syllable_count, poolLimit]);
    }

    checkChannel('vowel_key', `SELECT id FROM hot WHERE vowel_key=?${suffix}${order}`,
      [queryRow.vowel_key, queryRow.syllable_count, poolLimit]);
    checkChannel('vowel_family', `SELECT id FROM hot WHERE vowel_family=?${suffix}${order}`,
      [queryRow.vowel_family, queryRow.syllable_count, poolLimit]);

    const stressedFamily = String(queryRow.vowel_family || '').split('-')[0];
    if (stressedFamily) {
      const lower = `${stressedFamily}-`;
      const upper = `${stressedFamily}.`;
      checkChannel('stressed_vowel_family', `SELECT id FROM hot WHERE (vowel_family=? OR (vowel_family>=? AND vowel_family<?))${suffix}${order}`,
        [stressedFamily, lower, upper, queryRow.syllable_count, poolLimit]);
    }

    checkChannel('vowel_family+coda_class', `SELECT id FROM hot WHERE vowel_family=? AND coda_class=?${suffix}${order}`,
      [queryRow.vowel_family, queryRow.coda_class, queryRow.syllable_count, poolLimit]);

    if (queryRow.coda_key) {
      checkChannel('coda_key', `SELECT id FROM hot WHERE coda_key=?${suffix}${order}`,
        [queryRow.coda_key, queryRow.syllable_count, poolLimit]);
    }

    if (queryAnalysis && typeof profile.writerRetrievalKeys === 'function') {
      for (const entry of profile.writerRetrievalKeys(queryAnalysis)) {
        checkChannel(
          `right_edge:${entry.kind}`,
          `SELECT id FROM hot
           WHERE vowel_key LIKE ?${suffix}
             AND ABS(syllable_count-?) <= 1
           ORDER BY ABS(syllable_count-?), usage_rank IS NULL, usage_rank, id
           LIMIT ?`,
          [`%${entry.key}`, queryRow.syllable_count, queryRow.syllable_count, poolLimit],
          { key: entry.key, anchorPosition: entry.anchorPosition, nuclei: entry.nuclei },
        );
      }
    }
  }

  const directScores = [];
  const anchoredScores = [];
  for (const { row: queryRow, analysis: queryAnalysis } of queryAnalyses) {
    for (const candidateRow of candidateRows) {
      let candidateAnalysis;
      try { candidateAnalysis = profile.analyzeIpa(candidateRow.ipa); } catch { continue; }
      const score = profile.scoreAnalyses(queryAnalysis, candidateAnalysis);
      directScores.push({
        queryIpa: queryRow.ipa,
        candidateIpa: candidateRow.ipa,
        type: score.type,
        overall: Number(score.overall.toFixed(4)),
        vowel: Number(score.vowel.toFixed(4)),
        coda: Number(score.coda.toFixed(4)),
        stress: Number(score.stress.toFixed(4)),
        syllable: Number(score.syllable.toFixed(4)),
        relationTypes: score.relationTypes || [],
      });

      if (typeof profile.scoreWriterAnalyses === 'function') {
        const anchored = profile.scoreWriterAnalyses(queryAnalysis, candidateAnalysis);
        anchoredScores.push({
          queryIpa: queryRow.ipa,
          candidateIpa: candidateRow.ipa,
          type: anchored.type,
          overall: Number(anchored.overall.toFixed(4)),
          vowel: Number(anchored.vowel.toFixed(4)),
          coda: Number(anchored.coda.toFixed(4)),
          stress: Number(anchored.stress.toFixed(4)),
          syllable: Number(anchored.syllable.toFixed(4)),
          anchor: anchored.anchor || null,
          anchorCandidates: anchored.anchorCandidates || [],
          relationTypes: anchored.relationTypes || [],
        });
      }
    }
  }
  directScores.sort((a, b) => b.overall - a.overall);
  anchoredScores.sort((a, b) => b.overall - a.overall);

  const query = queryRows[0];
  const candidate = candidateRows[0];
  const legacyChannels = channels.filter((entry) => entry.matched && !entry.name.startsWith('right_edge:'));
  const rightEdgeChannels = channels.filter((entry) => entry.matched && entry.name.startsWith('right_edge:'));

  console.log(JSON.stringify({
    schema: 'rhymelab-rhyme-pair-diagnostic-v2',
    database: dbPath,
    poolLimit,
    candidateFound: true,
    query: {
      surface: query.surface,
      normalized: query.normalized,
      ipa: query.ipa,
      syllables: query.syllable_count,
      stress: query.stress,
      primaryStress: query.primary_stress,
      rhymeTail: query.rhyme_tail,
      finalTail: query.final_tail,
      vowels: query.vowels,
      exactKey: query.exact_key,
      multisyllableKey: query.multisyllable_key,
      vowelKey: query.vowel_key,
      vowelFamily: query.vowel_family,
      codaKey: query.coda_key,
      codaClass: query.coda_class,
    },
    candidate: {
      surface: candidate.surface,
      normalized: candidate.normalized,
      ipa: candidate.ipa,
      usageRank: candidate.usage_rank,
      syllables: candidate.syllable_count,
      stress: candidate.stress,
      primaryStress: candidate.primary_stress,
      rhymeTail: candidate.rhyme_tail,
      finalTail: candidate.final_tail,
      vowels: candidate.vowels,
      exactKey: candidate.exact_key,
      multisyllableKey: candidate.multisyllable_key,
      vowelKey: candidate.vowel_key,
      vowelFamily: candidate.vowel_family,
      codaKey: candidate.coda_key,
      codaClass: candidate.coda_class,
    },
    retrieval: {
      retrievedByLegacyPool: legacyChannels.length > 0,
      retrievedByRightEdgePool: rightEdgeChannels.length > 0,
      matchedLegacyChannels: legacyChannels.map((entry) => entry.name),
      matchedRightEdgeChannels: rightEdgeChannels.map((entry) => ({ name: entry.name, key: entry.key })),
      channels,
    },
    bestLegacyPhoneticScore: directScores[0] || null,
    bestAnchoredPhoneticScore: anchoredScores[0] || null,
    directScores,
    anchoredScores,
  }, null, 2));
} finally {
  db.close();
}
