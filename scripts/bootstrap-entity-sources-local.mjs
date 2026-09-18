#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
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
let aria2Connections = Number.parseInt(process.env.RHYMELAB_ARIA2_CONNECTIONS || '8', 10) || 8;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--registry') registryPath = args[++i] || registryPath;
  else if (arg === '--raw-dir') rawDir = args[++i] || rawDir;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--allow-low-space') allowLowSpace = true;
  else if (arg === '--refresh-qrank') refreshQRank = true;
  else if (arg === '--aria2-connections') aria2Connections = Number.parseInt(args[++i] || '', 10) || aria2Connections;
}

registryPath = resolve(registryPath);
rawDir = resolve(rawDir);
reportPath = resolve(reportPath);

function commandExists(command) {
  if (existsSync(command)) return true;
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [command], { stdio: 'ignore' })
    : spawnSync('sh', ['-lc', `command -v "${command}" >/dev/null 2>&1`], { stdio: 'ignore' });
  return probe.status === 0;
}

function windows7ZipCandidates() {
  const values = [
    process.env.ProgramFiles && resolve(process.env.ProgramFiles, '7-Zip', '7z.exe'),
    process.env['ProgramFiles(x86)'] && resolve(process.env['ProgramFiles(x86)'], '7-Zip', '7z.exe'),
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ];
  return [...new Set(values.filter(Boolean))];
}

function chooseCurl() {
  const names = process.platform === 'win32' ? ['curl.exe', 'curl'] : ['curl'];
  return names.find(commandExists) || null;
}

