function text(value){return String(value??'');}
function integer(value,fallback=0){
  const number=Number(value);
  return Number.isInteger(number)&&number>=0?number:fallback;
}
function safeSongId(song){return text(song?.id||'song').replace(/[^\p{L}\p{N}._:-]+/gu,'-')||'song';}
function initialBarId(song,index){
  return `bar:${safeSongId(song)}:legacy:${String(index+1).padStart(4,'0')}`;
}
function nextBarId(song){
  ensureEditorSong(song);
  const sequence=integer(song.editorNextBarId,1);
  song.editorNextBarId=sequence+1;
  return `bar:${safeSongId(song)}:edit:${String(sequence).padStart(8,'0')}`;
}

export function ensureEditorSong(song){
  if(!song||typeof song!=='object')throw new TypeError('song is required');
  song.lines=Array.isArray(song.lines)?song.lines.map(text):[''];
  if(!song.lines.length)song.lines=[''];

  const existingIds=Array.isArray(song.barIds)?song.barIds.map(text):[];
  const used=new Set();
  song.barIds=song.lines.map((_,index)=>{
    let id=existingIds[index];
    if(!id||used.has(id))id=initialBarId(song,index);
    let suffix=1;
    const base=id;
    while(used.has(id))id=`${base}:${suffix++}`;
    used.add(id);
    return id;
  });

  const existingRevisions=Array.isArray(song.barRevisions)?song.barRevisions:[];
  song.barRevisions=song.lines.map((_,index)=>integer(existingRevisions[index],0));
  song.editorNextBarId=Math.max(1,integer(song.editorNextBarId,1));
  song.steps=song.steps&&typeof song.steps==='object'?song.steps:{};
  return song;
}

export function barIdentity(song,index){
  ensureEditorSong(song);
  if(index<0||index>=song.lines.length)return null;
  return {
    id:song.barIds[index],
    revision:song.barRevisions[index],
    index,
    text:song.lines[index],
  };
}

export function editorSnapshot(song){
  ensureEditorSong(song);
  return {
    lines:[...song.lines],
    steps:{...song.steps},
    performance:song.performance&&typeof song.performance==='object'?{...song.performance}:{},
    performanceCues:Object.fromEntries(Object.entries(song.performanceCues||{}).map(([key,value])=>[
      key,
      value&&typeof value==='object'?{...value}:value,
    ])),
    performanceAnchors:{...(song.performanceAnchors||{})},
    barIds:[...song.barIds],
    barRevisions:[...song.barRevisions],
    editorNextBarId:song.editorNextBarId,
  };
}

export function restoreEditorSnapshot(song,snapshot){
  if(!song||!snapshot)return false;
  song.lines=Array.isArray(snapshot.lines)?snapshot.lines.map(text):[''];
  song.steps=snapshot.steps&&typeof snapshot.steps==='object'?{...snapshot.steps}:{};
  song.performance=snapshot.performance&&typeof snapshot.performance==='object'?{...snapshot.performance}:{};
  song.performanceCues=Object.fromEntries(Object.entries(snapshot.performanceCues||{}).map(([key,value])=>[
    key,
    value&&typeof value==='object'?{...value}:value,
  ]));
  song.performanceAnchors={...(snapshot.performanceAnchors||{})};
  song.barIds=Array.isArray(snapshot.barIds)?[...snapshot.barIds]:[];
  song.barRevisions=Array.isArray(snapshot.barRevisions)?[...snapshot.barRevisions]:[];
  song.editorNextBarId=integer(snapshot.editorNextBarId,1);
  ensureEditorSong(song);
  return true;
}

export function setEditorBarText(song,index,value){
  ensureEditorSong(song);
  if(index<0||index>=song.lines.length)return null;
  const next=text(value).replace(/[\r\n]+/g,' ');
  if(song.lines[index]===next)return barIdentity(song,index);
  song.lines[index]=next;
  song.barRevisions[index]=integer(song.barRevisions[index],0)+1;
  return barIdentity(song,index);
}

export function splitEditorBar(song,index,start,end=start){
  ensureEditorSong(song);
  if(index<0||index>=song.lines.length)return null;
  const source=song.lines[index];
  const from=Math.max(0,Math.min(source.length,integer(start,0)));
  const to=Math.max(from,Math.min(source.length,integer(end,from)));
  const left=source.slice(0,from);
  const right=source.slice(to);
  setEditorBarText(song,index,left);
  const rightId=nextBarId(song);
  song.lines.splice(index+1,0,right);
  song.barIds.splice(index+1,0,rightId);
  song.barRevisions.splice(index+1,0,0);
  return {
    left:barIdentity(song,index),
    right:barIdentity(song,index+1),
  };
}

