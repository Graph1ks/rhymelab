import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Markov remains an unlinked demo surface outside the React product navigation',async()=>{
  const [navigation,surfaceContent,server]=await Promise.all([
    readFile('apps/studio-react/src/shell/navigation.ts','utf8'),
    readFile('apps/studio-react/src/shell/SurfaceContent.tsx','utf8'),
    readFile('src/server.mjs','utf8'),
  ]);

  assert.doesNotMatch(navigation,/markov-test|Markov/iu);
  assert.doesNotMatch(surfaceContent,/markov-test/iu);
  assert.match(server,/"\/markov-test"|'\/markov-test'/u);
  assert.match(server,/url\.pathname === '\/api\/markov\/generate'/u);
});
