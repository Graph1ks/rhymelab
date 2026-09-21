import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Studio 02 golden-master surface is present with its core visual/interaction contract',async()=>{
  const [html,css,app]=await Promise.all([
    readFile('src/studio/index.html','utf8'),
    readFile('src/studio/styles.css','utf8'),
    readFile('src/studio/app.js','utf8'),
  ]);

  assert.match(html,/RhymeLab Studio 02 — Desktop Workbench/u);
  assert.match(html,/href=["']\/studio\/styles\.css["']/u);
  assert.match(html,/src=["']\/studio\/app\.js["']/u);

  assert.match(css,/--assist-width:470px/u);
  assert.match(css,/--accent:#7453db/u);
  assert.match(css,/\[data-theme=dark\]/u);
  assert.match(css,/prefers-reduced-motion:reduce/u);
  assert.match(css,/100dvh/u);

  assert.match(html,/class="splitter"/u);
  assert.match(html,/class="detail-dock hidden"/u);
  assert.match(html,/class="editor-dock hidden"/u);
  assert.match(html,/class="mobile-nav"/u);
  assert.match(html,/data-density="compact"/u);
  assert.match(html,/data-density="tiles"/u);
  assert.match(app,/dataset\.studioVersion='2'/u);
});

test('Studio preview route is parallel and leaves legacy Search and RhymePad routes in place',async()=>{
  const server=await readFile('src/server.mjs','utf8');

  assert.match(server,/const studioUiDir = resolve\('src\/studio'\)/u);
  assert.match(server,/const studioHtml = readFileSync\(resolve\(studioUiDir, 'index\.html'\)\)/u);
  assert.match(server,/'\/studio': \{ type: 'text\/html; charset=utf-8', body: studioHtml \}/u);
  assert.match(server,/'\/studio\/': \{ type: 'text\/html; charset=utf-8', body: studioHtml \}/u);
  assert.match(server,/'\/studio\/styles\.css': \{ type: 'text\/css; charset=utf-8'/u);
  assert.match(server,/'\/studio\/app\.js': \{ type: 'text\/javascript; charset=utf-8'/u);

  assert.match(server,/'\/': \{ type: 'text\/html; charset=utf-8', body: writerHtml \}/u);
  assert.match(server,/'\/pad': \{ type: 'text\/html; charset=utf-8', body: padHtml \}/u);
  assert.match(server,/Studio 02 preview:/u);
});

test('Studio migration contract keeps old routes until exhaustive parity acceptance',async()=>{
  const parity=await readFile('docs/UI_REDESIGN_PARITY.md','utf8');
  const migration=await readFile('docs/STUDIO_V2_MIGRATION_PLAN.md','utf8');

  assert.match(parity,/Do not switch \/ to Studio until/u);
  assert.match(parity,/exhaustive old-vs-new feature audit/u);
  assert.match(parity,/Library folder hierarchy/u);
  assert.match(parity,/legacy tags\/badges/u);
  assert.match(parity,/optional rhyme-chain visualization/u);
  assert.match(parity,/Nested result scrollers are forbidden/u);
  assert.match(parity,/Markov work remains intentionally paused/u);

  assert.match(migration,/exact Studio 02 import\s+DONE/u);
  assert.match(migration,/parallel \/studio route\s+DONE/u);
  assert.match(migration,/parity matrix\s+DONE/u);
});
