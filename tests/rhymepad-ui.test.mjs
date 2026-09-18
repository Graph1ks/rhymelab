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
  assert.match(padApp, /entity_limit: '250'/);
  assert.match(padApp, /entity_pool: '512'/);
  assert.match(padApp, /entity_category: entityCategory/);
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


test('RhymePad v14 exposes Entity scope, semantic categories and IPA-bearing cards', () => {
  assert.ok(serverSource.includes('DEFAULT_ENTITY_DB_PATH'));
  assert.ok(serverSource.includes('openEntityWriterDb'));
  assert.ok(serverSource.includes("entityCategory: url.searchParams.get('entity_category')"));
  assert.ok(padApp.includes('<option value="entities">Entities only</option>'));
  assert.ok(padApp.includes('<option value="entities">Entities</option>'));
  assert.ok(padApp.includes("'person.rapper': 'Rapper'"));
  assert.ok(padApp.includes("'person.musician': 'Musician'"));
  assert.ok(padApp.includes("'group.music_group': 'Band / group'"));
  assert.ok(padApp.includes("row.resultKind === 'entity'"));
  assert.ok(padApp.includes('entityCategoryBadges'));
  assert.ok(padApp.includes('ENTITY_CATEGORY_LABELS'));
  assert.ok(padApp.includes("const ipa = row.ipa ?"));
  assert.match(padCss, /\.entityCategoryBadge/);
  assert.match(padCss, /\.resultKind\.entity/);
});


test('RhymePad UI additions never reparent authoritative v14 controls', () => {
  assert.doesNotMatch(padApp, /appendChild\(modeTabs\)/);
  assert.doesNotMatch(padApp, /appendChild\(document\.getElementById/);
  assert.doesNotMatch(padApp, /rhymePadCommandDeck/);
  assert.doesNotMatch(padCss, /rhymePadLegacyTopHidden/);
});

test('RhymePad bar and syllable readability scales conservatively inside rail cards', () => {
  assert.match(padCss, /\.rail button\{[\s\S]*overflow:hidden/);
  assert.match(padCss, /\.rail button b\{[\s\S]*clamp\(11px,[^;]*,16px\)/);
  assert.match(padCss, /\.rail button span\{[\s\S]*clamp\(8px,[^;]*,10px\)/);
  assert.match(padCss, /#barNo,#syl\{[\s\S]*clamp\(18px,[^;]*,26px\)/);
  assert.match(padCss, /var\(--editor-size,17px\)/);
  assert.doesNotMatch(padApp, /rhymePadRailCounter/);
});

test('RhymePad suggestions use one inspector scrollbar with endless opt-in auto-scroll', () => {
  assert.match(padApp, /AUTO_SCROLL_STORAGE_KEY/);
  assert.match(padApp, /id="rhymeLabAutoScroll"/);
  assert.match(padApp, /function suggestionScrollRange\(/);
  assert.match(padApp, /suggestions\.closest\('\.inspector'\)/);
  assert.match(padApp, /inspector\.scrollTop = start/);
  assert.match(padApp, /inspector\.scrollTop = Math\.min\(end/);
  assert.match(padApp, /state\.autoScrollPauseUntil = timestamp \+ 850/);
  assert.match(padApp, /new MutationObserver\(\(\) => \{/);
  assert.match(padApp, /word_limit: '250'/);
  assert.match(padApp, /word_pool: '800'/);
  assert.match(padApp, /phrase_limit: '250'/);
  assert.match(padApp, /entity_limit: '250'/);
  assert.match(padCss, /\.inspector\{[\s\S]*overflow-x:hidden!important/);
  assert.match(padCss, /\.rhymeLabAutoScrollSurface\{[\s\S]*max-height:none!important;[\s\S]*overflow:visible!important/);
  assert.doesNotMatch(padCss, /\.rhymeLabAutoScrollSurface\{[^}]*overflow-y:auto/);
  assert.doesNotMatch(padCss, /\.rhymeLabAutoScrollSurface\{[^}]*scrollbar-gutter/);
});

test('RhymePad integration fails visibly instead of silently falling back to demo results', () => {
  assert.doesNotThrow(() => new Function(padApp));
  assert.match(padApp, /function initializeRhymeLabPad\(/);
  assert.match(padApp, /RhymeLab integration failed\./);
  assert.match(padApp, /root\.dataset\.rhymeLabIntegration = 'failed'/);
  assert.doesNotMatch(padApp, /\$\('\*',\s*rail\)\.forEach\(/);
});
