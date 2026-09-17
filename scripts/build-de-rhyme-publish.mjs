#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { analyzeGermanIpa } from './german-ipa.mjs';
import { coarseCodaClass } from './german-rhyme-features.mjs';
import { cleanIpa, normalizeGerman, optionsForHeadword, optionsForListedForms, mergeOptions } from './kaikki-resolver-lib.mjs';
import { rankPronunciationVariants } from './pronunciation-policy.mjs';

const args = process.argv.slice(2);
let rankingPath = 'data/de/usage/de-usage.tsv';
let kaikkiPath = 'data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz';
let dictionaryMetaPath = 'data/de/source-snapshot.json';
let outDir = 'data/de/publish';
let shardSize = 500;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--ranking') rankingPath = args[++i] || rankingPath;
  else if (arg === '--kaikki') kaikkiPath = args[++i] || kaikkiPath;
  else if (arg === '--dictionary-meta') dictionaryMetaPath = args[++i] || dictionaryMetaPath;
  else if (arg === '--out') outDir = args[++i] || outDir;
  else if (arg === '--shard-size') shardSize = Math.max(1, Number.parseInt(args[++i] || '', 10) || 500);
}

const validWord = /^\p{L}+(?:[-'’]\p{L}+)*$/u;
function sha256(text) { return createHash('sha256').update(text).digest('hex'); }

function readRanking(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error(`Ranking file is empty: ${rankingPath}`);
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((name, index) => [name, index]));
  for (const required of ['rank','form','normalized_form']) if (!(required in idx)) throw new Error(`Ranking missing column: ${required}`);
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split('\t');
    const rank = Number.parseInt(c[idx.rank] || '', 10);
    const form = String(c[idx.form] || '').normalize('NFKC').trim();
    if (!Number.isInteger(rank) || rank < 1 || !form) continue;
    rows.push({ rank, form, normalized: c[idx.normalized_form] || normalizeGerman(form), score: idx.usage_score === undefined ? null : Number(c[idx.usage_score]) });
  }
  rows.sort((a,b) => a.rank-b.rank);
  rows.forEach((row, index) => { if (row.rank !== index + 1) throw new Error(`Usage ranks must be contiguous: expected ${index + 1}, got ${row.rank}`); });
  return rows;
}

function bestAnalysis(current, option) {
  if (!current) return option;
  if ((option.confidence || 0) > (current.confidence || 0)) return option;
  if ((option.confidence || 0) < (current.confidence || 0)) return current;
  return option.resolutionKey.localeCompare(current.resolutionKey, 'de') < 0 ? option : current;
}

const rankingText = await readFile(rankingPath, 'utf8');
const ranking = readRanking(rankingText);
const usageBySurface = new Map(ranking.map((row) => [row.form, row]));
const records = new Map();
const usageLexicalMatches = new Set();
const failedIpaKeys = new Set();
let germanEntriesSeen = 0, listedFormsSeen = 0, listedFormLinksUsed = 0, malformedJsonLines = 0, excludedDictionaryWords = 0;

function getRecord(surface) {
  const word = String(surface || '').normalize('NFKC').trim();
  if (!validWord.test(word) || word.length > 80) return null;
  let record = records.get(word);
  if (!record) {
    const usage = usageBySurface.get(word) || null;
    record = { word, normalized: usage?.normalized || normalizeGerman(word), usageRank: usage?.rank ?? null, usageScore: Number.isFinite(usage?.score) ? usage.score : null, analysis: null, lexicalEvidenceCount: 0, currentLexicalEvidenceCount: 0, styleTags: new Set(), pronunciations: new Map(), rankedPronunciations: [] };
    records.set(word, record);
  }
  return record;
}

function addAnalysis(record, option) {
  if (!record || !option) return;
  record.analysis = bestAnalysis(record.analysis, option);
  record.lexicalEvidenceCount += 1;
  if (!option.historicalOnly) record.currentLexicalEvidenceCount += 1;
  for (const tag of Array.isArray(option.styleTags) ? option.styleTags : []) record.styleTags.add(String(tag));
  if (record.usageRank !== null) usageLexicalMatches.add(record.usageRank);
}

