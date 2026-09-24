import {validateStudioDocumentSnapshot} from './document-model.mjs';

export const STUDIO_PORTABLE_BACKUP_SCHEMA='rhymelab-studio-portable-backup-v1';
export const STUDIO_PORTABLE_BACKUP_VERSION=1;
export const STUDIO_PORTABLE_BACKUP_LIMITS=Object.freeze({
  maxJsonBytes:64*1024*1024,
  maxSongs:10_000,
  maxBars:250_000,
  maxRevisions:100_000,
  maxFolders:10_000,
  maxRevisionBars:1_000_000,
  maxTextChars:1_000_000,
});

function plainObject(value){
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
}
function looksLikeDocumentSnapshot(value){
  return Boolean(
    value
    &&typeof value==='object'
    &&typeof value.schema==='string'
    &&Number.isFinite(Number(value.schemaVersion))
    &&Array.isArray(value.songs)
    &&Array.isArray(value.bars)
    &&Array.isArray(value.revisions)
    &&Array.isArray(value.folders)
  );
}
function assertCount(label,value,max){
  if(value.length>max){
    throw new Error(`Studio Backup überschreitet das Limit für ${label}: ${value.length} > ${max}.`);
  }
}
function assertTextBudget(label,value){
  if(String(value??'').length>STUDIO_PORTABLE_BACKUP_LIMITS.maxTextChars){
    throw new Error(`Studio Backup enthält einen zu großen Text in ${label}.`);
  }
}
function assertSnapshotWithinLimits(snapshot){
  if(!looksLikeDocumentSnapshot(snapshot)){
    throw new Error('Studio Backup enthält keinen gültigen Dokument-Snapshot.');
  }

  const limits=STUDIO_PORTABLE_BACKUP_LIMITS;
  assertCount('Songs',snapshot.songs,limits.maxSongs);
  assertCount('Bars',snapshot.bars,limits.maxBars);
  assertCount('Revisionen',snapshot.revisions,limits.maxRevisions);
  assertCount('Ordner',snapshot.folders,limits.maxFolders);

  let revisionBars=0;
  for(const bar of snapshot.bars)assertTextBudget(`Bar ${String(bar?.id||'unknown')}`,bar?.text);
  for(const revision of snapshot.revisions){
    const bars=Array.isArray(revision?.documentSnapshot?.bars)
      ?revision.documentSnapshot.bars
      :[];
    revisionBars+=bars.length;
    if(revisionBars>limits.maxRevisionBars){
      throw new Error(
        `Studio Backup überschreitet das Limit für Revision-Bars: ${revisionBars} > ${limits.maxRevisionBars}.`
      );
    }
    for(const bar of bars){
      assertTextBudget(
        `Revision ${String(revision?.id||'unknown')} / Bar ${String(bar?.id||'unknown')}`,
        bar?.text,
      );
    }
  }

  const validation=validateStudioDocumentSnapshot(snapshot);
  if(!validation.valid){
    throw new Error(
      'Studio Backup enthält einen inkonsistenten Dokument-Snapshot: '
      +validation.errors.join(', ')
    );
  }
  return snapshot;
}
function parseInput(input){
  if(typeof input!=='string')return input;
  const bytes=new TextEncoder().encode(input).byteLength;
  if(bytes>STUDIO_PORTABLE_BACKUP_LIMITS.maxJsonBytes){
    throw new Error(
      `Studio Backup ist zu groß: ${bytes} Bytes > ${STUDIO_PORTABLE_BACKUP_LIMITS.maxJsonBytes} Bytes.`
    );
  }
  return JSON.parse(input);
}

export function createPortableStudioBackup({
  snapshot,
  preferences={},
  searchState={},
  exportedAt=Date.now(),
}={}){
  if(!looksLikeDocumentSnapshot(snapshot)){
    throw new TypeError('A valid Studio document snapshot is required.');
  }
  assertSnapshotWithinLimits(snapshot);
  return {
    schema:STUDIO_PORTABLE_BACKUP_SCHEMA,
    version:STUDIO_PORTABLE_BACKUP_VERSION,
    exportedAt:Number(exportedAt)||Date.now(),
    documentSchema:snapshot.schema,
    documentSchemaVersion:Number(snapshot.schemaVersion),
    snapshot,
    preferences:{...plainObject(preferences)},
    searchState:{...plainObject(searchState)},
  };
}

export function parsePortableStudioBackup(input){
  const value=parseInput(input);
  if(looksLikeDocumentSnapshot(value)){
    const snapshot=assertSnapshotWithinLimits(value);
    return {
      schema:STUDIO_PORTABLE_BACKUP_SCHEMA,
      version:STUDIO_PORTABLE_BACKUP_VERSION,
      exportedAt:0,
      documentSchema:snapshot.schema,
      documentSchemaVersion:Number(snapshot.schemaVersion),
      snapshot,
      preferences:{},
      searchState:{},
      legacyRawSnapshot:true,
    };
  }
  if(!value||typeof value!=='object'||value.schema!==STUDIO_PORTABLE_BACKUP_SCHEMA){
    throw new Error('Unbekanntes RhymeLab Studio Backup-Format.');
  }
  if(Number(value.version)!==STUDIO_PORTABLE_BACKUP_VERSION){
    throw new Error('Nicht unterstützte Studio Backup-Version: '+String(value.version));
  }
  const snapshot=assertSnapshotWithinLimits(value.snapshot);
  return {
    schema:STUDIO_PORTABLE_BACKUP_SCHEMA,
    version:STUDIO_PORTABLE_BACKUP_VERSION,
    exportedAt:Number(value.exportedAt)||0,
    documentSchema:snapshot.schema,
    documentSchemaVersion:Number(snapshot.schemaVersion),
    snapshot,
    preferences:{...plainObject(value.preferences)},
    searchState:{...plainObject(value.searchState)},
    legacyRawSnapshot:false,
  };
}

export function portableBackupFilename(title='studio',date=new Date()){
  const safe=String(title||'studio')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._ -]+/gu,'')
    .trim()
    .replace(/\s+/g,'-')
    .slice(0,64)||'studio';
  const stamp=date instanceof Date&&!Number.isNaN(date.valueOf())
    ?date.toISOString().slice(0,19).replaceAll(':','-')
    :'backup';
  return `rhymelab-${safe}-${stamp}.json`;
}
