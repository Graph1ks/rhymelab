import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

import {
  INTERNAL_DISTRIBUTION_DB_IDS,
  internalDistributionDbPaths,
  internalDistributionRuntimeSummary,
  internalDistributionSwitcherEnabled,
  normalizeInternalDistributionDbId,
  preferredAvailableDistributionDbId,
  requestedInternalDistributionDbId,
} from '../src/internal-distribution-switcher.mjs';

test('shipping distribution switcher is enabled by default and can be explicitly disabled',()=>{
  assert.equal(internalDistributionSwitcherEnabled({argv:[],env:{}}),true);
  assert.equal(
    internalDistributionSwitcherEnabled({argv:['--internal-db-switcher'],env:{}}),
    true,
  );
  assert.equal(
    internalDistributionSwitcherEnabled({argv:['--no-distribution-switcher'],env:{}}),
    false,
  );
  assert.equal(
    internalDistributionSwitcherEnabled({argv:[],env:{RHYMELAB_DISTRIBUTION_SWITCHER:'0'}}),
    false,
  );
});

test('distribution runtime IDs are closed to LITE STANDARD FULL only',()=>{
  assert.deepEqual(INTERNAL_DISTRIBUTION_DB_IDS,['lite','standard','full']);
  assert.equal(normalizeInternalDistributionDbId('STANDARD'),'standard');
  assert.equal(normalizeInternalDistributionDbId('master'),'standard');
  assert.equal(normalizeInternalDistributionDbId('garbage'),'standard');

  const selected=new URL('http://local/api/writer?runtime_db=full');
  assert.equal(requestedInternalDistributionDbId(selected,{enabled:true}),'full');
  assert.equal(requestedInternalDistributionDbId(selected,{enabled:false}),null);
  assert.equal(
    requestedInternalDistributionDbId(
      new URL('http://local/api/writer?runtime_db=master'),
      {enabled:true},
    ),
    null,
  );
  assert.equal(
    requestedInternalDistributionDbId(
      new URL('http://local/api/writer?runtime_db=garbage'),
      {enabled:true},
    ),
    null,
  );
});

test('runtime starts with the best available shipping edition without requiring STANDARD',()=>{
  const entries=new Map([
    ['lite',{runtime:{id:'lite'}}],
    ['standard',{runtime:null}],
    ['full',{runtime:null}],
  ]);
  assert.equal(preferredAvailableDistributionDbId(entries),'lite');
  entries.set('full',{runtime:{id:'full'}});
  assert.equal(preferredAvailableDistributionDbId(entries),'full');
  entries.set('standard',{runtime:{id:'standard'}});
  assert.equal(preferredAvailableDistributionDbId(entries),'standard');
  assert.equal(preferredAvailableDistributionDbId(new Map()),null);
});

test('distribution DB paths have explicit env overrides and stable local defaults',()=>{
  const paths=internalDistributionDbPaths({
    env:{RHYMELAB_DISTRIBUTION_LITE_DB:'tmp/custom-lite.sqlite'},
  });
  assert.match(paths.lite,/custom-lite\.sqlite$/u);
  assert.match(paths.standard,/rhymelab-serving-v1-standard\.sqlite$/u);
  assert.match(paths.full,/rhymelab-serving-v1-full\.sqlite$/u);
});

test('internal runtime summary exposes DB size, SQLite storage and distribution metadata',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-internal-db-lab-'));
  const path=join(dir,'lite.sqlite');
  const db=new DatabaseSync(path);
  try{
    db.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE payload(id INTEGER PRIMARY KEY,value TEXT);
      CREATE INDEX idx_payload_value ON payload(value);
      INSERT INTO meta(key,value) VALUES
        ('schema','rhymelab-serving-v1'),
        ('distribution_edition','lite'),
        ('distribution_total_target','50000'),
        ('distribution_features_json','{"words_de":true,"words_en":true,"phrases":false,"entities":false,"generated":false,"markov":false}');
      INSERT INTO payload(value) VALUES('x'),('y');
    `);

    const runtime={
      coreDb:db,
      capabilities:{
        edition:'lite',
        words_de:true,
        words_en:true,
        phrases:false,
        entities:false,
        generated:false,
        markov:false,
      },
    };
    const summary=internalDistributionRuntimeSummary({
      id:'lite',
      path,
      runtime,
      state:{available:true},
      timing:{searchMs:4.2,averageLast100Ms:5.1,sampleCount:12},
    });

    assert.equal(summary.available,true);
    assert.ok(summary.file.sizeBytes>0);
    assert.ok(summary.sqlite.pageSize>0);
    assert.ok(summary.sqlite.pageCount>0);
    assert.ok(summary.sqlite.tables>=2);
    assert.ok(summary.sqlite.indexes>=1);
    assert.equal(summary.meta.distribution_edition,'lite');
    assert.equal(summary.meta.distribution_total_target,'50000');
    assert.equal(summary.queryTiming.searchMs,4.2);
  }finally{
    db.close();
    await rm(dir,{recursive:true,force:true});
  }
});
