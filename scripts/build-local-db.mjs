#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { analyzeGermanIpa } from './german-ipa.mjs';
import { coarseCodaClass } from './german-rhyme-features.mjs';

const args = process.argv.slice(2);
let publishDir = 'data/de/publish';
let dbPath = 'data/local/rhymelab.sqlite';
let reportPath = 'data/local/build-report.json';
let rankingPath = 'data/de/usage/de-usage.tsv';
let supplementalPath = 'data/supplemental/modern-entities.json';
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--publish') publishDir = args[++i] || publishDir;
  else if (arg === '--out') dbPath = args[++i] || dbPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--ranking') rankingPath = args[++i] || rankingPath;
  else if (arg === '--supplemental') supplementalPath = args[++i] || supplementalPath;
}
publishDir = resolve(publishDir);
dbPath = resolve(dbPath);
reportPath = resolve(reportPath);
rankingPath = resolve(rankingPath);
supplementalPath = resolve(supplementalPath);

const manifest = JSON.parse(await readFile(join(publishDir, 'manifest.json'), 'utf8'));
if (manifest.schema !== 'rhymelab-de-publish-v2') throw new Error(`Unexpected publish schema: ${manifest.schema}`);

const normalizeWord = (value) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('de-DE');
function readUsageRanking(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { bySurface: new Map(), byNormalized: new Map() };
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((name, index) => [name, index]));
  const bySurface = new Map();
  const byNormalized = new Map();
  for (const line of lines.slice(1)) {
    const c = line.split('\t');
    const rank = Number.parseInt(c[idx.rank] || '', 10);
    const form = String(c[idx.form] || '').normalize('NFKC').trim();
    if (!Number.isInteger(rank) || !form) continue;
    const row = {
      rank,
      form,
      normalized: c[idx.normalized_form] || normalizeWord(form),
      score: idx.usage_score === undefined ? null : Number(c[idx.usage_score]),
      count: idx.combined_count === undefined ? null : Number.parseInt(c[idx.combined_count] || '0', 10),
      sourceCount: idx.source_count === undefined ? null : Number.parseInt(c[idx.source_count] || '0', 10),
    };
    bySurface.set(form, row);
    const current = byNormalized.get(row.normalized);
    if (!current || row.rank < current.rank) byNormalized.set(row.normalized, row);
  }
  return { bySurface, byNormalized };
}

let usageRanking = { bySurface: new Map(), byNormalized: new Map() };
try { usageRanking = readUsageRanking(await readFile(rankingPath, 'utf8')); } catch {}
let supplemental = { entries: [] };
try { supplemental = JSON.parse(await readFile(supplementalPath, 'utf8')); } catch {}

await mkdir(dirname(dbPath), { recursive: true });
await rm(dbPath, { force: true });
const db = new DatabaseSync(dbPath);
const scalar = (sql) => Number(Object.values(db.prepare(sql).get())[0]);
const bytesNow = () => scalar('PRAGMA page_count') * scalar('PRAGMA page_size');
const mib = (bytes) => Number((bytes / 1024 / 1024).toFixed(2));

