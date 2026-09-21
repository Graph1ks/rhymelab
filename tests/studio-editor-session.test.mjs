import test from 'node:test';
import assert from 'node:assert/strict';

import {
  barIdentity,
  createSelectionProof,
  editorSnapshot,
  ensureEditorSong,
  mergeEditorBarWithPrevious,
  pasteEditorText,
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
