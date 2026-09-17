#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
let workDir = 'data/work/de-rhyme-core-v1';
let cleanSource = false;
let refreshKaikki = false;
let rankedOnly = false;
let publishPrereqsOnly = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--work') workDir = args[++i] || workDir;
  else if (arg === '--clean-source') cleanSource = true;
  else if (arg === '--refresh-kaikki') refreshKaikki = true;
  else if (arg === '--ranked-only') rankedOnly = true;
  else if (arg === '--publish-prereqs-only') publishPrereqsOnly = true;
}

if (publishPrereqsOnly && cleanSource) {
  throw new Error('--clean-source cannot be combined with --publish-prereqs-only because publish still needs the local Kaikki source.');
}

const root = process.cwd();
const sourceBundle = JSON.parse(await readFile(join(root, 'sources/de-rhyme-core-v1.json'), 'utf8'));
const leipzigManifest = JSON.parse(await readFile(join(root, sourceBundle.usage_manifest), 'utf8'));
const work = resolve(root, workDir);
const downloads = join(work, 'downloads');
const extracted = join(work, 'extracted');
const usageOutput = join(root, 'data/de/usage/de-usage.tsv');
const coreOutput = join(root, 'data/de/core');
const snapshotOutput = join(root, 'data/de/source-snapshot.json');
const reportOutput = join(root, 'data/de/build-report.json');

await mkdir(downloads, { recursive: true });
await mkdir(extracted, { recursive: true });
await mkdir(join(root, 'data/de/usage'), { recursive: true });
await mkdir(join(root, 'data/de'), { recursive: true });

function human(bytes) {
  const units = ['B','KiB','MiB','GiB'];
  let value = Number(bytes) || 0;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), new Transform({
    transform(chunk, encoding, callback) { hash.update(chunk); callback(); }
  }));
  return hash.digest('hex');
}

async function download(url, target, { expectedSha256 = null, minimumBytes = 1, force = false } = {}) {
  if (!force && await exists(target)) {
    const size = (await stat(target)).size;
    if (size >= minimumBytes) {
      const localSha = await sha256File(target);
      if (!expectedSha256 || localSha === expectedSha256) {
        console.log(`Reuse ${basename(target)} (${human(size)}, sha256 ${localSha.slice(0,12)}…)`);
        return { path: target, size, sha256: localSha, reused: true, headers: {} };
      }
      console.log(`Cached ${basename(target)} checksum mismatch; downloading frozen source again.`);
    }
    await rm(target, { force: true });
  }

  console.log(`Download ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed ${response.status}: ${url}`);
  const expectedLength = Number(response.headers.get('content-length') || 0);
  let bytes = 0;
  let lastLog = 0;
  const progress = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes - lastLog >= 64 * 1024 * 1024) {
        lastLog = bytes;
        console.log(`  ${human(bytes)}${expectedLength ? ` / ${human(expectedLength)}` : ''}`);
      }
      callback(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(target));
  const size = (await stat(target)).size;
  if (size < minimumBytes) throw new Error(`Downloaded file is unexpectedly small: ${target} (${size} bytes)`);
  const actualSha = await sha256File(target);
  if (expectedSha256 && actualSha !== expectedSha256) {
    throw new Error(`SHA-256 mismatch for ${target}: expected ${expectedSha256}, got ${actualSha}`);
  }
  return {
    path: target,
    size,
    sha256: actualSha,
    reused: false,
    headers: {
      etag: response.headers.get('etag'),
      last_modified: response.headers.get('last-modified'),
      content_length: response.headers.get('content-length'),
      content_type: response.headers.get('content-type'),
    },
  };
}

function ensureTar() {
  const probe = spawnSync('tar', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    throw new Error('A `tar` executable is required to extract Leipzig archives. Install tar/bsdtar or use WSL.');
  }
}

function tarList(archive) {
  const result = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Could not list ${archive}: ${result.stderr || result.error}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

async function tarExtractMember(archive, member, target) {
  await mkdir(dirname(target), { recursive: true });
  const child = spawn('tar', ['-xOzf', archive, member], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exit = new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`tar failed (${code}): ${stderr}`)));
  });
  await Promise.all([
    pipeline(child.stdout, createWriteStream(target)),
    exit,
  ]);
}

