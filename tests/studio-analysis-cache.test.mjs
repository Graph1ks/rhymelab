import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearStudioAnalysisMemoryCache,
  readStudioAnalysisCache,
  writeStudioAnalysisCache,
} from '../src/studio/analysis-cache.mjs';

test('Studio analysis cache serves session-memory hits without IndexedDB',async()=>{
  clearStudioAnalysisMemoryCache();
  const payload={schema:'demo',pairs:[{left:'nacht',right:'macht'}]};
  const persisted=await writeStudioAnalysisCache('song|end|v1',payload);
  assert.equal(persisted,false);
  assert.deepEqual(await readStudioAnalysisCache('song|end|v1'),payload);
  clearStudioAnalysisMemoryCache();
});
