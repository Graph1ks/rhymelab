import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { getPhonologyProfile, normalizeForLanguage } from '../scripts/phonology-profiles.mjs';
import {
  RUNTIME_RANKING_POLICY,
  rankRuntimeRecommendedResults,
} from './runtime-ranking-policy.mjs';

export const DEFAULT_DB_PATH = resolve('data/local/rhymelab.sqlite');
export const PRIMARY_RHYME_TYPES = Object.freeze([
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
]);
export const SOUND_RELATION_TYPES = Object.freeze(['assonance', 'consonance']);
export const RHYME_TYPES = Object.freeze([...PRIMARY_RHYME_TYPES, ...SOUND_RELATION_TYPES]);

const RHYME_TYPE_SET = new Set(RHYME_TYPES);
const PRIMARY_RHYME_TYPE_SET = new Set(PRIMARY_RHYME_TYPES);
const SOUND_RELATION_TYPE_SET = new Set(SOUND_RELATION_TYPES);
const MAX_QUERY = 96;
const RHYME_TIER = new Map([
  ['multisyllabic_perfect', 0],
  ['perfect', 0],
  ['multisyllabic_slant', 1],
  ['family', 2],
  ['slant', 3],
  ['assonance', 4],
  ['consonance', 5],
]);

function databaseLanguage(db) {
  const schema=String(db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value||'');
  if(schema==='rhymelab-serving-v1') return 'de';
  return String(db.prepare("SELECT value FROM meta WHERE key='language'").get()?.value || 'de')
    .trim()
    .toLocaleLowerCase('en-US');
}

function profileForDb(db) {
  return getPhonologyProfile(databaseLanguage(db));
}

export function normalizeWord(value, language = 'de') {
  return normalizeForLanguage(value, language).slice(0, MAX_QUERY);
}

export function openRhymeDb(dbPath = DEFAULT_DB_PATH) {
  const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
  db.exec('PRAGMA query_only=ON;');
  const schema = db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  if (schema !== 'rhymelab-local-db-v4') {
    db.close();
    throw new Error(`Unexpected local database schema: ${schema || 'missing'}; run npm run local:refresh`);
  }
  profileForDb(db);
  return db;
}

function clampLimit(value, fallback = 20, max = 250) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function clampCoverageFloor(value, fallback = 20, max = 50) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

const parseJsonArray = (value) => {
  try { return JSON.parse(value || '[]'); } catch { return []; }
};

function normalizedRequestedType(value) {
  const type = String(value ?? 'all').trim();
  return RHYME_TYPE_SET.has(type) ? type : 'all';
}

function relationFor(row, type) {
  return (row.relations || []).find((relation) => relation.type === type) || null;
}

export function resultTypes(row) {
  const types = new Set();
  const primary = row.primaryType || (PRIMARY_RHYME_TYPE_SET.has(row.type) ? row.type : null);
  if (primary) types.add(primary);
  for (const type of row.relationTypes || []) if (SOUND_RELATION_TYPE_SET.has(type)) types.add(type);
  return RHYME_TYPES.filter((type) => types.has(type));
}

export function resultMatchesType(row, type) {
  return resultTypes(row).includes(type);
}

function countByType(rows) {
  const counts = Object.fromEntries(RHYME_TYPES.map((type) => [type, 0]));
  for (const row of rows) for (const type of resultTypes(row)) counts[type] += 1;
  return counts;
}

export function getStats(db) {
  const rows = db.prepare('SELECT key,value FROM meta').all();
  const meta = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    schema: meta.schema,
    language: meta.language || 'de',
    builtAt: meta.built_at,
    publishGeneratedAt: meta.publish_generated_at,
    pronunciationPolicy: meta.pronunciation_policy,
    lexicalHistoryPolicy: meta.lexical_history_policy,
    forms: Number(meta.forms || 0),
    baseForms: Number(meta.base_forms || 0),
    supplementalForms: Number(meta.supplemental_forms || 0),
    historicalForms: Number(meta.historical_forms || 0),
    usageRankedForms: Number(meta.usage_ranked_forms || 0),
    pronunciations: Number(meta.pronunciations || 0),
    preferredPronunciations: Number(meta.preferred_pronunciations || 0),
  };
}

