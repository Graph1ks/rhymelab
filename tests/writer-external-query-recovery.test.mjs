import test from 'node:test';
import assert from 'node:assert/strict';

import {
  externalTerminalRecoveryComponent,
} from '../src/writer-search.mjs';

function queryDetail({
  language='de',
  method='client_mixed_source_right_reference_compound',
  components=['krankenkassenwarte','Weise'],
}={}) {
  return {
    kind:'word',
    language,
    surface:'Krankenkassenwarteweise',
    normalized:'krankenkassenwarteweise',
    queryPronunciation:{
      method,
      components,
    },
  };
}

test('external German Writer selects the explicit source-backed terminal compound component',()=>{
  assert.deepEqual(
    externalTerminalRecoveryComponent(queryDetail()),
    {
      surface:'Weise',
      normalized:'weise',
      method:'client_mixed_source_right_reference_compound',
      components:['krankenkassenwarte','Weise'],
    },
  );
});

test('external terminal recovery does not apply to arbitrary client rules or cross-language queries',()=>{
  assert.equal(
    externalTerminalRecoveryComponent(queryDetail({method:'client_rules'})),
    null,
  );
  assert.equal(
    externalTerminalRecoveryComponent(queryDetail({language:'en'})),
    null,
  );
  assert.equal(
    externalTerminalRecoveryComponent(queryDetail({
      method:'client_generated_overlay_reference_compound',
    })),
    null,
  );
});
