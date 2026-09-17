#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { analyzeGermanIpa } from './german-ipa.mjs';
import { featureVectorForAnalysis, coarseCodaClass } from './german-rhyme-features.mjs';
import { normalizeGerman, optionsForHeadword, mergeOptions } from './kaikki-resolver-lib.mjs';

const args = process.argv.slice(2);
let rankingPath = '';
let kaikkiPath = '';
let dictionaryMetaPath = '';
let outDir = 'data/de/core';
let shardSize = 500;
let includeUnranked = true;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--ranking') rankingPath = args[++i] || '';
  else if (arg === '--kaikki') kaikkiPath = args[++i] || '';
  else if (arg === '--dictionary-meta') dictionaryMetaPath = args[++i] || '';
  else if (arg === '--out') outDir = args[++i] || outDir;
  else if (arg === '--shard-size') shardSize = Math.max(1, Number.parseInt(args[++i] || '', 10) || 500);
  else if (arg === '--ranked-only') includeUnranked = false;
}

if (!rankingPath || !kaikkiPath) {
  console.error('Usage: node scripts/build-de-rhyme-core.mjs --ranking data/de/usage/de-usage.tsv --kaikki raw-wiktextract-data.jsonl.gz [--dictionary-meta source.json] [--out data/de/core] [--shard-size 500] [--ranked-only]');
  process.exit(1);
}

const validWord = /^\p{L}+(?:[-'’]\p{L}+)*$/u;

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function readRanking(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error(`Ranking file is empty: ${rankingPath}`);
  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const required of ['rank','form','normalized_form','combined_count','source_count','source_counts_json']) {
    if (!(required in index)) throw new Error(`Ranking missing column: ${required}`);
  }

  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split('\t');
    const rank = Number.parseInt(c[index.rank] || '', 10);
    const form = c[index.form];
    if (!Number.isInteger(rank) || rank < 1 || !form) continue;
    rows.push({
      usageRank: rank,
      form,
      normalizedForm: c[index.normalized_form] || normalizeGerman(form),
      usageScore: index.usage_score === undefined ? null : Number(c[index.usage_score]),
      combinedCount: Number.parseInt(c[index.combined_count] || '0', 10) || 0,
      sourceCount: Number.parseInt(c[index.source_count] || '0', 10) || 0,
      sourceCounts: parseJson(c[index.source_counts_json], {}),
      sourcePerMillion: index.source_per_million_json === undefined
        ? {}
        : parseJson(c[index.source_per_million_json], {}),
    });
  }
  rows.sort((a,b) => a.usageRank-b.usageRank);
  rows.forEach((row, i) => {
    if (row.usageRank !== i + 1) throw new Error(`Usage ranks must be contiguous at ${i + 1}; got ${row.usageRank}`);
  });
  return rows;
}

function makeRecord(word, usage = null) {
  return {
    processing_order: null,
    usage_rank: usage?.usageRank ?? null,
    word,
    normalized_form: usage?.normalizedForm ?? normalizeGerman(word),
    usage_score: Number.isFinite(usage?.usageScore) ? usage.usageScore : null,
    usage_count: usage?.combinedCount ?? null,
    usage_source_count: usage?.sourceCount ?? 0,
    usage_sources: usage?.sourceCounts ?? {},
    usage_per_million: usage?.sourcePerMillion ?? {},
    source_entry_count: 0,
    analyses: new Map(),
    ipas: new Map(),
  };
}

const rankingText = await readFile(rankingPath, 'utf8');
const ranking = readRanking(rankingText);
const bySurface = new Map(ranking.map((row) => [row.form, row]));
const recordsByWord = new Map();
let germanEntriesSeen = 0;
let rankedEntriesSeen = 0;
let malformedLines = 0;
let excludedDictionaryWords = 0;

function getRecord(word, usage = null) {
  let record = recordsByWord.get(word);
  if (!record) {
    record = makeRecord(word, usage);
    recordsByWord.set(word, record);
  } else if (usage && record.usage_rank === null) {
    Object.assign(record, makeRecord(word, usage), {
      source_entry_count: record.source_entry_count,
      analyses: record.analyses,
      ipas: record.ipas,
    });
  }
  return record;
}

