import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WRITER_RUNTIME_ID,
  selectRhymeRuntimeDatabases,
  useLegacyRanking,
} from '../src/runtime-db-routing.mjs';

function params(value = '') {
  return new URLSearchParams(value);
}

test('normal rhyme requests use the promoted materialized writer v5 runtime', () => {
  const writerDb = { id: 'writer-v5' };
  const legacyDb = { id: 'legacy-v4' };
  const selected = selectRhymeRuntimeDatabases({ writerDb, legacyDb }, params());
  assert.equal(selected.mode, 'writer');
  assert.equal(selected.database, writerDb);
  assert.equal(selected.runtimeId, WRITER_RUNTIME_ID);
  assert.equal(selected.runtimeId, 'materialized-writer-v5-v1');
});

test('ranking=legacy remains pinned to the v4 control database', () => {
  const writerDb = { id: 'writer-v5' };
  const legacyDb = { id: 'legacy-v4' };
  const searchParams = params('ranking=legacy');
  assert.equal(useLegacyRanking(searchParams), true);
  const selected = selectRhymeRuntimeDatabases({ writerDb, legacyDb }, searchParams);
  assert.equal(selected.mode, 'legacy');
  assert.equal(selected.database, legacyDb);
  assert.equal(selected.runtimeId, 'legacy-v4-control');
});

test('non-legacy ranking values cannot silently select the control database', () => {
  const writerDb = { id: 'writer-v5' };
  const legacyDb = { id: 'legacy-v4' };
  for (const value of ['', 'writer', 'default', 'legacy-v5']) {
    const selected = selectRhymeRuntimeDatabases(
      { writerDb, legacyDb },
      params(value ? `ranking=${value}` : ''),
    );
    assert.equal(selected.mode, 'writer');
    assert.equal(selected.database, writerDb);
  }
});
