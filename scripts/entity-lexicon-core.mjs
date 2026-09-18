import { createHash } from 'node:crypto';

export const ENTITY_DB_SCHEMA = 'rhymelab-entity-catalog-v1';
export const ENTITY_TAXONOMY_POLICY = 'wikidata-cultural-entity-taxonomy-v1';
export const ENTITY_POPULARITY_POLICY = 'category-relative-popularity-v1';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round6(value) {
  return Math.round(Number(value) * 1_000_000) / 1_000_000;
}

export function normalizeEntityName(value) {
  return cleanText(value).toLocaleLowerCase('und');
}

function rawClaimValues(item, propertyId) {
  const rows = Array.isArray(item?.claims?.[propertyId]) ? item.claims[propertyId] : [];
  return rows.map((row) => {
    if (typeof row === 'string' || typeof row === 'number') return String(row);
    const dataValue = row?.mainsnak?.datavalue?.value;
    if (typeof dataValue === 'string' || typeof dataValue === 'number') return String(dataValue);
    if (dataValue && typeof dataValue === 'object') {
      if (typeof dataValue.id === 'string') return dataValue.id;
      if (typeof dataValue.text === 'string') return dataValue.text;
    }
    return '';
  }).filter(Boolean);
}

export function claimEntityIds(item, propertyId) {
  return rawClaimValues(item, propertyId).filter((value) => /^Q\d+$/u.test(value));
}

function categoryMatches(item, category) {
  return (category.match_any || []).some((rule) => {
    const values = new Set(claimEntityIds(item, rule.property));
    return (rule.qids || []).some((qid) => values.has(qid));
  });
}

export function classifyEntity(item, taxonomy) {
  return (taxonomy.categories || [])
    .filter((category) => categoryMatches(item, category))
    .map((category) => ({
      category: category.category,
      priority: Number(category.priority ?? 9999),
      retentionPercentileFloor: Number(category.retention_percentile_floor ?? 0),
    }))
    .sort((a, b) => a.priority - b.priority || a.category.localeCompare(b.category, 'en'));
}

function wikipediaSitelinks(item) {
  return Object.keys(item?.sitelinks || {}).filter((key) =>
    /^[a-z0-9_-]+wiki$/iu.test(key) && !/^(?:commonswiki|specieswiki)$/iu.test(key)
  );
}

function retainedNames(item, taxonomy) {
  const languages = taxonomy.retained_name_languages || ['de', 'en'];
  const rows = [];
  const seen = new Set();

  const add = (surface, language, nameKind, preferred) => {
    const clean = cleanText(surface);
    if (!clean) return;
    const normalized = normalizeEntityName(clean);
    const key = `${language}\u001f${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      surface: clean,
      normalized,
      language,
      script: 'auto',
      nameKind,
      preferred: preferred ? 1 : 0,
      searchable: 1,
      sourceKind: 'wikidata',
    });
  };

  for (const language of languages) {
    const label = item?.labels?.[language]?.value;
    if (label) add(label, language, 'label', true);
    for (const alias of item?.aliases?.[language] || []) {
      add(alias?.value, language, 'alias', false);
    }
  }

  return rows.sort((a, b) =>
    b.preferred - a.preferred
    || a.language.localeCompare(b.language, 'en')
    || a.normalized.localeCompare(b.normalized, 'en')
    || a.surface.localeCompare(b.surface, 'en')
  );
}

function externalIds(item, taxonomy) {
  const rows = [];
  const seen = new Set();
  for (const [propertyId, system] of Object.entries(taxonomy.external_id_whitelist || {})) {
    for (const value of rawClaimValues(item, propertyId)) {
      if (/^Q\d+$/u.test(value)) continue;
      const clean = cleanText(value);
      if (!clean) continue;
      const key = `${system}\u001f${clean}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ propertyId, system, value: clean });
    }
  }
  return rows.sort((a, b) =>
    a.system.localeCompare(b.system, 'en')
    || a.value.localeCompare(b.value, 'en')
  );
}

