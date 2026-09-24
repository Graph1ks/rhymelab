import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_PREFERENCES_KEY,
  createStudioState,
  loadStudioPreferences,
  studioPreferencesFromState,
  studioStateFromDocumentSnapshot,
  writeStudioPreferences,
} from '../src/studio/document-adapter.mjs';
import {migrateLegacyStudioState} from '../src/studio/document-model.mjs';

test('new Studio workspaces start in compact result density',()=>{
  assert.equal(createStudioState().density,'compact');
});

test('Studio preferences exclude document authority fields',()=>{
  const state={
    songs:[{id:'song'}],
    active:'song',
    folders:['Drafts'],
    saved:[{word:'night'}],
    theme:'dark',
    fontSize:22,
    density:'compact',
    motion:'off',
    uiLanguage:'en',
  };
  assert.deepEqual(studioPreferencesFromState(state),{
    saved:[{word:'night'}],
    theme:'dark',
    fontSize:22,
    density:'compact',
    motion:'off',
    uiLanguage:'en',
  });

  const values=new Map();
  const storage={
    getItem:(key)=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,String(value)),
  };
  writeStudioPreferences(state,storage);
  assert.equal(values.has(STUDIO_PREFERENCES_KEY),true);
  assert.deepEqual(loadStudioPreferences(storage),studioPreferencesFromState(state));
});

test('DocumentStore snapshot hydrates songs, folders, revisions and stable editor state',()=>{
  const legacy={
    active:'song',
    folders:['Drafts','Empty'],
    songs:[{
      id:'song',
      title:'Authority',
      folder:'Drafts',
      lines:['alpha','beta'],
      barIds:['bar-a','bar-b'],
      barRevisions:[3,7],
      editorNextBarId:12,
      performance:{bpm:104,grid:16,feel:'straight',tempoScale:1,pauseLength:2},
      performanceCues:{'bar-a:0':{type:'accent',length:1}},
      performanceAnchors:{'bar-a':3},
      revisions:[{
        at:100,
        text:'alpha\nbeta',
        snapshot:{
          lines:['alpha','beta'],
          barIds:['bar-a','bar-b'],
          barRevisions:[2,6],
          editorNextBarId:11,
          steps:{},
          performance:{bpm:100,grid:8,feel:'triplet',tempoScale:.5,pauseLength:1},
          performanceCues:{'bar-a:0':{type:'hit',length:1}},
          performanceAnchors:{'bar-a':2},
        },
      }],
    }],
  };
  const {snapshot}=migrateLegacyStudioState(legacy);
  const hydrated=studioStateFromDocumentSnapshot(snapshot,{
    saved:[{word:'saved'}],
    theme:'light',
  });

  assert.equal(hydrated.active,'song');
  assert.deepEqual(hydrated.folders,['Drafts','Empty']);
  assert.deepEqual(hydrated.songs[0].lines,['alpha','beta']);
  assert.deepEqual(hydrated.songs[0].barIds,['bar-a','bar-b']);
  assert.deepEqual(hydrated.songs[0].barRevisions,[3,7]);
  assert.equal(hydrated.songs[0].editorNextBarId,12);
  assert.equal(hydrated.songs[0].performance.bpm,104);
  assert.equal(hydrated.songs[0].performanceCues['bar-a:0'].type,'accent');
  assert.equal(hydrated.songs[0].revisions[0].snapshot.barIds[0],'bar-a');
  assert.equal(hydrated.songs[0].revisions[0].snapshot.performance.feel,'triplet');
  assert.deepEqual(hydrated.saved,[{word:'saved'}]);
  assert.equal(hydrated.theme,'light');
});
