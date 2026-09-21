import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_PORTABLE_BACKUP_SCHEMA,
  createPortableStudioBackup,
  parsePortableStudioBackup,
  portableBackupFilename,
} from '../src/studio/backup-portability.mjs';

const snapshot={
  schema:'rhymelab-studio-document-v1',
  schemaVersion:2,
  activeSongId:'song',
  songs:[{id:'song'}],
  bars:[{id:'bar',songId:'song',orderKey:1000,text:'alpha'}],
  revisions:[],
  folders:[{id:'folder',name:'Drafts',orderKey:1000}],
  meta:{},
};

test('portable Studio backup round-trips document, preferences and SearchState',()=>{
  const backup=createPortableStudioBackup({
    snapshot,
    preferences:{theme:'dark',fontSize:21},
    searchState:{anchor:'Nacht',entityCategories:['person','musician']},
    exportedAt:123,
  });
  assert.equal(backup.schema,STUDIO_PORTABLE_BACKUP_SCHEMA);
  assert.equal(backup.exportedAt,123);

  const parsed=parsePortableStudioBackup(JSON.stringify(backup));
  assert.deepEqual(parsed.snapshot,snapshot);
  assert.deepEqual(parsed.preferences,{theme:'dark',fontSize:21});
  assert.deepEqual(parsed.searchState,{anchor:'Nacht',entityCategories:['person','musician']});
  assert.equal(parsed.legacyRawSnapshot,false);
});

test('portable backup parser accepts raw versioned Studio snapshot for recovery compatibility',()=>{
  const parsed=parsePortableStudioBackup(snapshot);
  assert.deepEqual(parsed.snapshot,snapshot);
  assert.equal(parsed.legacyRawSnapshot,true);
});

test('portable backup parser rejects unknown or malformed payloads',()=>{
  assert.throws(()=>parsePortableStudioBackup({schema:'other'}),/Unbekanntes/u);
  assert.throws(
    ()=>parsePortableStudioBackup({
      schema:STUDIO_PORTABLE_BACKUP_SCHEMA,
      version:1,
      snapshot:{schema:'rhymelab-studio-document-v1',schemaVersion:2},
    }),
    /gültigen Dokument-Snapshot/u,
  );
});

test('portable backup filename is deterministic and filesystem-safe',()=>{
  const name=portableBackupFilename('Meine / Nacht ✨',new Date('2026-09-21T12:34:56Z'));
  assert.equal(name,'rhymelab-Meine-Nacht-2026-09-21T12-34-56.json');
});
