#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function collect(path) {
  const out = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...await collect(full));
    else if (/\.(?:mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [];
for (const root of ['src', 'scripts', 'tests']) files.push(...await collect(root));
let failed = false;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`Syntax check failed: ${file}`);
    process.stderr.write(result.stderr || result.stdout || '');
  }
}
if (failed) process.exit(1);
console.log(`Syntax OK: ${files.length} JavaScript files`);
