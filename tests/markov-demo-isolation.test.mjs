import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Markov remains an unlinked demo surface outside the RhymeLab product navigation',async()=>{
  const [
    studioHtml,
    studioApp,
    searchHtml,
    searchApp,
    padApp,
    server,
  ]=await Promise.all([
    readFile('src/studio/index.html','utf8'),
    readFile('src/studio/app.js','utf8'),
    readFile('src/ui/index.html','utf8'),
    readFile('src/ui/app.js','utf8'),
    readFile('src/pad/app.js','utf8'),
    readFile('src/server.mjs','utf8'),
  ]);

  for(const [name,source] of [
    ['Studio HTML',studioHtml],
    ['Studio app',studioApp],
    ['Search HTML',searchHtml],
    ['Search app',searchApp],
    ['RhymePad app',padApp],
  ]){
    assert.doesNotMatch(source,/\/markov-test(?:\/|["'?#\s])/u,name+' must not link or advertise the Markov demo');
  }

  assert.match(server,/"\/markov-test"|'\/markov-test'/u);
  assert.match(server,/url\.pathname === '\/api\/markov\/generate'/u);
});