export function removeEditorBar(song,index){
  ensureEditorSong(song);
  if(song.lines.length<=1||index<0||index>=song.lines.length)return null;
  const removed=barIdentity(song,index);
  song.lines.splice(index,1);
  song.barIds.splice(index,1);
  song.barRevisions.splice(index,1);
  return removed;
}

export function moveEditorBar(song,fromIndex,toIndex){
  ensureEditorSong(song);
  const length=song.lines.length;
  const from=integer(fromIndex,-1);
  const target=integer(toIndex,-1);
  if(from<0||from>=length||target<0||target>=length)return null;
  if(from===target)return {
    moved:false,
    from,
    to:target,
    bar:barIdentity(song,target),
  };
  const [line]=song.lines.splice(from,1);
  const [barId]=song.barIds.splice(from,1);
  const [revision]=song.barRevisions.splice(from,1);
  song.lines.splice(target,0,line);
  song.barIds.splice(target,0,barId);
  song.barRevisions.splice(target,0,revision);
  return {
    moved:true,
    from,
    to:target,
    bar:barIdentity(song,target),
  };
}

export function mergeEditorBarWithPrevious(song,index){
  ensureEditorSong(song);
  if(index<=0||index>=song.lines.length)return null;
  const previousIndex=index-1;
  const previousText=song.lines[previousIndex];
  const currentText=song.lines[index];
  setEditorBarText(song,previousIndex,previousText+currentText);
  const removed=removeEditorBar(song,index);
  return {
    index:previousIndex,
    caret:previousText.length,
    bar:barIdentity(song,previousIndex),
    removed,
  };
}

export function pasteEditorText(song,index,start,end,clipboardText){
  ensureEditorSong(song);
  if(index<0||index>=song.lines.length)return null;
  const source=song.lines[index];
  const from=Math.max(0,Math.min(source.length,integer(start,0)));
  const to=Math.max(from,Math.min(source.length,integer(end,from)));
  const normalized=text(clipboardText).replace(/\r\n?/g,'\n');
  const chunks=normalized.split('\n');
  if(chunks.length===1){
    const inserted=chunks[0];
    setEditorBarText(song,index,source.slice(0,from)+inserted+source.slice(to));
    return {
      firstIndex:index,
      lastIndex:index,
      focusIndex:index,
      selectionStart:from+inserted.length,
      selectionEnd:from+inserted.length,
      insertedBarIds:[song.barIds[index]],
    };
  }

  const first=source.slice(0,from)+chunks[0];
  const last=chunks.at(-1)+source.slice(to);
  setEditorBarText(song,index,first);
  const inserted=[];
  for(let offset=1;offset<chunks.length;offset++){
    const value=offset===chunks.length-1?last:chunks[offset];
    const id=nextBarId(song);
    song.lines.splice(index+offset,0,value);
    song.barIds.splice(index+offset,0,id);
    song.barRevisions.splice(index+offset,0,0);
    inserted.push(id);
  }
  const focusIndex=index+chunks.length-1;
  const caret=chunks.at(-1).length;
  return {
    firstIndex:index,
    lastIndex:focusIndex,
    focusIndex,
    selectionStart:caret,
    selectionEnd:caret,
    insertedBarIds:[song.barIds[index],...inserted],
  };
}

export function createSelectionProof(song,{index,start=0,end=start}={}){
  ensureEditorSong(song);
  const bar=barIdentity(song,index);
  if(!bar)return null;
  const from=Math.max(0,Math.min(bar.text.length,integer(start,0)));
  const to=Math.max(from,Math.min(bar.text.length,integer(end,from)));
  return {
    songId:song.id,
    barId:bar.id,
    barRevision:bar.revision,
    start:from,
    end:to,
    text:bar.text.slice(from,to),
  };
}

export function validateSelectionProof(song,proof){
  ensureEditorSong(song);
  if(!proof||proof.songId!==song.id)return {valid:false,reason:'song_changed',index:-1};
  const index=song.barIds.indexOf(proof.barId);
  if(index<0)return {valid:false,reason:'bar_missing',index:-1};
  if(song.barRevisions[index]!==proof.barRevision)return {valid:false,reason:'bar_changed',index};
  const source=song.lines[index];
  if(source.slice(proof.start,proof.end)!==proof.text)return {valid:false,reason:'range_changed',index};
  return {valid:true,reason:null,index};
}
