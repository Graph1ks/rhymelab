#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir, readFile, rm, stat, statfs, writeFile,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
let registryPath = 'sources/entity/phase12a-sources-v1.json';
let rawDir = 'data/raw/entity/phase12a-20260918';
let reportPath = 'data/local/entity-source-bootstrap-v1-report.json';
let allowLowSpace = false;
let refreshQRank = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--registry') registryPath = args[++i] || registryPath;
  else if (arg === '--raw-dir') rawDir = args[++i] || rawDir;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--allow-low-space') allowLowSpace = true;
  else if (arg === '--refresh-qrank') refreshQRank = true;
}

registryPath = resolve(registryPath);
rawDir = resolve(rawDir);
reportPath = resolve(reportPath);

function commandExists(command) {
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [command], { stdio: 'ignore' })
    : spawnSync('sh', ['-lc', `command -v "${command}" >/dev/null 2>&1`], { stdio: 'ignore' });
  return probe.status === 0;
}

function chooseCurl() {
  const names = process.platform === 'win32' ? ['curl.exe', 'curl'] : ['curl'];
  return names.find(commandExists) || null;
}

function chooseBzip2Decompressor() {
  const explicit = String(process.env.RHYMELAB_BZIP2_CMD || '').trim();
  if (explicit) return explicit;
  const names = process.platform === 'win32'
    ? ['7z', '7zz', 'bzip2']
    : ['lbzip2', 'bzip2', '7zz', '7z'];
  return names.find(commandExists) || null;
}

