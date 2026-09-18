import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { getPhonologyProfile } from '../scripts/phonology-profiles.mjs';
import {
  ENTITY_PHONETIC_RUNTIME,
  ENTITY_RUNTIME_ANALYZER,
  entityRetrievalAnchors,
} from '../scripts/entity-pronunciation-core.mjs';

export const DEFAULT_ENTITY_DB_PATH = resolve('data/local/rhymelab-entities-v1.sqlite');
export const ENTITY_WRITER_RUNTIME_POLICY = 'entity-writer-channel-v1';

const RHYME_TYPES = new Set([
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
  'assonance',
  'consonance',
]);
const PRIMARY_TYPES = new Set([
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
]);
const RHYME_TIER = new Map([
  ['multisyllabic_perfect', 0],
  ['perfect', 0],
  ['multisyllabic_slant', 1],
  ['family', 2],
  ['slant', 3],
  ['assonance', 4],
  ['consonance', 5],
]);

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function tableExists(db, name) {
  if (!db) return false;
  try {
    return Boolean(db.prepare(
      "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?",
    ).get(name));
  } catch {
    return false;
  }
}

function metaValue(db, key) {
  if (!db) return null;
  try {
    return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value ?? null;
  } catch {
    return null;
  }
}

function relationRows(score) {
  return ['assonance', 'consonance'].flatMap((type) => {
    const relation = score?.relations?.[type];
    return relation?.matched ? [{
      type,
      strength: relation.strength,
      score: Number(relation.score || 0),
      components: relation.components || null,
    }] : [];
  });
}

function scoreTypes(score) {
  const types = [];
  if (PRIMARY_TYPES.has(score?.type)) types.push(score.type);
  for (const relation of relationRows(score)) {
    if (!types.includes(relation.type)) types.push(relation.type);
  }
  return types;
}

function rhymeTier(score) {
  const types = scoreTypes(score);
  return types.length
    ? Math.min(...types.map((type) => RHYME_TIER.get(type) ?? 99))
    : 99;
}

function normalizeCategory(value) {
  const category = String(value || 'all').trim();
  return category || 'all';
}

function categoryRows(db, entityId) {
  return db.prepare(`
    SELECT category,category_score,category_rank,category_percentile,
      category_tier,retained_by_category
    FROM entity_category
    WHERE entity_id=?
    ORDER BY retained_by_category DESC,category_percentile DESC,category
  `).all(entityId).map((row) => ({
    category: row.category,
    score: Number(row.category_score || 0),
    rank: Number(row.category_rank || 0),
    percentile: Number(row.category_percentile || 0),
    tier: row.category_tier,
    retained: Boolean(row.retained_by_category),
  }));
}

