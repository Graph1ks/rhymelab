#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildPhraseMatcher,
  countPhraseMatchesInSentence,
  registerPhraseSnapshot,
  registerPhraseSource,
  snapshotIdFor,
} from './phrase-catalog-core.mjs';
import {
  computeRegisterEvidenceFingerprint,
  ensurePhraseRegisterEvidenceStorage,
  writeRegisterEvidence,
} from './phrase-register-evidence-core.mjs';
import {
  RUEG_REGISTER_POLICY,
  RUEG_REGISTER_SCHEMA,
  computeRuegDetailFingerprint,
  documentIdFor,
  ensureRuegRegisterStorage,
  parseRuegExb,
  parseRuegMeta,
  unitIdFor,
} from './rueg-register-core.mjs';

const args = process.argv.slice(2);
let dbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let manifestPath = 'sources/phrase/rueg-dakoda-de-v1.json';
let reportPath = 'data/local/rueg-register-report.json';
const inputs = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--db') dbPath = args[++i] || dbPath;
  else if (arg === '--manifest') manifestPath = args[++i] || manifestPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--subcorpus') inputs.push(args[++i] || '');
}

function parseInput(value) {
  const at = value.indexOf('=');
  if (at <= 0 || at === value.length - 1) throw new Error('Expected --subcorpus ID=/path/to/extracted/files');
  return { id: value.slice(0, at), root: resolve(value.slice(at + 1)) };
}

async function walk(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else out.push(path);
  }
  return out;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((done, fail) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', fail);
    stream.on('end', done);
  });
  return hash.digest('hex');
}

