import {
  WRITER_MORPHOLOGY_POLICY,
  rightHeadSplitCandidates,
} from '../src/writer-morphology.mjs';
import { resolveWriterFamilyConsensus } from './writer-lexical-model-core.mjs';

export { WRITER_MORPHOLOGY_POLICY };

export const CREATE_WRITER_MORPHOLOGY_EVIDENCE_SQL = `
CREATE TABLE IF NOT EXISTS writer_morphology_evidence(
  form_id INTEGER NOT NULL,
  analysis_key TEXT NOT NULL,
  morphology_policy TEXT NOT NULL,
  status TEXT NOT NULL,
  family_key TEXT,
  construction_rule TEXT,
  split_index INTEGER,
  left_normalized TEXT,
  right_normalized TEXT,
  right_head_analysis_key TEXT,
  evidence_json TEXT NOT NULL,
  PRIMARY KEY(form_id, analysis_key, morphology_policy)
);
CREATE INDEX IF NOT EXISTS idx_writer_morphology_family
  ON writer_morphology_evidence(morphology_policy, family_key, form_id);
`;

const INSERT_EVIDENCE_SQL = `
  INSERT INTO writer_morphology_evidence(
    form_id,analysis_key,morphology_policy,status,family_key,construction_rule,
    split_index,left_normalized,right_normalized,right_head_analysis_key,evidence_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
`;

const ADVERBIAL_WEISE_POS = new Set(['adv', 'adj']);

function normalizeSurface(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE');
}

function normalizePos(value) {
  const pos = normalizeSurface(value);
  if (pos === 'adjective') return 'adj';
  if (pos === 'adverb') return 'adv';
  if (pos === 'proper_noun') return 'name';
  return pos || null;
}

function normalizedAnalysis(row) {
  return {
    analysisKey: String(row?.analysisKey || row?.analysis_key || row?.k || ''),
    lemma: normalizeSurface(row?.normalizedLemma || row?.normalized_lemma || row?.nl || row?.lemma || row?.l),
    pos: normalizePos(row?.pos || row?.p),
  };
}

function ordinaryHeadCompatible(wholePos, rightPos) {
  if (wholePos === 'noun') return rightPos === 'noun';
  if (wholePos === 'adj') return rightPos === 'adj';
  return false;
}

function constructionRule(whole, right) {
  if (ADVERBIAL_WEISE_POS.has(whole.pos) && right.pos === 'noun' && right.lemma === 'weise') {
    return 'de-adverbial-weise-v2';
  }
  return null;
}

