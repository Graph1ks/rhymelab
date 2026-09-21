export const STUDIO_DOCUMENT_SCHEMA='rhymelab-studio-document-v1';
export const STUDIO_DOCUMENT_VERSION=1;

const ORDER_STEP=1024;

function asText(value){return String(value??'');}
function asTime(value){
  const number=Number(value);
  return Number.isFinite(number)&&number>=0?number:0;
}
function slug(value){
  const text=asText(value).normalize('NFKC').trim().toLocaleLowerCase('de-DE')
    .replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'');
  return text||'default';
}
function stableHash(value){
  const text=asText(value);
  let hash=2166136261;
  for(let index=0;index<text.length;index++){
    hash^=text.charCodeAt(index);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(16).padStart(8,'0');
}
function cloneSnapshot(snapshot){
  return {
    ...snapshot,
    meta:{...snapshot.meta},
    folders:snapshot.folders.map((row)=>({...row})),
    songs:snapshot.songs.map((row)=>({...row})),
    bars:snapshot.bars.map((row)=>({...row})),
    revisions:snapshot.revisions.map((row)=>({
      ...row,
      documentSnapshot:{
        ...row.documentSnapshot,
        bars:(row.documentSnapshot?.bars||[]).map((bar)=>({...bar})),
      },
    })),
  };
}
function legacySongId(song,index){
  const source=asText(song?.id).trim();
  return source||`legacy-song-${String(index+1).padStart(4,'0')}`;
}
function folderRows(legacySongs){
  const names=[];
  for(const song of legacySongs){
    const name=asText(song?.folder).trim();
    if(name&&!names.includes(name))names.push(name);
  }
  return names.map((name,index)=>({
    id:`folder:${slug(name)}:${String(index+1).padStart(3,'0')}`,
    name,
    orderKey:(index+1)*ORDER_STEP,
    createdAt:0,
    updatedAt:0,
  }));
}
function snapshotBarsForText(songId,text){
  return asText(text).split('\n').map((line,index)=>({
    id:`revision-bar:${songId}:${String(index+1).padStart(4,'0')}`,
    orderKey:(index+1)*ORDER_STEP,
    text:line,
  }));
}

export function serializeLegacyStudioBackup(legacyState){
  return JSON.stringify({
    schema:'rhymelab-studio-legacy-backup-v1',
    source:'rhymelab-studio-concept-v2',
    payload:legacyState,
  });
}

export function migrateLegacyStudioState(legacyState={}){
  const legacySongs=Array.isArray(legacyState.songs)?legacyState.songs:[];
  const folders=folderRows(legacySongs);
  const folderByName=new Map(folders.map((row)=>[row.name,row.id]));
  const songs=[];
  const bars=[];
  const revisions=[];

  legacySongs.forEach((legacySong,songIndex)=>{
    const songId=legacySongId(legacySong,songIndex);
    const createdAt=asTime(legacySong.createdAt);
    const revisionRows=Array.isArray(legacySong.revisions)?legacySong.revisions:[];
    const latestRevisionAt=revisionRows.reduce((max,row)=>Math.max(max,asTime(row?.at)),0);
    const updatedAt=Math.max(asTime(legacySong.updatedAt),latestRevisionAt,createdAt);
    const folderName=asText(legacySong.folder).trim();
    songs.push({
      id:songId,
      title:asText(legacySong.title||'Untitled'),
      folderId:folderByName.get(folderName)||null,
      createdAt,
      updatedAt,
      deletedAt:legacySong.deletedAt!=null
        ?asTime(legacySong.deletedAt)
        :legacySong.deleted
          ?Math.max(updatedAt,1)
          :null,
      schemaVersion:STUDIO_DOCUMENT_VERSION,
    });

    const lines=Array.isArray(legacySong.lines)?legacySong.lines.map(asText):[''];
    lines.forEach((line,barIndex)=>{
      bars.push({
        id:`bar:${songId}:${String(barIndex+1).padStart(4,'0')}`,
        songId,
        orderKey:(barIndex+1)*ORDER_STEP,
        text:line,
        revision:0,
      });
    });

    revisionRows.forEach((legacyRevision,revisionIndex)=>{
      const text=asText(legacyRevision?.text);
      revisions.push({
        id:`revision:${songId}:${String(revisionIndex+1).padStart(4,'0')}`,
        songId,
        createdAt:asTime(legacyRevision?.at),
        reason:'legacy_revision',
        documentSnapshot:{
          title:asText(legacySong.title||'Untitled'),
          bars:snapshotBarsForText(songId,text),
        },
      });
    });
  });

  const snapshot={
    schema:STUDIO_DOCUMENT_SCHEMA,
    schemaVersion:STUDIO_DOCUMENT_VERSION,
    activeSongId:songs.some((song)=>song.id===legacyState.active)
      ?legacyState.active
      :songs[0]?.id||null,
    meta:{
      nextSongId:songs.length+1,
      nextBarId:bars.length+1,
      nextRevisionId:revisions.length+1,
    },
    folders,
    songs,
    bars,
    revisions,
  };
  const validation=validateStudioDocumentSnapshot(snapshot);
  const backup=serializeLegacyStudioBackup(legacyState);
  return {
    snapshot,
    backup,
    report:{
      sourceSchema:'rhymelab-studio-concept-v2',
      targetSchema:STUDIO_DOCUMENT_SCHEMA,
      valid:validation.valid,
      errors:validation.errors,
      counts:{
        songs:songs.length,
        bars:bars.length,
        revisions:revisions.length,
        folders:folders.length,
      },
      sourceSignature:stableHash(JSON.stringify(legacyState)),
      targetSignature:stableHash(JSON.stringify(snapshot)),
      backupSignature:stableHash(backup),
    },
  };
}

export function validateStudioDocumentSnapshot(snapshot){
  const errors=[];
  if(snapshot?.schema!==STUDIO_DOCUMENT_SCHEMA)errors.push('schema');
  if(snapshot?.schemaVersion!==STUDIO_DOCUMENT_VERSION)errors.push('schemaVersion');
  if(!Array.isArray(snapshot?.songs))errors.push('songs');
  if(!Array.isArray(snapshot?.bars))errors.push('bars');
  if(!Array.isArray(snapshot?.revisions))errors.push('revisions');
  if(!Array.isArray(snapshot?.folders))errors.push('folders');
  if(errors.length)return {valid:false,errors};

  const songIds=new Set();
  const barIds=new Set();
  const revisionIds=new Set();
  for(const song of snapshot.songs){
    if(!song?.id||songIds.has(song.id))errors.push(`song:${song?.id||'missing'}`);
    songIds.add(song.id);
  }
  for(const bar of snapshot.bars){
    if(!bar?.id||barIds.has(bar.id))errors.push(`bar:${bar?.id||'missing'}`);
    if(!songIds.has(bar?.songId))errors.push(`bar-song:${bar?.id||'missing'}`);
    if(!Number.isFinite(Number(bar?.orderKey)))errors.push(`bar-order:${bar?.id||'missing'}`);
    barIds.add(bar.id);
  }
  for(const revision of snapshot.revisions){
    if(!revision?.id||revisionIds.has(revision.id))errors.push(`revision:${revision?.id||'missing'}`);
    if(!songIds.has(revision?.songId))errors.push(`revision-song:${revision?.id||'missing'}`);
    revisionIds.add(revision.id);
  }
  if(snapshot.activeSongId&&!songIds.has(snapshot.activeSongId))errors.push('activeSongId');
  return {valid:errors.length===0,errors};
}

export function barsForSong(snapshot,songId){
  return snapshot.bars.filter((bar)=>bar.songId===songId)
    .slice().sort((a,b)=>Number(a.orderKey)-Number(b.orderKey)||String(a.id).localeCompare(String(b.id)));
}

export function songText(snapshot,songId){
  return barsForSong(snapshot,songId).map((bar)=>bar.text).join('\n');
}

function nextId(next,prefix){
  return `${prefix}:${String(next).padStart(8,'0')}`;
}
function normalizeSongOrder(snapshot,songId){
  const rows=barsForSong(snapshot,songId);
  const order=new Map(rows.map((bar,index)=>[bar.id,(index+1)*ORDER_STEP]));
  snapshot.bars=snapshot.bars.map((bar)=>order.has(bar.id)?{...bar,orderKey:order.get(bar.id)}:bar);
}
function orderKeyAfter(snapshot,bar){
  const rows=barsForSong(snapshot,bar.songId);
  const index=rows.findIndex((row)=>row.id===bar.id);
  const next=rows[index+1];
  if(!next)return Number(bar.orderKey)+ORDER_STEP;
  const currentKey=Number(bar.orderKey),nextKey=Number(next.orderKey);
  if(nextKey-currentKey>1)return currentKey+Math.floor((nextKey-currentKey)/2);
  normalizeSongOrder(snapshot,bar.songId);
  const normalized=snapshot.bars.find((row)=>row.id===bar.id);
  return orderKeyAfter(snapshot,normalized);
}

export function replaceBarText(snapshot,barId,text){
  const next=cloneSnapshot(snapshot);
  const index=next.bars.findIndex((bar)=>bar.id===barId);
  if(index<0)return {snapshot:next,changed:false,bar:null};
  const bar=next.bars[index];
  const value=asText(text);
  if(bar.text===value)return {snapshot:next,changed:false,bar};
  next.bars[index]={...bar,text:value,revision:Number(bar.revision||0)+1};
  return {snapshot:next,changed:true,bar:next.bars[index]};
}

export function splitBar(snapshot,barId,offset){
  let next=cloneSnapshot(snapshot);
  const index=next.bars.findIndex((bar)=>bar.id===barId);
  if(index<0)return {snapshot:next,changed:false,left:null,right:null};
  const bar=next.bars[index];
  const position=Math.max(0,Math.min(asText(bar.text).length,Number(offset)||0));
  const leftText=bar.text.slice(0,position);
  const rightText=bar.text.slice(position);
  const updated=replaceBarText(next,barId,leftText);
  next=updated.snapshot;
  const current=next.bars.find((row)=>row.id===barId);
  const id=nextId(next.meta.nextBarId,'bar');
  next.meta.nextBarId+=1;
  const right={
    id,
    songId:bar.songId,
    orderKey:orderKeyAfter(next,current),
    text:rightText,
    revision:0,
  };
  next.bars.push(right);
  return {snapshot:next,changed:true,left:next.bars.find((row)=>row.id===barId),right};
}

export function removeBar(snapshot,barId){
  const next=cloneSnapshot(snapshot);
  const bar=next.bars.find((row)=>row.id===barId);
  if(!bar)return {snapshot:next,changed:false};
  const songBars=barsForSong(next,bar.songId);
  if(songBars.length<=1)return {snapshot:next,changed:false};
  next.bars=next.bars.filter((row)=>row.id!==barId);
  normalizeSongOrder(next,bar.songId);
  return {snapshot:next,changed:true};
}

export function captureSongRevision(snapshot,songId,{reason='manual',createdAt=Date.now()}={}){
  const next=cloneSnapshot(snapshot);
  const song=next.songs.find((row)=>row.id===songId);
  if(!song)return {snapshot:next,revision:null};
  const id=nextId(next.meta.nextRevisionId,'revision');
  next.meta.nextRevisionId+=1;
  const revision={
    id,
    songId,
    createdAt:asTime(createdAt),
    reason:asText(reason)||'manual',
    documentSnapshot:{
      title:song.title,
      bars:barsForSong(next,songId).map((bar)=>({
        id:bar.id,
        orderKey:bar.orderKey,
        text:bar.text,
      })),
    },
  };
  next.revisions.push(revision);
  return {snapshot:next,revision};
}

export function replaceSelection(snapshot,{barId,start=0,end=start,text=''}) {
  const bar=snapshot.bars.find((row)=>row.id===barId);
  if(!bar)return {snapshot:cloneSnapshot(snapshot),changed:false,selection:null};
  const source=asText(bar.text);
  const from=Math.max(0,Math.min(source.length,Number(start)||0));
  const to=Math.max(from,Math.min(source.length,Number(end)||from));
  const insert=asText(text);
  const updated=replaceBarText(snapshot,barId,source.slice(0,from)+insert+source.slice(to));
  return {
    ...updated,
    selection:{
      barId,
      start:from,
      end:from+insert.length,
    },
  };
}