async function treeFingerprint(root, files) {
  const hash = createHash('sha256');
  for (const path of [...files].sort()) {
    hash.update(relative(root, path).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(await sha256File(path));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function sourceRecordStem(path) {
  return basename(path, extname(path)).toLocaleLowerCase('en-US');
}

function isGermanLanguage(value) {
  const key = String(value ?? '').trim().toLocaleLowerCase('de-DE');
  if (!key) return true;
  return /^(?:de|deu|ger|german|deutsch)(?:\b|$)/u.test(key);
}

function observe(map, value) {
  const key = String(value ?? '').trim() || '(missing)';
  map.set(key, (map.get(key) || 0) + 1);
}
function mapRows(map) {
  return [...map.entries()].map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'de'));
}

dbPath = resolve(dbPath);
manifestPath = resolve(manifestPath);
reportPath = resolve(reportPath);
const parsedInputs = inputs.filter(Boolean).map(parseInput);
if (!parsedInputs.length) throw new Error('Provide at least one --subcorpus ID=/path/to/extracted/files');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const configured = new Map((manifest.subcorpora || []).map((row) => [row.id, row]));
for (const input of parsedInputs) if (!configured.has(input.id)) throw new Error('Unknown subcorpus: ' + input.id);
await mkdir(dirname(reportPath), { recursive: true });

const db = new DatabaseSync(dbPath);
try {
  db.exec('PRAGMA foreign_keys=ON;');
  const schema = db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  if (schema !== 'rhymelab-phrase-catalog-v1') throw new Error('Unexpected phrase DB schema: ' + String(schema || 'missing'));
  ensurePhraseRegisterEvidenceStorage(db);
  ensureRuegRegisterStorage(db);
  registerPhraseSource(db, {
    source_id: manifest.source_id,
    name: manifest.name,
    role: manifest.role,
    homepage_url: manifest.homepage_url,
    license_id: manifest.license_id,
    license_url: manifest.license_url,
    attribution: manifest.attribution,
    redistribution_policy: manifest.redistribution_policy,
  });
  const matcher = buildPhraseMatcher(db);
  const reports = [];

  for (const input of parsedInputs) {
    const config = configured.get(input.id);
    const allFiles = await walk(input.root);
    const exbFiles = allFiles.filter((path) => extname(path).toLocaleLowerCase() === '.exb');
    if (!exbFiles.length) throw new Error('No .exb files found under ' + input.root);
    const metaFiles = allFiles.filter((path) => ['.meta','.xml','.json','.txt'].includes(extname(path).toLocaleLowerCase()) && extname(path).toLocaleLowerCase() !== '.exb' && !basename(path).startsWith('.rhymelab-'));
    const metaByStem = new Map();
    for (const path of metaFiles) {
      const stem = sourceRecordStem(path);
      const list = metaByStem.get(stem) || [];
      list.push(path);
      metaByStem.set(stem, list);
    }
    const artifactSha256 = await treeFingerprint(input.root, [...exbFiles, ...metaFiles]);
    const snapshotIds = {};
    for (const layer of ['dipl', 'norm']) {
      const snapshotLabel = input.id + ':' + layer;
      const snapshotId = snapshotIdFor({ sourceId: manifest.source_id, snapshotLabel, artifactSha256 });
      snapshotIds[layer] = snapshotId;
      const old = db.prepare("SELECT snapshot_id FROM phrase_snapshot WHERE source_id=? AND snapshot_label=?").all(manifest.source_id, snapshotLabel);
      for (const row of old) db.prepare('DELETE FROM phrase_register_evidence WHERE snapshot_id=?').run(row.snapshot_id);
      for (const row of old) db.prepare('DELETE FROM phrase_snapshot WHERE snapshot_id=?').run(row.snapshot_id);
      registerPhraseSnapshot(db, {
        snapshot_id: snapshotId,
        source_id: manifest.source_id,
        snapshot_label: snapshotLabel,
        artifact_path: input.root,
        artifact_sha256: artifactSha256,
        upstream_url: config.exb_url,
        evidence_year: 2023,
        genre: 'rueg_' + layer,
        country: 'DE',
        metadata: { subcorpus: input.id, layer, policy: RUEG_REGISTER_POLICY, corpus_version: manifest.corpus_version },
      });
    }
    db.prepare('DELETE FROM register_document WHERE source_id=? AND subcorpus=?').run(manifest.source_id, input.id);

    const layerAgg = {
      dipl: { occurrences: new Map(), units: new Map(), tokens: 0, unitCount: 0 },
      norm: { occurrences: new Map(), units: new Map(), tokens: 0, unitCount: 0 },
    };
    const observed = { formality: new Map(), mode: new Map(), ageGroup: new Map(), language: new Map(), boundaryType: new Map(), surfaceCategory: new Map(), normCategory: new Map() };
    let documents = 0, metadataMatched = 0, missingMeta = 0, skippedNonGerman = 0, units = 0, different = 0, documentsWithNorm = 0;
    let detailedOccurrenceRows = 0;
    const insertDocument = db.prepare('INSERT INTO register_document(document_id,source_id,subcorpus,source_record_id,speaker_id,formality,mode,age_group,speaker_age,speaker_bilingual,elicitation_language,elicitation_country,elicitation_date,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const insertUnit = db.prepare('INSERT INTO register_unit(unit_id,document_id,unit_index,unit_type,dipl_text,norm_text,languages_json,dipl_token_count,norm_token_count) VALUES(?,?,?,?,?,?,?,?,?)');
    const insertOccurrence = db.prepare('INSERT OR REPLACE INTO phrase_register_occurrence(phrase_id,unit_id,layer,occurrence_count) VALUES(?,?,?,?)');

    db.exec('BEGIN');
    try {
      for (const exbPath of exbFiles.sort()) {
        const stem = sourceRecordStem(exbPath);
        const metaCandidates = metaByStem.get(stem) || [];
        let meta = { raw: {} };
        if (metaCandidates.length) {
          meta = parseRuegMeta(await readFile(metaCandidates[0], 'utf8'));
          metadataMatched += 1;
        } else missingMeta += 1;
        if (meta.elicitationLanguage && !isGermanLanguage(meta.elicitationLanguage)) {
          skippedNonGerman += 1;
          continue;
        }
        const parsed = parseRuegExb(await readFile(exbPath, 'utf8'));
        observe(observed.boundaryType, parsed.unitType);
        observe(observed.surfaceCategory, parsed.surfaceSourceCategory);
        observe(observed.normCategory, parsed.normSourceCategory);
        if (parsed.normAvailable) documentsWithNorm += 1;
        const sourceRecordId = relative(input.root, exbPath).replaceAll('\\', '/');
        const documentId = documentIdFor({ sourceId: manifest.source_id, subcorpus: input.id, sourceRecordId });
        insertDocument.run(documentId, manifest.source_id, input.id, sourceRecordId, meta.speakerId ?? null, meta.formality ?? null, meta.mode ?? null, meta.ageGroup ?? null, meta.speakerAge ?? null, meta.speakerBilingual ?? null, meta.elicitationLanguage ?? null, meta.elicitationCountry ?? null, meta.elicitationDate ?? null, JSON.stringify(meta.raw || {}));
        documents += 1;
        observe(observed.formality, meta.formality); observe(observed.mode, meta.mode); observe(observed.ageGroup, meta.ageGroup); observe(observed.language, meta.elicitationLanguage);
        for (const unit of parsed.units) {
          const unitId = unitIdFor(documentId, unit.index);
          const unitLanguages = unit.languages?.length ? unit.languages : (meta.elicitationLanguage ? [meta.elicitationLanguage] : []);
          insertUnit.run(unitId, documentId, unit.index, unit.unitType, unit.dipl || null, unit.norm || null, JSON.stringify(unitLanguages), unit.diplTokenCount, unit.normTokenCount);
          units += 1;
          if (unit.dipl && unit.norm && unit.dipl !== unit.norm) different += 1;
          for (const layer of ['dipl', 'norm']) {
            const text = unit[layer] || '';
            if (!text) continue;
            const match = countPhraseMatchesInSentence(matcher, text);
            layerAgg[layer].tokens += match.tokenCount;
            layerAgg[layer].unitCount += 1;
            for (const [phraseId, count] of match.counts) {
              insertOccurrence.run(phraseId, unitId, layer, count);
              detailedOccurrenceRows += 1;
              layerAgg[layer].occurrences.set(phraseId, (layerAgg[layer].occurrences.get(phraseId) || 0) + count);
            }
            for (const phraseId of match.seenInSentence) layerAgg[layer].units.set(phraseId, (layerAgg[layer].units.get(phraseId) || 0) + 1);
          }
        }
      }
      if (documents > 0 && units === 0) {
        throw new Error('Parsed ' + documents + ' RUEG documents for ' + input.id + ' but produced zero register units. Refusing a false-success import.');
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const layers = {};
    for (const layer of ['dipl', 'norm']) {
      const agg = layerAgg[layer];
      const rows = writeRegisterEvidence(db, {
        snapshotId: snapshotIds[layer],
        policy: RUEG_REGISTER_POLICY + ':' + layer,
        registerTags: ['rueg', input.id, 'layer:' + layer, 'spoken_written'],
        occurrenceCounts: agg.occurrences,
        unitCounts: agg.units,
        corpusTokenCount: agg.tokens,
        corpusUnitCount: agg.unitCount,
        evidence: { source_manifest: manifest.id, subcorpus: input.id, layer, scope: 'register_evidence_not_population_commonness' },
      });
      layers[layer] = { tokens: agg.tokens, units: agg.unitCount, matchedPhrases: agg.occurrences.size, evidenceRows: rows, phraseOccurrences: [...agg.occurrences.values()].reduce((a,b) => a+b, 0) };
    }
    reports.push({
      subcorpus: input.id, root: input.root, artifactSha256, exbFiles: exbFiles.length, metaFiles: metaFiles.length,
      documents, metadataMatched, missingMeta, skippedNonGerman, units, diplDifferentFromNorm: different,
      documentsWithNorm, normLayerAvailableInExb: documentsWithNorm > 0,
      detailedOccurrenceRows, reportedTokens: config.reported_tokens, layers,
      observed: {
        formality: mapRows(observed.formality), mode: mapRows(observed.mode), ageGroup: mapRows(observed.ageGroup),
        elicitationLanguage: mapRows(observed.language), boundaryType: mapRows(observed.boundaryType),
        surfaceCategory: mapRows(observed.surfaceCategory), normCategory: mapRows(observed.normCategory),
      },
    });
  }

  const detailFingerprint = computeRuegDetailFingerprint(db);
  const aggregateFingerprint = computeRegisterEvidenceFingerprint(db);
  const upsertMeta = db.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  upsertMeta.run('rueg_register_schema', RUEG_REGISTER_SCHEMA);
  upsertMeta.run('rueg_register_policy', RUEG_REGISTER_POLICY);
  upsertMeta.run('rueg_detail_fingerprint', detailFingerprint);
  upsertMeta.run('phrase_register_fingerprint', aggregateFingerprint || '');
  upsertMeta.run('rueg_register_updated_at', new Date().toISOString());
  db.exec('ANALYZE; PRAGMA optimize;');
  const report = {
    schema: 'rhymelab-rueg-register-report-v1', status: 'ok', built_at: new Date().toISOString(),
    database: dbPath, manifest: manifestPath, source_id: manifest.source_id, license_id: manifest.license_id,
    policy: RUEG_REGISTER_POLICY, register_schema: RUEG_REGISTER_SCHEMA,
    detail_fingerprint: detailFingerprint, aggregate_register_fingerprint: aggregateFingerprint,
    subcorpora: reports, candidate_generation: false, population_commonness_claimed: false, runtime_rewired: false,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
