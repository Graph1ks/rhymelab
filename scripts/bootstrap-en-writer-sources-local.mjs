#!/usr/bin/env node
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gitBlobSha1File, readJson, sha256File } from './en-writer-source-core.mjs';

const args = process.argv.slice(2);
let registryPath = 'sources/en/phase12b-sources-v1.json';
let rawDir = null;
let reportPath = null;
let refreshKaikki = false;
let refreshAll = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--registry') registryPath = args[++i] || registryPath;
  else if (arg === '--raw-dir') rawDir = args[++i] || rawDir;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--refresh-kaikki') refreshKaikki = true;
  else if (arg === '--refresh') refreshAll = true;
}

registryPath = resolve(registryPath);
const registry = await readJson(registryPath);
rawDir = resolve(rawDir || registry.local_raw_directory || 'data/raw/en/phase12b-20260918');
reportPath = resolve(reportPath || registry.bootstrap_report || 'data/local/en-source-bootstrap-v1-report.json');
await mkdir(rawDir, { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });

function commandExists(command) {
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [command], { stdio: 'ignore' })
    : spawnSync('sh', ['-lc', `command -v "${command}" >/dev/null 2>&1`], { stdio: 'ignore' });
  return probe.status === 0;
}

function chooseCurl() {
  for (const candidate of process.platform === 'win32' ? ['curl.exe', 'curl'] : ['curl']) {
    if (commandExists(candidate)) return candidate;
  }
  return null;
}

function run(command, commandArgs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit', windowsHide: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed: exit=${code} signal=${signal || ''}`));
    });
  });
}

function human(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = Number(bytes) || 0;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function parseHeaders(raw) {
  const blocks = String(raw || '').split(/\r?\n\r?\n/u).map((value) => value.trim()).filter(Boolean);
  const final = blocks.at(-1) || '';
  const lines = final.split(/\r?\n/u);
  const headers = { status: lines[0] || null };
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    headers[line.slice(0, index).trim().toLocaleLowerCase('en-US')] = line.slice(index + 1).trim();
  }
  return headers;
}

async function validateMovingSnapshot(source) {
  const response = await fetch(source.homepage_url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Could not verify ${source.source_id} metadata: HTTP ${response.status}`);
  const text = await response.text();
  const missing = (source.snapshot?.metadata_markers || []).filter((marker) => !text.includes(marker));
  if (missing.length) {
    throw new Error(
      `${source.source_id} moving source no longer matches the pinned snapshot metadata. Missing markers: ${missing.join(', ')}. `
      + 'Update the manifest explicitly rather than silently downloading a new snapshot.',
    );
  }
}

async function downloadWithFetch(url, target) {
  const partial = `${target}.part`;
  await rm(partial, { force: true });
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed HTTP ${response.status}: ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  await rename(partial, target);
  return Object.fromEntries(response.headers.entries());
}

async function downloadWithCurl(curl, url, target) {
  const partial = `${target}.part`;
  const headerPath = `${target}.headers.tmp`;
  const commandArgs = [
    '-L', '--fail', '--retry', '8', '--retry-delay', '5', '--retry-all-errors',
    '-C', '-', '-D', headerPath, '-o', partial, url,
  ];
  await run(curl, commandArgs);
  await rename(partial, target);
  let headers = {};
  try { headers = parseHeaders(await readFile(headerPath, 'utf8')); } catch {}
  await rm(headerPath, { force: true });
  return headers;
}

async function verifyLocal(source, target) {
  const fileStat = await stat(target);
  if (source.expected_bytes && fileStat.size !== Number(source.expected_bytes)) {
    throw new Error(`${source.source_id} size mismatch: expected ${source.expected_bytes}, got ${fileStat.size}`);
  }
  if (source.expected_minimum_bytes && fileStat.size < Number(source.expected_minimum_bytes)) {
    throw new Error(`${source.source_id} is unexpectedly small: ${fileStat.size} bytes`);
  }
  const sha256 = await sha256File(target);
  let gitBlobSha1 = null;
  if (source.git_blob_sha1) {
    gitBlobSha1 = await gitBlobSha1File(target);
    if (gitBlobSha1 !== source.git_blob_sha1) {
      throw new Error(`${source.source_id} Git blob SHA-1 mismatch: expected ${source.git_blob_sha1}, got ${gitBlobSha1}`);
    }
  }
  return { bytes: fileStat.size, sha256, git_blob_sha1: gitBlobSha1 };
}

const curl = chooseCurl();
const artifacts = [];
for (const source of registry.sources || []) {
  const target = resolve(rawDir, source.local_filename || basename(new URL(source.upstream_url).pathname));
  const isKaikki = source.source_id.startsWith('enwiktionary-kaikki');
  const force = refreshAll || (isKaikki && refreshKaikki);
  let reused = false;
  let headers = {};

  if (existsSync(target) && !force) {
    try {
      const verified = await verifyLocal(source, target);
      console.log(`Reuse ${source.source_id}: ${human(verified.bytes)} sha256:${verified.sha256.slice(0, 12)}…`);
      artifacts.push({
        source_id: source.source_id,
        path: target,
        reused: true,
        ...verified,
        http: null,
      });
      continue;
    } catch (error) {
      console.warn(`Existing ${source.source_id} failed verification; redownloading: ${error.message}`);
      await rm(target, { force: true });
    }
  }

  if (isKaikki) await validateMovingSnapshot(source);
  console.log(`Download ${source.source_id} -> ${target}`);
  if (curl) headers = await downloadWithCurl(curl, source.upstream_url, target);
  else headers = await downloadWithFetch(source.upstream_url, target);
  const verified = await verifyLocal(source, target);
  console.log(`Verified ${source.source_id}: ${human(verified.bytes)} sha256:${verified.sha256.slice(0, 12)}…`);
  artifacts.push({
    source_id: source.source_id,
    path: target,
    reused,
    ...verified,
    http: {
      etag: headers.etag || null,
      last_modified: headers['last-modified'] || null,
      content_length: headers['content-length'] || null,
      status: headers.status || null,
    },
  });
}

const report = {
  schema: 'rhymelab-en-source-bootstrap-report-v1',
  generated_at: new Date().toISOString(),
  registry: registryPath,
  registry_id: registry.id,
  raw_directory: rawDir,
  artifacts,
  notes: [
    'Raw artifacts remain gitignored and local.',
    'Content-addressed GitHub source files are verified against pinned Git blob SHA-1 plus local SHA-256.',
    'The moving Kaikki raw URL is guarded by pinned dump/extraction metadata before a fresh download; the downloaded bytes are then pinned locally by SHA-256.',
    'This bootstrap does not materialize the English Writer database and performs no G2P.',
  ],
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('\nPHASE 12B1 ENGLISH SOURCE BOOTSTRAP COMPLETE');
console.log(JSON.stringify({
  schema: report.schema,
  registry_id: report.registry_id,
  raw_directory: report.raw_directory,
  artifacts: artifacts.map((artifact) => ({
    source_id: artifact.source_id,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    reused: artifact.reused,
  })),
  report: reportPath,
}, null, 2));
