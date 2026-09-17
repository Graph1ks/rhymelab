#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import readline from 'node:readline';

const args = process.argv.slice(2);
const inputs = [];
let output = 'data/de/usage/de-usage.tsv';
let limit = Number.POSITIVE_INFINITY;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--out') output = args[++i];
  else if (arg === '--limit') {
    const parsed = Number.parseInt(args[++i] || '', 10);
    limit = Number.isFinite(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
  } else inputs.push(arg);
}

if (!inputs.length) {
  console.error('Usage: node scripts/build-de-usage-ranking.mjs <*_words.txt> [more *_words.txt] [--limit N] [--out data/de/usage/de-usage.tsv]');
  process.exit(1);
}

const validWord = /^\p{L}+(?:[-'’]\p{L}+)*$/u;
const rows = new Map();
const sources = [];

for (const file of inputs) {
  const sourceKey = basename(file);
  let parsedRows = 0;
  let acceptedRows = 0;
  let acceptedTokens = 0;
  const perSource = new Map();

  const rl = readline.createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line) continue;
    const columns = line.split('\t');
    if (columns.length < 3) continue;
    const form = String(columns[1] ?? '').normalize('NFKC').trim();
    const count = Number.parseInt(columns.at(-1) || '', 10);
    if (!form || !Number.isFinite(count) || count <= 0) continue;
    parsedRows += 1;
    if (!validWord.test(form) || form.length > 80) continue;
    acceptedRows += 1;
    acceptedTokens += count;
    perSource.set(form, (perSource.get(form) || 0) + count);
  }

  sources.push({ sourceKey, file, parsedRows, acceptedRows, acceptedTokens });

  for (const [form, count] of perSource) {
    const row = rows.get(form) || {
      form,
      normalized: form.toLocaleLowerCase('de-DE'),
      combinedCount: 0,
      bySource: {},
      perMillionBySource: {},
    };
    row.combinedCount += count;
    row.bySource[sourceKey] = count;
    rows.set(form, row);
  }
}

for (const row of rows.values()) {
  for (const source of sources) {
    const count = row.bySource[source.sourceKey] || 0;
    row.perMillionBySource[source.sourceKey] = source.acceptedTokens > 0
      ? count * 1_000_000 / source.acceptedTokens
      : 0;
  }
  const values = Object.values(row.perMillionBySource);
  row.usageScore = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  row.sourceCount = Object.values(row.bySource).filter((count) => count > 0).length;
}

const ranked = [...rows.values()]
  .sort((a, b) =>
    b.usageScore - a.usageScore ||
    b.sourceCount - a.sourceCount ||
    b.combinedCount - a.combinedCount ||
    a.form.localeCompare(b.form, 'de')
  )
  .slice(0, limit);

await mkdir(dirname(output), { recursive: true });
const header = [
  'rank','form','normalized_form','usage_score','combined_count',
  'source_count','source_counts_json','source_per_million_json'
].join('\t');
const body = ranked.map((row, index) => [
  index + 1,
  row.form,
  row.normalized,
  row.usageScore.toFixed(8),
  row.combinedCount,
  row.sourceCount,
  JSON.stringify(row.bySource),
  JSON.stringify(row.perMillionBySource),
].join('\t'));

await writeFile(output, `${header}\n${body.join('\n')}\n`, 'utf8');
await writeFile(`${output}.meta.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  output,
  emittedForms: ranked.length,
  candidateForms: rows.size,
  inputSources: sources,
  ranking: 'equal-weight mean of per-million frequency across supplied corpora; ties use source coverage, combined count, lexical order',
  purpose: 'RhymeLab German core processing order; frequency is a priority/ranking signal, never a lexical fact source',
  filter: 'Unicode-letter words with optional internal hyphen/apostrophe; max length 80',
}, null, 2) + '\n', 'utf8');

console.log(`Wrote ${ranked.length.toLocaleString()} usage-ranked German forms to ${output}`);