function measuredUsage(row) {
  const rank = Number(row?.usageRank ?? row?.usage_rank);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function evidenceFor(attested, normalized) {
  return attested instanceof Map ? attested.get(normalizeSurface(normalized)) || null : null;
}

function rightAnalyses(row) {
  const analyses = Array.isArray(row?.analyses) ? row.analyses : [];
  return analyses.map(normalizedAnalysis).filter((analysis) => analysis.analysisKey && analysis.lemma);
}

export function deriveWriterMorphologyForAnalysis(form, analysis, attested) {
  const normalized = normalizeSurface(form?.normalized || form?.surface || form?.word);
  const whole = normalizedAnalysis(analysis);
  const unresolved = () => ({
    analysisKey: whole.analysisKey,
    policy: WRITER_MORPHOLOGY_POLICY,
    status: 'unresolved',
    familyKey: null,
    source: 'materialized_multi_analysis_right_head_evidence',
    wholeLemma: whole.lemma || null,
    wholePartOfSpeech: whole.pos,
  });
  if (!normalized || !whole.analysisKey || !whole.lemma) return unresolved();

  const valid = [];
  for (const candidate of rightHeadSplitCandidates(normalized)) {
    const rightEvidence = evidenceFor(attested, candidate.right);
    if (!rightEvidence) continue;
    const leftEvidence = candidate.leftVariants
      .map((variant) => ({
        variant,
        row: evidenceFor(attested, variant.normalized),
      }))
      .filter((entry) => measuredUsage(entry.row) != null)
      .sort((a, b) => a.variant.cost - b.variant.cost
        || measuredUsage(a.row) - measuredUsage(b.row))[0];
    if (!leftEvidence) continue;

    for (const right of rightAnalyses(rightEvidence)) {
      const rule = constructionRule(whole, right);
      const ordinaryCompatible = ordinaryHeadCompatible(whole.pos, right.pos);
      if (!ordinaryCompatible && !rule) continue;
      if (!whole.lemma.endsWith(right.lemma)) continue;

      valid.push({
        candidate,
        leftEvidence,
        rightEvidence,
        right,
        rule,
        ordinaryCompatible,
      });
    }
  }

  valid.sort((a, b) => a.right.lemma.length - b.right.lemma.length
    || a.leftEvidence.variant.cost - b.leftEvidence.variant.cost
    || b.candidate.splitIndex - a.candidate.splitIndex
    || Number(measuredUsage(a.rightEvidence) ?? Number.MAX_SAFE_INTEGER)
      - Number(measuredUsage(b.rightEvidence) ?? Number.MAX_SAFE_INTEGER)
    || a.right.analysisKey.localeCompare(b.right.analysisKey, 'de'));

  const best = valid[0];
  if (!best) return unresolved();

  return {
    analysisKey: whole.analysisKey,
    policy: WRITER_MORPHOLOGY_POLICY,
    status: 'attested_right_head_candidate',
    familyKey: `right:${best.right.lemma}`,
    source: best.rule
      ? 'materialized_multi_analysis_explicit_construction_evidence'
      : 'materialized_multi_analysis_lemma_pos_suffix_evidence',
    wholeLemma: whole.lemma,
    wholePartOfSpeech: whole.pos,
    constructionRule: best.rule,
    split: {
      index: best.candidate.splitIndex,
      leftRaw: best.candidate.leftRaw,
      right: best.candidate.right,
    },
    leftEvidence: {
      normalized: best.leftEvidence.variant.normalized,
      surface: best.leftEvidence.row?.surface || null,
      usageRank: measuredUsage(best.leftEvidence.row),
      transformation: best.leftEvidence.variant.transformation,
      linker: best.leftEvidence.variant.linker,
    },
    rightHead: {
      normalized: best.candidate.right,
      surface: best.rightEvidence?.surface || null,
      analysisKey: best.right.analysisKey,
      lemma: best.right.lemma,
      partOfSpeech: best.right.pos,
      usageRank: measuredUsage(best.rightEvidence),
    },
    checks: {
      wholeLemmaEndsWithRightLemma: true,
      headPartOfSpeechCompatible: best.ordinaryCompatible,
      explicitConstructionRule: best.rule,
      leftHasMeasuredUsageEvidence: true,
    },
  };
}

export function deriveWriterMorphologyForForm(form, analyses = [], attested = new Map()) {
  const evidence = analyses
    .map((analysis) => deriveWriterMorphologyForAnalysis(form, analysis, attested))
    .sort((a, b) => String(a.analysisKey).localeCompare(String(b.analysisKey), 'de'));
  return {
    evidence,
    consensus: resolveWriterFamilyConsensus(evidence),
  };
}

export function createWriterMorphologyEvidenceStorage(db) {
  db.exec(CREATE_WRITER_MORPHOLOGY_EVIDENCE_SQL);
}

export function prepareWriterMorphologyEvidenceInsert(db) {
  return db.prepare(INSERT_EVIDENCE_SQL);
}

export function insertWriterMorphologyEvidence(db, formId, evidenceRows = [], preparedInsert = null) {
  const insert = preparedInsert || prepareWriterMorphologyEvidenceInsert(db);
  let inserted = 0;
  for (const evidence of evidenceRows) {
    if (!evidence?.analysisKey) throw new Error('Writer morphology evidence requires analysisKey');
    insert.run(
      Number(formId),
      String(evidence.analysisKey),
      WRITER_MORPHOLOGY_POLICY,
      String(evidence.status || 'unresolved'),
      evidence.familyKey ?? null,
      evidence.constructionRule ?? null,
      evidence.split?.index ?? null,
      evidence.leftEvidence?.normalized ?? null,
      evidence.rightHead?.normalized ?? null,
      evidence.rightHead?.analysisKey ?? null,
      JSON.stringify(evidence),
    );
    inserted += 1;
  }
  return inserted;
}
