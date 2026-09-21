import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateLegacyStudioStateToStore,
  shadowLegacyStudioStateToStore,
} from '../src/studio/document-store.mjs';

function memoryStore(){
  let snapshot=null;
  const backups=[];
  return {
    backups,
    async available(){return true;},
    async saveLegacyBackup(migration){
      backups.push(migration);
      return {saved:true,id:'backup-1'};
    },
    async saveSnapshot(next){
      snapshot=structuredClone(next);
      return {
        saved:true,
        counts:{
          songs:next.songs.length,
          bars:next.bars.length,
          revisions:next.revisions.length,
          folders:next.folders.length,
        },
      };
    },
    async loadSnapshot(){return structuredClone(snapshot);},
  };
}

test('DocumentStore migration backs up first then verifies the migrated snapshot',async()=>{
  const store=memoryStore();
  const legacy={
    active:'song',
    songs:[{
      id:'song',
      title:'Test',
      lines:['one','two'],
      barIds:['stable-one','stable-two'],
      barRevisions:[3,7],
      revisions:[],
    }],
  };

  const result=await migrateLegacyStudioStateToStore(legacy,store);
  assert.equal(result.verified,true);
  assert.equal(store.backups.length,1);
  assert.deepEqual(result.counts,{songs:1,bars:2,revisions:0,folders:0});
  const loaded=await store.loadSnapshot();
  assert.deepEqual(loaded.bars.map((bar)=>bar.id),['stable-one','stable-two']);
  assert.deepEqual(loaded.bars.map((bar)=>bar.revision),[3,7]);
});

test('DocumentStore shadow saves current stable bar identities without generating another backup',async()=>{
  const store=memoryStore();
  const legacy={
    active:'song',
    songs:[{
      id:'song',
      title:'Test',
      lines:['alpha','beta'],
      barIds:['bar-a','bar-b'],
      barRevisions:[1,2],
      revisions:[],
    }],
  };
  await migrateLegacyStudioStateToStore(legacy,store);
  const backupsBefore=store.backups.length;

  legacy.lines;
  legacy.songs[0].lines[1]='BETA';
  legacy.songs[0].barRevisions[1]=3;
  const result=await shadowLegacyStudioStateToStore(legacy,store);
  const loaded=await store.loadSnapshot();

  assert.equal(store.backups.length,backupsBefore);
  assert.equal(result.saveResult.saved,true);
  assert.equal(loaded.bars[1].id,'bar-b');
  assert.equal(loaded.bars[1].revision,3);
  assert.equal(loaded.bars[1].text,'BETA');
});
