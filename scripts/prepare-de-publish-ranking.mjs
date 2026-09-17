#!/usr/bin/env node
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import readline from 'node:readline';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const inputPath = resolve(argValue('--input', 'data/de/usage/de-usage.tsv'));
const outputPath = resolve(argValue('--out', 'data/de/usage/de-usage-publish.tsv'));

try {
  await access(inputPath);
} catch {
  throw new Error(`Usage ranking not found: ${inputPath}`);
}

await mkdir(dirname(outputPath), { recursive: true });
const input = createReadStream(inputPath, { encoding: 'utf8' });
const output = createWriteStream(outputPath, { encoding: 'utf8' });
const rl = readline.createInterface({ input, crlfDelay: Infinity });

let header = null;
let idx = null;
let rows = 0;
let expectedRank = 1;

function writeLine(line) {
  if (output.write(`${line}\n`)) return Promise.resolve();
  return new Promise((resolvePromise, reject) => {
    output.once('drain', resolvePromise);
    output.once('error', reject);
  });
}

for await (const line of rl) {
  if (!line) continue;
  if (!header) {
    header = line.split('\t');
    idx = Object.fromEntries(header.map((name, index) => [name, index]));
    for (const required of ['rank', 'form', 'normalized_form', 'usage_score']) {
      if (!(required in idx)) throw new Error(`Usage ranking missing required column: ${required}`);
    }
    await writeLine('rank\tform\tnormalized_form\tusage_score');
    continue;
  }

  const columns = line.split('\t');
  const rank = Number.parseInt(columns[idx.rank] || '', 10);
  const form = columns[idx.form] || '';
  const normalized = columns[idx.normalized_form] || '';
  const score = columns[idx.usage_score] || '';
  if (!Number.isInteger(rank) || rank < 1 || !form || !normalized) continue;
  if (rank !== expectedRank) {
    throw new Error(`Usage ranks must be contiguous while compacting: expected ${expectedRank}, got ${rank}`);
  }
  await writeLine(`${rank}\t${form}\t${normalized}\t${score}`);
  rows += 1;
  expectedRank += 1;
  if (rows % 250000 === 0) {
    console.log(`[publish-ranking] rows=${rows.toLocaleString('de-DE')}`);
  }
}

await new Promise((resolvePromise, reject) => {
  output.end(resolvePromise);
  output.once('error', reject);
});

if (!header || rows === 0) throw new Error(`Usage ranking is empty: ${inputPath}`);
console.log(`Wrote ${rows.toLocaleString('de-DE')} compact publish-ranking rows to ${outputPath}`);
