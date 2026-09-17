#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

const args = process.argv.slice(2);
const inputs = [];
let output = 'data/generated/de-10000.tsv';
let limit = 10_000;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--out') output = args[++i];
  else if (arg === '--limit') limit = Math.max(1, Number.parseInt(args[++i] || '', 10) || 10_000);
  else inputs.push(arg);
}

if (!inputs.length) {
  console.error('Usage: node scripts/build-de-seed.mjs <*_words.txt> [more *_words.txt] [--limit 10000] [--out data/generated/de-10000.tsv]');
  process.exit(1);
}

const validWord = /^\p{L}+(?:[-'’]\p{L}+)*$/u;
const rows = new Map();
const sourceMeta = [];

for (const file of inputs) {
  const sourceKey = basename(file);
  const text = await readFile(file, 'utf8');
  let accepted = 0;
  let parsed = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const columns = line.split('\t');
    if (columns.length < 3) continue;
    const form = columns[1]?.normalize('NFKC').trim();
    const count = Number.parseInt(columns.at(-1) || '', 10);
    if (!form || !Number.isFinite(count) || count <= 0) continue;
    parsed += 1;
    if (!validWord.test(form)) continue;
    if (form.length > 80) continue;
    accepted += 1;

    // Keep case-sensitive surface forms distinct. German capitalization is lexical
    // information; normalized_form is only the search/merge key used downstream.
    // Leipzig can contain more than one row for the same surface form inside one
    // corpus, so counts must be accumulated per corpus rather than overwritten.
    const key = form;
    const previous = rows.get(key) || {
      form,
      normalized: form.toLocaleLowerCase('de-DE'),
      total: 0,
      bySource: {},
    };
    previous.total += count;
    previous.bySource[sourceKey] = (previous.bySource[sourceKey] || 0) + count;
    rows.set(key, previous);
  }
  sourceMeta.push({ file: sourceKey, parsed, accepted });
}

const withSourceCount = [...rows.values()].map((row) => ({
  ...row,
  sources: Object.keys(row.bySource).length,
}));

const ranked = withSourceCount
  .sort((a, b) => b.total - a.total || b.sources - a.sources || a.form.localeCompare(b.form, 'de'))
  .slice(0, limit);

await mkdir(dirname(output), { recursive: true });
const header = ['rank', 'form', 'normalized_form', 'combined_count', 'source_count', 'source_counts_json'].join('\t');
const body = ranked.map((row, index) => [
  index + 1,
  row.form,
  row.normalized,
  row.total,
  row.sources,
  JSON.stringify(row.bySource),
].join('\t'));
await writeFile(output, `${header}\n${body.join('\n')}\n`, 'utf8');

const metaPath = output.replace(/\.tsv$/i, '.meta.json');
await writeFile(metaPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  limit,
  output,
  inputFiles: sourceMeta,
  candidateForms: rows.size,
  emittedForms: ranked.length,
  filter: 'Unicode letters with optional internal hyphen/apostrophe; max length 80',
  ranking: 'descending summed raw frequency across supplied equal-priority corpora',
  aggregation: 'duplicate surface-form rows are summed within each corpus; source_count is the number of distinct input corpora containing the form',
}, null, 2) + '\n', 'utf8');

console.log(`Wrote ${ranked.length.toLocaleString()} German surface forms to ${output}`);
console.log(`Metadata: ${metaPath}`);
