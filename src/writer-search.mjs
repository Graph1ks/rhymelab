import {
  RHYME_TYPES,
  findRhymes,
  resultTypes,
} from './local-engine.mjs';
import { getPhonologyProfile } from '../scripts/phonology-profiles.mjs';
import {
  WRITER_MORPHOLOGY_POLICY,
  resolveWriterMorphologyBatch,
} from './writer-morphology.mjs';
import {
  lookupMaterializedWriterAnchorRows,
  materializedWriterRuntimeState,
  resolveMaterializedWriterMorphologyBatch,
} from './writer-materialized-runtime.mjs';
import {
  WRITER_RANKING_POLICY,
  rankWriterRecommendedResults,
} from './writer-ranking-policy.mjs';

const RHYME_TIER = new Map([
  ['multisyllabic_perfect', 0],
  ['perfect', 0],
  ['multisyllabic_slant', 1],
  ['family', 2],
  ['slant', 3],
  ['assonance', 4],
  ['consonance', 5],
]);

function clampLimit(value, fallback = 250, max = 250) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function parseJsonArray(value) {
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

function groupsFor(results) {
  const groups = Object.fromEntries(RHYME_TYPES.map((type) => [type, []]));
  for (const result of results) {
    for (const type of resultTypes(result)) groups[type].push(result);
  }
  return groups;
}

function relationRows(score) {
  return ['assonance', 'consonance'].flatMap((type) => {
    const relation = score.relations?.[type];
    return relation?.matched ? [{
      type,
      strength: relation.strength,
      score: relation.score,
      components: relation.components,
    }] : [];
  });
}

function resultFromCandidateRow(row, score, querySyllables, language) {
  const primaryType = score.type === 'weak' ? null : score.type;
  const relations = relationRows(score);
  const relationTypes = relations.map((relation) => relation.type);
  const fallbackTier = relationTypes.length
    ? Math.min(...relationTypes.map((type) => RHYME_TIER.get(type) ?? 99))
    : 99;
  const rhymeTier = primaryType ? (RHYME_TIER.get(primaryType) ?? 99) : fallbackTier;
  const pronunciationFlags=parseJsonArray(row.pronunciation_flags);
  const generatedPronunciation=
    pronunciationFlags.includes('generated')
    ||String(row.pronunciation_source||'').toLocaleLowerCase('en-US').includes('espeak');
  return {
    language,
    word: row.surface,
    normalized: row.normalized,
    ipa: row.ipa,
    pronunciationPreferred: Boolean(row.pronunciation_preferred),
    pronunciationRank: row.pronunciation_rank,
    locale: row.locale,
    dialect: row.dialect,
    register: row.pronunciation_register,
    ...(generatedPronunciation?{
      pronunciationSource:row.pronunciation_source||null,
      pronunciationFlags,
      generatedPronunciation:true,
    }:{}),
    usageRank: row.usage_rank,
    usageScore: row.usage_score,
    usageCount: row.usage_count,
    usageSourceCount: row.usage_source_count,
    lexiconLayer: row.lexicon_layer,
    entityKind: row.entity_kind,
    historical: Boolean(row.historical),
    lexicalTags: parseJsonArray(row.lexical_tags),
    lemma: row.lemma,
    partOfSpeech: row.pos,
    syllableCount: row.syllable_count,
    syllableDistance: Math.abs(Number(row.syllable_count) - Number(querySyllables)),
    rhymeTier,
    score: Number(score.overall.toFixed(4)),
    type: score.type,
    primaryType,
    relationTypes,
    relations,
    components: {
      vowel: Number(score.vowel.toFixed(4)),
      coda: Number(score.coda.toFixed(4)),
      stress: Number(score.stress.toFixed(4)),
      syllable: Number(score.syllable.toFixed(4)),
      onset: Number((score.onset ?? 0).toFixed(4)),
      consonance: Number(score.consonance.toFixed(4)),
    },
    writerAnchor: score.anchor || null,
    writerAnchorCandidates: score.anchorCandidates || [],
  };
}

function compareSound(a, b) {
  return Number(a.rhymeTier ?? 99) - Number(b.rhymeTier ?? 99)
    || Number(b.score || 0) - Number(a.score || 0)
    || Number(a.syllableDistance || 0) - Number(b.syllableDistance || 0)
    || (a.usageRank == null) - (b.usageRank == null)
    || Number(a.usageRank ?? Number.MAX_SAFE_INTEGER) - Number(b.usageRank ?? Number.MAX_SAFE_INTEGER);
}

function rescoreWriterResult(row, queryAnalysis, profile, querySyllables) {
  if (typeof profile.scoreWriterAnalyses !== 'function') return row;
  let candidateAnalysis;
  try { candidateAnalysis = profile.analyzeIpa(row.ipa); } catch { return row; }
  const score = profile.scoreWriterAnalyses(queryAnalysis, candidateAnalysis);
  const rescored = resultFromCandidateRow({
    surface: row.word,
    normalized: row.normalized,
    ipa: row.ipa,
    pronunciation_preferred: row.pronunciationPreferred ? 1 : 0,
    pronunciation_rank: row.pronunciationRank,
    locale: row.locale,
    dialect: row.dialect,
    pronunciation_register: row.register,
    usage_rank: row.usageRank,
    usage_score: row.usageScore,
    usage_count: row.usageCount,
    usage_source_count: row.usageSourceCount,
    lexicon_layer: row.lexiconLayer,
    entity_kind: row.entityKind,
    historical: row.historical ? 1 : 0,
    lexical_tags: JSON.stringify(row.lexicalTags || []),
    lemma: row.lemma,
    pos: row.partOfSpeech,
    syllable_count: row.syllableCount,
  }, score, querySyllables, row.language || profile.language);
  return {
    ...rescored,
    ...(row.generatedPronunciation?{
      pronunciationSource:row.pronunciationSource||null,
      pronunciationFlags:row.pronunciationFlags||[],
      generatedPronunciation:true,
    }:{}),
    legacyScore: row.score,
    legacyPrimaryType: row.primaryType,
    legacyRhymeTier: row.rhymeTier,
  };
}

function collectRightEdgeCandidates(db, queryAnalysis, queryNormalized, querySyllables, profile, options = {}) {
  if (typeof profile.writerRetrievalKeys !== 'function' || typeof profile.scoreWriterAnalyses !== 'function') {
    return { results: [], keys: [], runtime: null };
  }
  const keys = profile.writerRetrievalKeys(queryAnalysis);
  if (!keys.length) return { results: [], keys: [], runtime: null };

  const runtimeState = materializedWriterRuntimeState(db);
  const includeVariants = options.includeVariants === true;
  const includeHistorical = options.includeHistorical === true;
  const generatedOnly = options.generatedOnly === true;
  const preferred = includeVariants ? '' : ' AND pronunciation_preferred=1';
  const historical = includeHistorical ? '' : ' AND historical=0';
  const generated = generatedOnly ? " AND pronunciation_flags LIKE '%secondary_opt_in%'" : '';
  const perChannelLimit = Math.max(50, Math.min(800, Number.parseInt(String(options.poolLimit ?? 800), 10) || 800));
  const byWord = new Map();

  for (const entry of keys) {
    const rows = runtimeState.active
      ? lookupMaterializedWriterAnchorRows(db, entry.key, {
          queryNormalized,
          querySyllables,
          includeVariants,
          includeHistorical,
          generatedOnly,
          limit: perChannelLimit,
        })
      : db.prepare(`
          SELECT * FROM hot
          WHERE vowel_key LIKE ?
            AND normalized != ?
            AND ABS(syllable_count-?) <= 1
            ${preferred}${historical}${generated}
          ORDER BY ABS(syllable_count-?), usage_rank IS NULL, usage_rank, id
          LIMIT ?
        `).all(`%${entry.key}`, queryNormalized, querySyllables, querySyllables, perChannelLimit);

    for (const row of rows) {
      let candidateAnalysis;
      try { candidateAnalysis = profile.analyzeIpa(row.ipa); } catch { continue; }
      const score = profile.scoreWriterAnalyses(queryAnalysis, candidateAnalysis);
      if (score.type === 'weak' && !(score.relationTypes || []).length) continue;
      const result = resultFromCandidateRow(row, score, querySyllables, profile.language);
      result.writerRetrievalChannel = entry.kind;
      result.writerRetrievalKey = entry.key;
      const current = byWord.get(row.normalized);
      if (!current || compareSound(result, current) < 0) byWord.set(row.normalized, result);
    }
  }

  return {
    results: [...byWord.values()],
    keys,
    runtime: runtimeState.active ? runtimeState : null,
  };
}

export function findWriterRhymesFromExternalQuery(db, queryDetail, options = {}) {
  const limit = clampLimit(options.limit, 250, 250);
  const profile = getPhonologyProfile('de');
  const ipa = String(queryDetail?.preferredIpa || queryDetail?.ipa || '').trim();
  if (!ipa) return null;

  let queryAnalysis;
  try { queryAnalysis = profile.analyzeIpa(ipa); }
  catch { return null; }

  const queryNormalized = String(
    queryDetail?.normalized || queryDetail?.surface || queryDetail?.word || '',
  ).normalize('NFKC').trim().toLocaleLowerCase('de-DE');
  const querySurface = String(
    queryDetail?.surface || queryDetail?.word || queryNormalized,
  ).normalize('NFKC').trim();
  const querySyllables = Number(
    queryDetail?.syllableCount || queryAnalysis.syllableCount || 0,
  );
  const runtimeState = materializedWriterRuntimeState(db);
  const retrieval = collectRightEdgeCandidates(
    db,
    queryAnalysis,
    queryNormalized,
    querySyllables,
    profile,
    options,
  );
  const soundSorted = [...retrieval.results].sort(compareSound);
  const morphologyInput = [{
    normalized: queryNormalized,
    surface: querySurface,
    lemma: queryDetail?.lemma || null,
    partOfSpeech: queryDetail?.partOfSpeech || null,
  }, ...soundSorted];
  const morphology = runtimeState.active
    ? resolveMaterializedWriterMorphologyBatch(db, morphologyInput, 'de')
    : resolveWriterMorphologyBatch(db, morphologyInput, 'de');
  const query = {
    ...queryDetail,
    kind: 'word',
    language: queryDetail?.language || 'de',
    surface: querySurface,
    normalized: queryNormalized,
    preferredIpa: ipa,
    ipa,
    syllableCount: querySyllables,
    writerMorphology: morphology.get(queryNormalized) || null,
  };
  const morphologyRows = soundSorted.map((row) => ({
    ...row,
    writerMorphology: morphology.get(row.normalized) || null,
  }));
  const ranked = rankWriterRecommendedResults(morphologyRows, query, { limit });
  const results = ranked.slice(0, limit);
  const resolvedMorphology = morphologyRows.filter(
    (row) => row.writerMorphology?.status === 'attested_right_head_candidate',
  ).length;

  return {
    schema: 'rhymelab-writer-external-query-v1',
    status: 'ok',
    query,
    phonology: {
      analyzer: profile.analyzerVersion || null,
      scorer: profile.scorerVersion || null,
      writerAnchorPolicy: profile.writerAnchorPolicyVersion || null,
    },
    selection: {
      mode: 'writer_ranked_external_query',
      limit,
      coverageFloorPerType: 0,
    },
    rankingPolicy: WRITER_RANKING_POLICY,
    ranking: 'accepted German writer ranking over indexed candidates anchored by an external ephemeral query pronunciation',
    writerRuntime: runtimeState.active ? {
      id: runtimeState.runtimeId,
      databaseSchema: runtimeState.databaseSchema,
      anchorStorage: runtimeState.anchorStorage,
      anchorCandidateBasis: runtimeState.anchorCandidateBasis,
      morphologyStorage: runtimeState.morphologyStorage,
    } : {
      id: 'validation-like-dynamic-v1',
      databaseSchema: runtimeState.databaseSchema,
      anchorStorage: 'vowel_key_suffix_like',
      anchorCandidateBasis: 'legacy-vowel-key-string-suffix-v1',
      morphologyStorage: 'dynamic-hot-single-analysis',
    },
    writerRetrieval: {
      policy: profile.writerAnchorPolicyVersion || null,
      source: runtimeState.active ? 'writer_anchor' : 'hot.vowel_key LIKE suffix',
      storage: runtimeState.active ? runtimeState.anchorStorage : null,
      candidateBasis: runtimeState.active ? runtimeState.anchorCandidateBasis : 'legacy-vowel-key-string-suffix-v1',
      rightEdgeKeys: retrieval.keys,
      baseCandidates: 0,
      rightEdgeCandidates: retrieval.results.length,
      mergedCandidates: soundSorted.length,
      externalQuery: true,
    },
    writerMorphology: {
      policy: WRITER_MORPHOLOGY_POLICY,
      source: runtimeState.active ? 'writer_morphology_evidence + form_analysis' : 'dynamic hot lookup',
      storage: runtimeState.active ? runtimeState.morphologyStorage : null,
      query: query.writerMorphology,
      resolvedCandidates: resolvedMorphology,
      totalCandidates: morphologyRows.length,
      externalQuery: true,
    },
    results,
    groups: groupsFor(results),
  };
}

export function findWriterRhymes(db, word, options = {}) {
  const limit = clampLimit(options.limit, 250, 250);
  const base = findRhymes(db, word, {
    ...options,
    limit: 250,
    ensureTypeCoverage: false,
  });
  if (!base) return null;

  const profile = getPhonologyProfile(base.language);
  const runtimeState = materializedWriterRuntimeState(db);
  let queryAnalysis;
  try { queryAnalysis = profile.analyzeIpa(base.query.preferredIpa); }
  catch { queryAnalysis = null; }

  const merged = new Map();
  for (const row of base.results) {
    const rescored = queryAnalysis
      ? rescoreWriterResult(row, queryAnalysis, profile, base.query.syllableCount)
      : row;
    merged.set(rescored.normalized, rescored);
  }

  let retrieval = { results: [], keys: [], runtime: null };
  if (queryAnalysis) {
    retrieval = collectRightEdgeCandidates(
      db,
      queryAnalysis,
      base.query.normalized,
      base.query.syllableCount,
      profile,
      options,
    );
    for (const row of retrieval.results) {
      const current = merged.get(row.normalized);
      if (!current || compareSound(row, current) < 0) merged.set(row.normalized, row);
    }
  }

  const soundSorted = [...merged.values()].sort(compareSound);
  const morphologyInput = [{
    normalized: base.query.normalized,
    surface: base.query.surface,
    lemma: base.query.lemma,
    partOfSpeech: base.query.partOfSpeech,
  }, ...soundSorted];
  const morphology = runtimeState.active
    ? resolveMaterializedWriterMorphologyBatch(db, morphologyInput, base.language)
    : resolveWriterMorphologyBatch(db, morphologyInput, base.language);
  const query = {
    ...base.query,
    writerMorphology: morphology.get(base.query.normalized) || null,
  };
  const morphologyRows = soundSorted.map((row) => ({
    ...row,
    writerMorphology: morphology.get(row.normalized) || null,
  }));
  // Greedy diversity is prefix-stable: later selection rounds cannot change the
  // already-selected prefix. Rank only the rows the API can return instead of
  // completing O(n^2) greedy selection for candidates beyond the requested page.
  const ranked = rankWriterRecommendedResults(morphologyRows, query, { limit });
  const results = ranked.slice(0, limit);
  const resolvedMorphology = morphologyRows.filter(
    (row) => row.writerMorphology?.status === 'attested_right_head_candidate',
  ).length;

  return {
    ...base,
    query,
    phonology: {
      ...base.phonology,
      writerAnchorPolicy: profile.writerAnchorPolicyVersion || null,
    },
    selection: {
      ...base.selection,
      mode: 'writer_ranked',
      limit,
      coverageFloorPerType: 0,
    },
    rankingPolicy: WRITER_RANKING_POLICY,
    ranking: 'deterministic multi-anchor phonetic relevance + conservative lemma/POS right-head family evidence + lexical novelty/commonness utility + greedy family diversity; legacy endpoint remains unchanged',
    writerRuntime: runtimeState.active ? {
      id: runtimeState.runtimeId,
      databaseSchema: runtimeState.databaseSchema,
      anchorStorage: runtimeState.anchorStorage,
      anchorCandidateBasis: runtimeState.anchorCandidateBasis,
      morphologyStorage: runtimeState.morphologyStorage,
    } : {
      id: 'validation-like-dynamic-v1',
      databaseSchema: runtimeState.databaseSchema,
      anchorStorage: 'vowel_key_suffix_like',
      anchorCandidateBasis: 'legacy-vowel-key-string-suffix-v1',
      morphologyStorage: 'dynamic-hot-single-analysis',
    },
    writerRetrieval: {
      policy: profile.writerAnchorPolicyVersion || null,
      source: runtimeState.active ? 'writer_anchor' : 'hot.vowel_key LIKE suffix',
      storage: runtimeState.active ? runtimeState.anchorStorage : null,
      candidateBasis: runtimeState.active ? runtimeState.anchorCandidateBasis : 'legacy-vowel-key-string-suffix-v1',
      rightEdgeKeys: retrieval.keys,
      baseCandidates: base.results.length,
      rightEdgeCandidates: retrieval.results.length,
      mergedCandidates: soundSorted.length,
    },
    writerMorphology: {
      policy: WRITER_MORPHOLOGY_POLICY,
      source: runtimeState.active ? 'writer_morphology_evidence + form_analysis' : 'dynamic hot lookup',
      storage: runtimeState.active ? runtimeState.morphologyStorage : null,
      query: query.writerMorphology,
      resolvedCandidates: resolvedMorphology,
      totalCandidates: morphologyRows.length,
      note: runtimeState.active
        ? 'Source-supported multi-analysis morphology reconstructed from compact materialized evidence; unresolved analyses are represented by absence of positive evidence and conflicting families remain unresolved.'
        : 'Conservative inferred writer-family evidence: whole lemma must end in the candidate right-head lemma, noun/adjective POS must be compatible, and the left side must have measured local usage evidence. Unresolved is preferred over speculative morphology.',
    },
    results,
    groups: groupsFor(results),
  };
}
