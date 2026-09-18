import { createHash } from 'node:crypto';

export const PHRASE_CATALOG_DB_SCHEMA = 'rhymelab-phrase-catalog-v1';
export const PHRASE_CATALOG_POLICY = 'de-phrase-catalog-v1';
export const LEIPZIG_MATCH_POLICY = 'leipzig-exact-token-sequence-v1';

const HISTORICAL_MARKERS = new Set([
  'archaic','obsolete','dated','historical','old-fashioned',
  'archaisch','veraltet','historisch',
]);

const STYLE_MARKERS = new Set([
  'slang','colloquial','informal','vulgar','offensive','derogatory',
  'rare','regional','dialectal','poetic','formal',
  'umgangssprachlich','salopp','vulgär','regional','dialektal','poetisch','gehoben',
]);

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function normalizePhraseText(value) {
  return cleanText(value).toLocaleLowerCase('de-DE');
}

export function tokenizePhrase(value) {
  const source = cleanText(value);
  const tokens = [];
  const re = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
  for (const match of source.matchAll(re)) {
    tokens.push({
      index: tokens.length,
      surface: match[0],
      normalized: match[0].normalize('NFKC').toLocaleLowerCase('de-DE'),
      charStart: match.index,
      charEnd: match.index + match[0].length,
    });
  }
  return tokens;
}

export function tokenKey(tokens) {
  return tokens.map((token) => token.normalized).join('\u001f');
}

function sortedUnique(values) {
  return [...new Set((values || []).map((value) => cleanText(value)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'de'));
}

function normalizedMarkers(values) {
  return sortedUnique(values).map((value) => value
    .toLocaleLowerCase('de-DE')
    .replaceAll('_', ' ')
    .replaceAll('-', ' '));
}

function senseRows(entry) {
  return Array.isArray(entry?.senses) ? entry.senses : [];
}

function evidenceValues(entry) {
  const senses = senseRows(entry);
  return sortedUnique([
    ...(Array.isArray(entry?.tags) ? entry.tags : []),
    ...(Array.isArray(entry?.raw_tags) ? entry.raw_tags : []),
    ...(Array.isArray(entry?.categories) ? entry.categories : []),
    ...senses.flatMap((sense) => Array.isArray(sense?.tags) ? sense.tags : []),
    ...senses.flatMap((sense) => Array.isArray(sense?.raw_tags) ? sense.raw_tags : []),
    ...senses.flatMap((sense) => Array.isArray(sense?.categories) ? sense.categories : []),
  ]);
}

function hasHistoricalMarker(values) {
  const markers = normalizedMarkers(values);
  return markers.some((value) =>
    HISTORICAL_MARKERS.has(value)
    || /\b(archaisch|archaic|obsolete|veraltet|dated|historisch|historical)\b/u.test(value)
  );
}

function historicalState(entry) {
  const entryEvidence = [
    ...(Array.isArray(entry?.tags) ? entry.tags : []),
    ...(Array.isArray(entry?.raw_tags) ? entry.raw_tags : []),
  ];
  if (hasHistoricalMarker(entryEvidence)) return 'historical_only';

  const senses = senseRows(entry);
  if (!senses.length) return 'current_or_unmarked';
  const states = senses.map((sense) => hasHistoricalMarker([
    ...(Array.isArray(sense?.tags) ? sense.tags : []),
    ...(Array.isArray(sense?.raw_tags) ? sense.raw_tags : []),
    ...(Array.isArray(sense?.categories) ? sense.categories : []),
  ]));
  if (states.every(Boolean)) return 'historical_only';
  if (states.some(Boolean)) return 'mixed';
  return 'current_or_unmarked';
}

function phraseTypes(entry, tokens) {
  const pos = cleanText(entry?.pos || entry?.pos_title).toLocaleLowerCase('de-DE');
  const markers = normalizedMarkers(evidenceValues(entry));
  const types = new Set();

  const has = (pattern) => markers.some((value) => pattern.test(value));
  if (has(/sprichw[oö]rt|proverb/u)) types.add('proverb');
  if (has(/redewendung|idiom/u)) types.add('idiom');
  if (has(/phraseolog|feste[rn]? ausdruck|fixed expression/u)) types.add('fixed_expression');
  if (has(/figurativ|figürlich|metaphor/u)) types.add('figurative_expression');
  if (pos === 'phrase' || pos.includes('phrase')) types.add('phrase');
  if (!types.size && tokens.length >= 2) types.add('multiword_lexeme');

  return [...types].sort((a, b) => a.localeCompare(b, 'en'));
}

function styleTags(entry) {
  const out = [];
  for (const raw of evidenceValues(entry)) {
    const normalized = raw.toLocaleLowerCase('de-DE');
    if (STYLE_MARKERS.has(normalized)) out.push(normalized);
  }
  return sortedUnique(out);
}

function sourceRecordPayload(entry) {
  const senses = senseRows(entry).map((sense) => ({
    tags: sortedUnique(sense?.tags),
    raw_tags: sortedUnique(sense?.raw_tags),
    categories: sortedUnique(sense?.categories),
    form_of: (Array.isArray(sense?.form_of) ? sense.form_of : [])
      .map((item) => cleanText(item?.word))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'de')),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));

  return {
    word: cleanText(entry?.word),
    pos: cleanText(entry?.pos),
    pos_title: cleanText(entry?.pos_title),
    etymology_number: entry?.etymology_number ?? entry?.etymology_index ?? null,
    tags: sortedUnique(entry?.tags),
    raw_tags: sortedUnique(entry?.raw_tags),
    categories: sortedUnique(entry?.categories),
    senses,
  };
}

