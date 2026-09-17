#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

const PDFJS_VERSION = '6.3.289';

const args = process.argv.slice(2);
let manifestPath = 'sources/phrase/cologne-kiezdeutsch-2025-v2.json';
let workDir = 'data/work/cologne-kiezdeutsch-2025-v2';
let dbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let reportPath = 'data/local/cologne-kiezdeutsch-register-report.json';
let refresh = false;
let noAutoInstall = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--manifest') manifestPath = args[++i] || manifestPath;
  else if (arg === '--work') workDir = args[++i] || workDir;
  else if (arg === '--db') dbPath = args[++i] || dbPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--refresh') refresh = true;
  else if (arg === '--no-auto-install') noAutoInstall = true;
}

const root = process.cwd();
manifestPath = resolve(root, manifestPath);
workDir = resolve(root, workDir);
dbPath = resolve(root, dbPath);
reportPath = resolve(root, reportPath);
const downloads = join(workDir, 'transcripts');

await mkdir(downloads, { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function human(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = Number(bytes) || 0;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return value.toFixed(index ? 1 : 0) + ' ' + units[index];
}

async function digestFile(path, algorithm) {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(path), new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      callback();
    },
  }));
  return hash.digest('hex');
}

async function download(url, target, {
  expectedMd5,
  minimumBytes = 1,
  force = false,
} = {}) {
  if (!force && await exists(target)) {
    const size = (await stat(target)).size;
    if (size >= minimumBytes) {
      const md5 = await digestFile(target, 'md5');
      if (!expectedMd5 || md5 === expectedMd5) {
        console.log('Reuse ' + basename(target) + ' (' + human(size) + ', md5 ' + md5.slice(0, 12) + '…)');
        return { path: target, size, md5, reused: true };
      }
    }
    await rm(target, { force: true });
  }

  console.log('Download ' + url);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'RhymeLab/0.11 (+https://github.com/Graph1ks/rhymelab)',
      'Accept': 'application/pdf,application/octet-stream,*/*',
      'Referer': 'https://zenodo.org/',
    },
  });
  if (!response.ok || !response.body) {
    throw new Error('Download failed ' + response.status + ': ' + url);
  }

  let bytes = 0;
  const progress = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(target));

  const size = (await stat(target)).size;
  if (size < minimumBytes) {
    throw new Error('Downloaded file is unexpectedly small: ' + target + ' (' + size + ' bytes)');
  }
  const md5 = await digestFile(target, 'md5');
  if (expectedMd5 && md5 !== expectedMd5) {
    throw new Error('MD5 mismatch for ' + target + ': expected ' + expectedMd5 + ', got ' + md5);
  }
  console.log('  saved ' + human(size) + ', md5 ' + md5.slice(0, 12) + '…');
  return { path: target, size, md5, reused: false };
}

function hasPdfJs() {
  const probe = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "await import('pdfjs-dist/legacy/build/pdf.mjs')",
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return probe.status === 0;
}

function ensurePdfJs() {
  if (hasPdfJs()) return;
  if (noAutoInstall) {
    throw new Error(
      'pdfjs-dist is missing. Run npm install --no-save --ignore-scripts pdfjs-dist@'
      + PDFJS_VERSION + ' and retry.',
    );
  }

  console.log(
    'Install pinned PDF parser pdfjs-dist@' + PDFJS_VERSION
    + ' locally (~33 MB unpacked, build-time only)…',
  );
  const install = spawnSync('npm', [
    'install',
    '--no-save',
    '--ignore-scripts',
    'pdfjs-dist@' + PDFJS_VERSION,
  ], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  if (install.error || install.status !== 0 || !hasPdfJs()) {
    throw new Error('Could not install/load pdfjs-dist@' + PDFJS_VERSION);
  }
}

function runNode(script, scriptArgs) {
  const result = spawnSync(process.execPath, ['--no-warnings', script, ...scriptArgs], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(script + ' failed with exit ' + String(result.status ?? 'spawn error'));
  }
}

if (!await exists(dbPath)) {
  throw new Error(
    'Phrase catalog DB not found: ' + dbPath
    + '. Run npm run phrase:catalog:bootstrap first.',
  );
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const transcriptInputs = [];
let totalDownloadBytes = 0;
const zenodoFileUrls = new Map();
if (manifest.zenodo_record_id) {
  try {
    const recordResponse = await fetch(
      'https://zenodo.org/api/records/' + encodeURIComponent(manifest.zenodo_record_id),
      {
        headers: {
          'User-Agent': 'RhymeLab/0.11 (+https://github.com/Graph1ks/rhymelab)',
          'Accept': 'application/json',
        },
      },
    );
    if (recordResponse.ok) {
      const record = await recordResponse.json();
      for (const item of record.files || []) {
        const key = String(item.key || '');
        const contentUrl = item.links?.content || item.links?.self;
        if (key && contentUrl) zenodoFileUrls.set(key, contentUrl);
      }
    } else {
      console.warn('Zenodo record API returned ' + recordResponse.status + '; use manifest URLs.');
    }
  } catch (error) {
    console.warn('Zenodo record API lookup failed; use manifest URLs: ' + (error?.message || error));
  }
}

for (const file of manifest.files || []) {
  const safeName = file.group + '-transcription.pdf';
  const target = join(downloads, safeName);
  const sourceUrl = zenodoFileUrls.get(file.name) || file.url;
  const downloaded = await download(sourceUrl, target, {
    expectedMd5: file.md5,
    minimumBytes: 100_000,
    force: refresh,
  });
  totalDownloadBytes += downloaded.size;
  transcriptInputs.push({ group: file.group, path: target });
}

ensurePdfJs();

const enrichArgs = [
  '--db', dbPath,
  '--manifest', manifestPath,
  '--report', reportPath,
];
for (const input of transcriptInputs) {
  enrichArgs.push('--pdf', input.group + '=' + input.path);
}

console.log('\nBuild Cologne youth/urban/spoken register evidence…');
runNode('scripts/enrich-de-phrase-register-cologne.mjs', enrichArgs);

console.log('\nCOLOGNE KIEZDEUTSCH REGISTER EVIDENCE COMPLETE');
console.log(JSON.stringify({
  database: dbPath,
  report: reportPath,
  transcription_download_bytes: totalDownloadBytes,
  transcription_download_mib: Number((totalDownloadBytes / 1024 / 1024).toFixed(2)),
  audio_downloaded: false,
  pdf_parser: 'pdfjs-dist@' + PDFJS_VERSION,
  runtime_rewired: false,
}, null, 2));