export function searchWords(db, query, requestedLimit, options = {}) {
  const profile = profileForDb(db);
  const normalized = normalizeWord(query, profile.language);
  if (!normalized) return [];
  const limit = clampLimit(requestedLimit, 20, 50);
  const prefix = `${normalized}%`;
  const historical = options.includeHistorical === true ? '' : ' AND historical=0';
  return db.prepare(`
    SELECT surface, normalized, MIN(usage_rank) AS usage_rank,
           MAX(usage_count) AS usage_count, MIN(usage_score) AS usage_score,
           COUNT(*) AS pronunciations, MAX(lexicon_layer) AS lexicon_layer,
           MAX(entity_kind) AS entity_kind, MAX(historical) AS historical,
           MAX(lexical_tags) AS lexical_tags
    FROM hot
    WHERE (normalized = ? OR normalized LIKE ?)${historical}
    GROUP BY surface, normalized
    ORDER BY CASE WHEN normalized = ? THEN 0 ELSE 1 END,
             usage_rank IS NULL, usage_rank, LENGTH(normalized), surface
    LIMIT ?
  `).all(normalized, prefix, normalized, limit).map((row) => ({
    ...row,
    language: profile.language,
    historical: Boolean(row.historical),
    lexical_tags: parseJsonArray(row.lexical_tags),
  }));
}

export function getWord(db, word) {
  const profile = profileForDb(db);
  const normalized = normalizeWord(word, profile.language);
  if (!normalized) return null;
  const rows = db.prepare(`
    SELECT * FROM hot
    WHERE normalized = ?
    ORDER BY usage_rank IS NULL, usage_rank, surface,
             pronunciation_preferred DESC, pronunciation_rank, ipa
    LIMIT 100
  `).all(normalized);
  if (!rows.length) return null;
  const first = rows[0];
  const preferred = rows.find((row) => row.pronunciation_preferred) || first;
  const preferredFlags=parseJsonArray(preferred.pronunciation_flags);
  const generatedPronunciation=
    preferredFlags.includes('generated')
    ||String(preferred.pronunciation_source||'').toLocaleLowerCase('en-US').includes('espeak');
  return {
    language: profile.language,
    surface: first.surface,
    normalized,
    usageRank: first.usage_rank,
    usageScore: first.usage_score,
    usageCount: first.usage_count,
    usageSourceCount: first.usage_source_count,
    lemma: first.lemma,
    partOfSpeech: first.pos,
    gender: first.gender,
    lexiconLayer: first.lexicon_layer,
    entityKind: first.entity_kind,
    historical: Boolean(first.historical),
    lexicalTags: parseJsonArray(first.lexical_tags),
    syllableCount: preferred.syllable_count,
    stress: preferred.stress,
    primaryStressSyllable: preferred.primary_stress,
    preferredIpa: preferred.ipa,
    ...(generatedPronunciation?{
      generatedPronunciation:true,
      pronunciationProvenance:'generated_optin_overlay',
    }:{}),
    pronunciations: rows.map((row) => ({
      ipa: row.ipa,
      preferred: Boolean(row.pronunciation_preferred),
      defaultEligible: Boolean(row.pronunciation_eligible),
      preferenceRank: row.pronunciation_rank,
      evidenceCount: row.pronunciation_evidence,
      sourceOrder: row.pronunciation_source_order,
      source: row.pronunciation_source,
      sourceTags: parseJsonArray(row.pronunciation_tags),
      sourceRawTags: parseJsonArray(row.pronunciation_raw_tags),
      flags: parseJsonArray(row.pronunciation_flags),
      locale: row.locale,
      dialect: row.dialect,
      register: row.pronunciation_register,
      phonemes: row.phonemes,
      syllableCount: row.syllable_count,
      stress: row.stress,
      primaryStressSyllable: row.primary_stress,
      rhymeTail: row.rhyme_tail,
      finalTail: row.final_tail,
      vowelSequence: row.vowels,
      consonantSequence: row.consonants,
      rhymeSyllables: row.rhyme_syllables,
    })),
  };
}

