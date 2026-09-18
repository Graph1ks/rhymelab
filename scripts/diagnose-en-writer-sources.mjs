#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createGunzip, gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import {
  classifyWiktionaryHistory,
  classifyWiktionaryIpaLocale,
  collectWiktionaryTags,
  decodeMsgpack,
  isExplicitProperNameRecord,
  isSingleTokenSurface,
  isWriterCandidateSurface,
  normalizeEnglishSurface,
  parseCmudictSurface,
  parseEsdbLine,
  parseWordfreqCBpack,
  pct,
  readJson,
  sha256File,
} from './en-writer-source-core.mjs';

const args = process.argv.slice(2);
let registryPath = 'sources/en/phase12b-sources-v1.json';
let rawDir = null;
let outPath = null;
let progressEvery = 500000;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--registry') registryPath = args[++i] || registryPath;
  else if (arg === '--raw-dir') rawDir = args[++i] || rawDir;
  else if (arg === '--out') outPath = args[++i] || outPath;
  else if (arg === '--progress-every') progressEvery = Number.parseInt(args[++i] || '', 10) || progressEvery;
}
registryPath = resolve(registryPath);
const registry = await readJson(registryPath);
rawDir = resolve(rawDir || registry.local_raw_directory || 'data/raw/en/phase12b-20260918');
outPath = resolve(outPath || registry.diagnostics_report || 'data/local/en-source-diagnostics-v1.json');
await mkdir(dirname(outPath), { recursive: true });

const sources = Object.fromEntries((registry.sources || []).map((source) => [source.source_id, source]));
const kaikkiSource = Object.values(sources).find((source) => source.source_id.startsWith('enwiktionary-kaikki'));
const cmuSource = Object.values(sources).find((source) => source.source_id.startsWith('cmudict-en-us'));
const esdbSource = Object.values(sources).find((source) => source.source_id.startsWith('esdb-scowl'));
const wordfreqSource = Object.values(sources).find((source) => source.source_id.startsWith('wordfreq-en'));
if (!kaikkiSource || !cmuSource || !esdbSource || !wordfreqSource) {
  throw new Error('Registry must define Kaikki, CMUdict, ESDB and wordfreq sources.');
}

function sourcePath(source) {
  return resolve(rawDir, source.local_filename);
}

function addSurface(surface, all, single, candidate, multi) {
  const normalized = normalizeEnglishSurface(surface);
  if (!normalized) return;
  all.add(normalized);
  if (isSingleTokenSurface(normalized)) {
    single.add(normalized);
    if (isWriterCandidateSurface(normalized)) candidate.add(normalized);
  } else {
    multi.add(normalized);
  }
}

function intersectionCount(left, right) {
  let count = 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const value of small) if (large.has(value)) count += 1;
  return count;
}

async function fileMetadata(source) {
  const path = sourcePath(source);
  const fileStat = await stat(path);
  return { path, bytes: fileStat.size, sha256: await sha256File(path) };
}

const sourceFiles = {
  kaikki: await fileMetadata(kaikkiSource),
  cmudict: await fileMetadata(cmuSource),
  esdb: await fileMetadata(esdbSource),
  wordfreq: await fileMetadata(wordfreqSource),
};

console.log('12B2: scan English Wiktionary / Wiktextract…');
const headwords = new Set();
const listedForms = new Set();
const allSurfaces = new Set();
const singleTokenSurfaces = new Set();
const candidateSurfaces = new Set();
const multiWordSurfaces = new Set();
const explicitProperHeadwords = new Set();
const historicalHeadwords = new Set();
const obsoleteHeadwords = new Set();
const archaicHeadwords = new Set();
const datedHeadwords = new Set();
const wiktIpaHeadwords = new Set();
const wiktUsIpaHeadwords = new Set();
const wiktUkIpaHeadwords = new Set();
const wiktUnqualifiedIpaHeadwords = new Set();
const posCounts = new Map();
let linesScanned = 0;
let englishEntries = 0;
let entriesWithIpa = 0;
let entriesWithUsIpa = 0;
let entriesWithUkIpa = 0;
let entriesWithUnqualifiedIpa = 0;
let properNameEntries = 0;
let archaicEntries = 0;
let obsoleteEntries = 0;
let historicalEntries = 0;
let datedEntries = 0;
let parseErrors = 0;

