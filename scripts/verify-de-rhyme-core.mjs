#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.argv[2] || 'data/de/core';
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
if (manifest.schema !== 'rhymelab-de-core-v2') throw new Error(`Unexpected schema: ${manifest.schema}`);

let expectedProcessingOrder = 1;
let expectedUsageRank = 1;
let seenDictionaryTail = false;
let total = 0;
let usageRanked = 0;
let dictionaryOnly = 0;
let matched = 0;
let withPron = 0;
const seen = new Set();

for (const shard of manifest.files) {
  const data = await readFile(join(dir, shard.file), 'utf8');
  const hash = createHash('sha256').update(data).digest('hex');
  if (hash !== shard.sha256) throw new Error(`Checksum mismatch: ${shard.file}`);
  const lines = data.split(/\r?\n/).filter(Boolean);
  if (lines.length !== shard.items) throw new Error(`Item count mismatch: ${shard.file}`);
  if (lines.length > manifest.shard_size) throw new Error(`Oversized shard: ${shard.file}`);

  let shardUsage = 0;
  let shardDictionaryOnly = 0;
  for (const line of lines) {
    const row = JSON.parse(line);
    if (row.processing_order !== expectedProcessingOrder) {
      throw new Error(`Processing-order gap: expected ${expectedProcessingOrder}, got ${row.processing_order}`);
    }
    expectedProcessingOrder += 1;

    if (row.usage_rank === null) {
      seenDictionaryTail = true;
      dictionaryOnly += 1;
      shardDictionaryOnly += 1;
      if (row.usage !== null) throw new Error(`Dictionary-only row unexpectedly has usage payload: ${row.word}`);
    } else {
      if (seenDictionaryTail) throw new Error(`Usage-ranked row appears after dictionary-only tail: ${row.word}`);
      if (row.usage_rank !== expectedUsageRank) {
        throw new Error(`Usage-rank gap: expected ${expectedUsageRank}, got ${row.usage_rank}`);
      }
      expectedUsageRank += 1;
      usageRanked += 1;
      shardUsage += 1;
      if (!row.usage) throw new Error(`Usage-ranked row missing usage payload: ${row.word}`);
    }

    if (seen.has(row.word)) throw new Error(`Duplicate surface form: ${row.word}`);
    seen.add(row.word);
    if (!['complete','partial','frequency_only'].includes(row.dictionary_status)) {
      throw new Error(`Invalid dictionary_status for ${row.word}`);
    }
    for (const p of row.pronunciations || []) {
      if (!p.ipa || !p.canonical_phonemes || !p.syllable_count || !p.stress_pattern || !p.rhyme?.exact_tail_key) {
        throw new Error(`Incomplete pronunciation/rhyme payload for ${row.word}`);
      }
    }
    total += 1;
    if ((row.analyses || []).length) matched += 1;
    if ((row.pronunciations || []).length) withPron += 1;
  }

  if (shardUsage !== shard.usage_ranked_items) throw new Error(`Usage count mismatch: ${shard.file}`);
  if (shardDictionaryOnly !== shard.dictionary_only_items) throw new Error(`Dictionary-tail count mismatch: ${shard.file}`);
}

if (total !== manifest.total_forms) throw new Error(`Total mismatch: ${total} vs ${manifest.total_forms}`);
if (usageRanked !== manifest.usage_ranked_forms) throw new Error(`Usage-ranked mismatch: ${usageRanked} vs ${manifest.usage_ranked_forms}`);
if (dictionaryOnly !== manifest.dictionary_only_forms) throw new Error(`Dictionary-only mismatch: ${dictionaryOnly} vs ${manifest.dictionary_only_forms}`);
if (matched !== manifest.dictionary_matched_forms) throw new Error(`Matched mismatch: ${matched} vs ${manifest.dictionary_matched_forms}`);
if (withPron !== manifest.forms_with_pronunciation) throw new Error(`Pronunciation coverage mismatch: ${withPron} vs ${manifest.forms_with_pronunciation}`);

console.log(JSON.stringify({
  status: 'ok',
  forms: total,
  usage_ranked_forms: usageRanked,
  dictionary_only_forms: dictionaryOnly,
  shards: manifest.files.length,
  dictionary_matched: matched,
  with_pronunciation: withPron,
  dictionary_coverage_pct: Number((matched / Math.max(total,1) * 100).toFixed(2)),
  pronunciation_coverage_pct: Number((withPron / Math.max(total,1) * 100).toFixed(2)),
}, null, 2));
