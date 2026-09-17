#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildPhraseMatcher,
  countPhraseMatchesInSentence,
  registerPhraseSnapshot,
  registerPhraseSource,
  snapshotIdFor,
  tokenizePhrase,
} from './phrase-catalog-core.mjs';
import {
  COLOGNE_KIEZDEUTSCH_MATCH_POLICY,
  PHRASE_REGISTER_EVIDENCE_SCHEMA,
  cleanConversationTranscriptLine,
  computeRegisterEvidenceFingerprint,
  ensurePhraseRegisterEvidenceStorage,
  registerEvidenceStats,
  writeRegisterEvidence,
} from './phrase-register-evidence-core.mjs';
import { extractPdfVisualLines } from './cologne-kiezdeutsch-pdf.mjs';

const args = process.argv.slice(2);
let dbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let manifestPath = 'sources/phrase/cologne-kiezdeutsch-2025-v2.json';
let reportPath = 'data/local/cologne-kiezdeutsch-register-report.json';
const pdfArgs = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--db') dbPath = args[++i] || dbPath;
  else if (arg === '--manifest') manifestPath = args[++i] || manifestPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--pdf') pdfArgs.push(args[++i] || '');
}

function parsePdfArg(value) {
  const split = value.indexOf('=');
  if (split <= 0 || split === value.length - 1) {
    throw new Error('Invalid --pdf value "' + value + '", expected GROUP=/path/to/transcript.pdf');
  }
  return {
    group: value.slice(0, split),
    path: resolve(value.slice(split + 1)),
  };
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

function sourceFromManifest(manifest) {
  return {
    source_id: manifest.source_id,
    name: manifest.name,
    role: manifest.role,
    homepage_url: manifest.homepage_url,
    license_id: manifest.license_id,
    license_url: manifest.license_url,
    attribution: manifest.attribution,
    redistribution_policy: manifest.redistribution_policy,
  };
}

dbPath = resolve(dbPath);
manifestPath = resolve(manifestPath);
reportPath = resolve(reportPath);
const pdfInputs = pdfArgs.filter(Boolean).map(parsePdfArg);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (!pdfInputs.length) {
  throw new Error('At least one --pdf GROUP=/path/to/transcript.pdf input is required.');
}

const manifestByGroup = new Map((manifest.files || []).map((file) => [file.group, file]));
for (const input of pdfInputs) {
  if (!manifestByGroup.has(input.group)) {
    throw new Error('Manifest does not contain transcript group ' + input.group);
  }
}

await mkdir(dirname(reportPath), { recursive: true });

const db = new DatabaseSync(dbPath);
try {
  db.exec('PRAGMA foreign_keys=ON;');
  const meta = Object.fromEntries(
    db.prepare('SELECT key,value FROM meta').all().map((row) => [row.key, row.value]),
  );
  if (meta.schema !== 'rhymelab-phrase-catalog-v1') {
    throw new Error('Unexpected phrase catalog schema: ' + String(meta.schema || 'missing'));
  }

  ensurePhraseRegisterEvidenceStorage(db);
  registerPhraseSource(db, sourceFromManifest(manifest));
  const matcher = buildPhraseMatcher(db);
  const groups = [];

  for (const input of pdfInputs) {
    const fileInfo = manifestByGroup.get(input.group);
    const artifactSha256 = await sha256File(input.path);
    const snapshotLabel = manifest.id + ':' + input.group;
    const snapshotId = snapshotIdFor({
      sourceId: manifest.source_id,
      snapshotLabel,
      artifactSha256,
    });

    registerPhraseSnapshot(db, {
      snapshot_id: snapshotId,
      source_id: manifest.source_id,
      snapshot_label: snapshotLabel,
      artifact_path: input.path,
      artifact_sha256: artifactSha256,
      upstream_url: fileInfo.url,
      evidence_year: manifest.recording_year,
      genre: 'informal_spoken_youth',
      country: 'DE',
      metadata: {
        group: input.group,
        speaker_group: fileInfo.speaker_group,
        source_manifest: manifest.id,
        doi: manifest.doi,
        importer_policy: COLOGNE_KIEZDEUTSCH_MATCH_POLICY,
        unit: manifest.ingestion_policy?.unit || 'transcript_line',
      },
    });

    const visualLines = await extractPdfVisualLines(input.path);
    const occurrenceCounts = new Map();
    const unitCounts = new Map();
    let corpusTokenCount = 0;
    let corpusUnitCount = 0;
    let discardedLines = 0;

    for (const line of visualLines) {
      const cleaned = cleanConversationTranscriptLine(line.text);
      if (!cleaned) {
        discardedLines += 1;
        continue;
      }

      const tokenCount = tokenizePhrase(cleaned).length;
      if (!tokenCount) {
        discardedLines += 1;
        continue;
      }

      corpusUnitCount += 1;
      corpusTokenCount += tokenCount;
      const result = countPhraseMatchesInSentence(matcher, cleaned);
      for (const [phraseId, count] of result.counts) {
        occurrenceCounts.set(phraseId, (occurrenceCounts.get(phraseId) || 0) + count);
      }
      for (const phraseId of result.seenInSentence) {
        unitCounts.set(phraseId, (unitCounts.get(phraseId) || 0) + 1);
      }
    }

    db.exec('BEGIN');
    try {
      const evidenceRows = writeRegisterEvidence(db, {
        snapshotId,
        policy: COLOGNE_KIEZDEUTSCH_MATCH_POLICY,
        registerTags: [
          ...(manifest.register || []),
          'speaker_group:' + fileInfo.speaker_group,
          'location:cologne',
          'recording_year:' + manifest.recording_year,
        ],
        occurrenceCounts,
        unitCounts,
        corpusTokenCount,
        corpusUnitCount,
        evidence: {
          source_manifest: manifest.id,
          group: input.group,
          speaker_group: fileInfo.speaker_group,
          recording_year: manifest.recording_year,
          reported_corpus_tokens: manifest.reported_tokens,
          role: manifest.role,
          frequency_scope: 'register_evidence_not_population_commonness',
        },
      });
      db.exec('COMMIT');

      groups.push({
        group: input.group,
        speakerGroup: fileInfo.speaker_group,
        snapshotId,
        file: input.path,
        sha256: artifactSha256,
        visualLines: visualLines.length,
        cleanedUnits: corpusUnitCount,
        cleanedTokens: corpusTokenCount,
        discardedLines,
        matchedPhrases: occurrenceCounts.size,
        evidenceRows,
        totalPhraseOccurrences: [...occurrenceCounts.values()].reduce((a, b) => a + b, 0),
      });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const fingerprint = computeRegisterEvidenceFingerprint(db);
  const stats = registerEvidenceStats(db);
  const updatedAt = new Date().toISOString();
  const upsertMeta = db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);
  for (const [key, value] of Object.entries({
    phrase_register_schema: PHRASE_REGISTER_EVIDENCE_SCHEMA,
    phrase_register_policy: COLOGNE_KIEZDEUTSCH_MATCH_POLICY,
    phrase_register_fingerprint: fingerprint || '',
    phrase_register_updated_at: updatedAt,
    cologne_kiezdeutsch_manifest: manifest.id,
  })) {
    upsertMeta.run(key, String(value));
  }

  db.exec('ANALYZE; PRAGMA optimize;');

  const cleanedTokens = groups.reduce((sum, group) => sum + group.cleanedTokens, 0);
  const reportedTokens = Number(manifest.reported_tokens || 0);
  const report = {
    schema: 'rhymelab-phrase-register-cologne-report-v1',
    status: 'ok',
    built_at: updatedAt,
    database: dbPath,
    source_manifest: manifestPath,
    source_id: manifest.source_id,
    source_version: manifest.version,
    license_id: manifest.license_id,
    policy: COLOGNE_KIEZDEUTSCH_MATCH_POLICY,
    register_evidence_schema: PHRASE_REGISTER_EVIDENCE_SCHEMA,
    register_evidence_fingerprint: fingerprint,
    reported_tokens: reportedTokens,
    cleaned_tokens: cleanedTokens,
    cleaned_to_reported_token_ratio: reportedTokens > 0
      ? Number((cleanedTokens / reportedTokens).toFixed(4))
      : null,
    groups,
    stats,
    candidate_generation: false,
    population_commonness_claimed: false,
    runtime_rewired: false,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
