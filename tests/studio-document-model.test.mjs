import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_DOCUMENT_SCHEMA,
  barsForSong,
  captureSongRevision,
  migrateLegacyStudioState,
  removeBar,
  replaceSelection,
  songText,
  splitBar,
  validateStudioDocumentSnapshot,
} from '../src/studio/document-model.mjs';

test('Studio document migration is deterministic, non-destructive and reference-safe',()=>{
  const legacy={
    active:'song-a',
    songs:[
      {
        id:'song-a',
        title:'Night Shift',
        folder:'Drafts',
        lines:['eins','zwei','drei'],
        revisions:[
          {at:100,text:'eins\nzwei'},
          {at:200,text:'eins\nzwei\ndrei'},
        ],
      },
      {
        id:'song-b',
        title:'Archive',
        folder:'Drafts',
        lines:['alt'],
        deleted:true,
      },
    ],
  };

  const first=migrateLegacyStudioState(legacy);
  const second=migrateLegacyStudioState(legacy);

  assert.equal(first.snapshot.schema,STUDIO_DOCUMENT_SCHEMA);
  assert.deepEqual(first.snapshot,second.snapshot);
  assert.equal(first.report.sourceSignature,second.report.sourceSignature);
  assert.equal(first.report.targetSignature,second.report.targetSignature);
  assert.equal(first.report.valid,true);
  assert.deepEqual(first.report.counts,{songs:2,bars:4,revisions:2,folders:1});
  assert.equal(first.snapshot.activeSongId,'song-a');
  assert.equal(first.snapshot.songs[1].deletedAt,1);
  assert.deepEqual(
    barsForSong(first.snapshot,'song-a').map((bar)=>bar.id),
    ['bar:song-a:0001','bar:song-a:0002','bar:song-a:0003'],
  );
  assert.equal(songText(first.snapshot,'song-a'),'eins\nzwei\ndrei');

  const backup=JSON.parse(first.backup);
  assert.equal(backup.schema,'rhymelab-studio-legacy-backup-v1');
  assert.deepEqual(backup.payload,legacy);
  assert.deepEqual(legacy.songs[0].lines,['eins','zwei','drei']);
  assert.deepEqual(validateStudioDocumentSnapshot(first.snapshot),{valid:true,errors:[]});
});

test('document/editor spike keeps stable bar identities across 200 bars, Unicode edits and splits',()=>{
  const lines=Array.from({length:200},(_,index)=>
    index===79
      ?'Emoji 🎤 und Wörter — sehr lange Zeile '.repeat(20).trim()
      :`Bar ${String(index+1).padStart(3,'0')} · Straße · déjà vu`,
  );
  const migrated=migrateLegacyStudioState({
    active:'stress',
    songs:[{id:'stress',title:'Stress Fixture',lines,revisions:[]}],
  });
  let snapshot=migrated.snapshot;
  const before=barsForSong(snapshot,'stress');
  assert.equal(before.length,200);
  const target=before[79];
  const targetId=target.id;

  const marker='🎤';
  const markerStart=target.text.indexOf(marker);
  const selectionEnd=markerStart+marker.length;
  const replaced=replaceSelection(snapshot,{
    barId:targetId,
    start:markerStart,
    end:selectionEnd,
    text:'MIC',
  });
  snapshot=replaced.snapshot;
  assert.equal(replaced.selection.barId,targetId);
  assert.equal(replaced.selection.start,markerStart);
  assert.equal(replaced.selection.end,markerStart+3);
  assert.equal(barsForSong(snapshot,'stress')[79].id,targetId);
  assert.match(barsForSong(snapshot,'stress')[79].text,/MIC/);

  const splitOffset=barsForSong(snapshot,'stress')[79].text.indexOf(' und ');
  const split=splitBar(snapshot,targetId,splitOffset);
  snapshot=split.snapshot;
  assert.equal(split.changed,true);
  assert.equal(split.left.id,targetId);
  assert.notEqual(split.right.id,targetId);
  assert.equal(split.right.songId,'stress');
  assert.equal(barsForSong(snapshot,'stress').length,201);
  assert.equal(barsForSong(snapshot,'stress')[79].id,targetId);
  assert.equal(barsForSong(snapshot,'stress')[80].id,split.right.id);

  const removed=removeBar(snapshot,split.right.id);
  snapshot=removed.snapshot;
  assert.equal(removed.changed,true);
  assert.equal(barsForSong(snapshot,'stress').length,200);
  assert.equal(barsForSong(snapshot,'stress')[79].id,targetId);

  const revisionResult=captureSongRevision(snapshot,'stress',{
    reason:'editor-spike',
    createdAt:123456,
  });
  snapshot=revisionResult.snapshot;
  assert.equal(revisionResult.revision.createdAt,123456);
  assert.equal(revisionResult.revision.reason,'editor-spike');
  assert.equal(revisionResult.revision.documentSnapshot.bars.length,200);
  assert.deepEqual(validateStudioDocumentSnapshot(snapshot),{valid:true,errors:[]});
});

test('document validation rejects dangling bar and revision references',()=>{
  const {snapshot}=migrateLegacyStudioState({
    active:'a',
    songs:[{id:'a',title:'A',lines:['one'],revisions:[]}],
  });
  const broken={
    ...snapshot,
    bars:[...snapshot.bars,{id:'dangling',songId:'missing',orderKey:99,text:'x',revision:0}],
    revisions:[...snapshot.revisions,{
      id:'bad-revision',
      songId:'missing',
      createdAt:0,
      reason:'test',
      documentSnapshot:{title:'x',bars:[]},
    }],
  };
  const validation=validateStudioDocumentSnapshot(broken);
  assert.equal(validation.valid,false);
  assert.equal(validation.errors.includes('bar-song:dangling'),true);
  assert.equal(validation.errors.includes('revision-song:bad-revision'),true);
});
