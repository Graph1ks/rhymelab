#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const bootstrapMissing = args.includes('--bootstrap-missing');
const root = process.cwd();

const required = [
  'data/de/usage/de-usage.tsv',
  'data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz',
  'data/de/source-snapshot.json',
];

async function exists(path) {
  try { await access(resolve(root, path)); return true; } catch { return false; }
}

function run(script, scriptArgs = []) {
  console.log(`\n> node ${script} ${scriptArgs.join(' ')}`.trimEnd());
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${script} failed with exit ${result.status ?? 'spawn error'}`);
  }
}

async function missingRequired() {
  const rows = [];
  for (const path of required) if (!await exists(path)) rows.push(path);
  return rows;
}

let missing = await missingRequired();
if (missing.length) {
  console.log('Missing local publish prerequisites:');
  for (const path of missing) console.log(`  - ${path}`);

  if (!bootstrapMissing) {
    console.log('\nThese files are generated/local-only and are intentionally not stored in Git.');
    console.log('Run this command to prepare only the publish prerequisites, then rerun this script:');
    console.log('  node scripts/bootstrap-de-rhyme-core-local.mjs --publish-prereqs-only');
    console.log('\nOr rerun this pipeline with automatic prerequisite preparation:');
    console.log('  node scripts/build-writer-v5-owner.mjs --bootstrap-missing');
    process.exit(2);
  }

  run('scripts/bootstrap-de-rhyme-core-local.mjs', ['--publish-prereqs-only']);
  missing = await missingRequired();
  if (missing.length) {
    throw new Error(`Publish prerequisite bootstrap completed but files are still missing: ${missing.join(', ')}`);
  }
}

run('scripts/build-de-rhyme-publish.mjs', ['--writer-lexical-v3']);
run('scripts/build-local-db.mjs', ['--publish', 'data/de/publish-v3']);
run('scripts/materialize-writer-v5.mjs');

console.log('\nWRITER V5 OWNER BUILD COMPLETE');
console.log('Generated experimental outputs:');
console.log('  data/de/publish-v3/manifest.json');
console.log('  data/local/rhymelab-v5.sqlite');
console.log('  data/local/build-report-v5.json');
console.log('  data/local/writer-materialization-v5-report.json');
console.log('\nAccepted v4 runtime/database paths were not selected by this pipeline.');
