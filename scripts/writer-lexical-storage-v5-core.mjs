export const WRITER_LEXICAL_DB_SCHEMA = 'rhymelab-local-db-v5';

export const CREATE_FORM_ANALYSIS_SQL = `
CREATE TABLE form_analysis(
  form_id INTEGER NOT NULL,
  analysis_key TEXT NOT NULL,
  lemma TEXT NOT NULL,
  normalized_lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  homograph_no INTEGER NOT NULL,
  confidence REAL NOT NULL,
  gender TEXT,
  is_proper INTEGER NOT NULL CHECK(is_proper IN (0,1)),
  is_obsolete INTEGER NOT NULL CHECK(is_obsolete IN (0,1)),
  historical_only INTEGER NOT NULL CHECK(historical_only IN (0,1)),
  style_tags TEXT NOT NULL,
  form_features TEXT NOT NULL,
  match_kinds TEXT NOT NULL,
  source_record_keys TEXT NOT NULL,
  candidate_ipas TEXT NOT NULL,
  PRIMARY KEY(form_id, analysis_key)
);
CREATE INDEX idx_form_analysis_lemma_pos
  ON form_analysis(normalized_lemma, pos, form_id);
`;

const sortedUnique = (values) => [...new Set((values || [])
  .map((value) => String(value))
  .filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'de'));

function jsonArray(values) {
  return JSON.stringify(sortedUnique(values));
}

export function compactAnalysisToStorageRow(formId, analysis) {
  if (!Number.isInteger(Number(formId)) || Number(formId) < 1) {
    throw new Error(`Invalid form_id for writer lexical analysis: ${formId}`);
  }
  if (!analysis?.k || !analysis?.l || !analysis?.nl) {
    throw new Error('Compact writer lexical analysis requires k, l and nl fields');
  }

  return {
    formId: Number(formId),
    analysisKey: String(analysis.k),
    lemma: String(analysis.l),
    normalizedLemma: String(analysis.nl),
    pos: String(analysis.p || 'unknown'),
    homographNo: Number(analysis.h || 1),
    confidence: Number(analysis.c || 0),
    gender: analysis.g ?? null,
    isProper: analysis.ip ? 1 : 0,
    isObsolete: analysis.io ? 1 : 0,
    historicalOnly: analysis.ho ? 1 : 0,
    styleTags: jsonArray(analysis.st),
    formFeatures: jsonArray(analysis.ff),
    matchKinds: jsonArray(analysis.mk),
    sourceRecordKeys: jsonArray(analysis.sr),
    candidateIpas: jsonArray(analysis.ci),
  };
}

export function createWriterLexicalStorage(db) {
  db.exec(CREATE_FORM_ANALYSIS_SQL);
}

export function insertWriterLexicalAnalyses(db, formId, compactAnalyses = []) {
  const insert = db.prepare(`
    INSERT INTO form_analysis(
      form_id,analysis_key,lemma,normalized_lemma,pos,homograph_no,confidence,gender,
      is_proper,is_obsolete,historical_only,style_tags,form_features,match_kinds,
      source_record_keys,candidate_ipas
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let inserted = 0;
  for (const compact of compactAnalyses) {
    const row = compactAnalysisToStorageRow(formId, compact);
    insert.run(
      row.formId,
      row.analysisKey,
      row.lemma,
      row.normalizedLemma,
      row.pos,
      row.homographNo,
      row.confidence,
      row.gender,
      row.isProper,
      row.isObsolete,
      row.historicalOnly,
      row.styleTags,
      row.formFeatures,
      row.matchKinds,
      row.sourceRecordKeys,
      row.candidateIpas,
    );
    inserted += 1;
  }
  return inserted;
}

export function readWriterLexicalAnalyses(db, formId) {
  return db.prepare(`
    SELECT
      form_id,analysis_key,lemma,normalized_lemma,pos,homograph_no,confidence,gender,
      is_proper,is_obsolete,historical_only,style_tags,form_features,match_kinds,
      source_record_keys,candidate_ipas
    FROM form_analysis
    WHERE form_id=?
    ORDER BY confidence DESC, analysis_key
  `).all(Number(formId)).map((row) => ({
    ...row,
    style_tags: JSON.parse(row.style_tags),
    form_features: JSON.parse(row.form_features),
    match_kinds: JSON.parse(row.match_kinds),
    source_record_keys: JSON.parse(row.source_record_keys),
    candidate_ipas: JSON.parse(row.candidate_ipas),
  }));
}