export function wiktextractSourceRecordId(entry) {
  return `dewiktionary:${sha256(JSON.stringify(sourceRecordPayload(entry))).slice(0, 24)}`;
}

export function phraseIdForNormalized(normalized) {
  return `phrase:${sha256(normalized).slice(0, 24)}`;
}

export function snapshotIdFor({ sourceId, snapshotLabel, artifactSha256 }) {
  return `snapshot:${sha256(JSON.stringify([
    String(sourceId),
    String(snapshotLabel),
    String(artifactSha256 || ''),
  ])).slice(0, 24)}`;
}

export function extractWiktextractPhrase(entry, {
  minimumTokens = 2,
  maximumTokens = 16,
  maximumCharacters = 240,
} = {}) {
  if (entry?.lang_code !== 'de') return null;
  const canonical = cleanText(entry?.word);
  if (!canonical || canonical.length > maximumCharacters) return null;

  const tokens = tokenizePhrase(canonical);
  if (tokens.length < minimumTokens || tokens.length > maximumTokens) return null;

  const normalized = normalizePhraseText(canonical);
  const types = phraseTypes(entry, tokens);
  const history = historicalState(entry);
  const rawTags = evidenceValues(entry);
  const categories = sortedUnique([
    ...(Array.isArray(entry?.categories) ? entry.categories : []),
    ...senseRows(entry).flatMap((sense) => Array.isArray(sense?.categories) ? sense.categories : []),
  ]);

  return {
    phraseId: phraseIdForNormalized(normalized),
    canonical,
    normalized,
    tokenKey: tokenKey(tokens),
    tokenCount: tokens.length,
    phraseTypes: types,
    historicalState: history,
    modernEligible: history === 'historical_only' ? 0 : 1,
    identityFingerprint: sha256(JSON.stringify([normalized, tokenKey(tokens)])),
    sourceRecordId: wiktextractSourceRecordId(entry),
    sourcePos: cleanText(entry?.pos || entry?.pos_title) || 'unknown',
    styleTags: styleTags(entry),
    rawTags,
    categories,
    tokens,
  };
}