function addPronunciation(record, rawIpa, meta = {}) {
  if (!record) return;
  const ipa = cleanIpa(rawIpa);
  if (!ipa) return;
  let analysis;
  try { analysis = analyzeGermanIpa(ipa); } catch { failedIpaKeys.add(`${record.word}\u0000${ipa}`); return; }
  const key = analysis.ipa;
  let pronunciation = record.pronunciations.get(key);
  if (!pronunciation) {
    const final = analysis.syllables.at(-1);
    pronunciation = { compact: { i: analysis.ipa, ph: analysis.canonicalPhonemes, sc: analysis.syllableCount, st: analysis.stressPattern, ps: analysis.primaryStressSyllable, rt: analysis.stressedTail, ft: analysis.finalTail, v: analysis.vowelSequence, c: analysis.consonantSequence, e: analysis.exactTailKey, vk: analysis.vowelKey, vf: analysis.vowelFamilyKey, ck: analysis.codaKey, cc: coarseCodaClass(final?.coda || []), rs: analysis.stressedSyllableCount }, ipa: analysis.ipa, tags: new Set(), rawTags: new Set(), sourceKeys: new Set(), sourceOrder: Number.isFinite(meta.sourceOrder) ? meta.sourceOrder : 999, matchKinds: new Set() };
    if (analysis.multisyllableKey) pronunciation.compact.m = analysis.multisyllableKey;
    record.pronunciations.set(key, pronunciation);
  }
  for (const tag of Array.isArray(meta.tags) ? meta.tags : []) if (tag) pronunciation.tags.add(String(tag));
  for (const tag of Array.isArray(meta.rawTags) ? meta.rawTags : []) if (tag) pronunciation.rawTags.add(String(tag));
  if (meta.sourceKey) pronunciation.sourceKeys.add(String(meta.sourceKey));
  if (meta.matchKind) pronunciation.matchKinds.add(String(meta.matchKind));
  pronunciation.sourceOrder = Math.min(pronunciation.sourceOrder, Number.isFinite(meta.sourceOrder) ? meta.sourceOrder : 999);
}

function addEntrySounds(record, entry, sourceKey) {
  const sounds = Array.isArray(entry?.sounds) ? entry.sounds : [];
  for (let index = 0; index < sounds.length; index += 1) {
    const sound = sounds[index];
    if (!sound?.ipa) continue;
    addPronunciation(record, sound.ipa, { tags: sound.tags || [], rawTags: sound.raw_tags || [], sourceKey, sourceOrder: index, matchKind: 'headword_sound' });
  }
}

function finalizeRecord(record) {
  const variants = [...record.pronunciations.values()].map((pronunciation) => ({ ...pronunciation.compact, ipa: pronunciation.ipa, tags: [...pronunciation.tags], rawTags: [...pronunciation.rawTags], evidenceCount: Math.max(1, pronunciation.sourceKeys.size), sourceOrder: pronunciation.sourceOrder, matchKinds: [...pronunciation.matchKinds] }));
  const ranked = rankPronunciationVariants(variants);
  record.rankedPronunciations = ranked;
  return ranked.some((variant) => variant.preferred);
}

const source = createReadStream(kaikkiPath);
const input = kaikkiPath.endsWith('.gz') ? source.pipe(createGunzip()) : source;
const rl = readline.createInterface({ input, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line) continue;
  let entry;
  try { entry = JSON.parse(line); } catch { malformedJsonLines += 1; continue; }
  if (entry?.lang_code !== 'de' || !entry?.word) continue;
  germanEntriesSeen += 1;
  const headword = String(entry.word).normalize('NFKC').trim();
  const headwordValid = validWord.test(headword) && headword.length <= 80;
  const headOptions = mergeOptions(optionsForHeadword(entry));
  const headHasIpa = (Array.isArray(entry.sounds) ? entry.sounds : []).some((sound) => sound?.ipa);
  const headHasUsage = usageBySurface.has(headword);
  if (headwordValid && (headHasIpa || headHasUsage)) {
    const record = getRecord(headword);
    for (const option of headOptions) addAnalysis(record, option);
    addEntrySounds(record, entry, headOptions[0]?.sourceRecordKey || `entry:${germanEntriesSeen}`);
  } else if (!headwordValid) excludedDictionaryWords += 1;

  for (const listed of optionsForListedForms(entry)) {
    listedFormsSeen += 1;
    const surface = listed.candidateSurface;
    if (!validWord.test(surface) || surface.length > 80) continue;
    const hasUsage = usageBySurface.has(surface);
    const hasOwnIpa = (listed.option.candidateIpas || []).length > 0;
    const existing = records.get(surface);
    if (!hasUsage && !hasOwnIpa && !existing) continue;
    const record = existing || getRecord(surface);
    addAnalysis(record, listed.option);
    for (let index = 0; index < (listed.option.candidateIpas || []).length; index += 1) addPronunciation(record, listed.option.candidateIpas[index], { tags: listed.option.formFeatures || [], sourceKey: listed.option.sourceRecordKey, sourceOrder: index, matchKind: 'listed_form' });
    listedFormLinksUsed += 1;
  }
}

