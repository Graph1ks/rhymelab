import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serverSource = await readFile(new URL('../src/server.mjs', import.meta.url), 'utf8');
const writerHtml = await readFile(new URL('../src/ui/index.html', import.meta.url), 'utf8');
const padHtml = await readFile(new URL('../src/pad/index.html', import.meta.url), 'utf8');
const padApp = await readFile(new URL('../src/pad/app.js', import.meta.url), 'utf8');

test('RhymePad is served as a first-class local RhymeLab page', () => {
  assert.match(serverSource, /'\/pad': \{ type: 'text\/html; charset=utf-8', body: padHtml \}/);
  assert.match(serverSource, /'\/pad\/assets\/app\.js'/);
  assert.match(writerHtml, /href="\/pad">RhymePad<\/a>/);
  assert.match(padHtml, /href="\/">Search<\/a>/);
});

test('RhymePad live rhyme assistance uses the unified Writer API', () => {
  assert.match(padApp, /fetch\(`\/api\/writer\?\$\{params\}`/);
  assert.match(padApp, /word_limit:deep\?'250':'36'/);
  assert.match(padApp, /phrase_limit:deep\?'250':'36'/);
  assert.match(padApp, /phrase_per_channel:deep\?'128':'32'/);
  assert.doesNotMatch(padApp, /Math\.random/);
});

test('WRITE exposes compact presets while RHYME exposes deep scope and relation controls', () => {
  assert.match(padHtml, />Best of everything<\/option>/);
  assert.match(padHtml, />Words only<\/option>/);
  assert.match(padHtml, />Phrases \/ Mosaic only<\/option>/);
  assert.match(padHtml, /id="rhymeScope"/);
  assert.match(padHtml, /id="rhymeType"/);
  assert.match(padApp, /compactResults\(data\)/);
  assert.match(padApp, /deepResults\(data\)/);
});


test('RhymePad exposes Entity scope, categories and IPA-aware result rendering', () => {
  assert.match(padHtml, />Entities only<\/option>/);
  assert.match(padHtml, /id="entityCategory"/);
  assert.match(padHtml, /value="person\.rapper">Rapper<\/option>/);
  assert.match(padHtml, /value="person\.musician">Musicians<\/option>/);
  assert.match(padApp, /entity_category:/);
  assert.match(padApp, /row\.resultKind==='entity'/);
  assert.match(padApp, /entity-category-chip/);
  assert.match(padApp, /entity-ipa/);
});
