import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phrase Explorer exposes phrase catalog browsing without replacing Writer UI', async () => {
  const [html, app, css, server, writerHtml] = await Promise.all([
    readFile('src/phrase-ui/index.html','utf8'),
    readFile('src/phrase-ui/app.js','utf8'),
    readFile('src/phrase-ui/styles.css','utf8'),
    readFile('src/server.mjs','utf8'),
    readFile('src/ui/index.html','utf8'),
  ]);
  assert.match(html,/Phrase Catalog/);
  assert.match(html,/value="pronunciation"/);
  assert.doesNotMatch(html,/RUEG/);
  assert.doesNotMatch(app,/RUEG/);
  assert.doesNotMatch(css,/rueg/i);
  assert.doesNotMatch(server,/\/api\/register\/search/);
  assert.doesNotMatch(server,/\/api\/register\/facets/);
  assert.match(app,/\/api\/phrases\/search/);
  assert.match(app,/\/api\/phrases\/detail/);
  assert.match(app,/IPA ready/);
  assert.match(app,/pronunciationReady/);
  assert.match(app,/wordBoundarySyllablePositions/);
  assert.match(css,/\.pron-card/);
  assert.match(server,/RHYMELAB_PHRASE_DB/);
  assert.match(server,/\/phrases/);
  assert.match(server,/phraseDbError/);
  assert.match(writerHtml,/href="\/phrases"/);
});
