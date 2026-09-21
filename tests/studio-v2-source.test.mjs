import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Studio 02 golden-master surface is present with its core visual/interaction contract',async()=>{
  const html=await readFile('src/studio/index.html','utf8');

  assert.match(html,/RhymeLab Studio 02 — Desktop Workbench/u);
  assert.match(html,/--assist-width:470px/u);
  assert.match(html,/--accent:#7453db/u);
  assert.match(html,/data-theme=dark/u);
  assert.match(html,/class="splitter"/u);
  assert.match(html,/class="detail-dock hidden"/u);
  assert.match(html,/class="editor-dock hidden"/u);
  assert.match(html,/class="mobile-nav"/u);
  assert.match(html,/data-density="compact"/u);
  assert.match(html,/data-density="tiles"/u);
  assert.match(html,/prefers-reduced-motion:reduce/u);
  assert.match(html,/dataset\.studioVersion='2'/u);
  assert.match(html,/100dvh/u);
});

test('Studio preview route is parallel and leaves legacy Search and RhymePad routes in place',async()=>{
  const server=await readFile('src/server.mjs','utf8');

  assert.match(server,/const studioUiDir = resolve\('src\/studio'\)/u);
  assert.match(server,/const studioHtml = readFileSync\(resolve\(studioUiDir, 'index\.html'\)\)/u);
  assert.match(server,/'\/studio': \{ type: 'text\/html; charset=utf-8', body: studioHtml \}/u);
  assert.match(server,/'\/studio\/': \{ type: 'text\/html; charset=utf-8', body: studioHtml \}/u);

  assert.match(server,/'\/': \{ type: 'text\/html; charset=utf-8', body: writerHtml \}/u);
  assert.match(server,/'\/pad': \{ type: 'text\/html; charset=utf-8', body: padHtml \}/u);
  assert.match(server,/Studio 02 preview:/u);
});

test('Studio migration contract keeps old routes until parity acceptance',async()=>{
  const parity=await readFile('docs/UI_REDESIGN_PARITY.md','utf8');
  const migration=await readFile('docs/STUDIO_V2_MIGRATION_PLAN.md','utf8');

  assert.match(parity,/Do not switch \/ to Studio until/u);
  assert.match(parity,/Nested result scrollers are forbidden/u);
  assert.match(parity,/Markov work remains intentionally paused/u);
  assert.match(migration,/exact Studio 02 import\s+DONE/u);
  assert.match(migration,/parallel \/studio route\s+DONE/u);
  assert.match(migration,/parity matrix\s+DONE/u);
});
