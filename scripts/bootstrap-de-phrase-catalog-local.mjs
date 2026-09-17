#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
let workDir = 'data/work/de-phrase-catalog-v1';
let rhymeCoreWorkDir = 'data/work/de-rhyme-core-v1';
let refreshKaikki = false;
let keepArchives = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--work') workDir = args[++i] || workDir;
  else if (arg === '--rhyme-core-work') rhymeCoreWorkDir = args[++i] || rhymeCoreWorkDir;
  else if (arg === '--refresh-kaikki') refreshKaikki = true;
  else if (arg === '--keep-archives') keepArchives = true;
}

const root = process.cwd();
const phraseRegistry = JSON.parse(await readFile(
  join(root, 'sources/phrase/de-phase11b1-v1.json'),
  'utf8',
));
const sourceBundle = JSON.parse(await readFile(
  join(root, 'sources/de-rhyme-core-v1.json'),
  'utf8',
));
const leipzigManifest = JSON.parse(await readFile(
  join(root, phraseRegistry.leipzig_policy.snapshot_manifest),
  'utf8',
));

const work = resolve(root, workDir);
const downloads = join(work, 'downloads');
const extracted = join(work, 'extracted');
const sharedKaikki = resolve(root, rhymeCoreWorkDir, 'downloads', 'dewiktionary-kaikki-raw.jsonl.gz');
const phraseKaikki = join(downloads, 'dewiktionary-kaikki-raw.jsonl.gz');
const dbPath = join(root, 'data/local/rhymelab-phrases-v1.sqlite');
const reportPath = join(root, 'data/local/phrase-catalog-v1-report.json');
const sourceSnapshotPath = join(root, 'data/de/source-snapshot.json');

await mkdir(downloads, { recursive: true });
await mkdir(extracted, { recursive: true });
await mkdir(dirname(dbPath), { recursive: true });

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function human(bytes) {
  const units = ['B','KiB','MiB','GiB'];
  let value = Number(bytes) || 0;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      callback();
    },
  }));
  return hash.digest('hex');
}

async function download(url, target, {
  expectedSha256 = null,
  minimumBytes = 1,
  force = false,
} = {}) {
  if (!force && await exists(target)) {
    const size = (await stat(target)).size;
    if (size >= minimumBytes) {
      const localSha = await sha256File(target);
      if (!expectedSha256 || localSha === expectedSha256) {
        console.log(`Reuse ${basename(target)} (${human(size)}, sha256 ${localSha.slice(0, 12)}…)`);
        return { path: target, size, sha256: localSha, reused: true };
      }
    }
    await rm(target, { force: true });
  }

  console.log(`Download ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status}: ${url}`);
  }

  let bytes = 0;
  let lastLog = 0;
  const progress = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes - lastLog >= 64 * 1024 * 1024) {
        lastLog = bytes;
        console.log(`  ${human(bytes)}`);
      }
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body),
    progress,
    createWriteStream(target),
  );

  const size = (await stat(target)).size;
  if (size < minimumBytes) {
    throw new Error(`Downloaded file is unexpectedly small: ${target} (${size} bytes)`);
  }
  const actualSha = await sha256File(target);
  if (expectedSha256 && actualSha !== expectedSha256) {
    throw new Error(
      `SHA-256 mismatch for ${target}: expected ${expectedSha256}, got ${actualSha}`,
    );
  }
  return { path: target, size, sha256: actualSha, reused: false };
}

function ensureTar() {
  const probe = spawnSync('tar', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    throw new Error('A `tar` executable is required to extract Leipzig archives.');
  }
}

function tarList(archive) {
  const result = spawnSync('tar', ['-tzf', archive], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not list ${archive}: ${result.stderr || result.error}`);
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

async function tarExtractMember(archive, member, target) {
  await mkdir(dirname(target), { recursive: true });
  const child = spawn('tar', ['-xOzf', archive, member], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const exit = new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`tar failed (${code}): ${stderr}`));
    });
  });

  await Promise.all([
    pipeline(child.stdout, createWriteStream(target)),
    exit,
  ]);
}

function runNode(script, scriptArgs = []) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${script} failed with exit ${result.status ?? 'spawn error'}`);
  }
}

ensureTar();

const dictionary = sourceBundle.dictionary;
let kaikkiPath;
let kaikkiSha;

if (!refreshKaikki && await exists(sharedKaikki)) {
  kaikkiPath = sharedKaikki;
  kaikkiSha = await sha256File(kaikkiPath);
  console.log(`Reuse shared Kaikki snapshot ${kaikkiPath} (sha256 ${kaikkiSha.slice(0, 12)}…)`);
} else {
  const downloaded = await download(dictionary.url, phraseKaikki, {
    minimumBytes: Number(dictionary.minimum_expected_bytes || 1),
    force: refreshKaikki,
  });
  kaikkiPath = downloaded.path;
  kaikkiSha = downloaded.sha256;
}

let snapshotLabel = `German Wiktionary via Kaikki local snapshot sha256:${kaikkiSha.slice(0, 16)}`;
if (await exists(sourceSnapshotPath)) {
  try {
    const sourceSnapshot = JSON.parse(await readFile(sourceSnapshotPath, 'utf8'));
    if (sourceSnapshot.sha256 === kaikkiSha && sourceSnapshot.snapshot_label) {
      snapshotLabel = sourceSnapshot.snapshot_label;
    }
  } catch {}
}

const sentenceInputs = [];
for (const corpus of leipzigManifest.corpora || []) {
  const archive = join(downloads, `${corpus.code}.tar.gz`);
  await download(corpus.url, archive, {
    expectedSha256: corpus.sha256,
    minimumBytes: 1_000_000,
  });

  const members = tarList(archive);
  const sentenceMember = members.find((name) => /(?:^|\/).*[-_]sentences\.txt$/i.test(name));
  if (!sentenceMember) {
    throw new Error(`No *_sentences.txt inside ${archive}`);
  }

  const sentenceFile = join(extracted, `${corpus.code}_sentences.txt`);
  console.log(`Extract ${sentenceMember} -> ${sentenceFile}`);
  await tarExtractMember(archive, sentenceMember, sentenceFile);
  sentenceInputs.push({ code: corpus.code, path: sentenceFile });

  if (!keepArchives) await rm(archive, { force: true });
}

const buildArgs = [
  '--wiktextract', kaikkiPath,
  '--wiktionary-snapshot', snapshotLabel,
  '--wiktionary-upstream-url', dictionary.url,
  '--out', dbPath,
  '--report', reportPath,
];
for (const input of sentenceInputs) {
  buildArgs.push('--leipzig-sentences', `${input.code}=${input.path}`);
}

console.log('\nBuild Phase 11B1 phrase catalog…');
runNode('scripts/build-de-phrase-catalog.mjs', buildArgs);

console.log('\nPHASE 11B1 LOCAL PHRASE CATALOG BUILD COMPLETE');
console.log(JSON.stringify({
  database: 'data/local/rhymelab-phrases-v1.sqlite',
  report: 'data/local/phrase-catalog-v1-report.json',
  wiktionary_snapshot: snapshotLabel,
  wiktionary_sha256: kaikkiSha,
  leipzig_sentence_files: sentenceInputs.map((input) => ({
    code: input.code,
    path: input.path,
  })),
  runtime_rewired: false,
}, null, 2));
