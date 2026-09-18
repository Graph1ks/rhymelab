import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  materializeRhymePadV14,
  RHYMEPAD_V14_SHA256,
} from '../src/rhymepad-v14.mjs';

const serverSource = await readFile(new URL('../src/server.mjs', import.meta.url), 'utf8');
const writerHtml = await readFile(new URL('../src/ui/index.html', import.meta.url), 'utf8');
const padApp = await readFile(new URL('../src/pad/app.js', import.meta.url), 'utf8');
const padCss = await readFile(new URL('../src/pad/styles.css', import.meta.url), 'utf8');

test('RhymePad serves the checksum-verified authoritative v14 product surface', () => {
  const { sourceHtml, html, sha256 } = materializeRhymePadV14();
  assert.equal(sha256, RHYMEPAD_V14_SHA256);
  assert.equal((sourceHtml.match(/id="libraryOpen"/g) || []).length, 1);
  assert.equal((sourceHtml.match(/id="libraryOverlay"/g) || []).length, 1);

  for (const marker of [
    'id="libraryOpen"',
    'id="libraryOverlay"',
    'id="libraryFolders"',
    'id="songGrid"',
    'id="historyBack"',
    'class="modeTabs"',
    'data-mode="write"',
    'data-mode="rhyme"',
    'data-mode="perform"',
    'id="syl"',
    'id="words"',
    'id="hits"',
    'id="breath"',
    'id="stressCount"',
    'id="rhymeOverview"',
    'id="schemeRows"',
    'id="performOverlay"',
    'id="timingGrid"',
  ]) {
    assert.ok(sourceHtml.includes(marker), `missing v14 marker: ${marker}`);
  }

  assert.match(sourceHtml, /function renderLibrary\(/);
  assert.match(sourceHtml, /function renderRail\(/);
  assert.match(sourceHtml, /function renderRhymeWorkbench\(/);
  assert.match(sourceHtml, /function renderPerformance\(/);
  assert.match(html, /\/pad\/assets\/styles\.css/);
  assert.match(html, /\/pad\/assets\/app\.js/);
  assert.match(html, /<title>RhymePad · RhymeLab Local<\/title>/);
});

test('RhymePad live suggestions use RhymeLab at full accepted result depth', () => {
  assert.match(serverSource, /materializeRhymePadV14/);
  assert.match(serverSource, /'\/pad': \{ type: 'text\/html; charset=utf-8', body: padHtml \}/);
  assert.match(padApp, /fetch\(\`\/api\/writer\?\$\{params\}\`/);
  assert.match(padApp, /word_limit: '250'/);
  assert.match(padApp, /word_pool: '800'/);
  assert.match(padApp, /phrase_limit: '250'/);
  assert.match(padApp, /phrase_pool: '1024'/);
  assert.match(padApp, /phrase_per_channel: '256'/);
  assert.match(padApp, /function isAlreadyUsed\(/);
  assert.match(padApp, /lyricWords\(\)\.has\(candidate\)/);
  assert.match(padApp, /rhymeLabDeepResults/);
  assert.match(padCss, /html\[data-mode="rhyme"\] \.rhymeLabDeepResults\{display:block\}/);
  assert.match(padApp, /basis === 'en'/);
  assert.match(padApp, /original RhymePad phonetic fallback stays active/);
  assert.doesNotMatch(padApp, /candidateBank/);
  assert.doesNotMatch(padApp, /Math\.random/);
});

test('RhymeLab and RhymePad share a first-class workspace switcher', () => {
  assert.match(writerHtml, /class="primary-nav"/);
  assert.match(writerHtml, /class="primary-nav-link active" href="\/"/);
  assert.match(writerHtml, /class="primary-nav-link" href="\/pad"/);
  assert.match(padApp, /className = 'rhymeLabProductNav'/);
  assert.match(padApp, /<a href="\/">SEARCH<\/a><a href="\/pad" class="active"/);
});
