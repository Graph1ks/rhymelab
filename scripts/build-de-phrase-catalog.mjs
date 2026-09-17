#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import {
  PHRASE_CATALOG_DB_SCHEMA,
  PHRASE_CATALOG_POLICY,
  LEIPZIG_MATCH_POLICY,
  buildPhraseMatcher,
  computePhraseCatalogFingerprint,
  countPhraseMatchesInSentence,
  createPhraseCatalogStorage,
  extractWiktextractPhrase,
  insertWiktextractPhrase,
  phraseCatalogStats,
  registerPhraseSnapshot,
  registerPhraseSource,
  snapshotIdFor,
  writeLeipzigUsageEvidence,
} from './phrase-catalog-core.mjs';

const args = process.argv.slice(2);
let registryPath = 'sources/phrase/de-phase11b1-v1.json';
let leipzigManifestPath = 'sources/leipzig/de10k-v1-frozen.json';
let wiktextractPath = '';
let wiktionarySnapshotLabel = '';
let wiktionaryUpstreamUrl = '';
let outPath = 'data/local/rhymelab-phrases-v1.sqlite';
let reportPath = 'data/local/phrase-catalog-v1-report.json';
const leipzigSentenceArgs = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--registry') registryPath = args[++i] || registryPath;
  else if (arg === '--leipzig-manifest') leipzigManifestPath = args[++i] || leipzigManifestPath;
  else if (arg === '--wiktextract') wiktextractPath = args[++i] || '';
  else if (arg === '--wiktionary-snapshot') wiktionarySnapshotLabel = args[++i] || '';
  else if (arg === '--wiktionary-upstream-url') wiktionaryUpstreamUrl = args[++i] || '';
  else if (arg === '--leipzig-sentences') leipzigSentenceArgs.push(args[++i] || '');
  else if (arg === '--out') outPath = args[++i] || outPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
}

if (!wiktextractPath || !wiktionarySnapshotLabel) {
  console.error(
    'Usage: node scripts/build-de-phrase-catalog.mjs '
    + '--wiktextract <raw-wiktextract-data.jsonl[.gz]> '
    + '--wiktionary-snapshot <label> '
    + '[--leipzig-sentences corpus_code=/path/to/*_sentences.txt] '
    + '[--out data/local/rhymelab-phrases-v1.sqlite]',
  );
  process.exit(1);
}

registryPath = resolve(registryPath);
leipzigManifestPath = resolve(leipzigManifestPath);
wiktextractPath = resolve(wiktextractPath);
outPath = resolve(outPath);
reportPath = resolve(reportPath);

function parseLeipzigArg(value) {
  const split = value.indexOf('=');
  if (split <= 0 || split === value.length - 1) {
    throw new Error(`Invalid --leipzig-sentences value "${value}", expected corpus_code=/path/to/file`);
  }
  return {
    code: value.slice(0, split),
    path: resolve(value.slice(split + 1)),
  };
}

const leipzigInputs = leipzigSentenceArgs.filter(Boolean).map(parseLeipzigArg);

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

function lineReader(path) {
  const source = createReadStream(path);
  const input = path.endsWith('.gz') ? source.pipe(createGunzip()) : source;
  return readline.createInterface({ input, crlfDelay: Infinity });
}

function sourceFromRegistry(registry, sourceId) {
  const source = (registry.sources || []).find((item) => item.source_id === sourceId);
  if (!source) throw new Error(`Phrase source registry missing source_id=${sourceId}`);
  return source;
}

function leipzigCorpusByCode(manifest, code) {
  const corpus = (manifest.corpora || []).find((item) => item.code === code);
  if (!corpus) throw new Error(`Leipzig manifest does not contain corpus code: ${code}`);
  return corpus;
}

await mkdir(dirname(outPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });
await rm(outPath, { force: true });

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const leipzigManifest = JSON.parse(await readFile(leipzigManifestPath, 'utf8'));
const wiktionarySource = sourceFromRegistry(registry, 'dewiktionary-kaikki-raw');
const leipzigSource = sourceFromRegistry(registry, 'leipzig-corpora');

const wiktextractSha256 = await sha256File(wiktextractPath);
const wiktionarySnapshotId = snapshotIdFor({
  sourceId: wiktionarySource.source_id,
  snapshotLabel: wiktionarySnapshotLabel,
  artifactSha256: wiktextractSha256,
});