export function openEntityWriterDb(dbPath = DEFAULT_ENTITY_DB_PATH) {
  const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON;');
    const schema = metaValue(db, 'schema');
    if (schema !== 'rhymelab-entity-catalog-v1') {
      throw new Error(`Unexpected entity database schema: ${schema || 'missing'}`);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function entityWriterCapabilities(db) {
  if (!db) {
    return {
      available: false,
      reason: 'entity_database_unavailable',
      runtime: null,
      analyzer: null,
      pronunciations: 0,
      categories: [],
    };
  }

  const tablesReady = [
    'entity',
    'entity_category',
    'entity_name',
    'entity_pronunciation',
    'entity_phonetic_analysis',
    'entity_rhyme_anchor',
  ].every((name) => tableExists(db, name));
  const runtime = metaValue(db, 'entity_phonetic_runtime');
  const analyzer = metaValue(db, 'entity_phonetic_analyzer');
  const active = tablesReady
    && runtime === ENTITY_PHONETIC_RUNTIME
    && analyzer === ENTITY_RUNTIME_ANALYZER;

  const pronunciations = active
    ? Number(metaValue(db, 'entity_phonetic_analyses') || 0)
    : 0;
  const categories = tableExists(db, 'entity_category')
    ? db.prepare('SELECT DISTINCT category FROM entity_category ORDER BY category')
        .all().map((row) => row.category)
    : [];

  return {
    available: Boolean(active && pronunciations > 0),
    reason: !tablesReady
      ? 'entity_runtime_tables_missing'
      : runtime !== ENTITY_PHONETIC_RUNTIME
        ? 'entity_phonetic_runtime_not_materialized'
        : analyzer !== ENTITY_RUNTIME_ANALYZER
          ? 'entity_phonetic_analyzer_mismatch'
          : pronunciations > 0
            ? null
            : 'entity_pronunciations_unavailable',
    runtime,
    analyzer,
    pronunciations,
    categories,
  };
}

export function searchEntityRhymes(db, query, options = {}) {
  const capabilities = entityWriterCapabilities(db);
  if (!capabilities.available) {
    return {
      available: false,
      reason: capabilities.reason,
      policy: ENTITY_WRITER_RUNTIME_POLICY,
      results: [],
    };
  }

  const language = String(options.language || 'de').toLocaleLowerCase('en-US');
  if (language !== 'de') {
    return {
      available: false,
      reason: 'entity_language_profile_unavailable',
      policy: ENTITY_WRITER_RUNTIME_POLICY,
      results: [],
    };
  }

  const ipa = query?.preferredIpa || query?.ipa || '';
  if (!ipa) {
    return {
      available: true,
      reason: 'query_pronunciation_unresolved',
      policy: ENTITY_WRITER_RUNTIME_POLICY,
      results: [],
    };
  }

  const profile = getPhonologyProfile('de');
  let queryAnalysis;
  try {
    queryAnalysis = profile.analyzeIpa(ipa);
  } catch {
    return {
      available: true,
      reason: 'query_pronunciation_invalid',
      policy: ENTITY_WRITER_RUNTIME_POLICY,
      results: [],
    };
  }

  const category = normalizeCategory(options.category);
  const requestedType = RHYME_TYPES.has(String(options.type || ''))
    ? String(options.type)
    : 'all';
  const limit = clampInteger(options.limit, 100, 1, 250);
  const perChannelLimit = clampInteger(options.poolLimit, 192, 16, 512);
  const queryNormalized = profile.normalizeSurface(query?.surface || query?.word || '');
  const anchors = entityRetrievalAnchors(queryAnalysis, 'de');
  const byPronunciation = new Map();

  const lookup = db.prepare(`
    SELECT
      a.channel,a.anchor_key,
      p.pronunciation_id,p.name_id,p.ipa,p.locale,p.pronunciation_role,
      p.source_kind,p.source_record,p.generated,p.model_id,p.confidence,p.review_state,
      n.entity_id,n.surface,n.normalized,n.language,n.name_kind,n.preferred AS name_preferred,
      e.qid,e.primary_category,e.popularity_score,e.popularity_percentile,e.popularity_tier
    FROM entity_rhyme_anchor a
    JOIN entity_pronunciation p USING(pronunciation_id)
    JOIN entity_name n USING(name_id)
    JOIN entity e USING(entity_id)
    WHERE a.analyzer_id=?
      AND a.channel=?
      AND a.anchor_key=?
      AND p.locale='de-DE'
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition')
      AND (?='all' OR EXISTS(
        SELECT 1 FROM entity_category ec
        WHERE ec.entity_id=e.entity_id AND ec.category=?
      ))
    ORDER BY e.popularity_score DESC,n.preferred DESC,e.qid,n.name_id,p.pronunciation_id
    LIMIT ?
  `);

  for (const anchor of anchors) {
    const rows = lookup.all(
      ENTITY_RUNTIME_ANALYZER,
      anchor.channel,
      anchor.key,
      category,
      category,
      perChannelLimit,
    );
    for (const row of rows) {
      if (queryNormalized && profile.normalizeSurface(row.surface) === queryNormalized) continue;
      const current = byPronunciation.get(row.pronunciation_id);
      if (!current) {
        byPronunciation.set(row.pronunciation_id, {
          ...row,
          retrievalChannels: [anchor.channel],
        });
      } else if (!current.retrievalChannels.includes(anchor.channel)) {
        current.retrievalChannels.push(anchor.channel);
      }
    }
  }

  const results = [];
  for (const row of byPronunciation.values()) {
    let candidateAnalysis;
    try {
      candidateAnalysis = profile.analyzeIpa(row.ipa);
    } catch {
      continue;
    }
    const score = profile.scoreWriterAnalyses(queryAnalysis, candidateAnalysis);
    const types = scoreTypes(score);
    if (!types.length) continue;
    if (requestedType !== 'all' && !types.includes(requestedType)) continue;
    const relations = relationRows(score);
    const categories = categoryRows(db, row.entity_id);
    const selectedCategory = category === 'all'
      ? categories.find((entry) => entry.category === row.primary_category) || categories[0] || null
      : categories.find((entry) => entry.category === category) || null;

    results.push({
      resultKind: 'entity',
      language: 'de',
      resultId: `entity:${row.qid}:${row.name_id}:${row.pronunciation_id}`,
      word: row.surface,
      surface: row.surface,
      normalized: row.normalized,
      ipa: row.ipa,
      ipaKind: 'entity_name_pronunciation',
      locale: row.locale,
      syllableCount: Number(candidateAnalysis.syllableCount || 0),
      syllableDistance: Math.abs(
        Number(candidateAnalysis.syllableCount || 0)
        - Number(queryAnalysis.syllableCount || 0),
      ),
      score: Number(score.overall.toFixed(4)),
      type: score.type,
      primaryType: PRIMARY_TYPES.has(score.type) ? score.type : null,
      relationTypes: relations.map((relation) => relation.type),
      relations,
      rhymeTier: rhymeTier(score),
      components: {
        vowel: Number(score.vowel.toFixed(4)),
        coda: Number(score.coda.toFixed(4)),
        stress: Number(score.stress.toFixed(4)),
        syllable: Number(score.syllable.toFixed(4)),
        onset: Number((score.onset ?? 0).toFixed(4)),
        consonance: Number(score.consonance.toFixed(4)),
      },
      entityQid: row.qid,
      entityId: Number(row.entity_id),
      entityNameId: Number(row.name_id),
      primaryCategory: row.primary_category,
      entityCategories: categories,
      selectedCategory,
      popularityScore: Number(row.popularity_score || 0),
      popularityPercentile: Number(row.popularity_percentile || 0),
      popularityTier: row.popularity_tier,
      nameKind: row.name_kind,
      namePreferred: Boolean(row.name_preferred),
      pronunciationRole: row.pronunciation_role,
      pronunciationSource: row.source_kind,
      pronunciationSourceRecord: row.source_record,
      pronunciationGenerated: Boolean(row.generated),
      pronunciationModelId: row.model_id,
      pronunciationConfidence: row.confidence == null ? null : Number(row.confidence),
      pronunciationReviewState: row.review_state,
      retrievalChannels: row.retrievalChannels,
      writerAnchor: score.anchor || null,
      writerAnchorCandidates: score.anchorCandidates || [],
    });
  }

  results.sort((a, b) =>
    Number(a.rhymeTier ?? 99) - Number(b.rhymeTier ?? 99)
    || Number(b.score || 0) - Number(a.score || 0)
    || Number(a.syllableDistance || 0) - Number(b.syllableDistance || 0)
    || Number(b.selectedCategory?.percentile || b.popularityPercentile || 0)
      - Number(a.selectedCategory?.percentile || a.popularityPercentile || 0)
    || Number(b.popularityScore || 0) - Number(a.popularityScore || 0)
    || a.surface.localeCompare(b.surface, 'de')
    || a.entityQid.localeCompare(b.entityQid, 'en')
  );

  const deduped = [];
  const seen = new Set();
  for (const row of results) {
    const key = `${row.entityQid}\u001f${row.normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }

  return {
    available: true,
    reason: null,
    policy: ENTITY_WRITER_RUNTIME_POLICY,
    runtime: capabilities.runtime,
    analyzer: capabilities.analyzer,
    category,
    retrievalAnchors: anchors,
    candidateCount: byPronunciation.size,
    results: deduped.map((row, index) => ({ ...row, channelRank: index + 1 })),
  };
}