try {
  db.exec(`
    PRAGMA journal_mode=OFF;
    PRAGMA synchronous=OFF;
    PRAGMA temp_store=MEMORY;
    PRAGMA cache_size=-200000;
    CREATE TABLE meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE hot(
      id INTEGER PRIMARY KEY,
      publish_order INTEGER NOT NULL,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      usage_rank INTEGER,
      usage_score REAL,
      usage_count INTEGER,
      usage_source_count INTEGER,
      lemma TEXT,
      pos TEXT,
      gender TEXT,
      lexicon_layer TEXT NOT NULL DEFAULT 'dictionary',
      entity_kind TEXT,
      historical INTEGER NOT NULL DEFAULT 0 CHECK(historical IN (0,1)),
      lexical_tags TEXT NOT NULL DEFAULT '[]',
      ipa TEXT NOT NULL,
      phonemes TEXT NOT NULL,
      syllable_count INTEGER NOT NULL,
      stress TEXT NOT NULL,
      primary_stress INTEGER NOT NULL,
      rhyme_tail TEXT NOT NULL,
      final_tail TEXT NOT NULL,
      vowels TEXT NOT NULL,
      consonants TEXT NOT NULL,
      exact_key TEXT NOT NULL,
      multisyllable_key TEXT,
      vowel_key TEXT NOT NULL,
      vowel_family TEXT NOT NULL,
      coda_key TEXT NOT NULL,
      coda_class TEXT NOT NULL,
      rhyme_syllables INTEGER NOT NULL,
      pronunciation_rank INTEGER NOT NULL,
      pronunciation_preferred INTEGER NOT NULL,
      pronunciation_eligible INTEGER NOT NULL,
      pronunciation_evidence INTEGER NOT NULL,
      pronunciation_source_order INTEGER NOT NULL,
      pronunciation_source TEXT NOT NULL,
      pronunciation_tags TEXT NOT NULL,
      pronunciation_raw_tags TEXT NOT NULL,
      pronunciation_flags TEXT NOT NULL,
      locale TEXT,
      dialect TEXT,
      pronunciation_register TEXT
    );
  `);

  const columns = 'publish_order,surface,normalized,usage_rank,usage_score,usage_count,usage_source_count,lemma,pos,gender,lexicon_layer,entity_kind,historical,lexical_tags,ipa,phonemes,syllable_count,stress,primary_stress,rhyme_tail,final_tail,vowels,consonants,exact_key,multisyllable_key,vowel_key,vowel_family,coda_key,coda_class,rhyme_syllables,pronunciation_rank,pronunciation_preferred,pronunciation_eligible,pronunciation_evidence,pronunciation_source_order,pronunciation_source,pronunciation_tags,pronunciation_raw_tags,pronunciation_flags,locale,dialect,pronunciation_register';
  const insert = db.prepare(`INSERT INTO hot(${columns}) VALUES(${Array(42).fill('?').join(',')})`);

  let rows = 0;
  let forms = 0;
  let usageRankedForms = 0;
  let preferredRows = 0;
  let historicalForms = 0;

  for (const [index, fileInfo] of manifest.files.entries()) {
    const text = await readFile(join(publishDir, fileInfo.file), 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    db.exec('BEGIN');
    try {
      for (const line of lines) {
        const word = JSON.parse(line);
        const usage = usageRanking.bySurface.get(word.w) || null;
        forms += 1;
        if (word.u !== undefined) usageRankedForms += 1;
        if (word.h === 1) historicalForms += 1;
        for (const p of word.r || []) {
          insert.run(
            word.o, word.w, word.n, word.u ?? null, word.s ?? null,
            Number.isFinite(usage?.count) ? usage.count : null,
            Number.isFinite(usage?.sourceCount) ? usage.sourceCount : null,
            word.l ?? null, word.p ?? null, word.g ?? null,
            'dictionary', null, word.h === 1 ? 1 : 0, JSON.stringify(Array.isArray(word.lt) ? word.lt : []),
            p.i, p.ph, p.sc, p.st, p.ps, p.rt, p.ft, p.v, p.c, p.e, p.m ?? null, p.vk, p.vf, p.ck ?? '', p.cc, p.rs,
            p.pr, p.pf, p.el, p.ev, p.so,
            manifest.pronunciation_source || 'German Wiktionary via Kaikki/wiktextract',
            JSON.stringify(p.tg || []), JSON.stringify(p.rg || []), JSON.stringify(p.fg || []), p.lo ?? null, p.di ?? null, p.re ?? null,
          );
          rows += 1;
          preferredRows += p.pf ? 1 : 0;
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    if ((index + 1) % 100 === 0 || index + 1 === manifest.files.length) {
      console.log(`Loaded ${forms.toLocaleString('de-DE')} forms / ${rows.toLocaleString('de-DE')} pronunciations (${index + 1}/${manifest.files.length} shards)`);
    }
  }

  const baseForms = forms;
  const baseRows = rows;
  if (baseForms !== manifest.rhyme_ready_forms) throw new Error(`Base form mismatch ${baseForms} != ${manifest.rhyme_ready_forms}`);
  if (baseRows !== manifest.pronunciations) throw new Error(`Base pronunciation mismatch ${baseRows} != ${manifest.pronunciations}`);
  if (preferredRows !== manifest.preferred_pronunciations) throw new Error(`Preferred pronunciation mismatch ${preferredRows} != ${manifest.preferred_pronunciations}`);
  if (Number.isInteger(manifest.historical_forms) && historicalForms !== manifest.historical_forms) throw new Error(`Historical form mismatch ${historicalForms} != ${manifest.historical_forms}`);

  let supplementalInserted = 0;
  let supplementalOverlaidExisting = 0;
  let supplementalRejected = 0;
  let supplementalPronunciationsAdded = 0;
  let publishOrder = baseForms;

  const existingForm = db.prepare(`
    SELECT publish_order,surface,normalized,usage_rank,usage_score,usage_count,usage_source_count,
           lemma,pos,gender,historical,lexical_tags
    FROM hot
    WHERE normalized=?
    ORDER BY pronunciation_preferred DESC, usage_rank IS NULL, usage_rank, publish_order, id
    LIMIT 1
  `);
  const demoteExistingPronunciations = db.prepare(`
    UPDATE hot
    SET pronunciation_preferred=0,
        pronunciation_rank=pronunciation_rank+?
    WHERE publish_order=?
  `);

  db.exec('BEGIN');
  try {
    for (const entry of Array.isArray(supplemental.entries) ? supplemental.entries : []) {
      const requestedSurface = String(entry?.word || '').normalize('NFKC').trim();
      const normalized = normalizeWord(requestedSurface);
      if (!requestedSurface || !normalized || !Array.isArray(entry.pronunciations) || !entry.pronunciations.length) {
        supplementalRejected += 1;
        continue;
      }

      const analyses = [];
      for (let index = 0; index < entry.pronunciations.length; index += 1) {
        const sourcePronunciation = entry.pronunciations[index];
        try {
          analyses.push({ sourcePronunciation, index, analysis: analyzeGermanIpa(sourcePronunciation.ipa) });
        } catch {
          supplementalRejected += 1;
        }
      }
      if (!analyses.length) continue;

      const existing = existingForm.get(normalized) || null;
      const explicitPreferred = analyses.findIndex((item) => item.sourcePronunciation.preferred === true);
      const preferredIndex = explicitPreferred >= 0 ? explicitPreferred : 0;
      const usage = usageRanking.bySurface.get(requestedSurface)
        || usageRanking.byNormalized.get(normalized)
        || (existing ? {
          rank: existing.usage_rank,
          score: existing.usage_score,
          count: existing.usage_count,
          sourceCount: existing.usage_source_count,
        } : null);

      let targetOrder;
      let targetSurface;
      let lemma;
      let pos;
      let gender;
      let lexicalTags;
      if (existing) {
        targetOrder = existing.publish_order;
        targetSurface = existing.surface;
        lemma = existing.lemma || requestedSurface;
        pos = existing.pos || 'name';
        gender = existing.gender ?? null;
        lexicalTags = existing.lexical_tags || '[]';
        demoteExistingPronunciations.run(analyses.length, targetOrder);
        supplementalOverlaidExisting += 1;
      } else {
        publishOrder += 1;
        targetOrder = publishOrder;
        targetSurface = requestedSurface;
        lemma = requestedSurface;
        pos = 'name';
        gender = null;
        lexicalTags = '[]';
        forms += 1;
        supplementalInserted += 1;
        if (usage?.rank != null) usageRankedForms += 1;
      }

      for (let i = 0; i < analyses.length; i += 1) {
        const { sourcePronunciation, index, analysis } = analyses[i];
        const final = analysis.syllables.at(-1);
        const preferred = i === preferredIndex ? 1 : 0;
        insert.run(
          targetOrder, targetSurface, normalized,
          usage?.rank ?? null,
          Number.isFinite(usage?.score) ? usage.score : null,
          Number.isFinite(usage?.count) ? usage.count : null,
          Number.isFinite(usage?.sourceCount) ? usage.sourceCount : null,
          lemma, pos, gender,
          'modern', entry.kind || 'entity', 0, lexicalTags,
          analysis.ipa, analysis.canonicalPhonemes, analysis.syllableCount, analysis.stressPattern,
          analysis.primaryStressSyllable, analysis.stressedTail, analysis.finalTail,
          analysis.vowelSequence, analysis.consonantSequence, analysis.exactTailKey,
          analysis.multisyllableKey, analysis.vowelKey, analysis.vowelFamilyKey,
          analysis.codaKey || '', coarseCodaClass(final?.coda || []), analysis.stressedSyllableCount,
          i + 1, preferred, 1, 1, index,
          'RhymeLab curated modern lexicon', '[]', '[]', '["curated_modern"]', 'de-DE', null, null,
        );
        rows += 1;
        supplementalPronunciationsAdded += 1;
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  preferredRows = scalar('SELECT COUNT(*) FROM hot WHERE pronunciation_preferred=1');
  const formsWithoutExactlyOnePreferred = scalar(`
    SELECT COUNT(*) FROM (
      SELECT publish_order, SUM(pronunciation_preferred) AS c
      FROM hot
      GROUP BY publish_order
      HAVING c != 1
    )
  `);
  if (formsWithoutExactlyOnePreferred !== 0) {
    throw new Error(`Supplemental pronunciation overlay broke preferred-pronunciation invariant for ${formsWithoutExactlyOnePreferred} forms`);
  }
  if (preferredRows !== forms) throw new Error(`Preferred/form mismatch after supplemental overlay: ${preferredRows} != ${forms}`);

  console.log(`Supplemental modern lexicon: ${supplementalInserted} new forms, ${supplementalOverlaidExisting} existing forms overlaid, ${supplementalPronunciationsAdded} curated pronunciations added, ${supplementalRejected} rejected.`);
  console.log(`Historical/obsolete dictionary forms: ${historicalForms.toLocaleString('de-DE')} (hidden by default at query time).`);
  console.log('Building local lookup/rhyme indexes…');

  db.exec(`
    CREATE INDEX idx_hot_normalized ON hot(normalized,historical,pronunciation_preferred DESC,pronunciation_rank,usage_rank);
    CREATE INDEX idx_hot_usage ON hot(usage_rank) WHERE usage_rank IS NOT NULL;
    CREATE INDEX idx_hot_syllables ON hot(syllable_count,usage_rank);
    CREATE INDEX idx_hot_exact ON hot(exact_key,historical,pronunciation_preferred,syllable_count,usage_rank);
    CREATE INDEX idx_hot_multi ON hot(multisyllable_key,historical,pronunciation_preferred,syllable_count,usage_rank) WHERE multisyllable_key IS NOT NULL;
    CREATE INDEX idx_hot_vowel ON hot(vowel_key,historical,pronunciation_preferred,usage_rank);
    CREATE INDEX idx_hot_slant ON hot(vowel_family,coda_class,historical,pronunciation_preferred,usage_rank);
    CREATE INDEX idx_hot_coda ON hot(coda_key,historical,pronunciation_preferred,usage_rank);
    ANALYZE;
    PRAGMA optimize;
  `);

  const metadata = {
    schema: 'rhymelab-local-db-v4',
    language: 'de',
    built_at: new Date().toISOString(),
    publish_schema: manifest.schema,
    publish_generated_at: manifest.generated_at,
    pronunciation_policy: manifest.pronunciation_policy,
    lexical_history_policy: manifest.lexical_history_policy || 'not_available',
    forms,
    base_forms: baseForms,
    supplemental_forms: supplementalInserted,
    supplemental_overlaid_forms: supplementalOverlaidExisting,
    supplemental_pronunciations_added: supplementalPronunciationsAdded,
    historical_forms: historicalForms,
    usage_ranked_forms: usageRankedForms,
    pronunciations: rows,
    preferred_pronunciations: preferredRows,
  };
  const metaInsert = db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  for (const [key, value] of Object.entries(metadata)) metaInsert.run(key, String(value ?? ''));

  const databaseBytes = bytesNow();
  db.exec('VACUUM;');
  const fileBytes = (await stat(dbPath)).size;
  const report = {
    schema: 'rhymelab-local-db-build-v4',
    language: metadata.language,
    built_at: metadata.built_at,
    source_manifest: join(publishDir, 'manifest.json'),
    database: dbPath,
    forms,
    base_forms: baseForms,
    supplemental_forms: supplementalInserted,
    supplemental_overlaid_forms: supplementalOverlaidExisting,
    supplemental_pronunciations_added: supplementalPronunciationsAdded,
    supplemental_rejected: supplementalRejected,
    historical_forms: historicalForms,
    usage_ranked_forms: usageRankedForms,
    pronunciations: rows,
    preferred_pronunciations: preferredRows,
    alternate_pronunciations: rows - preferredRows,
    sqlite_bytes: fileBytes,
    sqlite_mib: mib(fileBytes),
    pre_vacuum_bytes: databaseBytes,
    bytes_per_pronunciation: Number((fileBytes / Math.max(rows, 1)).toFixed(2)),
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
