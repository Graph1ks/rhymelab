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

export function editorBracketSegments(value){
  const raw=text(value);
  return [...raw.matchAll(/\[[^\]\r\n]*\]/gu)].map((match)=>({
    text:match[0],
    content:match[0].slice(1,-1),
    start:match.index??0,
    end:(match.index??0)+match[0].length,
  }));
}

export function editorTrackableText(value){
  return text(value)
    .replace(/\[[^\]\r\n]*\]/gu,' ')
    .replace(/\s+/gu,' ')
    .trim();
}

export function editorLineKind(value){
  const raw=text(value);
  if(!raw.trim())return 'blank';
  if(!editorTrackableText(raw)&&editorBracketSegments(raw).length)return 'bracket';
  return 'bar';
}

export function isTrackedEditorLine(value){
  return editorLineKind(value)==='bar';
}

export function trackedEditorLineIndexes(song){
  ensureEditorSong(song);
  return song.lines.map((line,index)=>isTrackedEditorLine(line)?index:-1).filter((index)=>index>=0);
}

export function trackedEditorBarNumber(song,index){
  ensureEditorSong(song);
  if(index<0||index>=song.lines.length||!isTrackedEditorLine(song.lines[index]))return null;
  let number=0;
  for(let current=0;current<=index;current++){
    if(isTrackedEditorLine(song.lines[current]))number++;
  }
  return number;
}

export function editorDocumentText(song){
  ensureEditorSong(song);
  return song.lines.join('\n');
}

export function editorLineStartOffset(lines,index){
  const source=Array.isArray(lines)?lines.map(text):[''];
  const target=Math.max(0,Math.min(source.length-1,integer(index,0)));
  let offset=0;
  for(let current=0;current<target;current++)offset+=source[current].length+1;
  return offset;
}

export function editorPositionFromOffset(lines,offset){
  const source=Array.isArray(lines)&&lines.length?lines.map(text):[''];
  const documentLength=source.reduce((sum,line,index)=>sum+line.length+(index<source.length-1?1:0),0);
  const target=Math.max(0,Math.min(documentLength,Number(offset)||0));
  let cursor=0;
  for(let index=0;index<source.length;index++){
    const end=cursor+source[index].length;
    if(target<=end||index===source.length-1){
      return {index,offset:Math.max(0,Math.min(source[index].length,target-cursor))};
    }
    cursor=end+1;
  }
  const last=source.length-1;
  return {index:last,offset:source[last].length};
}

