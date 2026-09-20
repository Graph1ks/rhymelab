import { analyzeGermanIpa } from './german-ipa.mjs';
import { germanRightEdgeVowelSuffixKeys } from './german-rhyme-anchors.mjs';

export const WRITER_ANCHOR_POLICY = 'de-right-edge-anchors-v1';
export const WRITER_ANCHOR_STORAGE = 'compact-primary-key-v2';
export const WRITER_ANCHOR_CANDIDATE_BASIS = 'legacy-vowel-key-string-suffix-v1';

export const CREATE_WRITER_ANCHOR_SQL = `
CREATE TABLE IF NOT EXISTS writer_anchor(
  anchor_key TEXT NOT NULL,
  pronunciation_id INTEGER NOT NULL,
  PRIMARY KEY(anchor_key, pronunciation_id)
) WITHOUT ROWID;
`;

const INSERT_WRITER_ANCHOR_SQL = `
  INSERT OR IGNORE INTO writer_anchor(anchor_key,pronunciation_id)
  VALUES(?,?)
`;

function analysisFor(value) {
  if (value && typeof value === 'object' && Array.isArray(value.syllables)) return value;
  return analyzeGermanIpa(String(value || ''));
}

export function writerQueryAnchorKeys(value) {
  const analysis = analysisFor(value);
  return germanRightEdgeVowelSuffixKeys(analysis).map((entry) => ({
    policy: WRITER_ANCHOR_POLICY,
    kind: entry.kind,
    anchorPosition: entry.anchorPosition,
    nuclei: entry.nuclei,
    key: entry.key,
  }));
}

function legacyVowelKeyStringSuffixes(vowelKey) {
  const chars = Array.from(String(vowelKey || ''));
  const suffixes = [];
  const seen = new Set();

  // The validation runtime used SQLite `vowel_key LIKE '%<query-key>'`.
  // Query keys always contain at least two nuclei and therefore at least one '-'.
  // Materializing every non-hyphen-leading string suffix that still contains '-'
  // exactly preserves that string-suffix behavior, including cases where LIKE can
  // begin inside a multi-code-point canonical nucleus such as aɪ.
  for (let start = 0; start < chars.length; start += 1) {
    const suffix = chars.slice(start).join('');
    if (!suffix.includes('-') || suffix.startsWith('-') || seen.has(suffix)) continue;
    seen.add(suffix);
    suffixes.push(suffix);
  }
  return suffixes;
}

export function writerCandidateSuffixRows(pronunciationId, value) {
  const analysis = analysisFor(value);
  const vowelKey = String(analysis.vowelKey || '');
  return legacyVowelKeyStringSuffixes(vowelKey).map((key, index) => ({
    pronunciationId: Number(pronunciationId),
    policy: WRITER_ANCHOR_POLICY,
    kind: 'legacy_vowel_key_string_suffix_lookup',
    anchorPosition: index + 1,
    nuclei: key.split('-').length,
    key,
  }));
}

export function createWriterAnchorStorage(db) {
  db.exec(CREATE_WRITER_ANCHOR_SQL);
}

export function prepareWriterAnchorInsert(db) {
  return db.prepare(INSERT_WRITER_ANCHOR_SQL);
}

export function insertWriterCandidateSuffixRows(db, pronunciationId, value, preparedInsert = null) {
  const insert = preparedInsert || prepareWriterAnchorInsert(db);
  const rows = writerCandidateSuffixRows(pronunciationId, value);
  for (const row of rows) insert.run(row.key, row.pronunciationId);
  return rows.length;
}

export function lookupWriterAnchorRows(db, anchorKey, options = {}) {
  const queryNormalized = String(options.queryNormalized || '');
  const querySyllables = Number(options.querySyllables || 0);
  const includeVariants = options.includeVariants === true;
  const includeHistorical = options.includeHistorical === true;
  const generatedOnly = options.generatedOnly === true;
  const limit = Math.max(1, Math.min(800, Number(options.limit || 800)));
  const preferred = includeVariants ? '' : ' AND h.pronunciation_preferred=1';
  const historical = includeHistorical ? '' : ' AND h.historical=0';
  const generated = generatedOnly ? " AND h.pronunciation_flags LIKE '%secondary_opt_in%'" : '';

  return db.prepare(`
    SELECT h.*
    FROM writer_anchor a
    JOIN hot h ON h.id=a.pronunciation_id
    WHERE a.anchor_key=?
      AND h.normalized != ?
      AND ABS(h.syllable_count-?) <= 1
      ${preferred}${historical}${generated}
    ORDER BY ABS(h.syllable_count-?), h.usage_rank IS NULL, h.usage_rank, h.id
    LIMIT ?
  `).all(
    String(anchorKey),
    queryNormalized,
    querySyllables,
    querySyllables,
    limit,
  );
}

export function writerAnchorLookupPlan(db, anchorKey) {
  return db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT h.id
    FROM writer_anchor a
    JOIN hot h ON h.id=a.pronunciation_id
    WHERE a.anchor_key=?
  `).all(String(anchorKey));
}
