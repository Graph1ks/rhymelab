export const STUDIO_PORTABLE_BACKUP_SCHEMA='rhymelab-studio-portable-backup-v1';
export const STUDIO_PORTABLE_BACKUP_VERSION=1;

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

export function createPortableStudioBackup({
  snapshot,
  preferences={},
  searchState={},
  exportedAt=Date.now(),
}={}){
  if(!looksLikeDocumentSnapshot(snapshot)){
    throw new TypeError('A valid Studio document snapshot is required.');
  }
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
  const value=typeof input==='string'?JSON.parse(input):input;
  if(looksLikeDocumentSnapshot(value)){
    return {
      schema:STUDIO_PORTABLE_BACKUP_SCHEMA,
      version:STUDIO_PORTABLE_BACKUP_VERSION,
      exportedAt:0,
      documentSchema:value.schema,
      documentSchemaVersion:Number(value.schemaVersion),
      snapshot:value,
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
  if(!looksLikeDocumentSnapshot(value.snapshot)){
    throw new Error('Studio Backup enthält keinen gültigen Dokument-Snapshot.');
  }
  return {
    schema:STUDIO_PORTABLE_BACKUP_SCHEMA,
    version:STUDIO_PORTABLE_BACKUP_VERSION,
    exportedAt:Number(value.exportedAt)||0,
    documentSchema:value.snapshot.schema,
    documentSchemaVersion:Number(value.snapshot.schemaVersion),
    snapshot:value.snapshot,
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
