import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

test('standalone Phrase Explorer UI and route are retired', async () => {
  const [server, writerHtml, app] = await Promise.all([
    readFile('src/server.mjs', 'utf8'),
    readFile('src/ui/index.html', 'utf8'),
    readFile('src/ui/app.js', 'utf8'),
  ]);

  await assert.rejects(access('src/phrase-ui/index.html'));
  await assert.rejects(access('src/phrase-ui/app.js'));
  await assert.rejects(access('src/phrase-ui/styles.css'));

  assert.match(server, /RHYMELAB_PHRASE_DB/);
  assert.doesNotMatch(server, /'\/phrases':/);
  assert.doesNotMatch(server, /'\/phrases\/':/);
  assert.doesNotMatch(server, /phraseUiDir/);
  assert.doesNotMatch(server, /\/phrases\/assets\//);

  assert.match(server, /\/api\/writer/);
  assert.match(server, /\/api\/phrases\/search/);
  assert.match(server, /\/api\/phrases\/detail/);
  assert.match(server, /phraseDbError/);

  assert.match(writerHtml, /id="scopeFilter"/);
  assert.match(writerHtml, /id="languageRouteFilter"/);
  assert.match(writerHtml, /value="de:both"/);
  assert.match(writerHtml, /value="en:both"/);
  assert.match(writerHtml, /value="both:both"/);
  assert.doesNotMatch(writerHtml, /href="\/phrases"/);

  assert.match(app, /\/api\/writer\?/);
  assert.match(app, /\/api\/phrases\/detail/);
  assert.match(app, /renderPhrasePanel/);
  assert.match(app, /resultKind==='phrase'/);
});