async function hashFile(path, algorithm) {
  const hash = createHash(algorithm);
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

async function run(command, commandArgs) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      windowsHide: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed: exit=${code} signal=${signal || ''}`));
    });
  });
}

async function downloadWithCurl(curl, url, output, headers, { resume = true } = {}) {
  await mkdir(dirname(output), { recursive: true });
  const curlArgs = [
    '-L',
    '--fail',
    '--retry', '8',
    '--retry-delay', '10',
    '--retry-all-errors',
    '-D', headers,
  ];
  if (resume) curlArgs.push('-C', '-');
  curlArgs.push('-o', output, url);
  await run(curl, curlArgs);
}

function parseHeaders(raw) {
  const blocks = String(raw).split(/\r?\n\r?\n/u).map((x) => x.trim()).filter(Boolean);
  const final = blocks.at(-1) || '';
  const rows = final.split(/\r?\n/u);
  const out = { status: rows[0] || null };
  for (const line of rows.slice(1)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return out;
}

await mkdir(rawDir, { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const wikidata = registry.sources.find((row) => row.source_id === 'wikidata-json-entities');
const qrank = registry.sources.find((row) => row.source_id === 'wikidata-qrank');
if (!wikidata?.selected_owner_snapshot) throw new Error('Registry has no selected Wikidata owner snapshot.');
if (!qrank?.selected_owner_snapshot_policy) throw new Error('Registry has no selected QRank owner snapshot policy.');

const wd = wikidata.selected_owner_snapshot;
const qr = qrank.selected_owner_snapshot_policy;
const curl = chooseCurl();
if (!curl) throw new Error('curl is required for resumable owner-source downloads.');
const bzip2 = chooseBzip2Decompressor();
if (!bzip2) {
  throw new Error(
    'No streaming bzip2 decompressor found. Install 7-Zip CLI, bzip2/lbzip2, '
    + 'or set RHYMELAB_BZIP2_CMD before downloading the 96 GiB Wikidata .bz2 snapshot.',
  );
}

const fsInfo = await statfs(rawDir, { bigint: true });
const freeBytes = fsInfo.bavail * fsInfo.bsize;
const gib = 1024n ** 3n;
const recommendedFreeBytes = BigInt(wd.bytes) + 40n * gib;
if (!allowLowSpace && freeBytes < recommendedFreeBytes) {
  throw new Error(
    `Insufficient free space for safe staging. Free=${Number(freeBytes / gib)} GiB, `
    + `recommended>=${Number(recommendedFreeBytes / gib)} GiB. `
    + 'Use --allow-low-space only if you have a separate staging-space plan.',
  );
}

const wikidataPath = resolve(rawDir, wd.filename);
const wikidataHeadersPath = `${wikidataPath}.headers.txt`;
const wikidataExisting = await stat(wikidataPath).catch(() => null);
if (!wikidataExisting || Number(wikidataExisting.size) !== Number(wd.bytes)) {
  console.log(`Downloading pinned Wikidata snapshot to ${wikidataPath}`);
  await downloadWithCurl(curl, wd.url, wikidataPath, wikidataHeadersPath, { resume: true });
}

const wikidataStat = await stat(wikidataPath);
if (Number(wikidataStat.size) !== Number(wd.bytes)) {
  throw new Error(
    `Wikidata size mismatch: got ${wikidataStat.size}, expected ${wd.bytes}. `
    + 'Keep the partial file and rerun; curl will resume.',
  );
}

console.log('Verifying official Wikidata SHA-1...');
const wikidataSha1 = await hashFile(wikidataPath, 'sha1');
if (wikidataSha1.toLowerCase() !== String(wd.official_checksum).toLowerCase()) {
  throw new Error(
    `Wikidata SHA-1 mismatch: got ${wikidataSha1}, expected ${wd.official_checksum}`,
  );
}
console.log('Computing local Wikidata SHA-256 snapshot fingerprint...');
const wikidataSha256 = await hashFile(wikidataPath, 'sha256');

const qrankPath = resolve(rawDir, qr.filename);
const qrankHeadersPath = `${qrankPath}.headers.txt`;
if (refreshQRank) {
  await rm(qrankPath, { force: true });
  await rm(qrankHeadersPath, { force: true });
}

const existingQRank = await stat(qrankPath).catch(() => null);
if (!existingQRank) {
  console.log(`Downloading QRank snapshot to ${qrankPath}`);
  // QRank is small enough to redownload atomically rather than resume a potentially changed "latest".
  const temp = `${qrankPath}.part`;
  const tempHeaders = `${qrankHeadersPath}.part`;
  await rm(temp, { force: true });
  await rm(tempHeaders, { force: true });
  await downloadWithCurl(curl, qr.source_url, temp, tempHeaders, { resume: false });
  const { rename } = await import('node:fs/promises');
  await rename(temp, qrankPath);
  await rename(tempHeaders, qrankHeadersPath);
}

const qrankStat = await stat(qrankPath);
const qrankSha256 = await hashFile(qrankPath, 'sha256');
const qrankHeadersRaw = await readFile(qrankHeadersPath, 'utf8').catch(() => '');
const wikidataHeadersRaw = await readFile(wikidataHeadersPath, 'utf8').catch(() => '');

const report = {
  schema: 'rhymelab-entity-source-bootstrap-report-v1',
  status: 'ok',
  built_at: new Date().toISOString(),
  registry: registryPath,
  raw_dir: rawDir,
  free_bytes_before: freeBytes.toString(),
  recommended_free_bytes: recommendedFreeBytes.toString(),
  tools: {
    curl,
    bzip2_decompressor: bzip2,
  },
  wikidata: {
    source_id: wikidata.source_id,
    snapshot_label: wd.snapshot_label,
    url: wd.url,
    path: wikidataPath,
    filename: basename(wikidataPath),
    bytes: Number(wikidataStat.size),
    official_checksum_algorithm: wd.official_checksum_algorithm,
    official_checksum_expected: wd.official_checksum,
    official_checksum_actual: wikidataSha1,
    official_checksum_match: true,
    local_sha256: wikidataSha256,
    http_headers: parseHeaders(wikidataHeadersRaw),
  },
  qrank: {
    source_id: qrank.source_id,
    snapshot_label: `retrieved-${qr.retrieval_date}`,
    url: qr.source_url,
    path: qrankPath,
    filename: basename(qrankPath),
    bytes: Number(qrankStat.size),
    local_sha256: qrankSha256,
    http_headers: parseHeaders(qrankHeadersRaw),
    historical_retrieval_guaranteed: false,
    pinned_local_artifact: true,
  },
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