const kaikkiInput = createReadStream(sourceFiles.kaikki.path).pipe(createGunzip());
const kaikkiLines = createInterface({ input: kaikkiInput, crlfDelay: Infinity });
for await (const line of kaikkiLines) {
  linesScanned += 1;
  if (!line) continue;
  let record;
  try { record = JSON.parse(line); } catch { parseErrors += 1; continue; }
  if (record?.lang_code !== 'en') continue;
  englishEntries += 1;
  const headword = normalizeEnglishSurface(record.word);
  if (headword) {
    headwords.add(headword);
    addSurface(record.word, allSurfaces, singleTokenSurfaces, candidateSurfaces, multiWordSurfaces);
  }
  const pos = String(record.pos || 'unknown');
  posCounts.set(pos, (posCounts.get(pos) || 0) + 1);

  for (const form of record.forms || []) {
    if (!form?.form) continue;
    const normalized = normalizeEnglishSurface(form.form);
    if (normalized) listedForms.add(normalized);
    addSurface(form.form, allSurfaces, singleTokenSurfaces, candidateSurfaces, multiWordSurfaces);
  }

  if (isExplicitProperNameRecord(record)) {
    properNameEntries += 1;
    if (headword) explicitProperHeadwords.add(headword);
  }
  const history = classifyWiktionaryHistory(collectWiktionaryTags(record));
  if (history.archaic) { archaicEntries += 1; if (headword) archaicHeadwords.add(headword); }
  if (history.obsolete) { obsoleteEntries += 1; if (headword) obsoleteHeadwords.add(headword); }
  if (history.historical) { historicalEntries += 1; if (headword) historicalHeadwords.add(headword); }
  if (history.dated) { datedEntries += 1; if (headword) datedHeadwords.add(headword); }

  let hasIpa = false;
  let hasUsIpa = false;
  let hasUkIpa = false;
  let hasUnqualifiedIpa = false;
  for (const sound of record.sounds || []) {
    if (!sound?.ipa) continue;
    hasIpa = true;
    const locale = classifyWiktionaryIpaLocale(sound);
    if (locale.us) hasUsIpa = true;
    if (locale.uk) hasUkIpa = true;
    if (locale.unqualified) hasUnqualifiedIpa = true;
  }
  if (hasIpa) { entriesWithIpa += 1; if (headword) wiktIpaHeadwords.add(headword); }
  if (hasUsIpa) { entriesWithUsIpa += 1; if (headword) wiktUsIpaHeadwords.add(headword); }
  if (hasUkIpa) { entriesWithUkIpa += 1; if (headword) wiktUkIpaHeadwords.add(headword); }
  if (hasUnqualifiedIpa) {
    entriesWithUnqualifiedIpa += 1;
    if (headword) wiktUnqualifiedIpaHeadwords.add(headword);
  }

  if (progressEvery > 0 && englishEntries % progressEvery === 0) {
    console.log(`  English entries ${englishEntries.toLocaleString('en-US')} / headwords ${headwords.size.toLocaleString('en-US')}`);
  }
}

for (const value of archaicHeadwords) historicalHeadwords.add(value);
for (const value of obsoleteHeadwords) historicalHeadwords.add(value);

console.log('12B2: scan CMUdict exact surfaces…');
const cmuWords = new Set();
let cmuPronunciationRows = 0;
const cmuLines = createInterface({ input: createReadStream(sourceFiles.cmudict.path), crlfDelay: Infinity });
for await (const line of cmuLines) {
  const word = parseCmudictSurface(line);
  if (!word) continue;
  cmuPronunciationRows += 1;
  cmuWords.add(word);
}