function candidatePool(db, queryRow, poolLimit, includeVariants = false, includeHistorical = false, generatedOnly = false) {
  const candidates = new Map();
  const add = (rows) => {
    for (const row of rows) {
      if (row.normalized === queryRow.normalized) continue;
      candidates.set(row.id, row);
    }
  };
  const limit = clampLimit(poolLimit, 350, 800);
  const preferred = includeVariants ? '' : ' AND pronunciation_preferred=1';
  const historical = includeHistorical ? '' : ' AND historical=0';
  const generated = generatedOnly ? " AND pronunciation_flags LIKE '%secondary_opt_in%'" : '';
  const order = ' ORDER BY ABS(syllable_count-?), usage_rank IS NULL, usage_rank LIMIT ?';

  add(db.prepare(`SELECT * FROM hot WHERE exact_key=?${preferred}${historical}${generated}${order}`)
    .all(queryRow.exact_key, queryRow.syllable_count, limit));

  if (queryRow.multisyllable_key) {
    add(db.prepare(`SELECT * FROM hot WHERE multisyllable_key=?${preferred}${historical}${generated}${order}`)
      .all(queryRow.multisyllable_key, queryRow.syllable_count, limit));
  }

  add(db.prepare(`SELECT * FROM hot WHERE vowel_key=?${preferred}${historical}${generated}${order}`)
    .all(queryRow.vowel_key, queryRow.syllable_count, limit));

  add(db.prepare(`SELECT * FROM hot WHERE vowel_family=?${preferred}${historical}${generated}${order}`)
    .all(queryRow.vowel_family, queryRow.syllable_count, limit));

  const stressedFamily = String(queryRow.vowel_family || '').split('-')[0];
  if (stressedFamily) {
    const lower = `${stressedFamily}-`;
    const upper = `${stressedFamily}.`;
    add(db.prepare(`SELECT * FROM hot WHERE (vowel_family=? OR (vowel_family>=? AND vowel_family<?))${preferred}${historical}${generated}${order}`)
      .all(stressedFamily, lower, upper, queryRow.syllable_count, limit));
  }

  add(db.prepare(`SELECT * FROM hot WHERE vowel_family=? AND coda_class=?${preferred}${historical}${generated}${order}`)
    .all(queryRow.vowel_family, queryRow.coda_class, queryRow.syllable_count, limit));

  if (queryRow.coda_key) {
    add(db.prepare(`SELECT * FROM hot WHERE coda_key=?${preferred}${historical}${generated}${order}`)
      .all(queryRow.coda_key, queryRow.syllable_count, limit));
  }

  return [...candidates.values()];
}

function resultFromRow(row, score, queryRow, profile) {
  const primaryType = score.type === 'weak' ? null : score.type;
  const relations = SOUND_RELATION_TYPES.flatMap((type) => {
    const relation = score.relations?.[type];
    return relation?.matched ? [{
      type,
      strength: relation.strength,
      score: relation.score,
      components: relation.components,
    }] : [];
  });
  const relationTypes = relations.map((relation) => relation.type);
  const fallbackTier = relationTypes.length
    ? Math.min(...relationTypes.map((type) => RHYME_TIER.get(type) ?? 99))
    : 99;
  const tier = primaryType ? (RHYME_TIER.get(primaryType) ?? 99) : fallbackTier;
  const pronunciationFlags=parseJsonArray(row.pronunciation_flags);
  const generatedPronunciation=
    pronunciationFlags.includes('generated')
    ||String(row.pronunciation_source||'').toLocaleLowerCase('en-US').includes('espeak');
  return {
    language: profile.language,
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
    syllableDistance: Math.abs(Number(row.syllable_count) - Number(queryRow.syllable_count)),
    rhymeTier: tier,
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
  };
}