let excludedNoPreferredPronunciation = 0;
const publishable = [];
for (const record of records.values()) {
  if (!record.pronunciations.size) continue;
  if (!finalizeRecord(record)) { excludedNoPreferredPronunciation += 1; continue; }
  record.historicalOnly = record.lexicalEvidenceCount > 0 && record.currentLexicalEvidenceCount === 0;
  publishable.push(record);
}
publishable.sort((a,b) => { const au = a.usageRank !== null, bu = b.usageRank !== null; if (au && bu) return a.usageRank-b.usageRank; if (au) return -1; if (bu) return 1; return a.word.localeCompare(b.word,'de'); });

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
let dictionaryMeta = null;
try { dictionaryMeta = JSON.parse(await readFile(dictionaryMetaPath, 'utf8')); } catch {}
const dictionarySnapshot = dictionaryMeta?.snapshot_label || dictionaryMeta?.kaikki?.snapshot_label || `German Wiktionary / Kaikki file ${basename(kaikkiPath)}`;
const dictionarySha256 = dictionaryMeta?.sha256 || dictionaryMeta?.kaikki?.sha256 || null;

const files = [];
let totalBytes=0,totalPronunciations=0,preferredPronunciations=0,markedVariantPronunciations=0,connectedSpeechPronunciations=0,regionalPronunciations=0,colloquialPronunciations=0,contextSpecificPronunciations=0,usageReady=0,dictionaryOnlyReady=0,historicalForms=0,historicalUsageReady=0;
for (let offset=0; offset<publishable.length; offset+=shardSize) {
  const block=publishable.slice(offset,offset+shardSize), rows=[];
  let usageItems=0,dictionaryItems=0,historicalItems=0;
  for (let index=0; index<block.length; index+=1) {
    const record=block[index], option=record.analysis;
    const pronunciations=record.rankedPronunciations.map((variant)=>{
      const p={i:variant.i,ph:variant.ph,sc:variant.sc,st:variant.st,ps:variant.ps,rt:variant.rt,ft:variant.ft,v:variant.v,c:variant.c,e:variant.e,vk:variant.vk,vf:variant.vf,ck:variant.ck,cc:variant.cc,rs:variant.rs,pr:variant.preferenceRank,pf:variant.preferred?1:0,el:variant.eligible?1:0,ev:variant.evidenceCount,so:variant.sourceOrder,tg:variant.tags,rg:variant.rawTags,fg:variant.flags};
      if (variant.m) p.m=variant.m; if (variant.locale) p.lo=variant.locale; if (variant.dialect) p.di=variant.dialect; if (variant.register) p.re=variant.register;
      totalPronunciations+=1; if(variant.preferred)preferredPronunciations+=1; if(!variant.preferred)markedVariantPronunciations+=1; if(variant.flags.includes('connected_speech'))connectedSpeechPronunciations+=1; if(variant.flags.includes('regional'))regionalPronunciations+=1; if(variant.flags.includes('colloquial'))colloquialPronunciations+=1; if(variant.flags.includes('context_specific'))contextSpecificPronunciations+=1;
      return p;
    });
    if(record.usageRank!==null)usageItems+=1; else dictionaryItems+=1;
    if(record.historicalOnly){historicalItems+=1;historicalForms+=1;if(record.usageRank!==null)historicalUsageReady+=1;}
    const row={o:offset+index+1,w:record.word,n:record.normalized,r:pronunciations};
    if(record.usageRank!==null)row.u=record.usageRank; if(record.usageScore!==null)row.s=Number(record.usageScore.toFixed(6)); if(option?.lemma)row.l=option.lemma; if(option?.pos&&option.pos!=='unknown')row.p=option.pos; if(option?.gender)row.g=option.gender; if(record.historicalOnly)row.h=1; if(record.styleTags.size)row.lt=[...record.styleTags].sort();
    rows.push(JSON.stringify(row));
  }
  const data=`${rows.join('\n')}\n`, bytes=Buffer.byteLength(data), shard=Math.floor(offset/shardSize)+1, file=`shard-${String(shard).padStart(6,'0')}.jsonl`;
  await writeFile(join(outDir,file),data,'utf8'); totalBytes+=bytes; usageReady+=usageItems; dictionaryOnlyReady+=dictionaryItems;
  files.push({shard,file,first_publish_order:offset+1,last_publish_order:offset+block.length,items:block.length,usage_ranked_items:usageItems,dictionary_only_items:dictionaryItems,historical_items:historicalItems,bytes,sha256:sha256(data)});
}