const source = createReadStream(kaikkiPath);
const input = kaikkiPath.endsWith('.gz') ? source.pipe(createGunzip()) : source;
const rl = readline.createInterface({ input, crlfDelay: Infinity });

for await (const line of rl) {
  if (!line) continue;
  let entry;
  try { entry = JSON.parse(line); }
  catch { malformedLines += 1; continue; }
  if (entry?.lang_code !== 'de' || !entry?.word) continue;
  germanEntriesSeen += 1;
  const word = String(entry.word).normalize('NFKC').trim();
  if (!validWord.test(word) || word.length > 80) {
    excludedDictionaryWords += 1;
    continue;
  }
  const usage = bySurface.get(word) || null;
  if (usage) rankedEntriesSeen += 1;
  if (!usage && !includeUnranked) continue;

  const record = getRecord(word, usage);
  record.source_entry_count += 1;

  for (const option of mergeOptions(optionsForHeadword(entry))) {
    record.analyses.set(option.resolutionKey, {
      lemma: option.lemma,
      normalized_lemma: option.normalizedLemma,
      pos: option.pos,
      gender: option.gender,
      confidence: option.confidence,
      source_record_key: option.sourceRecordKey,
    });
    for (const ipa of option.candidateIpas || []) {
      record.ipas.set(ipa, Math.max(record.ipas.get(ipa) || 0, option.confidence || 0.9));
    }
  }
}

// Every measured-usage form is retained even if the dictionary snapshot lacks it.
for (const usage of ranking) getRecord(usage.form, usage);

const usageOrdered = ranking.map((usage) => recordsByWord.get(usage.form));
const usageSet = new Set(ranking.map((usage) => usage.form));
const dictionaryOnly = includeUnranked
  ? [...recordsByWord.values()]
      .filter((record) => !usageSet.has(record.word))
      .sort((a,b) => a.word.localeCompare(b.word, 'de'))
  : [];
const ordered = [...usageOrdered, ...dictionaryOnly];
ordered.forEach((record, index) => { record.processing_order = index + 1; });

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const dictionaryMeta = dictionaryMetaPath
  ? JSON.parse(await readFile(dictionaryMetaPath, 'utf8'))
  : null;
const dictionarySnapshot = dictionaryMeta?.snapshot_label
  || dictionaryMeta?.snapshot
  || `German Wiktionary / Kaikki file ${basename(kaikkiPath)}`;
const dictionarySha256 = dictionaryMeta?.sha256 || null;

const shardManifest = [];
let totalMatched = 0;
let totalWithPronunciation = 0;
let totalPronunciations = 0;
let normalizationFailures = 0;

