import { getPhonologyProfile, normalizeForLanguage } from './phonology-profiles.mjs';
import { compareUsageFirstResults } from './ranking-policy-core.mjs';
import { getWord } from '../src/local-engine.mjs';

const SOUND_RELATION_TYPES = Object.freeze(['assonance', 'consonance']);
const RHYME_TIER = new Map([
  ['multisyllabic_perfect', 0],
  ['perfect', 0],
  ['multisyllabic_slant', 1],
  ['family', 2],
  ['slant', 3],
  ['assonance', 4],
  ['consonance', 5],
]);

function parseJsonArray(value) {
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

function databaseLanguage(db) {
  return String(db.prepare("SELECT value FROM meta WHERE key='language'").get()?.value || 'de')
    .trim()
    .toLocaleLowerCase('en-US');
}

function clampPoolLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return 350;
  return Math.max(1, Math.min(800, parsed));
}

function candidatePool(db, queryRow, requestedPoolLimit, includeVariants = false, includeHistorical = false) {
  const candidates = new Map();
  const add = (rows) => {
    for (const row of rows) {
      if (row.normalized === queryRow.normalized) continue;
      candidates.set(row.id, row);
    }
  };
  const limit = clampPoolLimit(requestedPoolLimit);
  const preferred = includeVariants ? '' : ' AND pronunciation_preferred=1';
  const historical = includeHistorical ? '' : ' AND historical=0';
  const order = ' ORDER BY ABS(syllable_count-?), usage_rank IS NULL, usage_rank LIMIT ?';

  add(db.prepare(`SELECT * FROM hot WHERE exact_key=?${preferred}${historical}${order}`)
    .all(queryRow.exact_key, queryRow.syllable_count, limit));

  if (queryRow.multisyllable_key) {
    add(db.prepare(`SELECT * FROM hot WHERE multisyllable_key=?${preferred}${historical}${order}`)
      .all(queryRow.multisyllable_key, queryRow.syllable_count, limit));
  }

  add(db.prepare(`SELECT * FROM hot WHERE vowel_key=?${preferred}${historical}${order}`)
    .all(queryRow.vowel_key, queryRow.syllable_count, limit));

  add(db.prepare(`SELECT * FROM hot WHERE vowel_family=?${preferred}${historical}${order}`)
    .all(queryRow.vowel_family, queryRow.syllable_count, limit));

  const stressedFamily = String(queryRow.vowel_family || '').split('-')[0];
  if (stressedFamily) {
    const lower = `${stressedFamily}-`;
    const upper = `${stressedFamily}.`;
    add(db.prepare(`SELECT * FROM hot WHERE (vowel_family=? OR (vowel_family>=? AND vowel_family<?))${preferred}${historical}${order}`)
      .all(stressedFamily, lower, upper, queryRow.syllable_count, limit));
  }

  add(db.prepare(`SELECT * FROM hot WHERE vowel_family=? AND coda_class=?${preferred}${historical}${order}`)
    .all(queryRow.vowel_family, queryRow.coda_class, queryRow.syllable_count, limit));

  if (queryRow.coda_key) {
    add(db.prepare(`SELECT * FROM hot WHERE coda_key=?${preferred}${historical}${order}`)
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

export function runtimeResultKey(row) {
  return `${row.normalized ?? String(row.word || '').toLocaleLowerCase('de-DE')}\u0000${row.ipa || ''}`;
}

export function sameRuntimeResultOrder(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function retrieveAllRuntimeCandidates(db, word, options = {}) {
  const profile = getPhonologyProfile(databaseLanguage(db));
  const normalized = normalizeForLanguage(word, profile.language).slice(0, 96);
  if (!normalized) return null;

  const includeVariants = options.includeVariants === true;
  const includeHistorical = options.includeHistorical === true;
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
    )) {
      let candidateAnalysis;
      try { candidateAnalysis = profile.analyzeIpa(candidate.ipa); }
      catch { continue; }

      const score = profile.scoreAnalyses(queryAnalysis, candidateAnalysis);
      if (score.type === 'weak' && !(score.relationTypes || []).length) continue;

      const result = resultFromRow(candidate, score, queryRow, profile);
      const current = bestByWord.get(candidate.normalized);
      if (!current || compareUsageFirstResults(result, current) < 0) {
        bestByWord.set(candidate.normalized, result);
      }
    }
  }

  return {
    query: getWord(db, normalized),
    results: [...bestByWord.values()].sort(compareUsageFirstResults),
  };
}