const manifest={schema:'rhymelab-de-publish-v2',generated_at:new Date().toISOString(),purpose:'compact pronunciation-backed local hot dataset for rhyme search with pronunciation and lexical provenance',ranking_file:rankingPath,ranking_sha256:sha256(rankingText),total_usage_forms:ranking.length,usage_lexically_matched_forms:usageLexicalMatches.size,dictionary_file:kaikkiPath,dictionary_snapshot:dictionarySnapshot,dictionary_sha256:dictionarySha256,pronunciation_source:'German Wiktionary via Kaikki/wiktextract',pronunciation_policy:'de-pron-priority-v1',lexical_history_policy:'historical-only when all available lexical evidence is archaic/obsolete/dated',german_dictionary_entries_seen:germanEntriesSeen,listed_forms_seen:listedFormsSeen,listed_form_links_used:listedFormLinksUsed,malformed_json_lines:malformedJsonLines,excluded_dictionary_words:excludedDictionaryWords,excluded_no_preferred_pronunciation:excludedNoPreferredPronunciation,ipa_normalization_failures:failedIpaKeys.size,shard_size:shardSize,shards:files.length,rhyme_ready_forms:publishable.length,usage_ranked_rhyme_ready_forms:usageReady,dictionary_only_rhyme_ready_forms:dictionaryOnlyReady,historical_forms:historicalForms,historical_usage_ranked_forms:historicalUsageReady,pronunciations:totalPronunciations,preferred_pronunciations:preferredPronunciations,alternate_pronunciations:markedVariantPronunciations,connected_speech_pronunciations:connectedSpeechPronunciations,regional_pronunciations:regionalPronunciations,colloquial_pronunciations:colloquialPronunciations,context_specific_pronunciations:contextSpecificPronunciations,normalized_bytes:totalBytes,average_bytes_per_form:publishable.length?Number((totalBytes/publishable.length).toFixed(2)):null,usage_pronunciation_coverage_pct:ranking.length?Number((usageReady/ranking.length*100).toFixed(2)):0,deliberate_omissions:['definitions','full senses','synonym/antonym graphs','etymology','translations','corpus evidence maps','syllable object trees','stored phonological feature JSON','embeddings'],compact_fields:{o:'publish_order',u:'usage_rank',w:'surface_form',n:'normalized_form',s:'usage_score',l:'lemma',p:'part_of_speech',g:'gender',h:'historical_only',lt:'lexical_style_tags',r:'pronunciations',i:'ipa',ph:'canonical_phonemes',sc:'syllable_count',st:'stress_pattern',ps:'primary_stress_syllable',rt:'stressed_rhyme_tail',ft:'final_tail',v:'vowel_sequence',c:'consonant_sequence',e:'exact_tail_key',m:'multisyllable_key',vk:'vowel_key',vf:'vowel_family_key',ck:'coda_key',cc:'coda_class_key',rs:'rhyme_syllable_count',pr:'pronunciation_preference_rank',pf:'pronunciation_preferred',el:'pronunciation_default_eligible',ev:'source_evidence_count',so:'source_order',tg:'source_tags',rg:'source_raw_tags',fg:'policy_flags',lo:'locale',di:'dialect',re:'register'},files};
await writeFile(join(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify({rhyme_ready_forms:manifest.rhyme_ready_forms,usage_ranked_rhyme_ready_forms:manifest.usage_ranked_rhyme_ready_forms,dictionary_only_rhyme_ready_forms:manifest.dictionary_only_rhyme_ready_forms,historical_forms:manifest.historical_forms,historical_usage_ranked_forms:manifest.historical_usage_ranked_forms,pronunciations:manifest.pronunciations,preferred_pronunciations:manifest.preferred_pronunciations,alternate_pronunciations:manifest.alternate_pronunciations,regional_pronunciations:manifest.regional_pronunciations,colloquial_pronunciations:manifest.colloquial_pronunciations,context_specific_pronunciations:manifest.context_specific_pronunciations,connected_speech_pronunciations:manifest.connected_speech_pronunciations,shards:manifest.shards,normalized_bytes:manifest.normalized_bytes,average_bytes_per_form:manifest.average_bytes_per_form,usage_lexically_matched_forms:manifest.usage_lexically_matched_forms,usage_pronunciation_coverage_pct:manifest.usage_pronunciation_coverage_pct,ipa_normalization_failures:manifest.ipa_normalization_failures},null,2));
