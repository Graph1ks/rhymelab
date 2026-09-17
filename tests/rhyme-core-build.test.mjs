import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

function run(args) {
  return execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
}

test('usage ranking -> full Wiktionary rhyme core -> 500-style shards -> verify', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rhymelab-core-'));
  const news = join(dir, 'news_words.txt');
  const web = join(dir, 'web_words.txt');
  const ranking = join(dir, 'de-usage.tsv');
  const kaikki = join(dir, 'dewiktionary.jsonl');
  const core = join(dir, 'core');

  await writeFile(news, [
    '1\tLiebe\t100',
    '2\tHallo\t80',
    '3\tTriebe\t10',
  ].join('\n') + '\n');
  await writeFile(web, [
    '1\tHallo\t100',
    '2\tLiebe\t50',
    '3\tTriebe\t30',
  ].join('\n') + '\n');

  run(['scripts/build-de-usage-ranking.mjs', news, web, '--out', ranking]);
  const rankingText = await readFile(ranking, 'utf8');
  assert.match(rankingText, /^rank\tform\tnormalized_form\tusage_score/m);
  assert.equal(rankingText.trim().split(/\r?\n/).length, 4);

  const entries = [
    { word: 'Liebe', lang_code: 'de', pos: 'noun', tags: ['feminine'], sounds: [{ ipa: '[ˈliːbə]' }], senses: [{ glosses: ['Gefühl'] }] },
    { word: 'Hallo', lang_code: 'de', pos: 'interj', sounds: [{ ipa: '[haˈloː]' }], senses: [{ glosses: ['Gruß'] }] },
    { word: 'Triebe', lang_code: 'de', pos: 'noun', sounds: [{ ipa: '[ˈtriːbə]' }], senses: [{ glosses: ['Plural'] }] },
    { word: 'Liebelei', lang_code: 'de', pos: 'noun', tags: ['feminine'], sounds: [{ ipa: '[liːbəˈlaɪ̯]' }], senses: [{ glosses: ['kurze Romanze'] }] },
  ];
  await writeFile(kaikki, entries.map((x) => JSON.stringify(x)).join('\n') + '\n');

  run(['scripts/build-de-rhyme-core.mjs', '--ranking', ranking, '--kaikki', kaikki, '--out', core, '--shard-size', '2']);
  const manifest = JSON.parse(await readFile(join(core, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 'rhymelab-de-core-v2');
  assert.equal(manifest.total_forms, 4);
  assert.equal(manifest.usage_ranked_forms, 3);
  assert.equal(manifest.dictionary_only_forms, 1);
  assert.equal(manifest.shards, 2);
  assert.equal(manifest.dictionary_matched_forms, 4);
  assert.equal(manifest.forms_with_pronunciation, 4);
  assert.equal(manifest.files[0].items, 2);
  assert.equal(manifest.files[1].items, 2);
  assert.equal(manifest.files[1].dictionary_only_items, 1);

  const shard2 = (await readFile(join(core, manifest.files[1].file), 'utf8'))
    .trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(shard2[0].usage_rank, 3);
  assert.equal(shard2[1].word, 'Liebelei');
  assert.equal(shard2[1].usage_rank, null);
  assert.equal(shard2[1].usage, null);
  assert.equal(shard2[1].processing_order, 4);

  const verify = run(['scripts/verify-de-rhyme-core.mjs', core]);
  assert.match(verify, /"status": "ok"/);
  assert.match(verify, /"dictionary_only_forms": 1/);
});