console.log('12B2: scan ESDB/SCOWL v2 source master…');
const esdbSurfaces = new Set();
const esdbCurrent70 = new Set();
const esdbArchaic = new Set();
const esdbUncommon = new Set();
const esdbInvalid = new Set();
const esdbRegions = new Map();
const esdbSizes = new Map();
let esdbRows = 0;
let esdbParsedRows = 0;
const esdbLines = createInterface({ input: createReadStream(sourceFiles.esdb.path), crlfDelay: Infinity });
for await (const line of esdbLines) {
  esdbRows += 1;
  const parsed = parseEsdbLine(line);
  if (!parsed) continue;
  esdbParsedRows += 1;
  esdbSizes.set(parsed.size, (esdbSizes.get(parsed.size) || 0) + 1);
  const region = parsed.region || 'shared_or_spelling_scoped';
  esdbRegions.set(region, (esdbRegions.get(region) || 0) + 1);
  for (const form of parsed.forms) {
    const normalized = normalizeEnglishSurface(form);
    if (!isWriterCandidateSurface(normalized)) continue;
    esdbSurfaces.add(normalized);
    if (parsed.size <= 70 && !parsed.archaic && !parsed.uncommon && !parsed.invalid) esdbCurrent70.add(normalized);
    if (parsed.archaic) esdbArchaic.add(normalized);
    if (parsed.uncommon) esdbUncommon.add(normalized);
    if (parsed.invalid) esdbInvalid.add(normalized);
  }
}

console.log('12B2: decode wordfreq English cBpack…');
const wordfreqCompressed = await readFile(sourceFiles.wordfreq.path);
const wordfreqDecoded = decodeMsgpack(gunzipSync(wordfreqCompressed));
const wordfreqRows = parseWordfreqCBpack(wordfreqDecoded);
const wordfreqWords = new Set();
const wordfreqRankCheckpoints = [10000, 50000, 100000, 250000];
const checkpointSets = new Map(wordfreqRankCheckpoints.map((limit) => [limit, new Set()]));
for (const row of wordfreqRows) {
  const normalized = normalizeEnglishSurface(row.word);
  if (!isWriterCandidateSurface(normalized)) continue;
  if (wordfreqWords.has(normalized)) continue;
  wordfreqWords.add(normalized);
  const rank = wordfreqWords.size;
  for (const limit of wordfreqRankCheckpoints) if (rank <= limit) checkpointSets.get(limit).add(normalized);
}

const cmuHeadwordMatches = intersectionCount(headwords, cmuWords);
const cmuCandidateMatches = intersectionCount(candidateSurfaces, cmuWords);
const wiktIpaCandidateMatches = intersectionCount(candidateSurfaces, wiktIpaHeadwords);
const combinedPronounced = new Set();
for (const value of wiktIpaHeadwords) if (candidateSurfaces.has(value)) combinedPronounced.add(value);
for (const value of cmuWords) if (candidateSurfaces.has(value)) combinedPronounced.add(value);
const esdbOverlap = intersectionCount(candidateSurfaces, esdbSurfaces);
const wordfreqOverlap = intersectionCount(candidateSurfaces, wordfreqWords);

const esdbArchaicWiktCurrent = [...esdbArchaic].filter((value) => candidateSurfaces.has(value) && !historicalHeadwords.has(value)).length;
const esdbInvalidWiktPresent = [...esdbInvalid].filter((value) => candidateSurfaces.has(value)).length;
const wiktHistoricalEsdbCurrent = [...historicalHeadwords].filter((value) => esdbCurrent70.has(value)).length;

const posDistribution = [...posCounts.entries()]
  .map(([pos, count]) => ({ pos, count }))
  .sort((a, b) => b.count - a.count || a.pos.localeCompare(b.pos, 'en'));