function localeForRow(row) {
  return row.language === 'en' ? 'en' : 'de';
}

function relationScore(row, type) {
  return Number(relationFor(row, type)?.score || 0);
}

function relationStrengthRank(row, type) {
  return relationFor(row, type)?.strength === 'strong' ? 0 : 1;
}

function compareRecommended(a, b) {
  return a.rhymeTier - b.rhymeTier
    || a.syllableDistance - b.syllableDistance
    || (a.usageRank == null) - (b.usageRank == null)
    || (a.usageRank ?? Number.MAX_SAFE_INTEGER) - (b.usageRank ?? Number.MAX_SAFE_INTEGER)
    || b.score - a.score
    || a.word.localeCompare(b.word, localeForRow(a));
}

function compareForType(a, b, type) {
  if (SOUND_RELATION_TYPE_SET.has(type)) {
    return Number(!resultMatchesType(a, type)) - Number(!resultMatchesType(b, type))
      || relationStrengthRank(a, type) - relationStrengthRank(b, type)
      || relationScore(b, type) - relationScore(a, type)
      || a.syllableDistance - b.syllableDistance
      || (a.usageRank == null) - (b.usageRank == null)
      || (a.usageRank ?? Number.MAX_SAFE_INTEGER) - (b.usageRank ?? Number.MAX_SAFE_INTEGER)
      || b.score - a.score
      || a.word.localeCompare(b.word, localeForRow(a));
  }
  return Number(!resultMatchesType(a, type)) - Number(!resultMatchesType(b, type))
    || compareRecommended(a, b);
}

export function selectResultsWithTypeCoverage(sortedResults, options = {}) {
  const limit = clampLimit(options.limit, 80, 250);
  const requestedType = normalizedRequestedType(options.type);
  const availableByType = countByType(sortedResults);

  if (requestedType !== 'all') {
    const results = sortedResults
      .filter((row) => resultMatchesType(row, requestedType))
      .sort((a, b) => compareForType(a, b, requestedType))
      .slice(0, limit);
    return {
      results,
      selection: {
        mode: SOUND_RELATION_TYPE_SET.has(requestedType) ? 'single_relation' : 'single_type',
        requestedType,
        limit,
        coverageFloorPerType: 0,
        availableByType,
        returnedByType: countByType(results),
      },
    };
  }

  if (options.ensureTypeCoverage !== true) {
    const results = sortedResults.slice(0, limit);
    return {
      results,
      selection: {
        mode: 'ranked',
        requestedType: 'all',
        limit,
        coverageFloorPerType: 0,
        availableByType,
        returnedByType: countByType(results),
      },
    };
  }

  const presentTypes = RHYME_TYPES.filter((type) => availableByType[type] > 0);
  const requestedFloor = clampCoverageFloor(options.coverageFloor, 20, 50);
  const floor = presentTypes.length
    ? Math.min(requestedFloor, Math.max(1, Math.floor(limit / presentTypes.length)))
    : 0;

  const selected = new Map();
  for (const type of presentTypes) {
    const candidates = sortedResults
      .filter((row) => resultMatchesType(row, type))
      .sort((a, b) => compareForType(a, b, type));
    let taken = 0;
    for (const row of candidates) {
      if (!selected.has(row.normalized)) selected.set(row.normalized, row);
      taken += 1;
      if (taken >= floor || selected.size >= limit) break;
    }
    if (selected.size >= limit) break;
  }

  for (const row of sortedResults) {
    if (selected.size >= limit) break;
    if (!selected.has(row.normalized)) selected.set(row.normalized, row);
  }

  const results = [...selected.values()].sort(compareRecommended);
  return {
    results,
    selection: {
      mode: 'balanced',
      requestedType: 'all',
      limit,
      coverageFloorPerType: floor,
      availableByType,
      returnedByType: countByType(results),
    },
  };
}