function findFileRecursive(root, filename, maxDepth = 4) {
  if (!root || !existsSync(root) || maxDepth < 0) return null;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
      return resolve(root, entry.name);
    }
  }

  if (maxDepth === 0) return null;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findFileRecursive(resolve(root, entry.name), filename, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

function windowsAria2Candidates() {
  const wingetPackagesRoot = process.env.LOCALAPPDATA
    ? resolve(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
    : null;
  let wingetPackageExecutable = null;

  if (wingetPackagesRoot && existsSync(wingetPackagesRoot)) {
    let packageDirs = [];
    try {
      packageDirs = readdirSync(wingetPackagesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^aria2\.aria2_/iu.test(entry.name))
        .map((entry) => resolve(wingetPackagesRoot, entry.name));
    } catch {
      packageDirs = [];
    }

    for (const packageDir of packageDirs) {
      wingetPackageExecutable = findFileRecursive(packageDir, 'aria2c.exe', 4);
      if (wingetPackageExecutable) break;
    }
  }

  const values = [
    process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'aria2c.exe'),
    wingetPackageExecutable,
    process.env.ProgramFiles && resolve(process.env.ProgramFiles, 'aria2', 'aria2c.exe'),
    'C:\\Program Files\\aria2\\aria2c.exe',
  ];
  return [...new Set(values.filter(Boolean))];
}

function chooseAria2() {
  const explicit = String(process.env.RHYMELAB_ARIA2_CMD || '').trim();
  if (explicit) return commandExists(explicit) ? explicit : null;
  const names = process.platform === 'win32'
    ? ['aria2c', 'aria2c.exe', ...windowsAria2Candidates()]
    : ['aria2c'];
  return names.find(commandExists) || null;
}

function chooseBzip2Decompressor() {
  const explicit = String(process.env.RHYMELAB_BZIP2_CMD || '').trim();
  if (explicit) return explicit;
  const names = process.platform === 'win32'
    ? ['7z', '7z.exe', '7zz', 'bzip2', ...windows7ZipCandidates()]
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

async function downloadWithAria2(aria2, url, output, connections) {
  await mkdir(dirname(output), { recursive: true });
  const boundedConnections = Math.max(2, Math.min(16, Number(connections) || 8));
  const ariaArgs = [
    '--continue=true',
    `--max-connection-per-server=${boundedConnections}`,
    `--split=${boundedConnections}`,
    '--min-split-size=4M',
    '--file-allocation=none',
    '--auto-file-renaming=false',
    '--max-tries=5',
    '--retry-wait=5',
    '--timeout=60',
    '--connect-timeout=30',
    '--summary-interval=5',
    '--console-log-level=notice',
    '--dir', dirname(output),
    '--out', basename(output),
    url,
  ];
  await run(aria2, ariaArgs);
  return boundedConnections;
}

async function downloadWithAria2Fallbacks(aria2, transports, output, connections) {
  const attempts = [];
  for (const transport of transports) {
    console.log(`Trying Wikidata transport: ${transport.id} -> ${transport.url}`);
    try {
      const usedConnections = await downloadWithAria2(
        aria2,
        transport.url,
        output,
        connections,
      );
      attempts.push({ id: transport.id, url: transport.url, status: 'completed' });
      return {
        selected: transport,
        connections: usedConnections,
        attempts,
      };
    } catch (error) {
      attempts.push({
        id: transport.id,
        url: transport.url,
        status: 'failed',
        error: String(error?.message || error),
      });
      console.warn(`Wikidata transport failed: ${transport.id}`);
    }
  }

  throw new Error(
    'All configured Wikidata transports failed. Existing partial data was kept for resume. '
    + JSON.stringify(attempts),
  );
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
const wikidataTransports = Array.isArray(wd.transport_urls) && wd.transport_urls.length
  ? wd.transport_urls
  : [{ id: 'wikimedia-origin', role: 'origin_fallback', url: wd.url }];
const curl = chooseCurl();
if (!curl) throw new Error('curl is required for QRank download and source metadata capture.');
const aria2 = chooseAria2();
const bzip2 = chooseBzip2Decompressor();
if (!bzip2) {
  throw new Error(
    'No streaming bzip2 decompressor found. Install 7-Zip (winget install --id 7zip.7zip -e), '
    + 'bzip2/lbzip2, or set RHYMELAB_BZIP2_CMD to the executable path before downloading '
    + 'the 96 GiB Wikidata .bz2 snapshot.',
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
let wikidataDownloader = 'already-complete';
let wikidataConnections = 0;
let wikidataTransport = null;
let wikidataTransportAttempts = [];
if (!wikidataExisting || Number(wikidataExisting.size) !== Number(wd.bytes)) {
  if (!aria2) {
    const wingetProbe = process.platform === 'win32'
      ? spawnSync('winget', ['list', '--id', 'aria2.aria2', '-e'], { encoding: 'utf8' })
      : null;
    const installedHint = wingetProbe?.status === 0
      ? ' WinGet reports aria2.aria2 as installed, but aria2c.exe could not be located.'
      : '';
    throw new Error(
      'aria2c is required for the 96 GiB Wikidata download to avoid single-stream throttling.'
      + installedHint
      + ' Install/reinstall it with: winget install --id aria2.aria2 -e --accept-package-agreements '
      + '--accept-source-agreements. Then rerun this command; the existing curl partial file '
      + 'will be continued, not discarded. You can override detection with RHYMELAB_ARIA2_CMD.',
    );
  }
  console.log(
    `Downloading pinned Wikidata snapshot with aria2 (${aria2Connections} requested connections) `
    + `to ${wikidataPath}`,
  );
  const transportResult = await downloadWithAria2Fallbacks(
    aria2,
    wikidataTransports,
    wikidataPath,
    aria2Connections,
  );
  wikidataConnections = transportResult.connections;
  wikidataTransport = transportResult.selected;
  wikidataTransportAttempts = transportResult.attempts;
  wikidataDownloader = 'aria2';
}

const wikidataStat = await stat(wikidataPath);
if (Number(wikidataStat.size) !== Number(wd.bytes)) {
  throw new Error(
    `Wikidata size mismatch: got ${wikidataStat.size}, expected ${wd.bytes}. `
    + 'Keep the partial file and rerun; aria2 will resume.',
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
    aria2: aria2 || null,
    aria2_connections: wikidataConnections,
    bzip2_decompressor: bzip2,
  },
  wikidata: {
    source_id: wikidata.source_id,
    snapshot_label: wd.snapshot_label,
    url: wd.url,
    canonical_url: wd.url,
    transport_url: wikidataTransport?.url || null,
    transport_id: wikidataTransport?.id || null,
    transport_role: wikidataTransport?.role || null,
    transport_attempts: wikidataTransportAttempts,
    path: wikidataPath,
    filename: basename(wikidataPath),
    bytes: Number(wikidataStat.size),
    official_checksum_algorithm: wd.official_checksum_algorithm,
    official_checksum_expected: wd.official_checksum,
    official_checksum_actual: wikidataSha1,
    official_checksum_match: true,
    local_sha256: wikidataSha256,
    downloader: wikidataDownloader,
    parallel_connections: wikidataConnections,
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