const db = new DatabaseSync(outPath);
try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY;');
  createPhraseCatalogStorage(db);
  registerPhraseSource(db, wiktionarySource);
  registerPhraseSource(db, leipzigSource);

  registerPhraseSnapshot(db, {
    snapshot_id: wiktionarySnapshotId,
    source_id: wiktionarySource.source_id,
    snapshot_label: wiktionarySnapshotLabel,
    artifact_path: wiktextractPath,
    artifact_sha256: wiktextractSha256,
    upstream_url: wiktionaryUpstreamUrl || wiktionarySource.upstream_url || null,
    metadata: {
      registry_id: registry.id,
      importer_policy: PHRASE_CATALOG_POLICY,
      local_file: basename(wiktextractPath),
    },
  });

  let wiktextractLines = 0;
  let malformedWiktextractLines = 0;
  let germanEntries = 0;
  let candidatePhraseEntries = 0;
  let insertedAttestations = 0;

  db.exec('BEGIN');
  try {
    const rl = lineReader(wiktextractPath);
    for await (const line of rl) {
      if (!line) continue;
      wiktextractLines += 1;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        malformedWiktextractLines += 1;
        continue;
      }
      if (entry?.lang_code === 'de') germanEntries += 1;
      const record = extractWiktextractPhrase(entry, registry.wiktionary_policy || {});
      if (!record) continue;
      candidatePhraseEntries += 1;
      insertedAttestations += insertWiktextractPhrase(db, wiktionarySnapshotId, record);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const matcher = buildPhraseMatcher(db);
  const leipzigReports = [];

  for (const input of leipzigInputs) {
    const corpus = leipzigCorpusByCode(leipzigManifest, input.code);
    const inputSha256 = await sha256File(input.path);
    const snapshotId = snapshotIdFor({
      sourceId: leipzigSource.source_id,
      snapshotLabel: corpus.code,
      artifactSha256: inputSha256,
    });

    registerPhraseSnapshot(db, {
      snapshot_id: snapshotId,
      source_id: leipzigSource.source_id,
      snapshot_label: corpus.code,
      artifact_path: input.path,
      artifact_sha256: inputSha256,
      upstream_url: corpus.url,
      evidence_year: corpus.year,
      genre: corpus.genre,
      country: corpus.country,
      metadata: {
        parent_archive_sha256: corpus.sha256,
        parent_archive_sha256_status: corpus.sha256_status,
        expected_sentences: corpus.sentences,
        importer_policy: LEIPZIG_MATCH_POLICY,
      },
    });

    const occurrenceCounts = new Map();
    const sentenceCounts = new Map();
    let corpusTokenCount = 0;
    let corpusSentenceCount = 0;
    let malformedSentenceRows = 0;

    const rl = lineReader(input.path);
    for await (const line of rl) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      const sentence = tab >= 0 ? line.slice(tab + 1) : line;
      if (!sentence.trim()) {
        malformedSentenceRows += 1;
        continue;
      }
      corpusSentenceCount += 1;
      const result = countPhraseMatchesInSentence(matcher, sentence);
      corpusTokenCount += result.tokenCount;
      for (const [phraseId, count] of result.counts) {
        occurrenceCounts.set(phraseId, (occurrenceCounts.get(phraseId) || 0) + count);
      }
      for (const phraseId of result.seenInSentence) {
        sentenceCounts.set(phraseId, (sentenceCounts.get(phraseId) || 0) + 1);
      }
    }

    db.exec('BEGIN');
    try {
      const evidenceRows = writeLeipzigUsageEvidence(db, {
        snapshotId,
        occurrenceCounts,
        sentenceCounts,
        corpusTokenCount,
        corpusSentenceCount,
        evidence: {
          corpus_code: corpus.code,
          genre: corpus.genre,
          year: corpus.year,
          country: corpus.country,
          source_manifest: leipzigManifest.id,
        },
      });
      db.exec('COMMIT');
      leipzigReports.push({
        corpusCode: corpus.code,
        snapshotId,
        file: input.path,
        sha256: inputSha256,
        sentences: corpusSentenceCount,
        tokens: corpusTokenCount,
        malformedSentenceRows,
        matchedPhrases: occurrenceCounts.size,
        usageEvidenceRows: evidenceRows,
      });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const fingerprint = computePhraseCatalogFingerprint(db);
  const stats = phraseCatalogStats(db);
  const metaInsert = db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  const builtAt = new Date().toISOString();
  for (const [key, value] of Object.entries({
    schema: PHRASE_CATALOG_DB_SCHEMA,
    policy: PHRASE_CATALOG_POLICY,
    language: 'de',
    built_at: builtAt,
    registry_id: registry.id,
    wiktionary_snapshot_id: wiktionarySnapshotId,
    catalog_fingerprint: fingerprint,
  })) {
    metaInsert.run(key, String(value));
  }

  db.exec('ANALYZE; PRAGMA optimize;');
  const fileBytes = (await stat(outPath)).size;
  const report = {
    schema: 'rhymelab-phrase-catalog-build-report-v1',
    catalog_schema: PHRASE_CATALOG_DB_SCHEMA,
    policy: PHRASE_CATALOG_POLICY,
    status: 'ok',
    built_at: builtAt,
    database: outPath,
    database_bytes: fileBytes,
    registry: registryPath,
    registry_id: registry.id,
    catalog_fingerprint: fingerprint,
    wiktionary: {
      snapshotId: wiktionarySnapshotId,
      snapshotLabel: wiktionarySnapshotLabel,
      file: wiktextractPath,
      sha256: wiktextractSha256,
      lines: wiktextractLines,
      malformedLines: malformedWiktextractLines,
      germanEntries,
      candidatePhraseEntries,
      insertedAttestations,
    },
    leipzig: leipzigReports,
    stats,
    runtime_rewired: false,
    phrase_pronunciation_generated: false,
    mosaic_index_generated: false,
    phrase_ranking_generated: false,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