function statementCount(item) {
  return Object.values(item?.claims || {})
    .reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

function structuralPopularitySignals(item, externalIdRows) {
  const sitelinks = wikipediaSitelinks(item);
  const metrics = item?.fixture_metrics || {};
  return {
    qrankScore: clamp01(metrics.qrank_score),
    wikipediaSitelinkCount: Number.isFinite(Number(metrics.wikipedia_sitelink_count))
      ? Number(metrics.wikipedia_sitelink_count)
      : sitelinks.length,
    hasDewiki: Object.hasOwn(item?.sitelinks || {}, 'dewiki') ? 1 : 0,
    hasEnwiki: Object.hasOwn(item?.sitelinks || {}, 'enwiki') ? 1 : 0,
    externalIdCount: externalIdRows.length,
    statementCount: statementCount(item),
    pageviewsDeScore: clamp01(metrics.pageviews_de_score),
    pageviewsEnScore: clamp01(metrics.pageviews_en_score),
  };
}

function popularityScores(signals) {
  const sitelinkScore = clamp01(
    Math.log1p(Math.max(0, signals.wikipediaSitelinkCount)) / Math.log1p(100),
  );
  const externalScore = clamp01(signals.externalIdCount / 6);
  const statementScore = clamp01(signals.statementCount / 60);
  const bilingualPresence = (signals.hasDewiki + signals.hasEnwiki) / 2;

  const globalScore = round6(
    0.60 * signals.qrankScore
    + 0.15 * sitelinkScore
    + 0.10 * bilingualPresence
    + 0.10 * externalScore
    + 0.05 * statementScore,
  );
  const deScore = round6(
    0.65 * globalScore
    + 0.20 * signals.hasDewiki
    + 0.15 * signals.pageviewsDeScore,
  );
  const enScore = round6(
    0.65 * globalScore
    + 0.20 * signals.hasEnwiki
    + 0.15 * signals.pageviewsEnScore,
  );

  return { globalScore, deScore, enScore };
}

function categoryScore(popularity) {
  return round6(
    0.70 * popularity.globalScore
    + 0.15 * popularity.deScore
    + 0.15 * popularity.enScore,
  );
}

function percentileForIndex(index, size) {
  if (size <= 1) return 1;
  return round6(1 - index / (size - 1));
}

export function popularityTier(percentile) {
  if (percentile >= 0.80) return 'A';
  if (percentile >= 0.35) return 'B';
  return 'C';
}

function entityRecord(item, taxonomy) {
  const categories = classifyEntity(item, taxonomy);
  if (!categories.length) return null;

  const names = retainedNames(item, taxonomy);
  if (!names.length) return null;

  const ids = externalIds(item, taxonomy);
  const signals = structuralPopularitySignals(item, ids);
  const popularity = popularityScores(signals);
  const primary = categories[0]?.category || null;

  return {
    qid: item.id,
    primaryCategory: primary,
    descriptionDe: cleanText(item?.descriptions?.de?.value) || null,
    descriptionEn: cleanText(item?.descriptions?.en?.value) || null,
    fixtureOnly: item?.fixture_only ? 1 : 0,
    categories,
    names,
    externalIds: ids,
    signals,
    popularity,
  };
}

function protectedSentinelMap(taxonomy) {
  return new Map((taxonomy.protected_sentinels || []).map((row) => [row.qid, row]));
}

export function buildEntityPrototype(items, taxonomy) {
  const structuralRejected = [];
  const candidates = [];

  for (const item of items || []) {
    const record = entityRecord(item, taxonomy);
    if (!record) {
      structuralRejected.push(item?.id || null);
      continue;
    }
    candidates.push(record);
  }

  const byCategory = new Map();
  for (const record of candidates) {
    for (const membership of record.categories) {
      const rows = byCategory.get(membership.category) || [];
      rows.push({ record, membership, score: categoryScore(record.popularity) });
      byCategory.set(membership.category, rows);
    }
  }

  for (const rows of byCategory.values()) {
    rows.sort((a, b) =>
      b.score - a.score
      || b.record.popularity.globalScore - a.record.popularity.globalScore
      || a.record.qid.localeCompare(b.record.qid, 'en')
    );
    rows.forEach((row, index) => {
      const percentile = percentileForIndex(index, rows.length);
      Object.assign(row.membership, {
        categoryScore: row.score,
        categoryRank: index + 1,
        categoryPercentile: percentile,
        categoryTier: popularityTier(percentile),
        retainedByCategory: percentile >= row.membership.retentionPercentileFloor ? 1 : 0,
      });
    });
  }

  const sentinels = protectedSentinelMap(taxonomy);
  const retained = [];
  const popularityRejected = [];

  for (const record of candidates) {
    const sentinel = sentinels.get(record.qid) || null;
    const retainedByCategory = record.categories.some((row) => row.retainedByCategory === 1);
    const retainedBySentinel = Boolean(sentinel);
    record.retention = {
      retained: retainedByCategory || retainedBySentinel ? 1 : 0,
      retainedByCategory: retainedByCategory ? 1 : 0,
      retainedBySentinel: retainedBySentinel ? 1 : 0,
    };
    if (record.retention.retained) retained.push(record);
    else popularityRejected.push(record.qid);
  }

  retained.sort((a, b) => a.qid.localeCompare(b.qid, 'en'));
  structuralRejected.sort((a, b) => String(a).localeCompare(String(b), 'en'));
  popularityRejected.sort((a, b) => a.localeCompare(b, 'en'));

  return {
    schema: ENTITY_DB_SCHEMA,
    taxonomyPolicy: taxonomy.policy || ENTITY_TAXONOMY_POLICY,
    popularityPolicy: ENTITY_POPULARITY_POLICY,
    candidates,
    retained,
    structuralRejected,
    popularityRejected,
  };
}

export const CREATE_ENTITY_SQL = `
CREATE TABLE meta(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE entity_source_snapshot(
  snapshot_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  snapshot_label TEXT NOT NULL,
  upstream_url TEXT,
  artifact_sha256 TEXT,
  license_id TEXT NOT NULL,
  importer_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE entity(
  entity_id INTEGER PRIMARY KEY,
  qid TEXT UNIQUE NOT NULL,
  primary_category TEXT,
  description_de TEXT,
  description_en TEXT,
  fixture_only INTEGER NOT NULL DEFAULT 0 CHECK(fixture_only IN (0,1)),
  popularity_score REAL NOT NULL,
  popularity_de REAL,
  popularity_en REAL,
  popularity_percentile REAL NOT NULL,
  popularity_tier TEXT NOT NULL CHECK(popularity_tier IN ('A','B','C')),
  source_snapshot_id TEXT NOT NULL REFERENCES entity_source_snapshot(snapshot_id)
);

CREATE TABLE entity_category(
  entity_id INTEGER NOT NULL REFERENCES entity(entity_id),
  category TEXT NOT NULL,
  category_score REAL NOT NULL,
  category_rank INTEGER NOT NULL,
  category_percentile REAL NOT NULL,
  category_tier TEXT NOT NULL CHECK(category_tier IN ('A','B','C')),
  retention_percentile_floor REAL NOT NULL,
  retained_by_category INTEGER NOT NULL CHECK(retained_by_category IN (0,1)),
  PRIMARY KEY(entity_id, category)
);

CREATE TABLE entity_name(
  name_id INTEGER PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES entity(entity_id),
  surface TEXT NOT NULL,
  normalized TEXT NOT NULL,
  language TEXT NOT NULL,
  script TEXT NOT NULL,
  name_kind TEXT NOT NULL,
  preferred INTEGER NOT NULL CHECK(preferred IN (0,1)),
  searchable INTEGER NOT NULL CHECK(searchable IN (0,1)),
  source_kind TEXT NOT NULL,
  source_record TEXT,
  UNIQUE(entity_id, language, normalized)
);

CREATE TABLE entity_popularity_evidence(
  entity_id INTEGER PRIMARY KEY REFERENCES entity(entity_id),
  policy TEXT NOT NULL,
  qrank_score REAL,
  qrank_raw INTEGER,
  candidate_score_ppm INTEGER,
  wikipedia_sitelink_count INTEGER NOT NULL,
  has_dewiki INTEGER NOT NULL CHECK(has_dewiki IN (0,1)),
  has_enwiki INTEGER NOT NULL CHECK(has_enwiki IN (0,1)),
  external_id_count INTEGER NOT NULL,
  statement_count INTEGER NOT NULL,
  pageviews_de_score REAL,
  pageviews_en_score REAL
);

CREATE TABLE entity_external_id(
  entity_id INTEGER NOT NULL REFERENCES entity(entity_id),
  property_id TEXT NOT NULL,
  system TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY(entity_id, system, value)
);

CREATE TABLE entity_pronunciation(
  pronunciation_id INTEGER PRIMARY KEY,
  name_id INTEGER NOT NULL REFERENCES entity_name(name_id),
  locale TEXT,
  pronunciation_role TEXT NOT NULL,
  ipa TEXT NOT NULL,
  preferred INTEGER NOT NULL DEFAULT 0 CHECK(preferred IN (0,1)),
  source_kind TEXT NOT NULL,
  source_record TEXT,
  generated INTEGER NOT NULL DEFAULT 0 CHECK(generated IN (0,1)),
  model_id TEXT,
  confidence REAL,
  review_state TEXT NOT NULL DEFAULT 'unreviewed'
);

CREATE TABLE entity_phonetic_analysis(
  pronunciation_id INTEGER NOT NULL REFERENCES entity_pronunciation(pronunciation_id),
  analyzer_id TEXT NOT NULL,
  phonemes TEXT NOT NULL,
  syllables TEXT NOT NULL,
  syllable_count INTEGER NOT NULL,
  primary_stress INTEGER,
  secondary_stress TEXT,
  stress_pattern TEXT,
  vowel_sequence TEXT,
  consonant_sequence TEXT,
  rhyme_tail TEXT,
  rhyme_signature TEXT,
  PRIMARY KEY(pronunciation_id, analyzer_id)
);

CREATE VIRTUAL TABLE entity_name_fts USING fts5(
  surface,
  normalized,
  entity_id UNINDEXED,
  name_id UNINDEXED,
  language UNINDEXED
);

CREATE INDEX idx_entity_primary_category ON entity(primary_category, popularity_score DESC);
CREATE INDEX idx_entity_category_tier ON entity_category(category, category_tier, category_score DESC);
CREATE INDEX idx_entity_name_normalized ON entity_name(normalized, language);
CREATE INDEX idx_entity_external_id ON entity_external_id(system, value);
CREATE INDEX idx_entity_pronunciation_locale ON entity_pronunciation(locale, pronunciation_role);

CREATE TABLE entity_rhyme_anchor(
  analyzer_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  anchor_key TEXT NOT NULL,
  pronunciation_id INTEGER NOT NULL REFERENCES entity_pronunciation(pronunciation_id),
  PRIMARY KEY(analyzer_id,channel,anchor_key,pronunciation_id)
) WITHOUT ROWID;

CREATE INDEX idx_entity_rhyme_anchor_pronunciation
  ON entity_rhyme_anchor(pronunciation_id,analyzer_id,channel);
`;

export function createEntityStorage(db) {
  db.exec(CREATE_ENTITY_SQL);
}

export function snapshotIdForEntitySource(snapshot) {
  return `entity-snapshot:${sha256(JSON.stringify([
    snapshot.source,
    snapshot.snapshotLabel,
    snapshot.artifactSha256 || '',
  ])).slice(0, 24)}`;
}

function overallPercentile(record) {
  const values = record.categories.map((row) => row.categoryPercentile);
  return values.length ? Math.max(...values) : 0;
}

export function writeEntityPrototype(db, prototype, {
  source = 'wikidata-fixture',
  snapshotLabel = 'fixture-v1',
  upstreamUrl = 'https://www.wikidata.org/',
  artifactSha256 = null,
  licenseId = 'CC0-1.0',
  importerVersion = ENTITY_DB_SCHEMA,
  metadata = {},
} = {}) {
  const snapshot = {
    source,
    snapshotLabel,
    upstreamUrl,
    artifactSha256,
    licenseId,
    importerVersion,
    metadata,
  };
  const snapshotId = snapshotIdForEntitySource(snapshot);

  db.prepare(`
    INSERT INTO entity_source_snapshot(
      snapshot_id,source,snapshot_label,upstream_url,artifact_sha256,
      license_id,importer_version,metadata_json
    ) VALUES(?,?,?,?,?,?,?,?)
  `).run(
    snapshotId,
    source,
    snapshotLabel,
    upstreamUrl,
    artifactSha256,
    licenseId,
    importerVersion,
    JSON.stringify(metadata),
  );

  const insertEntity = db.prepare(`
    INSERT INTO entity(
      qid,primary_category,description_de,description_en,fixture_only,
      popularity_score,popularity_de,popularity_en,popularity_percentile,
      popularity_tier,source_snapshot_id
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertCategory = db.prepare(`
    INSERT INTO entity_category(
      entity_id,category,category_score,category_rank,category_percentile,
      category_tier,retention_percentile_floor,retained_by_category
    ) VALUES(?,?,?,?,?,?,?,?)
  `);
  const insertName = db.prepare(`
    INSERT INTO entity_name(
      entity_id,surface,normalized,language,script,name_kind,
      preferred,searchable,source_kind,source_record
    ) VALUES(?,?,?,?,?,?,?,?,?,?)
  `);
  const insertFts = db.prepare(`
    INSERT INTO entity_name_fts(surface,normalized,entity_id,name_id,language)
    VALUES(?,?,?,?,?)
  `);
  const insertPopularity = db.prepare(`
    INSERT INTO entity_popularity_evidence(
      entity_id,policy,qrank_score,wikipedia_sitelink_count,has_dewiki,has_enwiki,
      external_id_count,statement_count,pageviews_de_score,pageviews_en_score
    ) VALUES(?,?,?,?,?,?,?,?,?,?)
  `);
  const insertExternal = db.prepare(`
    INSERT INTO entity_external_id(entity_id,property_id,system,value)
    VALUES(?,?,?,?)
  `);

  for (const record of prototype.retained) {
    const percentile = overallPercentile(record);
    const result = insertEntity.run(
      record.qid,
      record.primaryCategory,
      record.descriptionDe,
      record.descriptionEn,
      record.fixtureOnly,
      record.popularity.globalScore,
      record.popularity.deScore,
      record.popularity.enScore,
      percentile,
      popularityTier(percentile),
      snapshotId,
    );
    const entityId = Number(result.lastInsertRowid);

    for (const category of record.categories) {
      insertCategory.run(
        entityId,
        category.category,
        category.categoryScore,
        category.categoryRank,
        category.categoryPercentile,
        category.categoryTier,
        category.retentionPercentileFloor,
        category.retainedByCategory,
      );
    }

    for (const name of record.names) {
      const nameResult = insertName.run(
        entityId,
        name.surface,
        name.normalized,
        name.language,
        name.script,
        name.nameKind,
        name.preferred,
        name.searchable,
        name.sourceKind,
        record.qid,
      );
      const nameId = Number(nameResult.lastInsertRowid);
      if (name.searchable) {
        insertFts.run(name.surface, name.normalized, entityId, nameId, name.language);
      }
    }

    const s = record.signals;
    insertPopularity.run(
      entityId,
      ENTITY_POPULARITY_POLICY,
      s.qrankScore,
      s.wikipediaSitelinkCount,
      s.hasDewiki,
      s.hasEnwiki,
      s.externalIdCount,
      s.statementCount,
      s.pageviewsDeScore,
      s.pageviewsEnScore,
    );

    for (const external of record.externalIds) {
      insertExternal.run(entityId, external.propertyId, external.system, external.value);
    }
  }

  const metaInsert = db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  for (const [key, value] of Object.entries({
    schema: ENTITY_DB_SCHEMA,
    taxonomy_policy: prototype.taxonomyPolicy,
    popularity_policy: prototype.popularityPolicy,
    source_snapshot_id: snapshotId,
  })) {
    metaInsert.run(key, String(value));
  }

  return snapshotId;
}

function rows(db, sql) {
  return db.prepare(sql).all();
}

export function computeEntityFingerprint(db) {
  const payload = {
    entity_source_snapshot: rows(db, `
      SELECT snapshot_id,source,snapshot_label,artifact_sha256,license_id,importer_version,metadata_json
      FROM entity_source_snapshot ORDER BY snapshot_id
    `),
    entity: rows(db, `
      SELECT qid,primary_category,description_de,description_en,fixture_only,
        popularity_score,popularity_de,popularity_en,popularity_percentile,
        popularity_tier,source_snapshot_id
      FROM entity ORDER BY qid
    `),
    entity_category: rows(db, `
      SELECT e.qid,c.category,c.category_score,c.category_rank,c.category_percentile,
        c.category_tier,c.retention_percentile_floor,c.retained_by_category
      FROM entity_category c JOIN entity e USING(entity_id)
      ORDER BY e.qid,c.category
    `),
    entity_name: rows(db, `
      SELECT e.qid,n.surface,n.normalized,n.language,n.script,n.name_kind,
        n.preferred,n.searchable,n.source_kind,n.source_record
      FROM entity_name n JOIN entity e USING(entity_id)
      ORDER BY e.qid,n.language,n.normalized
    `),
    entity_popularity_evidence: rows(db, `
      SELECT e.qid,p.policy,p.qrank_score,p.wikipedia_sitelink_count,
        p.has_dewiki,p.has_enwiki,p.external_id_count,p.statement_count,
        p.pageviews_de_score,p.pageviews_en_score
      FROM entity_popularity_evidence p JOIN entity e USING(entity_id)
      ORDER BY e.qid
    `),
    entity_external_id: rows(db, `
      SELECT e.qid,x.property_id,x.system,x.value
      FROM entity_external_id x JOIN entity e USING(entity_id)
      ORDER BY e.qid,x.system,x.value
    `),
  };
  return sha256(JSON.stringify(payload));
}

export function entityStats(db) {
  const scalar = (sql) => Number(Object.values(db.prepare(sql).get())[0]);
  return {
    entities: scalar('SELECT COUNT(*) AS c FROM entity'),
    names: scalar('SELECT COUNT(*) AS c FROM entity_name'),
    categories: scalar('SELECT COUNT(*) AS c FROM entity_category'),
    externalIds: scalar('SELECT COUNT(*) AS c FROM entity_external_id'),
    pronunciations: scalar('SELECT COUNT(*) AS c FROM entity_pronunciation'),
    phoneticAnalyses: scalar('SELECT COUNT(*) AS c FROM entity_phonetic_analysis'),
    fixtureOnlyEntities: scalar('SELECT COUNT(*) AS c FROM entity WHERE fixture_only=1'),
  };
}

export function searchEntityNames(db, query, limit = 20) {
  const normalized = normalizeEntityName(query);
  if (!normalized) return [];
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return db.prepare(`
    SELECT e.qid,e.primary_category,e.popularity_tier,e.popularity_score,
      n.surface,n.language,n.name_kind
    FROM entity_name_fts f
    JOIN entity_name n ON n.name_id=CAST(f.name_id AS INTEGER)
    JOIN entity e ON e.entity_id=n.entity_id
    WHERE entity_name_fts MATCH ?
    ORDER BY e.popularity_score DESC,e.qid,n.preferred DESC,n.name_id
    LIMIT ?
  `).all(`"${normalized.replaceAll('"', '""')}"`, safeLimit);
}

export function sentinelChecks(prototype, taxonomy) {
  const byQid = new Map(prototype.retained.map((row) => [row.qid, row]));
  return (taxonomy.protected_sentinels || []).map((sentinel) => {
    const record = byQid.get(sentinel.qid);
    const category = record?.categories.find((row) => row.category === sentinel.required_category);
    return {
      qid: sentinel.qid,
      name: sentinel.name,
      retained: Boolean(record),
      category: sentinel.required_category,
      categoryTier: category?.categoryTier || null,
      expectedTier: sentinel.expected_tier || null,
      pass: Boolean(record)
        && Boolean(category)
        && (!sentinel.expected_tier || category.categoryTier === sentinel.expected_tier),
    };
  });
}
