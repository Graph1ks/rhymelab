#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { classifyCandidate, normalizeGerman, optionsForHeadword, optionsForListedForms } from './kaikki-resolver-lib.mjs';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];

const seedPath = args.seed || 'data/seeds/de-10000.tsv';
const dumpPath = args.dump;
const outPath = args.out || 'data/generated/de10k-kaikki-resolution.jsonl';
const metaPath = args.meta || 'data/generated/de10k-kaikki-resolution.meta.json';
if (!dumpPath) throw new Error('--dump is required');

function parseSeed(text) {
  const lines = text.replace(/\r/g, '').trimEnd().split('\n');
  const header = lines.shift()?.split('\t') ?? [];
  const expected = ['rank','form','normalized_form','combined_count','source_count','source_counts_json'];
  if (header.join('\t') !== expected.join('\t')) throw new Error(`Unexpected seed header: ${header.join('\t')}`);
  return lines.map((line, index) => {
    const [rank, surfaceForm, normalizedForm, combinedCount, sourceCount, sourceCountsJson] = line.split('\t');
    if (!rank || !surfaceForm || !normalizedForm || !sourceCountsJson) throw new Error(`Malformed seed row ${index + 2}`);
    return {
      rank: Number(rank), surfaceForm, normalizedForm, combinedCount: Number(combinedCount), sourceCount: Number(sourceCount), sourceCountsJson,
    };
  });
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const input = createReadStream(path);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', resolve);
    input.on('error', reject);
  });
  return hash.digest('hex');
}

const candidates = parseSeed(await readFile(seedPath, 'utf8'));
if (candidates.length !== 10_000) throw new Error(`Expected 10000 seed rows, got ${candidates.length}`);
const byNormalized = new Map(candidates.map((row) => [row.normalizedForm, row]));
const targetSet = new Set(byNormalized.keys());
const matches = new Map(candidates.map((row) => [row.normalizedForm, []]));

let totalLines = 0;
let germanEntries = 0;
let parseErrors = 0;
const input = createReadStream(dumpPath).pipe(createGunzip());
const rl = readline.createInterface({ input, crlfDelay: Infinity });
for await (const line of rl) {
  totalLines += 1;
  if (!line) continue;
  let entry;
  try { entry = JSON.parse(line); }
  catch { parseErrors += 1; continue; }
  if (entry?.lang_code !== 'de') continue;
  germanEntries += 1;

  const normalizedHead = normalizeGerman(entry.word);
  if (targetSet.has(normalizedHead)) matches.get(normalizedHead).push(...optionsForHeadword(entry));
  for (const listed of optionsForListedForms(entry, targetSet)) matches.get(listed.candidateNormalized).push(listed.option);
}

await mkdir(dirname(outPath), { recursive: true });
const out = createWriteStream(outPath, { encoding: 'utf8' });
const counts = { resolved: 0, ambiguous: 0, pending: 0 };
let withIpa = 0;
let withMorphology = 0;
for (const candidate of candidates) {
  const resolved = classifyCandidate(candidate, matches.get(candidate.normalizedForm) || []);
  counts[resolved.status] += 1;
  if (resolved.selected?.candidateIpas?.length) withIpa += 1;
  if (resolved.selected?.formFeatures?.length) withMorphology += 1;
  out.write(JSON.stringify(resolved) + '\n');
}
await new Promise((resolve, reject) => { out.end(resolve); out.on('error', reject); });

const dumpStat = await stat(dumpPath);
const dumpSha256 = await sha256File(dumpPath);
const metadata = {
  generatedAt: new Date().toISOString(),
  seedPath,
  seedRows: candidates.length,
  source: {
    name: 'German Wiktionary via Kaikki/Wiktextract',
    url: args['source-url'] || 'https://kaikki.org/dewiktionary/raw-wiktextract-data.jsonl.gz',
    dumpDate: args['dump-date'] || null,
    extractedAt: args['extracted-at'] || null,
    wiktextractRevisions: String(args['wiktextract-revisions'] || '').split(',').filter(Boolean),
    compressedBytes: dumpStat.size,
    compressedSha256: dumpSha256,
  },
  scan: { totalLines, germanEntries, parseErrors },
  counts,
  coverage: {
    resolved: counts.resolved / candidates.length,
    ambiguous: counts.ambiguous / candidates.length,
    pending: counts.pending / candidates.length,
    resolvedWithAttestedIpa: withIpa / candidates.length,
    resolvedWithMorphology: withMorphology / candidates.length,
  },
};
await writeFile(metaPath, JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata, null, 2));
