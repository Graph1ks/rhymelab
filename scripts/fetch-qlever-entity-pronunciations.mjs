#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import {
  WIKIDATA_P898_SOURCE_POLICY,
  WIKIDATA_P898_SOURCE_SCHEMA,
  buildWikidataP898Query,
} from './entity-wikidata-p898-core.mjs';

const args = process.argv.slice(2);
let taxonomyPath = 'sources/entity/wikidata-entity-taxonomy-v1.json';
let manifestPath = 'sources/entity/wikidata-p898-pronunciation-v1.json';
let endpoint = 'https://qlever.dev/api/wikidata';
let retrievalLabel = new Date().toISOString().slice(0, 10).replaceAll('-', '');
let outPath = '';
let reportPath = 'data/local/entity-wikidata-p898-source-report.json';
let maxAttempts = 6;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--taxonomy') taxonomyPath = args[++i] || taxonomyPath;
  else if (arg === '--manifest') manifestPath = args[++i] || manifestPath;
  else if (arg === '--endpoint') endpoint = args[++i] || endpoint;
  else if (arg === '--retrieval-label') retrievalLabel = args[++i] || retrievalLabel;
  else if (arg === '--out') outPath = args[++i] || outPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--max-attempts') maxAttempts = Number.parseInt(args[++i] || '', 10) || maxAttempts;
}

if (!outPath) outPath = `data/raw/entity/pronunciation/wikidata-p898-${retrievalLabel}.tsv.gz`;
taxonomyPath = resolve(taxonomyPath);
manifestPath = resolve(manifestPath);
outPath = resolve(outPath);
reportPath = resolve(reportPath);
await mkdir(dirname(outPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });

const [taxonomyBytes, manifestRaw] = await Promise.all([
  readFile(taxonomyPath),
  readFile(manifestPath, 'utf8'),
]);
const taxonomy = JSON.parse(taxonomyBytes.toString('utf8'));
const manifest = JSON.parse(manifestRaw);
const taxonomySha256 = createHash('sha256').update(taxonomyBytes).digest('hex');
const query = buildWikidataP898Query(taxonomy);
const querySha256 = createHash('sha256').update(query).digest('hex');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function reuseExisting() {
  if (!(await exists(outPath)) || !(await exists(reportPath))) return null;
  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    if (
      report.schema !== WIKIDATA_P898_SOURCE_SCHEMA
      || report.policy !== WIKIDATA_P898_SOURCE_POLICY
      || report.status !== 'ok'
      || report.query_sha256 !== querySha256
      || report.taxonomy_sha256 !== taxonomySha256
      || resolve(report.artifact) !== outPath
    ) return null;
    const actualSha = await sha256File(outPath);
    if (actualSha !== report.gzip_sha256) return null;
    return { ...report, cached: true };
  } catch {
    return null;
  }
}

function retryDelayMs(response, attempt) {
  const retry = response.headers.get('retry-after');
  if (retry) {
    const seconds = Number.parseInt(retry, 10);
    if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
    const date = Date.parse(retry);
    if (Number.isFinite(date)) return Math.max(1000, date - Date.now());
  }
  return Math.min(120000, 15000 * attempt);
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function openQueryResponse() {
  const url = new URL(endpoint);
  url.searchParams.set('query', query);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/tab-separated-values',
        'User-Agent': 'Graph1ks-RhymeLab-P898-Source/1.0',
      },
      redirect: 'follow',
    });
    if (response.ok) return { response, attempt, requestUrl: String(url) };
    if (response.status === 429 && attempt < maxAttempts) {
      const delay = retryDelayMs(response, attempt);
      console.error(
        `[entity-p898] rate-limited; retry ${attempt}/${maxAttempts} in ${Math.round(delay / 1000)}s`,
      );
      await response.body?.cancel();
      await sleep(delay);
      continue;
    }
    const body = (await response.text()).slice(0, 2000);
    throw new Error(`QLever P898 export failed HTTP ${response.status}: ${body}`);
  }
  throw new Error('QLever P898 export exhausted retries');
}

const cached = await reuseExisting();
if (cached) {
  console.error('[entity-p898] verified cached selective P898 artifact');
  console.log(JSON.stringify(cached, null, 2));
  process.exit(0);
}

const partPath = `${outPath}.part`;
await rm(partPath, { force: true });
const startedAt = new Date().toISOString();
const wallStarted = Date.now();
const { response, attempt, requestUrl } = await openQueryResponse();
const rawHash = createHash('sha256');
let rawBytes = 0;
let lineBreaks = 0;
const gzip = createGzip({ level: 6 });
const output = createWriteStream(partPath, { flags: 'wx' });
const pipeDone = pipeline(gzip, output);

try {
  for await (const value of response.body) {
    const chunk = Buffer.from(value);
    rawHash.update(chunk);
    rawBytes += chunk.length;
    for (let offset = 0; (offset = chunk.indexOf(10, offset)) !== -1; offset += 1) {
      lineBreaks += 1;
    }
    if (!gzip.write(chunk)) await once(gzip, 'drain');
  }
  gzip.end();
  await pipeDone;
  await rename(partPath, outPath);
} catch (error) {
  gzip.destroy();
  await rm(partPath, { force: true });
  throw error;
}

const report = {
  schema: WIKIDATA_P898_SOURCE_SCHEMA,
  policy: WIKIDATA_P898_SOURCE_POLICY,
  status: 'ok',
  source_id: manifest.source_id,
  source_name: manifest.name,
  source_property: manifest.property,
  source_license: manifest.license_id,
  commercial_use: manifest.commercial_use === true,
  runtime_use: manifest.runtime_use === true,
  endpoint,
  retrieval_label: retrievalLabel,
  retrieval_started_at: startedAt,
  retrieval_finished_at: new Date().toISOString(),
  taxonomy: taxonomyPath,
  taxonomy_sha256: taxonomySha256,
  query,
  query_sha256: querySha256,
  request_url: requestUrl,
  http_attempts: attempt,
  response_content_type: response.headers.get('content-type'),
  artifact: outPath,
  rows: Math.max(0, lineBreaks - 1),
  raw_bytes: rawBytes,
  raw_sha256: rawHash.digest('hex'),
  gzip_bytes: (await stat(outPath)).size,
  gzip_sha256: await sha256File(outPath),
  elapsed_ms: Date.now() - wallStarted,
  cached: false,
  freshness_semantics:
    'retrieval timestamp is not a dated Wikidata snapshot; the local selective response is pinned by exact query and SHA-256',
  runtime_network_dependency: false,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.error(
  `[entity-p898] rows=${report.rows.toLocaleString()} raw=${(rawBytes / 1024 / 1024).toFixed(1)}MiB `
  + `gzip=${(report.gzip_bytes / 1024 / 1024).toFixed(1)}MiB`,
);
console.log(JSON.stringify(report, null, 2));
