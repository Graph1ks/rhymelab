#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
let bootstrapReportPath = 'data/local/entity-source-bootstrap-v1-report.json';
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--bootstrap-report') bootstrapReportPath = args[++i] || bootstrapReportPath;
}
bootstrapReportPath = resolve(bootstrapReportPath);

const bootstrap = JSON.parse(await readFile(bootstrapReportPath, 'utf8'));
if (bootstrap.schema !== 'rhymelab-entity-source-bootstrap-report-v1' || bootstrap.status !== 'ok') {
  throw new Error('Entity source bootstrap report is missing or not accepted.');
}
if (!bootstrap.wikidata?.official_checksum_match) {
  throw new Error('Wikidata official checksum gate has not passed.');
}
if (!bootstrap.wikidata?.local_sha256 || !bootstrap.qrank?.local_sha256) {
  throw new Error('Pinned source SHA-256 fingerprints are missing.');
}

async function runNode(script, scriptArgs) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--no-warnings', script, ...scriptArgs], {
      stdio: 'inherit',
      windowsHide: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${script} failed: exit=${code} signal=${signal || ''}`));
    });
  });
}

await runNode('scripts/stage-wikidata-entities.mjs', [
  '--input', bootstrap.wikidata.path,
  '--snapshot', bootstrap.wikidata.snapshot_label,
  '--source-url', bootstrap.wikidata.url,
  '--input-sha256', bootstrap.wikidata.local_sha256,
]);

await runNode('scripts/stage-qrank.mjs', [
  '--input', bootstrap.qrank.path,
  '--snapshot', bootstrap.qrank.snapshot_label,
  '--source-url', bootstrap.qrank.url,
  '--input-sha256', bootstrap.qrank.local_sha256,
]);

await runNode('scripts/diagnose-entity-cut.mjs', []);
