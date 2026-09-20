import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVER_RUNTIME_MODES,
  isServingV1,
  resolveServerRuntimeMode,
} from '../src/server-runtime-mode.mjs';

test('Serving-v1 is the canonical/default server runtime',()=>{
  assert.equal(
    resolveServerRuntimeMode({argv:[],env:{}}),
    SERVER_RUNTIME_MODES.SERVING_V1,
  );
  assert.equal(isServingV1(SERVER_RUNTIME_MODES.SERVING_V1),true);
});

test('explicit Serving-v1 aliases keep the canonical runtime selected',()=>{
  for(const value of ['serving-v1','serving-v1-preview','serving']){
    assert.equal(
      resolveServerRuntimeMode({argv:[],env:{RHYMELAB_PRODUCT_RUNTIME:value}}),
      SERVER_RUNTIME_MODES.SERVING_V1,
    );
  }
  assert.equal(
    resolveServerRuntimeMode({argv:['--serving-v1'],env:{}}),
    SERVER_RUNTIME_MODES.SERVING_V1,
  );
});

test('the old split database bundle is archive-only and requires explicit opt-in',()=>{
  for(const value of ['legacy','legacy-archive','archive','writer-v5','accepted']){
    assert.equal(
      resolveServerRuntimeMode({argv:[],env:{RHYMELAB_PRODUCT_RUNTIME:value}}),
      SERVER_RUNTIME_MODES.LEGACY_ARCHIVE,
    );
  }
  for(const flag of ['--legacy-runtime','--archive-runtime']){
    assert.equal(
      resolveServerRuntimeMode({argv:[flag],env:{}}),
      SERVER_RUNTIME_MODES.LEGACY_ARCHIVE,
    );
  }
});

test('explicit archive CLI wins over Serving-v1 environment aliases',()=>{
  assert.equal(
    resolveServerRuntimeMode({
      argv:['--legacy-runtime'],
      env:{RHYMELAB_PRODUCT_RUNTIME:'serving-v1'},
    }),
    SERVER_RUNTIME_MODES.LEGACY_ARCHIVE,
  );
});
