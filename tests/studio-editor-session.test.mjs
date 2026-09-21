import test from 'node:test';
import assert from 'node:assert/strict';

import {
  barIdentity,
  createSelectionProof,
  duplicateEditorBar,
  editorSnapshot,
  ensureEditorSong,
  insertEditorBar,
  mergeEditorBarWithPrevious,
  moveEditorBar,
  pasteEditorText,
  removeEditorBar,
  restoreEditorSnapshot,
  setEditorBarText,
  splitEditorBar,
  validateSelectionProof,
} from '../src/studio/editor-session.mjs';

test('editor session preserves stable bar IDs across edits split merge undo and redo snapshots',()=>{
  const song={
    id:'session',
    lines:['eins zwei','drei vier','fünf'],
    steps:{},
  };
  ensureEditorSong(song);
  const ids=[...song.barIds];
  const before=editorSnapshot(song);

  const first=setEditorBarText(song,1,'DREI vier');
  assert.equal(first.id,ids[1]);
  assert.equal(first.revision,1);
  assert.equal(validateSelectionProof(song,createSelectionProof(song,{index:1,start:0,end:4})).valid,true);

  const split=splitEditorBar(song,1,4,4);
  assert.equal(split.left.id,ids[1]);
  assert.notEqual(split.right.id,ids[1]);
  assert.deepEqual(song.barIds.filter((id)=>ids.includes(id)),ids);
  assert.equal(song.lines.length,4);

  const merged=mergeEditorBarWithPrevious(song,2);
  assert.equal(merged.bar.id,ids[1]);
  assert.equal(song.lines.length,3);
  assert.deepEqual(song.barIds,ids);

  const after=editorSnapshot(song);
  restoreEditorSnapshot(song,before);
  assert.deepEqual(song.lines,['eins zwei','drei vier','fünf']);
  assert.deepEqual(song.barIds,ids);
  restoreEditorSnapshot(song,after);
  assert.equal(song.lines[1],'DREI vier');
  assert.deepEqual(song.barIds,ids);
});

test('multi-line paste creates bars without changing the identity of the target bar',()=>{
  const song={id:'paste',lines:['vorher NACHHER','tail'],steps:{}};
  ensureEditorSong(song);
  const target=barIdentity(song,0);
  const result=pasteEditorText(song,0,7,14,'alpha\nbeta\ngamma');

  assert.equal(song.barIds[0],target.id);
  assert.deepEqual(song.lines,[
    'vorher alpha',
    'beta',
    'gamma',
    'tail',
  ]);
  assert.equal(result.focusIndex,2);
  assert.equal(result.selectionStart,'gamma'.length);
  assert.equal(result.insertedBarIds.length,3);
  assert.equal(new Set(song.barIds).size,song.barIds.length);
});

test('selection proof rejects stale bar revision and survives unrelated bar changes',()=>{
  const song={id:'proof',lines:['alpha beta','other'],steps:{}};
  ensureEditorSong(song);
  const proof=createSelectionProof(song,{index:0,start:6,end:10});
  assert.equal(proof.text,'beta');
  assert.deepEqual(validateSelectionProof(song,proof),{valid:true,reason:null,index:0});

  setEditorBarText(song,1,'changed elsewhere');
  assert.deepEqual(validateSelectionProof(song,proof),{valid:true,reason:null,index:0});

  setEditorBarText(song,0,'alpha BETA');
  const stale=validateSelectionProof(song,proof);
  assert.equal(stale.valid,false);
  assert.equal(stale.reason,'bar_changed');
  assert.equal(stale.index,0);
});


test('moveEditorBar preserves stable Bar identity, revisions and cue anchors',()=>{
  const song={
    id:'reorder',
    lines:['alpha','beta','gamma','delta'],
    barIds:['a','b','c','d'],
    barRevisions:[1,2,3,4],
    editorNextBarId:10,
    steps:{},
    performanceCues:{'b:0':{type:'accent',length:1}},
    performanceAnchors:{b:2},
  };
  ensureEditorSong(song);
  const result=moveEditorBar(song,1,3);

  assert.equal(result.moved,true);
  assert.deepEqual(song.lines,['alpha','gamma','delta','beta']);
  assert.deepEqual(song.barIds,['a','c','d','b']);
  assert.deepEqual(song.barRevisions,[1,3,4,2]);
  assert.equal(song.performanceCues['b:0'].type,'accent');
  assert.equal(song.performanceAnchors.b,2);
  assert.equal(barIdentity(song,3).id,'b');
});

test('selection proof follows a stable Bar after reorder without becoming stale',()=>{
  const song={id:'proof-reorder',lines:['first','target word','third'],steps:{}};
  ensureEditorSong(song);
  const proof=createSelectionProof(song,{index:1,start:7,end:11});
  const barId=proof.barId;

  moveEditorBar(song,1,0);
  const validated=validateSelectionProof(song,proof);

  assert.equal(song.barIds[0],barId);
  assert.deepEqual(validated,{valid:true,reason:null,index:0});
  assert.equal(song.lines[0].slice(proof.start,proof.end),'word');
});

test('moveEditorBar rejects invalid indexes and reports no-op moves',()=>{
  const song={id:'move-guard',lines:['a','b'],steps:{}};
  ensureEditorSong(song);
  assert.equal(moveEditorBar(song,-1,0),null);
  assert.equal(moveEditorBar(song,0,9),null);
  assert.deepEqual(moveEditorBar(song,1,1),{
    moved:false,
    from:1,
    to:1,
    bar:barIdentity(song,1),
  });
});


test('insert and duplicate Bars get new identities without copying cue state',()=>{
  const song={
    id:'insert-duplicate',
    lines:['alpha','beta'],
    barIds:['a','b'],
    barRevisions:[2,3],
    editorNextBarId:5,
    steps:{},
    performanceCues:{'a:0':{type:'accent',length:1}},
    performanceAnchors:{a:2},
  };
  ensureEditorSong(song);

  const inserted=insertEditorBar(song,1,'middle');
  assert.equal(inserted.index,1);
  assert.equal(inserted.text,'middle');
  assert.notEqual(inserted.id,'a');
  assert.notEqual(inserted.id,'b');
  assert.equal(inserted.revision,0);

  const duplicate=duplicateEditorBar(song,0);
  assert.equal(duplicate.text,'alpha');
  assert.notEqual(duplicate.id,'a');
  assert.equal(duplicate.revision,0);
  assert.equal(song.performanceCues['a:0'].type,'accent');
  assert.equal(
    Object.keys(song.performanceCues).some((key)=>key.startsWith(duplicate.id+':')),
    false,
  );
});

test('removing a Bar also removes Bar-scoped Performance cues and anchors',()=>{
  const song={
    id:'cleanup',
    lines:['alpha','beta'],
    barIds:['a','b'],
    barRevisions:[1,4],
    editorNextBarId:3,
    steps:{},
    performanceCues:{
      'a:0':{type:'hit',length:1},
      'b:4':{type:'breath',length:1},
    },
    performanceAnchors:{a:1,b:4},
  };
  ensureEditorSong(song);

  const removed=removeEditorBar(song,1);
  assert.equal(removed.id,'b');
  assert.equal(song.performanceCues['b:4'],undefined);
  assert.equal(song.performanceAnchors.b,undefined);
  assert.equal(song.performanceCues['a:0'].type,'hit');
  assert.equal(song.performanceAnchors.a,1);
});
