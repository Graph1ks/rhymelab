import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generatedDataExplicitlyRequired,
  generatedDataRequested,
  generatedOnlyRequested,
} from '../src/generated-runtime-request-policy.mjs';

const params=(value='')=>new URLSearchParams(value);

test('generated data is included by default and generated=0 is the explicit opt-out',()=>{
  assert.equal(generatedDataRequested(params()),true);
  assert.equal(generatedDataRequested(params('generated=1')),true);
  assert.equal(generatedDataRequested(params('generated=0')),false);
});

test('generated-only always selects the generated-capable runtime',()=>{
  assert.equal(generatedOnlyRequested(params('generated_only=1')),true);
  assert.equal(generatedDataRequested(params('generated=0&generated_only=1')),true);
  assert.equal(generatedDataExplicitlyRequired(params('generated=0&generated_only=1')),true);
});

test('implicit default can fall back to Core when generated runtime is unavailable',()=>{
  assert.equal(generatedDataExplicitlyRequired(params()),false);
  assert.equal(generatedDataExplicitlyRequired(params('generated=0')),false);
  assert.equal(generatedDataExplicitlyRequired(params('generated=1')),true);
});