function runNode(script, scriptArgs = []) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${script} failed with exit ${result.status ?? 'spawn error'}`);
}

ensureTar();
const sourceSnapshot = {
  schema: 'rhymelab-de-source-snapshot-v1',
  built_at: new Date().toISOString(),
  source_bundle: sourceBundle.id,
  leipzig: [],
  kaikki: null,
};
const wordsFiles = [];

for (const corpus of leipzigManifest.corpora) {
  const archive = join(downloads, `${corpus.code}.tar.gz`);
  const downloaded = await download(corpus.url, archive, {
    expectedSha256: corpus.sha256,
    minimumBytes: 1_000_000,
  });
  sourceSnapshot.leipzig.push({
    code: corpus.code,
    url: corpus.url,
    bytes: downloaded.size,
    sha256: downloaded.sha256,
    license: leipzigManifest.license,
  });

  const members = tarList(archive);
  const wordsMember = members.find((name) => /(?:^|\/).*[-_]words\.txt$/i.test(name));
  if (!wordsMember) throw new Error(`No *_words.txt inside ${archive}`);
  const wordsFile = join(extracted, `${corpus.code}_words.txt`);
  console.log(`Extract ${wordsMember} -> ${wordsFile}`);
  await tarExtractMember(archive, wordsMember, wordsFile);
  wordsFiles.push(wordsFile);

  await rm(archive, { force: true });
}

console.log('\nBuild full German usage ranking…');
runNode('scripts/build-de-usage-ranking.mjs', [...wordsFiles, '--out', usageOutput]);

const dictionary = sourceBundle.dictionary;
const kaikkiFile = join(downloads, 'dewiktionary-kaikki-raw.jsonl.gz');
const kaikkiDownload = await download(dictionary.url, kaikkiFile, {
  minimumBytes: Number(dictionary.minimum_expected_bytes || 1),
  force: refreshKaikki,
});
sourceSnapshot.kaikki = {
  code: dictionary.code,
  name: dictionary.name,
  url: dictionary.url,
  landing_page: dictionary.landing_page,
  bytes: kaikkiDownload.size,
  sha256: kaikkiDownload.sha256,
  reused_local_snapshot: kaikkiDownload.reused,
  response_headers: kaikkiDownload.headers,
  license: dictionary.license,
  downloaded_at: new Date().toISOString(),
  snapshot_label: `German Wiktionary via Kaikki local snapshot sha256:${kaikkiDownload.sha256.slice(0,16)}`,
};
await writeFile(snapshotOutput, JSON.stringify({
  ...sourceSnapshot,
  snapshot_label: sourceSnapshot.kaikki.snapshot_label,
  sha256: sourceSnapshot.kaikki.sha256,
}, null, 2) + '\n', 'utf8');

if (publishPrereqsOnly) {
  console.log('\nGERMAN PUBLISH PREREQUISITES READY');
  console.log(JSON.stringify({
    schema: 'rhymelab-de-publish-prereqs-v1',
    usage_ranking: 'data/de/usage/de-usage.tsv',
    dictionary_source: 'data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz',
    source_snapshot: 'data/de/source-snapshot.json',
    core_rebuilt: false,
  }, null, 2));
  process.exit(0);
}

console.log('\nBuild German rhyme core shards…');
const coreArgs = [
  '--ranking', usageOutput,
  '--kaikki', kaikkiFile,
  '--dictionary-meta', snapshotOutput,
  '--out', coreOutput,
  '--shard-size', String(sourceBundle.shard_size || 500),
];
if (rankedOnly) coreArgs.push('--ranked-only');
runNode('scripts/build-de-rhyme-core.mjs', coreArgs);

console.log('\nVerify all shards…');
runNode('scripts/verify-de-rhyme-core.mjs', [coreOutput]);

const manifest = JSON.parse(await readFile(join(coreOutput, 'manifest.json'), 'utf8'));
let coreBytes = (await stat(join(coreOutput, 'manifest.json'))).size;
for (const shard of manifest.files) coreBytes += (await stat(join(coreOutput, shard.file))).size;
const report = {
  schema: 'rhymelab-de-build-report-v2',
  completed_at: new Date().toISOString(),
  source_snapshot: snapshotOutput,
  core_manifest: 'data/de/core/manifest.json',
  total_forms: manifest.total_forms,
  usage_ranked_forms: manifest.usage_ranked_forms,
  dictionary_only_forms: manifest.dictionary_only_forms,
  shards: manifest.shards,
  dictionary_matched_forms: manifest.dictionary_matched_forms,
  forms_with_pronunciation: manifest.forms_with_pronunciation,
  pronunciations: manifest.pronunciations,
  ipa_normalization_failures: manifest.ipa_normalization_failures,
  normalized_core_bytes: coreBytes,
  average_bytes_per_form: manifest.total_forms ? Number((coreBytes / manifest.total_forms).toFixed(2)) : null,
  external_uploads: false,
  external_database_writes: false,
};
await writeFile(reportOutput, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('\nGERMAN RHYME CORE BUILD COMPLETE');
console.log(JSON.stringify(report, null, 2));
console.log('\nNo external uploads or database writes were performed.');
console.log(`Raw Kaikki cache: ${kaikkiFile}`);

if (cleanSource) {
  console.log('\n--clean-source: removing transient source cache…');
  await rm(work, { recursive: true, force: true });
}
