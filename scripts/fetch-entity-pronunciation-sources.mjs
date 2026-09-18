#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
let manifestPath = 'sources/entity/cmudict-entity-pronunciation-v1.json';
let outPath = 'data/raw/entity/pronunciation/cmudict-entity-pronunciation-v1.dict';
let reportPath = 'data/local/entity-pronunciation-source-report.json';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--manifest') manifestPath = args[++i] || manifestPath;
  else if (arg === '--out') outPath = args[++i] || outPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
}

manifestPath = resolve(manifestPath);
outPath = resolve(outPath);
reportPath = resolve(reportPath);
await mkdir(dirname(outPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

async function verifiedLocalArtifact() {
  try {
    const bytes = await readFile(outPath);
    const sha = gitBlobSha1(bytes);
    if (sha === manifest.git_blob_sha1) return { bytes, sha, cached: true };
  } catch {}
  return null;
}

let artifact = await verifiedLocalArtifact();
if (!artifact) {
  console.error(`[entity-pronunciation:sources] fetching pinned CMUdict commit ${manifest.commit}`);
  const response = await fetch(manifest.raw_url, {
    headers: { 'user-agent': 'RhymeLab entity pronunciation source builder' },
  });
  if (!response.ok) {
    throw new Error(`CMUdict fetch failed: HTTP ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha = gitBlobSha1(bytes);
  if (sha !== manifest.git_blob_sha1) {
    throw new Error(
      `CMUdict blob mismatch: expected ${manifest.git_blob_sha1}, got ${sha}`,
    );
  }
  await writeFile(outPath, bytes);
  artifact = { bytes, sha, cached: false };
} else {
  console.error('[entity-pronunciation:sources] verified cached CMUdict artifact');
}

const lineCount = String(artifact.bytes).split(/\r?\n/u).filter(Boolean).length;
const report = {
  schema: 'rhymelab-entity-pronunciation-source-report-v1',
  status: 'ok',
  source_id: manifest.source_id,
  source_name: manifest.name,
  source_commit: manifest.commit,
  source_git_blob_sha1: artifact.sha,
  source_license: manifest.license_id,
  commercial_use: manifest.commercial_use === true,
  runtime_use: manifest.runtime_use === true,
  artifact: outPath,
  artifact_bytes: (await stat(outPath)).size,
  dictionary_lines: lineCount,
  cached: artifact.cached,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
