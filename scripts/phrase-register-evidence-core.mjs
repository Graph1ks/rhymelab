import { createHash } from 'node:crypto';

export const PHRASE_REGISTER_EVIDENCE_SCHEMA = 'rhymelab-phrase-register-evidence-v1';
export const COLOGNE_KIEZDEUTSCH_MATCH_POLICY = 'cologne-kiezdeutsch-register-exact-token-sequence-v1';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function sortedUnique(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'de'));
}

export const CREATE_PHRASE_REGISTER_EVIDENCE_SQL = \`
CREATE TABLE IF NOT EXISTS phrase_register_evidence(
  phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id),
  snapshot_id TEXT NOT NULL REFERENCES phrase_snapshot(snapshot_id),
  policy TEXT NOT NULL,
  register_tags_json TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL,
  unit_count INTEGER NOT NULL,
  corpus_token_count INTEGER NOT NULL,
  corpus_unit_count INTEGER NOT NULL,
  per_million_tokens REAL NOT NULL,
  per_million_units REAL NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(phrase_id, snapshot_id, policy)
);
CREATE INDEX IF NOT EXISTS idx_phrase_register_phrase
  ON phrase_register_evidence(phrase_id, policy);
CREATE INDEX IF NOT EXISTS idx_phrase_register_snapshot
  ON phrase_register_evidence(snapshot_id, policy);
\`;

export function ensurePhraseRegisterEvidenceStorage(db) {
  db.exec(CREATE_PHRASE_REGISTER_EVIDENCE_SQL);
}

export function cleanConversationTranscriptLine(value) {
  let line = String(value ?? '').normalize('NFKC').replace(/\\u00ad/gu, '').trim();
  if (!line) return '';

  line = line
    .replace(/^\\s*\\d{1,5}\\s+/u, '')
    .replace(/^\\s*(?:ME|MO)\\s*\\d+[A-Z]?\\s*[:\\-–—]?\\s*/iu, '')
    .replace(/^\\s*[A-ZÄÖÜ]{1,5}\\d{0,3}\\s*[:\\-–—]\\s*/u, '')
    .replace(/<[^>]{1,100}>/gu, ' ')
    .replace(/\\{[^}]{1,100}\\}/gu, ' ')
    .replace(/\\[(?:[^\\]]{0,100})\\]/gu, ' ')
    .replace(/\\((?:laughs?|laughter|pause|coughs?|breathes?|unintelligible|unclear|overlap|smiles?|sniffs?|sighs?)[^)]*\\)/giu, ' ')
    .replace(/\\(\\s*\\.{1,3}\\s*\\)/gu, ' ')
    .replace(/\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b/gu, ' ')
    .replace(/\\s+/gu, ' ')
    .trim();

  const lower = line.toLocaleLowerCase('de-DE');
  if (
    !line
    || /^\\d+$/u.test(line)
    || lower.includes('kölner korpus des kiezdeutschen')
    || lower.includes('cologne corpus of kiezdeutsch')
    || /^transcript(?:ion)?\\b/u.test(lower)
    || /^seite\\s+\\d+/u.test(lower)
    || /^page\\s+\\d+/u.test(lower)
  ) {
    return '';
  }

  return line;
}

export function writeRegisterEvidence(db, {
  snapshotId,
  policy,
  registerTags,
  occurrenceCounts,
  unitCounts,
  corpusTokenCount,
  corpusUnitCount,
  evidence = {},
}) {
  const insert = db.prepare(\`
    INSERT INTO phrase_register_evidence(
      phrase_id,snapshot_id,policy,register_tags_json,occurrence_count,unit_count,
      corpus_token_count,corpus_unit_count,per_million_tokens,per_million_units,evidence_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(phrase_id,snapshot_id,policy) DO UPDATE SET
      register_tags_json=excluded.register_tags_json,
      occurrence_count=excluded.occurrence_count,
      unit_count=excluded.unit_count,
      corpus_token_count=excluded.corpus_token_count,
      corpus_unit_count=excluded.corpus_unit_count,
      per_million_tokens=excluded.per_million_tokens,
      per_million_units=excluded.per_million_units,
      evidence_json=excluded.evidence_json
  \`);

  let rows = 0;
  const tags = JSON.stringify(sortedUnique(registerTags));
  const phraseIds = [...occurrenceCounts.keys()].sort((a, b) => a.localeCompare(b));
  for (const phraseId of phraseIds) {
    const occurrences = Number(occurrenceCounts.get(phraseId) || 0);
    if (occurrences <= 0) continue;
    const units = Number(unitCounts.get(phraseId) || 0);
    insert.run(
      phraseId,
      snapshotId,
      policy,
      tags,
      occurrences,
      units,
      corpusTokenCount,
      corpusUnitCount,
      corpusTokenCount > 0 ? occurrences * 1_000_000 / corpusTokenCount : 0,
      corpusUnitCount > 0 ? units * 1_000_000 / corpusUnitCount : 0,
      JSON.stringify(evidence),
    );
    rows += 1;
  }
  return rows;
}

function tableExists(db, table) {
  return Boolean(db.prepare(\`
    SELECT 1
    FROM sqlite_master
    WHERE type='table' AND name=?
  \`).get(table));
}

export function computeRegisterEvidenceFingerprint(db) {
  if (!tableExists(db, 'phrase_register_evidence')) return null;
  const rows = db.prepare(\`
    SELECT
      phrase_id,snapshot_id,policy,register_tags_json,occurrence_count,unit_count,
      corpus_token_count,corpus_unit_count,per_million_tokens,per_million_units,evidence_json
    FROM phrase_register_evidence
    ORDER BY phrase_id,snapshot_id,policy
  \`).all();
  return sha256(JSON.stringify(rows));
}

export function registerEvidenceStats(db) {
  if (!tableExists(db, 'phrase_register_evidence')) {
    return {
      rows: 0,
      matchedPhrases: 0,
      snapshots: 0,
      occurrences: 0,
    };
  }
  const row = db.prepare(\`
    SELECT
      COUNT(*) AS rows,
      COUNT(DISTINCT phrase_id) AS matched_phrases,
      COUNT(DISTINCT snapshot_id) AS snapshots,
      COALESCE(SUM(occurrence_count),0) AS occurrences
    FROM phrase_register_evidence
  \`).get();
  return {
    rows: Number(row.rows),
    matchedPhrases: Number(row.matched_phrases),
    snapshots: Number(row.snapshots),
    occurrences: Number(row.occurrences),
  };
}
