function asText(value){return String(value??'')}

function snapshotBars(snapshot,textFallback=''){
  if(snapshot&&Array.isArray(snapshot.lines)){
    const ids=Array.isArray(snapshot.barIds)?snapshot.barIds:[];
    const revisions=Array.isArray(snapshot.barRevisions)?snapshot.barRevisions:[];
    return snapshot.lines.map((line,index)=>({
      id:asText(ids[index]||('legacy:'+String(index+1).padStart(4,'0'))),
      index,
      text:asText(line),
      revision:Number(revisions[index]||0),
    }));
  }
  return asText(textFallback).split('\n').map((line,index)=>({
    id:'legacy:'+String(index+1).padStart(4,'0'),
    index,
    text:asText(line),
    revision:0,
  }));
}

export function revisionSnapshotBars(entry){
  return snapshotBars(entry?.snapshot,entry?.text);
}

function lcsPairs(current,previous){
  const rows=current.length+1,cols=previous.length+1;
  const matrix=Array.from({length:rows},()=>new Uint32Array(cols));
  for(let i=current.length-1;i>=0;i--){
    for(let j=previous.length-1;j>=0;j--){
      matrix[i][j]=current[i].id===previous[j].id
        ?matrix[i+1][j+1]+1
        :Math.max(matrix[i+1][j],matrix[i][j+1]);
    }
  }
  const pairs=[];
  let i=0,j=0;
  while(i<current.length&&j<previous.length){
    if(current[i].id===previous[j].id){
      pairs.push([i,j]);i++;j++;continue;
    }
    if(matrix[i+1][j]>=matrix[i][j+1])i++;
    else j++;
  }
  return pairs;
}

export function compareEditorRevisions(currentSnapshot,revisionEntry){
  const current=snapshotBars(currentSnapshot,currentSnapshot?.lines?.join('\n')||'');
  const previous=revisionSnapshotBars(revisionEntry);
  const currentById=new Map(current.map((bar)=>[bar.id,bar]));
  const previousById=new Map(previous.map((bar)=>[bar.id,bar]));
  const matched=new Map(lcsPairs(current,previous).map(([currentIndex,previousIndex])=>[
    current[currentIndex].id,
    {currentIndex,previousIndex},
  ]));

  const rows=[];
  let currentIndex=0,previousIndex=0;
  while(currentIndex<current.length||previousIndex<previous.length){
    const currentBar=current[currentIndex]||null;
    const previousBar=previous[previousIndex]||null;
    if(currentBar&&previousBar&&currentBar.id===previousBar.id){
      const textChanged=currentBar.text!==previousBar.text;
      const moved=currentBar.index!==previousBar.index;
      rows.push({
        type:textChanged?'changed':moved?'moved':'same',
        id:currentBar.id,
        current:currentBar,
        previous:previousBar,
        textChanged,
        moved,
      });
      currentIndex++;previousIndex++;continue;
    }

    const currentMatch=currentBar?matched.get(currentBar.id):null;
    const previousMatch=previousBar?matched.get(previousBar.id):null;
    if(currentBar&&(!currentMatch||currentMatch.previousIndex<previousIndex)){
      rows.push({type:'added',id:currentBar.id,current:currentBar,previous:null,textChanged:true,moved:false});
      currentIndex++;continue;
    }
    if(previousBar&&(!previousMatch||previousMatch.currentIndex<currentIndex)){
      rows.push({type:'removed',id:previousBar.id,current:null,previous:previousBar,textChanged:true,moved:false});
      previousIndex++;continue;
    }

    if(currentMatch&&previousMatch){
      if(currentMatch.previousIndex<=previousMatch.previousIndex){
        rows.push({type:'removed',id:previousBar.id,current:null,previous:previousBar,textChanged:true,moved:false});
        previousIndex++;
      }else{
        rows.push({type:'added',id:currentBar.id,current:currentBar,previous:null,textChanged:true,moved:false});
        currentIndex++;
      }
      continue;
    }
    if(currentBar){
      rows.push({type:'added',id:currentBar.id,current:currentBar,previous:null,textChanged:true,moved:false});
      currentIndex++;
    }else if(previousBar){
      rows.push({type:'removed',id:previousBar.id,current:null,previous:previousBar,textChanged:true,moved:false});
      previousIndex++;
    }
  }

  // Stable bar IDs let us distinguish pure movement even when the LCS places the
  // moved bar as an add/remove pair. Collapse those pairs into one explicit row.
  const addedById=new Map(rows.filter((row)=>row.type==='added').map((row)=>[row.id,row]));
  const removedById=new Map(rows.filter((row)=>row.type==='removed').map((row)=>[row.id,row]));
  const collapsed=[];
  const consumed=new Set();
  for(const row of rows){
    if(consumed.has(row))continue;
    if(row.type==='added'&&removedById.has(row.id)){
      const removed=removedById.get(row.id);
      consumed.add(removed);
      collapsed.push({
        type:row.current.text===removed.previous.text?'moved':'changed',
        id:row.id,
        current:row.current,
        previous:removed.previous,
        textChanged:row.current.text!==removed.previous.text,
        moved:true,
      });
      continue;
    }
    if(row.type==='removed'&&addedById.has(row.id)){
      if(!consumed.has(addedById.get(row.id)))continue;
    }
    collapsed.push(row);
  }

  const fullRows=collapsed.map((row)=>({
    ...row,
    currentLine:row.current?row.current.index+1:null,
    previousLine:row.previous?row.previous.index+1:null,
  }));
  const summary={
    added:fullRows.filter((row)=>row.type==='added').length,
    removed:fullRows.filter((row)=>row.type==='removed').length,
    changed:fullRows.filter((row)=>row.type==='changed').length,
    moved:fullRows.filter((row)=>row.type==='moved'||row.moved).length,
    unchanged:fullRows.filter((row)=>row.type==='same').length,
    currentBars:current.length,
    previousBars:previous.length,
  };

  return {
    rows:fullRows,
    changedRows:fullRows.filter((row)=>row.type!=='same'),
    summary,
    current,
    previous,
  };
}

export function revisionDiffLabel(row){
  if(row?.type==='added')return 'Added';
  if(row?.type==='removed')return 'Removed';
  if(row?.type==='moved')return 'Moved';
  if(row?.type==='changed'&&row?.moved)return 'Changed + moved';
  if(row?.type==='changed')return 'Changed';
  return 'Unchanged';
}