export function reconcileEditorDocumentText(song,value){
  ensureEditorSong(song);
  const normalized=text(value).replace(/\r\n?/g,'\n');
  const nextLines=normalized.split('\n');
  const oldLines=[...song.lines];
  const oldIds=[...song.barIds];
  const oldRevisions=[...song.barRevisions];

  if(nextLines.length===oldLines.length&&nextLines.every((line,index)=>line===oldLines[index])){
    return {changed:false,lines:[...song.lines],barIds:[...song.barIds],barRevisions:[...song.barRevisions]};
  }

  let prefix=0;
  while(prefix<oldLines.length&&prefix<nextLines.length&&oldLines[prefix]===nextLines[prefix])prefix++;

  let suffix=0;
  while(
    suffix<oldLines.length-prefix
    &&suffix<nextLines.length-prefix
    &&oldLines[oldLines.length-1-suffix]===nextLines[nextLines.length-1-suffix]
  )suffix++;

  const nextIds=new Array(nextLines.length);
  const nextRevisions=new Array(nextLines.length);

  for(let index=0;index<prefix;index++){
    nextIds[index]=oldIds[index];
    nextRevisions[index]=oldRevisions[index];
  }
  for(let offset=0;offset<suffix;offset++){
    const oldIndex=oldLines.length-1-offset;
    const nextIndex=nextLines.length-1-offset;
    nextIds[nextIndex]=oldIds[oldIndex];
    nextRevisions[nextIndex]=oldRevisions[oldIndex];
  }

  const oldMiddleStart=prefix;
  const oldMiddleEnd=oldLines.length-suffix;
  const nextMiddleStart=prefix;
  const nextMiddleEnd=nextLines.length-suffix;
  const oldMiddleLength=Math.max(0,oldMiddleEnd-oldMiddleStart);
  const nextMiddleLength=Math.max(0,nextMiddleEnd-nextMiddleStart);
  const paired=Math.min(oldMiddleLength,nextMiddleLength);

  for(let offset=0;offset<paired;offset++){
    const oldIndex=oldMiddleStart+offset;
    const nextIndex=nextMiddleStart+offset;
    nextIds[nextIndex]=oldIds[oldIndex];
    const changed=oldLines[oldIndex]!==nextLines[nextIndex];
    nextRevisions[nextIndex]=integer(oldRevisions[oldIndex],0)+(changed?1:0);
    if(isTrackedEditorLine(oldLines[oldIndex])&&!isTrackedEditorLine(nextLines[nextIndex])){
      removeBarScopedState(song,oldIds[oldIndex]);
    }
  }

  for(let offset=paired;offset<nextMiddleLength;offset++){
    const nextIndex=nextMiddleStart+offset;
    const sequence=integer(song.editorNextBarId,1);
    song.editorNextBarId=sequence+1;
    nextIds[nextIndex]=`bar:${safeSongId(song)}:edit:${String(sequence).padStart(8,'0')}`;
    nextRevisions[nextIndex]=0;
  }

  for(let offset=paired;offset<oldMiddleLength;offset++){
    const oldIndex=oldMiddleStart+offset;
    removeBarScopedState(song,oldIds[oldIndex]);
  }

  song.lines=nextLines.length?nextLines:[''];
  song.barIds=nextIds;
  song.barRevisions=nextRevisions;
  ensureEditorSong(song);

  return {
    changed:true,
    lines:[...song.lines],
    barIds:[...song.barIds],
    barRevisions:[...song.barRevisions],
    prefix,
    suffix,
  };
}

export function replaceEditorDocumentRange(song,start,end,replacement){
  ensureEditorSong(song);
  const document=editorDocumentText(song);
  const from=Math.max(0,Math.min(document.length,Number(start)||0));
  const to=Math.max(from,Math.min(document.length,Number(end)||from));
  const inserted=text(replacement).replace(/\r\n?/g,'\n');
  const next=document.slice(0,from)+inserted+document.slice(to);
  const result=reconcileEditorDocumentText(song,next);
  const caret=from+inserted.length;
  return {
    ...result,
    selectionStart:from,
    selectionEnd:caret,
    caret,
    position:editorPositionFromOffset(song.lines,caret),
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

function removeBarScopedState(song,barId){
  const id=String(barId||'');
  if(!id)return;
  if(song.performanceCues&&typeof song.performanceCues==='object'){
    const prefix=id+':';
    for(const key of Object.keys(song.performanceCues)){
      if(key.startsWith(prefix))delete song.performanceCues[key];
    }
  }
  if(song.performanceAnchors&&typeof song.performanceAnchors==='object'){
    delete song.performanceAnchors[id];
  }
}

export function insertEditorBar(song,index,value=''){
  ensureEditorSong(song);
  const target=Math.max(0,Math.min(song.lines.length,integer(index,song.lines.length)));
  const id=nextBarId(song);
  song.lines.splice(target,0,text(value).replace(/[\r\n]+/g,' '));
  song.barIds.splice(target,0,id);
  song.barRevisions.splice(target,0,0);
  return barIdentity(song,target);
}

export function duplicateEditorBar(song,index){
  ensureEditorSong(song);
  if(index<0||index>=song.lines.length)return null;
  return insertEditorBar(song,index+1,song.lines[index]);
}

export function removeEditorBar(song,index){
  ensureEditorSong(song);
  if(song.lines.length<=1||index<0||index>=song.lines.length)return null;
  const removed=barIdentity(song,index);
  song.lines.splice(index,1);
  song.barIds.splice(index,1);
  song.barRevisions.splice(index,1);
  removeBarScopedState(song,removed.id);
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
