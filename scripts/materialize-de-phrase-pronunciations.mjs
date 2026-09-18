#!/usr/bin/env node
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  PHRASE_BOUNDARY_POLICY,
  PHRASE_CITATION_COMPOSITION_POLICY,
  PHRASE_CONNECTED_SPEECH_POLICY,
  PHRASE_IPA_ANALYZER,
  PHRASE_PRONUNCIATION_POLICY,
  PHRASE_PRONUNCIATION_SCHEMA,
  PHRASE_TOKEN_RESOLVER_POLICY,
  materializePhrasePronunciations,
} from './phrase-pronunciation-core.mjs';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let writerDbPath = 'data/local/rhymelab-v5.sqlite';
let reportPath = 'data/local/phrase-pronunciation-v1-report.json';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--phrases') phraseDbPath = args[++i] || phraseDbPath;
  else if (arg === '--writer') writerDbPath = args[++i] || writerDbPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
}

phraseDbPath = resolve(phraseDbPath);
writerDbPath = resolve(writerDbPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

const phraseDb = new DatabaseSync(phraseDbPath);
const writerDb = new DatabaseSync(writerDbPath, { readOnly: true });

try {
  phraseDb.exec('PRAGMA foreign_keys=ON;');
  const result = materializePhrasePronunciations(phraseDb, writerDb);

  const unresolvedTop = phraseDb.prepare([
    'SELECT normalized,COUNT(*) token_count FROM phrase_token_pronunciation_resolution',
    " WHERE status<>'resolved_preferred' GROUP BY normalized",
    ' ORDER BY token_count DESC,normalized LIMIT 100',
  ].join('')).all();

  const multipleWriterCandidates = phraseDb.prepare([
    'SELECT normalized,MAX(normalized_form_candidates) candidate_count,COUNT(*) token_count',
    ' FROM phrase_token_pronunciation_resolution WHERE normalized_form_candidates>1',
    ' GROUP BY normalized ORDER BY token_count DESC,candidate_count DESC,normalized LIMIT 100',
  ].join('')).all();

  const pronunciationCountDistribution = phraseDb.prepare([
    'SELECT available_pronunciations,COUNT(*) token_count',
    ' FROM phrase_token_pronunciation_resolution WHERE status=\'resolved_preferred\'',
    ' GROUP BY available_pronunciations ORDER BY available_pronunciations',
  ].join('')).all();

  const phraseSyllableDistribution = phraseDb.prepare([
    'SELECT syllable_count,COUNT(*) phrase_count FROM phrase_pronunciation',
    ' WHERE eligible=1 GROUP BY syllable_count ORDER BY syllable_count',
  ].join('')).all();

  const sampleReady = phraseDb.prepare([
    'SELECT p.canonical,pp.ipa,pp.syllable_count,pp.stress_pattern,',
    ' pp.word_boundary_phoneme_positions_json,pp.word_boundary_syllable_positions_json',
    ' FROM phrase_pronunciation pp JOIN phrase p ON p.phrase_id=pp.phrase_id',
    ' WHERE pp.eligible=1 ORDER BY p.token_count DESC,p.normalized LIMIT 30',
  ].join('')).all();

  const upsert = phraseDb.prepare([
    'INSERT INTO meta(key,value) VALUES(?,?)',
    ' ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ].join(''));
  const builtAt = new Date().toISOString();
  const meta = {
    phrase_pronunciation_schema: PHRASE_PRONUNCIATION_SCHEMA,
    phrase_pronunciation_policy: PHRASE_PRONUNCIATION_POLICY,
    phrase_token_resolver_policy: PHRASE_TOKEN_RESOLVER_POLICY,
    phrase_citation_composition_policy: PHRASE_CITATION_COMPOSITION_POLICY,
    phrase_boundary_policy: PHRASE_BOUNDARY_POLICY,
    phrase_connected_speech_policy: PHRASE_CONNECTED_SPEECH_POLICY,
    phrase_ipa_analyzer: PHRASE_IPA_ANALYZER,
    phrase_pronunciation_fingerprint: result.pronunciationFingerprint,
    phrase_pronunciation_updated_at: builtAt,
    phrase_pronunciation_writer_db_schema: result.writerSchema,
    phrase_pronunciation_base_catalog_fingerprint: result.baseCatalogFingerprint,
  };
  for (const [key, value] of Object.entries(meta)) upsert.run(key, String(value));

  phraseDb.exec('ANALYZE; PRAGMA optimize;');
  const databaseBytes = (await stat(phraseDbPath)).size;

  const report = {
    schema: 'rhymelab-phrase-pronunciation-build-report-v1',
    status: 'ok',
    built_at: builtAt,
    phrase_database: phraseDbPath,
    writer_database: writerDbPath,
    database_bytes: databaseBytes,
    ...result,
    tokenCoveragePct: Number((result.tokenCoverage * 100).toFixed(2)),
    phraseCoveragePct: Number((result.phraseCoverage * 100).toFixed(2)),
    diagnostics: {
      unresolvedTop,
      multipleWriterCandidates,
      pronunciationCountDistribution,
      phraseSyllableDistribution,
      sampleReady,
    },
    alternatePhraseVariantsGenerated: 0,
    connectedSpeechVariantsGenerated: 0,
    mosaicIndexGenerated: false,
    phraseRankingGenerated: false,
    writerRuntimeRewired: false,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    base_catalog_fingerprint: result.baseCatalogFingerprint,
    phrase_pronunciation_fingerprint: result.pronunciationFingerprint,
    token_resolutions: result.tokenResolutions,
    resolved_tokens: result.resolvedTokens,
    token_coverage_pct: report.tokenCoveragePct,
    ready_phrases: result.readyPhrases,
    ready_modern_phrases: result.readyModernPhrases,
    phrase_coverage_pct: report.phraseCoveragePct,
    unresolved_reasons: result.unresolvedReasonCounts,
    ineligible_phrase_reasons: result.ineligiblePhraseReasonCounts,
    report: reportPath,
  }, null, 2));
} finally {
  writerDb.close();
  phraseDb.close();
}