export function findRhymes(db, word, options = {}) {
  const profile = profileForDb(db);
  const normalized = normalizeWord(word, profile.language);
  if (!normalized) return null;

  const includeVariants = options.includeVariants === true;
  const includeHistorical = options.includeHistorical === true;
  const requestedType = normalizedRequestedType(options.type);
  let queryRows = db.prepare(`
    SELECT * FROM hot
    WHERE normalized=? ${includeVariants ? '' : 'AND pronunciation_preferred=1'}
    ORDER BY usage_rank IS NULL, usage_rank, pronunciation_preferred DESC, pronunciation_rank, id
    LIMIT 12
  `).all(normalized);

  if (!queryRows.length && !includeVariants) {
    queryRows = db.prepare(`
      SELECT * FROM hot
      WHERE normalized=?
      ORDER BY pronunciation_rank, id
      LIMIT 12
    `).all(normalized);
  }
  if (!queryRows.length) return null;

  const queryDetail = getWord(db, normalized);
  const bestByWord = new Map();
  for (const queryRow of queryRows) {
    let queryAnalysis;
    try { queryAnalysis = profile.analyzeIpa(queryRow.ipa); }
    catch { continue; }

    for (const candidate of candidatePool(
      db,
      queryRow,
      options.poolLimit,
      includeVariants,
      includeHistorical,
      options.generatedOnly===true,
    )) {
      let candidateAnalysis;
      try { candidateAnalysis = profile.analyzeIpa(candidate.ipa); }
      catch { continue; }

      const score = profile.scoreAnalyses(queryAnalysis, candidateAnalysis);
      if (score.type === 'weak' && !(score.relationTypes || []).length) continue;
      const result = resultFromRow(candidate, score, queryRow, profile);
      const current = bestByWord.get(candidate.normalized);
      if (!current) {
        bestByWord.set(candidate.normalized, result);
        continue;
      }
      const compare = requestedType === 'all'
        ? compareRecommended(result, current)
        : compareForType(result, current, requestedType);
      if (compare < 0) bestByWord.set(candidate.normalized, result);
    }
  }

  const sortedResults = rankRuntimeRecommendedResults([...bestByWord.values()], queryDetail);
  const { results, selection } = selectResultsWithTypeCoverage(sortedResults, {
    limit: options.limit,
    type: requestedType,
    ensureTypeCoverage: options.ensureTypeCoverage,
    coverageFloor: options.coverageFloor,
  });

  const groups = Object.fromEntries(RHYME_TYPES.map((type) => [type, []]));
  for (const result of results) {
    for (const type of resultTypes(result)) groups[type].push(result);
  }

  const rankingPolicy = selection.mode === 'ranked'
    ? RUNTIME_RANKING_POLICY
    : selection.mode === 'balanced'
      ? 'balanced_usage_first_coverage'
      : 'type_specific_usage_first';

  return {
    language: profile.language,
    phonology: {
      analyzer: profile.analyzerVersion,
      scorer: profile.scorerVersion,
      relationPolicy: profile.relationPolicyVersion,
    },
    query: queryDetail,
    variantMode: includeVariants ? 'all' : 'preferred',
    historicalMode: includeHistorical ? 'all' : 'current',
    requestedType: selection.requestedType,
    selection,
    rankingPolicy,
    ranking: selection.mode === 'ranked'
      ? 'primary_rhyme_tier > syllable_distance > modern-query relative-commonness horizon (10x) > 0.05 phonetic score band > usage_rank > phonetic_score; dictionary/missing-usage/protected rows fall back usage-first; sound_relations_rank_independently'
      : 'coverage/type-specific selection retains usage-first ordering; sound_relations_rank_independently',
    results,
    groups,
  };
}
