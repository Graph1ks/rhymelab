import { analyzeGermanIpa } from './german-ipa.mjs';
import { germanRightEdgeVowelSuffixKeys } from './german-rhyme-anchors.mjs';

export const WRITER_ANCHOR_POLICY = 'de-right-edge-anchors-v1';
export const WRITER_ANCHOR_STORAGE = 'compact-primary-key-v2';

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

export function writerCandidateSuffixRows(pronunciationId, value) {
  const analysis = analysisFor(value);
  const syllables = Array.isArray(analysis.syllables) ? analysis.syllables : [];
  const nuclei = syllables.map((syllable) => syllable.nucleus).filter(Boolean);
  const rows = [];

  // Query keys are validated secondary-stress anchors. Candidate lookup, however,
  // previously used `vowel_key LIKE '%<query-key>'`. Materializing every complete
  // right-edge nucleus suffix is the boundary-aware indexed equivalent of that
  // candidate-side suffix scan and therefore preserves the validated candidate universe.
  //
  // Candidate-side policy/kind/position metadata is intentionally not stored in SQLite:
  // it is constant for this materialization contract and is already versioned in meta.
  for (let start = 0; start <= nuclei.length - 2; start += 1) {
    const suffix = nuclei.slice(start);
    rows.push({
      pronunciationId: Number(pronunciationId),
      policy: WRITER_ANCHOR_POLICY,
      kind: 'vowel_suffix_lookup',
      anchorPosition: start + 1,
      nuclei: suffix.length,
      key: suffix.join('-'),
    });
  }
  return rows;
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
  const limit = Math.max(1, Math.min(800, Number(options.limit || 800)));
  const preferred = includeVariants ? '' : ' AND h.pronunciation_preferred=1';
  const historical = includeHistorical ? '' : ' AND h.historical=0';

  return db.prepare(`
    SELECT h.*
    FROM writer_anchor a
    JOIN hot h ON h.id=a.pronunciation_id
    WHERE a.anchor_key=?
      AND h.normalized != ?
      AND ABS(h.syllable_count-?) <= 1
      ${preferred}${historical}
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