const mapDistribution = (map, key) => [...map.entries()]
  .map(([value, count]) => ({ [key]: value, count }))
  .sort((a, b) => b.count - a.count || String(a[key]).localeCompare(String(b[key]), 'en'));

const report = {
  schema: 'rhymelab-en-source-diagnostics-v1',
  generated_at: new Date().toISOString(),
  registry_id: registry.id,
  registry: registryPath,
  raw_directory: rawDir,
  normalization_policy: {
    id: 'en-source-diagnostic-normalization-v1',
    operations: ['Unicode NFKC', 'normalize curly apostrophes to ASCII apostrophe', 'trim', 'lowercase en-US'],
    writer_candidate_surface: 'single token, contains at least one Unicode letter, <=96 Unicode code points',
    warning: 'This is a diagnostic cross-source normalization only. It is not the Phase 12B4 final lexical identity/filter policy.',
  },
  source_files: {
    kaikki: { source_id: kaikkiSource.source_id, ...sourceFiles.kaikki },
    cmudict: { source_id: cmuSource.source_id, ...sourceFiles.cmudict },
    esdb: { source_id: esdbSource.source_id, diagnostic_scope: esdbSource.diagnostic_scope, ...sourceFiles.esdb },
    wordfreq: { source_id: wordfreqSource.source_id, data_snapshot_through_approx: wordfreqSource.data_snapshot_through_approx, ...sourceFiles.wordfreq },
  },
  wiktionary: {
    lines_scanned: linesScanned,
    parse_errors: parseErrors,
    raw_english_entries: englishEntries,
    distinct_headwords: headwords.size,
    distinct_listed_inflected_forms: listedForms.size,
    distinct_all_surfaces: allSurfaces.size,
    single_token_surfaces: singleTokenSurfaces.size,
    single_token_writer_candidate_surfaces: candidateSurfaces.size,
    multi_word_surfaces: multiWordSurfaces.size,
    explicit_proper_name_entries: properNameEntries,
    explicit_proper_name_entry_share_pct: pct(properNameEntries, englishEntries),
    explicit_proper_name_headwords: explicitProperHeadwords.size,
    explicit_proper_name_headword_share_pct: pct(explicitProperHeadwords.size, headwords.size),
    history: {
      archaic_entries: archaicEntries,
      obsolete_entries: obsoleteEntries,
      historical_entries: historicalEntries,
      dated_entries: datedEntries,
      union_historical_obsolete_archaic_headwords: historicalHeadwords.size,
      union_headword_share_pct: pct(historicalHeadwords.size, headwords.size),
    },
    pronunciation: {
      entries_with_ipa: entriesWithIpa,
      entry_coverage_pct: pct(entriesWithIpa, englishEntries),
      distinct_headwords_with_ipa: wiktIpaHeadwords.size,
      headword_coverage_pct: pct(wiktIpaHeadwords.size, headwords.size),
      us_tagged_entries: entriesWithUsIpa,
      uk_tagged_entries: entriesWithUkIpa,
      unqualified_entries: entriesWithUnqualifiedIpa,
      us_tagged_headwords: wiktUsIpaHeadwords.size,
      uk_tagged_headwords: wiktUkIpaHeadwords.size,
      unqualified_headwords: wiktUnqualifiedIpaHeadwords.size,
    },
    pos_distribution: posDistribution,
  },
  cmudict: {
    pronunciation_rows: cmuPronunciationRows,
    distinct_surfaces: cmuWords.size,
    exact_headword_matches: cmuHeadwordMatches,
    exact_headword_coverage_pct: pct(cmuHeadwordMatches, headwords.size),
    exact_writer_candidate_matches: cmuCandidateMatches,
    exact_writer_candidate_coverage_pct: pct(cmuCandidateMatches, candidateSurfaces.size),
  },
  combined_pronunciation: {
    wiktionary_ipa_writer_candidate_matches: wiktIpaCandidateMatches,
    wiktionary_ipa_writer_candidate_coverage_pct: pct(wiktIpaCandidateMatches, candidateSurfaces.size),
    wiktionary_or_cmudict_writer_candidate_matches: combinedPronounced.size,
    wiktionary_or_cmudict_writer_candidate_coverage_pct: pct(combinedPronounced.size, candidateSurfaces.size),
    incremental_cmudict_matches_over_wiktionary: combinedPronounced.size - wiktIpaCandidateMatches,
  },
  esdb: {
    diagnostic_scope: esdbSource.diagnostic_scope,
    source_rows: esdbRows,
    parsed_rows: esdbParsedRows,
    distinct_candidate_surfaces: esdbSurfaces.size,
    overlap_with_wiktionary_writer_candidates: esdbOverlap,
    wiktionary_writer_candidate_coverage_pct: pct(esdbOverlap, candidateSurfaces.size),
    esdb_surface_overlap_pct: pct(esdbOverlap, esdbSurfaces.size),
    current_size_70_or_better_surfaces: esdbCurrent70.size,
    archaic_surfaces: esdbArchaic.size,
    uncommon_surfaces: esdbUncommon.size,
    invalid_variant_surfaces: esdbInvalid.size,
    disagreement_probes: {
      esdb_archaic_but_wiktionary_not_historical: esdbArchaicWiktCurrent,
      esdb_invalid_but_wiktionary_present: esdbInvalidWiktPresent,
      wiktionary_historical_but_esdb_current_size_70_or_better: wiktHistoricalEsdbCurrent,
    },
    size_distribution: mapDistribution(esdbSizes, 'size'),
    region_distribution: mapDistribution(esdbRegions, 'region'),
    note: 'The pinned 12B2 ESDB artifact is the v2 source master scowl-pre.txt. Supplemental combine/adjust files are intentionally not silently applied in this diagnostic; final ESDB publish materialization remains a later explicit step.',
  },
  wordfreq: {
    decoded_rows: wordfreqRows.length,
    distinct_candidate_surfaces: wordfreqWords.size,
    overlap_with_wiktionary_writer_candidates: wordfreqOverlap,
    wiktionary_writer_candidate_coverage_pct: pct(wordfreqOverlap, candidateSurfaces.size),
    ranked_coverage: wordfreqRankCheckpoints.map((limit) => {
      const set = checkpointSets.get(limit);
      const matches = intersectionCount(candidateSurfaces, set);
      return {
        top_n: limit,
        available_distinct_surfaces: set.size,
        matches,
        writer_candidate_coverage_pct: pct(matches, candidateSurfaces.size),
      };
    }),
    data_snapshot_through_approx: wordfreqSource.data_snapshot_through_approx,
  },
  decision_boundary: {
    final_english_writer_row_count_frozen: false,
    g2p_used: false,
    english_runtime_materialized: false,
    next_gate: 'Review this source diagnostic, then build 12B3 English phonology fixture/analyzer/scorer.',
  },
};

await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('\nPHASE 12B2 ENGLISH SOURCE DIAGNOSTICS COMPLETE');
console.log(JSON.stringify({
  schema: report.schema,
  english_entries: englishEntries,
  distinct_headwords: headwords.size,
  writer_candidate_surfaces: candidateSurfaces.size,
  wiktionary_ipa_headword_coverage_pct: report.wiktionary.pronunciation.headword_coverage_pct,
  cmudict_candidate_coverage_pct: report.cmudict.exact_writer_candidate_coverage_pct,
  combined_pronunciation_coverage_pct: report.combined_pronunciation.wiktionary_or_cmudict_writer_candidate_coverage_pct,
  esdb_candidate_coverage_pct: report.esdb.wiktionary_writer_candidate_coverage_pct,
  wordfreq_candidate_coverage_pct: report.wordfreq.wiktionary_writer_candidate_coverage_pct,
  report: outPath,
}, null, 2));
