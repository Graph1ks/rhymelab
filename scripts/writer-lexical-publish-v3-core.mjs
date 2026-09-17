import { createHash } from 'node:crypto';
import {
  compactWriterLexicalAnalyses,
  compatibilityAnalysis,
  normalizeWriterLexicalAnalyses,
} from './writer-lexical-model-core.mjs';

export const WRITER_LEXICAL_PUBLISH_SCHEMA = 'rhymelab-de-publish-v3';
export const WRITER_LEXICAL_RESOLVER_POLICY = 'de-kaikki-resolution-v1';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function compatibilityFields(analysis) {
  if (!analysis) return {};
  const fields = {};
  if (analysis.lemma) fields.l = analysis.lemma;
  if (analysis.pos && analysis.pos !== 'unknown') fields.p = analysis.pos;
  if (analysis.gender) fields.g = analysis.gender;
  return fields;
}

export function writerLexicalPublishFields(options = []) {
  const analyses = normalizeWriterLexicalAnalyses(options);
  const compactAnalyses = compactWriterLexicalAnalyses(options);
  const compatibility = compatibilityAnalysis(analyses);
  const serialized = JSON.stringify(compactAnalyses);

  return {
    analyses: compactAnalyses,
    compatibility: compatibilityFields(compatibility),
    analysisFingerprint: sha256(serialized),
    analysisCount: compactAnalyses.length,
    resolverPolicy: WRITER_LEXICAL_RESOLVER_POLICY,
  };
}

export function augmentPublishRowV3(baseRow, options = []) {
  const row = { ...baseRow };
  const fields = writerLexicalPublishFields(options);

  if (!fields.analysisCount) return row;

  delete row.l;
  delete row.p;
  delete row.g;
  row.a = fields.analyses;
  Object.assign(row, fields.compatibility);
  return row;
}

export function writerLexicalPublishFingerprint(options = []) {
  return writerLexicalPublishFields(options).analysisFingerprint;
}
