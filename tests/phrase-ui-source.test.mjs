import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phrase Explorer exposes catalog and RUEG browse modes without replacing Writer UI', async () => {
  const [html, app, css, server, writerHtml] = await Promise.all([
    readFile('src/phrase-ui/index.html','utf8'),
    readFile('src/phrase-ui/app.js','utf8'),
    readFile('src/phrase-ui/styles.css','utf8'),
    readFile('src/server.mjs','utf8'),
    readFile('src/ui/index.html','utf8'),
  ]);
  assert.match(html,/Phrase Catalog/);
  assert.match(html,/RUEG Contexts/);
  assert.match(html,/value="pronunciation"/);
  assert.match(html,/id="layerFilter"/);
  assert.match(html,/id="formalityFilter"/);
  assert.match(html,/id="modeFilter"/);
  assert.match(html,/id="ageFilter"/);
  assert.match(app,/\/api\/phrases\/search/);
  assert.match(app,/\/api\/phrases\/detail/);
  assert.match(app,/\/api\/register\/search/);
  assert.match(app,/dipl/);
  assert.match(app,/norm/);
  assert.match(app,/IPA ready/);
  assert.match(app,/pronunciationReady/);
  assert.match(app,/wordBoundarySyllablePositions/);
  assert.match(css,/\.context-text/);
  assert.match(css,/\.pron-card/);
  assert.match(server,/RHYMELAB_PHRASE_DB/);
  assert.match(server,/\/phrases/);
  assert.match(server,/phraseDbError/);
  assert.match(writerHtml,/href="\/phrases"/);
});
