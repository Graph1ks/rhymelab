import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

test('standalone Phrase Explorer stays retired while unified React Search retains phrase capability', async () => {
  const [server,search,detail] = await Promise.all([
    readFile('src/server.mjs', 'utf8'),
    readFile('apps/studio-react/src/features/search/SearchExperience.tsx', 'utf8'),
    readFile('apps/studio-react/src/features/search/ResultDetail.tsx', 'utf8'),
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
  assert.match(search, /Words · Phrases \/ Mosaic · names/);
  assert.match(detail, /Phrase type/);
});
