import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVER_RUNTIME_MODES,
  isServingV1Preview,
  resolveServerRuntimeMode,
} from '../src/server-runtime-mode.mjs';

test('server runtime mode keeps accepted bundle as default',()=>{
  assert.equal(
    resolveServerRuntimeMode({argv:[],env:{}}),
    SERVER_RUNTIME_MODES.ACCEPTED,
  );
});

test('server runtime mode enables Serving-v1 preview from CLI',()=>{
  const mode=resolveServerRuntimeMode({argv:['--serving-v1'],env:{}});
  assert.equal(mode,SERVER_RUNTIME_MODES.SERVING_V1_PREVIEW);
  assert.equal(isServingV1Preview(mode),true);
});

test('server runtime mode enables Serving-v1 preview from environment',()=>{
  for(const value of ['serving-v1','serving-v1-preview','serving']){
    assert.equal(
      resolveServerRuntimeMode({argv:[],env:{RHYMELAB_PRODUCT_RUNTIME:value}}),
      SERVER_RUNTIME_MODES.SERVING_V1_PREVIEW,
    );
  }
});

test('explicit Serving-v1 CLI preview wins over unrelated environment values',()=>{
  assert.equal(
    resolveServerRuntimeMode({
      argv:['--serving-v1'],
      env:{RHYMELAB_PRODUCT_RUNTIME:'accepted'},
    }),
    SERVER_RUNTIME_MODES.SERVING_V1_PREVIEW,
  );
});