export const CREATE_PHRASE_CATALOG_SQL = `
CREATE TABLE meta(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE phrase_source(
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  homepage_url TEXT,
  license_id TEXT NOT NULL,
  license_url TEXT,
  attribution TEXT,
  redistribution_policy TEXT
);

CREATE TABLE phrase_snapshot(
  snapshot_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES phrase_source(source_id),
  snapshot_label TEXT NOT NULL,
  artifact_path TEXT,
  artifact_sha256 TEXT,
  upstream_url TEXT,
  evidence_year INTEGER,
  genre TEXT,
  country TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE phrase(
  phrase_id TEXT PRIMARY KEY,
  canonical TEXT NOT NULL,
  normalized TEXT NOT NULL,
  token_key TEXT NOT NULL,
  token_count INTEGER NOT NULL CHECK(token_count > 0),
  phrase_types_json TEXT NOT NULL,
  historical_state TEXT NOT NULL,
  modern_eligible INTEGER NOT NULL CHECK(modern_eligible IN (0,1)),
  identity_fingerprint TEXT NOT NULL
);

CREATE TABLE phrase_attestation(
  attestation_id TEXT PRIMARY KEY,
  phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id),
  snapshot_id TEXT NOT NULL REFERENCES phrase_snapshot(snapshot_id),
  source_record_id TEXT NOT NULL,
  source_pos TEXT,
  phrase_types_json TEXT NOT NULL,
  style_tags_json TEXT NOT NULL,
  raw_tags_json TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  historical_state TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(snapshot_id, source_record_id, phrase_id)
);

CREATE TABLE phrase_token(
  phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id),
  token_index INTEGER NOT NULL,
  surface TEXT NOT NULL,
  normalized TEXT NOT NULL,
  char_start INTEGER NOT NULL,
  char_end INTEGER NOT NULL,
  lexical_state TEXT NOT NULL DEFAULT 'unresolved',
  lexical_form_id INTEGER,
  PRIMARY KEY(phrase_id, token_index)
);

CREATE TABLE phrase_usage_evidence(
  phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id),
  snapshot_id TEXT NOT NULL REFERENCES phrase_snapshot(snapshot_id),
  policy TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL,
  sentence_count INTEGER NOT NULL,
  corpus_token_count INTEGER NOT NULL,
  corpus_sentence_count INTEGER NOT NULL,
  per_million_tokens REAL NOT NULL,
  per_million_sentences REAL NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(phrase_id, snapshot_id, policy)
);

CREATE TABLE phrase_semantic_link(
  phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id),
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(phrase_id, source_id, external_id, relation_type)
);

CREATE INDEX idx_phrase_normalized ON phrase(normalized);
CREATE INDEX idx_phrase_token_key ON phrase(token_key);
CREATE INDEX idx_phrase_modern ON phrase(modern_eligible, historical_state);
CREATE INDEX idx_phrase_attestation_phrase ON phrase_attestation(phrase_id, snapshot_id);
CREATE INDEX idx_phrase_usage_phrase ON phrase_usage_evidence(phrase_id, policy);
`;

export function createPhraseCatalogStorage(db) {
  db.exec(CREATE_PHRASE_CATALOG_SQL);
}

export function registerPhraseSource(db, source) {
  db.prepare(`
    INSERT INTO phrase_source(
      source_id,name,role,homepage_url,license_id,license_url,attribution,redistribution_policy
    ) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(source_id) DO UPDATE SET
      name=excluded.name,
      role=excluded.role,
      homepage_url=excluded.homepage_url,
      license_id=excluded.license_id,
      license_url=excluded.license_url,
      attribution=excluded.attribution,
      redistribution_policy=excluded.redistribution_policy
  `).run(
    source.source_id,
    source.name,
    source.role,
    source.homepage_url ?? null,
    source.license_id,
    source.license_url ?? null,
    source.attribution ?? null,
    source.redistribution_policy ?? null,
  );
}

export function registerPhraseSnapshot(db, snapshot) {
  db.prepare(`
    INSERT INTO phrase_snapshot(
      snapshot_id,source_id,snapshot_label,artifact_path,artifact_sha256,upstream_url,
      evidence_year,genre,country,metadata_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(snapshot_id) DO UPDATE SET
      artifact_path=excluded.artifact_path,
      upstream_url=excluded.upstream_url,
      evidence_year=excluded.evidence_year,
      genre=excluded.genre,
      country=excluded.country,
      metadata_json=excluded.metadata_json
  `).run(
    snapshot.snapshot_id,
    snapshot.source_id,
    snapshot.snapshot_label,
    snapshot.artifact_path ?? null,
    snapshot.artifact_sha256 ?? null,
    snapshot.upstream_url ?? null,
    snapshot.evidence_year ?? null,
    snapshot.genre ?? null,
    snapshot.country ?? null,
    JSON.stringify(snapshot.metadata ?? {}),
  );
}

function mergeJsonSet(existingJson, incoming) {
  let existing = [];
  try { existing = JSON.parse(existingJson || '[]'); } catch {}
  return JSON.stringify(sortedUnique([...existing, ...(incoming || [])]));
}

function mergeHistoricalState(a, b) {
  if (!a) return b;
  if (!b || a === b) return a;
  if (a === 'mixed' || b === 'mixed') return 'mixed';
  return 'mixed';
}