for (let offset = 0; offset < ordered.length; offset += shardSize) {
  const block = ordered.slice(offset, offset + shardSize);
  const lines = [];
  let matched = 0;
  let withPronunciation = 0;
  let usageRankedItems = 0;
  let dictionaryOnlyItems = 0;

  for (const raw of block) {
    const analyses = [...raw.analyses.values()]
      .sort((a,b) => b.confidence-a.confidence || a.lemma.localeCompare(b.lemma,'de'));
    const pronunciations = [];

    for (const [ipa, confidence] of raw.ipas) {
      try {
        const analysis = analyzeGermanIpa(ipa);
        const vector = featureVectorForAnalysis(analysis);
        pronunciations.push({
          ipa: analysis.ipa,
          canonical_phonemes: analysis.canonicalPhonemes,
          syllables: analysis.syllables,
          syllable_count: analysis.syllableCount,
          stress_pattern: analysis.stressPattern,
          primary_stress_syllable: analysis.primaryStressSyllable,
          confidence,
          rhyme: {
            signature_version: 'de-ipa-v1',
            stressed_tail: analysis.stressedTail,
            final_tail: analysis.finalTail,
            vowel_sequence: analysis.vowelSequence,
            consonant_sequence: analysis.consonantSequence,
            stress_shape: analysis.stressShape,
            exact_tail_key: analysis.exactTailKey,
            multisyllable_key: analysis.multisyllableKey,
            vowel_key: analysis.vowelKey,
            vowel_family_key: analysis.vowelFamilyKey,
            coda_key: analysis.codaKey,
            coda_class_key: coarseCodaClass(analysis.syllables.at(-1)?.coda || []),
            stressed_syllable_count: analysis.stressedSyllableCount,
            feature_vector: vector,
          },
        });
      } catch {
        normalizationFailures += 1;
      }
    }

    const dictionaryStatus = analyses.length && pronunciations.length
      ? 'complete'
      : analyses.length || raw.source_entry_count > 0
        ? 'partial'
        : 'frequency_only';
    if (analyses.length) matched += 1;
    if (pronunciations.length) withPronunciation += 1;
    if (raw.usage_rank !== null) usageRankedItems += 1;
    else dictionaryOnlyItems += 1;
    totalPronunciations += pronunciations.length;

    lines.push(JSON.stringify({
      processing_order: raw.processing_order,
      usage_rank: raw.usage_rank,
      word: raw.word,
      normalized_form: raw.normalized_form,
      usage: raw.usage_rank === null ? null : {
        score: raw.usage_score,
        count: raw.usage_count,
        source_count: raw.usage_source_count,
        sources: raw.usage_sources,
        per_million: raw.usage_per_million,
      },
      dictionary_status: dictionaryStatus,
      source_entry_count: raw.source_entry_count,
      analyses,
      pronunciations,
    }));
  }

  const data = `${lines.join('\n')}\n`;
  const shardNo = Math.floor(offset / shardSize) + 1;
  const name = `shard-${String(shardNo).padStart(6,'0')}.jsonl`;
  await writeFile(join(outDir, name), data, 'utf8');
  totalMatched += matched;
  totalWithPronunciation += withPronunciation;
  const usageRanks = block.map((x) => x.usage_rank).filter((x) => x !== null);
  shardManifest.push({
    shard: shardNo,
    file: name,
    first_processing_order: block[0].processing_order,
    last_processing_order: block.at(-1).processing_order,
    first_usage_rank: usageRanks.length ? Math.min(...usageRanks) : null,
    last_usage_rank: usageRanks.length ? Math.max(...usageRanks) : null,
    items: block.length,
    usage_ranked_items: usageRankedItems,
    dictionary_only_items: dictionaryOnlyItems,
    dictionary_matched: matched,
    with_pronunciation: withPronunciation,
    sha256: sha256(data),
  });
}

const manifest = {
  schema: 'rhymelab-de-core-v2',
  generated_at: new Date().toISOString(),
  ranking_file: rankingPath,
  ranking_sha256: sha256(rankingText),
  dictionary_file: kaikkiPath,
  dictionary_snapshot: dictionarySnapshot,
  dictionary_sha256: dictionarySha256,
  shard_size: shardSize,
  total_forms: ordered.length,
  usage_ranked_forms: ranking.length,
  dictionary_only_forms: dictionaryOnly.length,
  shards: shardManifest.length,
  german_dictionary_entries_seen: germanEntriesSeen,
  ranked_dictionary_entries_seen: rankedEntriesSeen,
  dictionary_matched_forms: totalMatched,
  forms_with_pronunciation: totalWithPronunciation,
  pronunciations: totalPronunciations,
  ipa_normalization_failures: normalizationFailures,
  malformed_json_lines: malformedLines,
  excluded_dictionary_words: excludedDictionaryWords,
  deliberate_omissions: [
    'definitions','senses','synonyms','antonyms','etymology','translations',
    'semantic graph','compound decomposition','embeddings'
  ],
  files: shardManifest,
};

await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  total_forms: manifest.total_forms,
  usage_ranked_forms: manifest.usage_ranked_forms,
  dictionary_only_forms: manifest.dictionary_only_forms,
  shards: manifest.shards,
  dictionary_matched_forms: manifest.dictionary_matched_forms,
  forms_with_pronunciation: manifest.forms_with_pronunciation,
  pronunciations: manifest.pronunciations,
  ipa_normalization_failures: manifest.ipa_normalization_failures,
}, null, 2));