export function insertWiktextractPhrase(db, snapshotId, record) {
  const existing = db.prepare('SELECT * FROM phrase WHERE phrase_id=?').get(record.phraseId);
  if (!existing) {
    db.prepare(`
      INSERT INTO phrase(
        phrase_id,canonical,normalized,token_key,token_count,phrase_types_json,
        historical_state,modern_eligible,identity_fingerprint
      ) VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
      record.phraseId,
      record.canonical,
      record.normalized,
      record.tokenKey,
      record.tokenCount,
      JSON.stringify(record.phraseTypes),
      record.historicalState,
      record.modernEligible,
      record.identityFingerprint,
    );
    const insertToken = db.prepare(`
      INSERT INTO phrase_token(
        phrase_id,token_index,surface,normalized,char_start,char_end,lexical_state,lexical_form_id
      ) VALUES(?,?,?,?,?,?,?,NULL)
    `);
    for (const token of record.tokens) {
      insertToken.run(
        record.phraseId,
        token.index,
        token.surface,
        token.normalized,
        token.charStart,
        token.charEnd,
        'unresolved',
      );
    }
  } else {
    const history = mergeHistoricalState(existing.historical_state, record.historicalState);
    db.prepare(`
      UPDATE phrase
      SET phrase_types_json=?, historical_state=?, modern_eligible=?
      WHERE phrase_id=?
    `).run(
      mergeJsonSet(existing.phrase_types_json, record.phraseTypes),
      history,
      history === 'historical_only' ? 0 : 1,
      record.phraseId,
    );
  }

  const attestationId = `attestation:${sha256(JSON.stringify([
    snapshotId,
    record.sourceRecordId,
    record.phraseId,
  ])).slice(0, 24)}`;

  const result = db.prepare(`
    INSERT OR IGNORE INTO phrase_attestation(
      attestation_id,phrase_id,snapshot_id,source_record_id,source_pos,
      phrase_types_json,style_tags_json,raw_tags_json,categories_json,
      historical_state,evidence_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    attestationId,
    record.phraseId,
    snapshotId,
    record.sourceRecordId,
    record.sourcePos,
    JSON.stringify(record.phraseTypes),
    JSON.stringify(record.styleTags),
    JSON.stringify(record.rawTags),
    JSON.stringify(record.categories),
    record.historicalState,
    JSON.stringify({ mapping_policy: PHRASE_CATALOG_POLICY }),
  );

  return Number(result.changes || 0);
}

export function buildPhraseMatcher(db) {
  const rows = db.prepare(`
    SELECT phrase_id,token_key,token_count
    FROM phrase
    WHERE modern_eligible=1
    ORDER BY token_count DESC, phrase_id
  `).all();

  const byFirst = new Map();
  for (const row of rows) {
    const tokens = String(row.token_key).split('\u001f').filter(Boolean);
    if (!tokens.length) continue;
    const bucket = byFirst.get(tokens[0]) || [];
    bucket.push({ phraseId: row.phrase_id, tokens });
    byFirst.set(tokens[0], bucket);
  }
  for (const bucket of byFirst.values()) {
    bucket.sort((a, b) => b.tokens.length - a.tokens.length || a.phraseId.localeCompare(b.phraseId));
  }
  return byFirst;
}

export function countPhraseMatchesInSentence(matcher, sentence) {
  const tokens = tokenizePhrase(sentence).map((token) => token.normalized);
  const counts = new Map();
  const seenInSentence = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    const candidates = matcher.get(tokens[index]);
    if (!candidates) continue;
    for (const candidate of candidates) {
      if (index + candidate.tokens.length > tokens.length) continue;
      let matches = true;
      for (let offset = 0; offset < candidate.tokens.length; offset += 1) {
        if (tokens[index + offset] !== candidate.tokens[offset]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      counts.set(candidate.phraseId, (counts.get(candidate.phraseId) || 0) + 1);
      seenInSentence.add(candidate.phraseId);
    }
  }

  return { tokenCount: tokens.length, counts, seenInSentence };
}

export function writeLeipzigUsageEvidence(db, {
  snapshotId,
  policy = LEIPZIG_MATCH_POLICY,
  occurrenceCounts,
  sentenceCounts,
  corpusTokenCount,
  corpusSentenceCount,
  evidence = {},
}) {
  const insert = db.prepare(`
    INSERT INTO phrase_usage_evidence(
      phrase_id,snapshot_id,policy,occurrence_count,sentence_count,
      corpus_token_count,corpus_sentence_count,per_million_tokens,
      per_million_sentences,evidence_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(phrase_id,snapshot_id,policy) DO UPDATE SET
      occurrence_count=excluded.occurrence_count,
      sentence_count=excluded.sentence_count,
      corpus_token_count=excluded.corpus_token_count,
      corpus_sentence_count=excluded.corpus_sentence_count,
      per_million_tokens=excluded.per_million_tokens,
      per_million_sentences=excluded.per_million_sentences,
      evidence_json=excluded.evidence_json
  `);

  let rows = 0;
  const phraseIds = [...occurrenceCounts.keys()].sort((a, b) => a.localeCompare(b));
  for (const phraseId of phraseIds) {
    const occurrences = occurrenceCounts.get(phraseId) || 0;
    if (occurrences <= 0) continue;
    const sentenceCount = sentenceCounts.get(phraseId) || 0;
    insert.run(
      phraseId,
      snapshotId,
      policy,
      occurrences,
      sentenceCount,
      corpusTokenCount,
      corpusSentenceCount,
      corpusTokenCount > 0 ? occurrences * 1_000_000 / corpusTokenCount : 0,
      corpusSentenceCount > 0 ? sentenceCount * 1_000_000 / corpusSentenceCount : 0,
      JSON.stringify(evidence),
    );
    rows += 1;
  }
  return rows;
}

function rowsForFingerprint(db, table, columns, orderBy) {
  return db.prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY ${orderBy}`).all();
}

export function computePhraseCatalogFingerprint(db) {
  // The Phase 11B1 catalog fingerprint intentionally covers only source/snapshot
  // rows that participate in the core phrase-attestation or Leipzig-usage graph.
  // Additive register layers reuse phrase_source/phrase_snapshot for
  // provenance, but must not mutate the frozen B1 semantic fingerprint.
  const phraseSource = db.prepare(`
    SELECT
      src.source_id,src.name,src.role,src.homepage_url,src.license_id,src.license_url,
      src.attribution,src.redistribution_policy
    FROM phrase_source src
    WHERE EXISTS (
      SELECT 1
      FROM phrase_snapshot s
      JOIN phrase_attestation a ON a.snapshot_id=s.snapshot_id
      WHERE s.source_id=src.source_id
    )
    OR EXISTS (
      SELECT 1
      FROM phrase_snapshot s
      JOIN phrase_usage_evidence u ON u.snapshot_id=s.snapshot_id
      WHERE s.source_id=src.source_id
    )
    ORDER BY src.source_id
  `).all();
  const phraseSnapshot = db.prepare(`
    SELECT
      s.snapshot_id,s.source_id,s.snapshot_label,s.artifact_sha256,s.upstream_url,
      s.evidence_year,s.genre,s.country,s.metadata_json
    FROM phrase_snapshot s
    WHERE EXISTS (
      SELECT 1 FROM phrase_attestation a WHERE a.snapshot_id=s.snapshot_id
    )
    OR EXISTS (
      SELECT 1 FROM phrase_usage_evidence u WHERE u.snapshot_id=s.snapshot_id
    )
    ORDER BY s.snapshot_id
  `).all();

  const payload = {
    phrase_source: phraseSource,
    phrase_snapshot: phraseSnapshot,
    phrase: rowsForFingerprint(db, 'phrase', [
      'phrase_id','canonical','normalized','token_key','token_count','phrase_types_json',
      'historical_state','modern_eligible','identity_fingerprint',
    ], 'phrase_id'),
    phrase_attestation: rowsForFingerprint(db, 'phrase_attestation', [
      'attestation_id','phrase_id','snapshot_id','source_record_id','source_pos',
      'phrase_types_json','style_tags_json','raw_tags_json','categories_json','historical_state','evidence_json',
    ], 'attestation_id'),
    phrase_token: rowsForFingerprint(db, 'phrase_token', [
      'phrase_id','token_index','surface','normalized','char_start','char_end','lexical_state','lexical_form_id',
    ], 'phrase_id,token_index'),
    phrase_usage_evidence: rowsForFingerprint(db, 'phrase_usage_evidence', [
      'phrase_id','snapshot_id','policy','occurrence_count','sentence_count',
      'corpus_token_count','corpus_sentence_count','per_million_tokens','per_million_sentences','evidence_json',
    ], 'phrase_id,snapshot_id,policy'),
  };
  return sha256(JSON.stringify(payload));
}

export function phraseCatalogStats(db) {
  const scalar = (sql) => Number(Object.values(db.prepare(sql).get())[0]);
  return {
    phrases: scalar('SELECT COUNT(*) AS c FROM phrase'),
    modernEligiblePhrases: scalar('SELECT COUNT(*) AS c FROM phrase WHERE modern_eligible=1'),
    historicalOnlyPhrases: scalar("SELECT COUNT(*) AS c FROM phrase WHERE historical_state='historical_only'"),
    mixedHistoricalPhrases: scalar("SELECT COUNT(*) AS c FROM phrase WHERE historical_state='mixed'"),
    attestations: scalar('SELECT COUNT(*) AS c FROM phrase_attestation'),
    tokens: scalar('SELECT COUNT(*) AS c FROM phrase_token'),
    usageEvidenceRows: scalar('SELECT COUNT(*) AS c FROM phrase_usage_evidence'),
    unresolvedTokens: scalar("SELECT COUNT(*) AS c FROM phrase_token WHERE lexical_state='unresolved'"),
  };
}
