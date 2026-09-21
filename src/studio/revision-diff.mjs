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

export function compareEditorRevisions(currentSnapshot,revisionEntry){
  const current=snapshotBars(currentSnapshot,currentSnapshot?.lines?.join('\n')||'');
  const previous=revisionSnapshotBars(revisionEntry);
  const currentById=new Map(current.map((bar)=>[bar.id,bar]));
  const previousById=new Map(previous.map((bar)=>[bar.id,bar]));
  const rows=[];

  for(const bar of current){
    const before=previousById.get(bar.id);
    if(!before){
      rows.push({type:'added',id:bar.id,current:bar,previous:null});
      continue;
    }
    const textChanged=before.text!==bar.text;
    const moved=before.index!==bar.index;
    if(textChanged||moved){
      rows.push({
        type:textChanged?'changed':'moved',
        id:bar.id,
        current:bar,
        previous:before,
        textChanged,
        moved,
      });
    }
  }
  for(const bar of previous){
    if(!currentById.has(bar.id)){
      rows.push({type:'removed',id:bar.id,current:null,previous:bar});
    }
  }

  const summary={
    added:rows.filter((row)=>row.type==='added').length,
    removed:rows.filter((row)=>row.type==='removed').length,
    changed:rows.filter((row)=>row.type==='changed').length,
    moved:rows.filter((row)=>row.type==='moved'||row.moved).length,
    unchanged:current.filter((bar)=>{
      const before=previousById.get(bar.id);
      return before&&before.text===bar.text&&before.index===bar.index;
    }).length,
    currentBars:current.length,
    previousBars:previous.length,
  };

  return {rows,summary,current,previous};
}

export function revisionDiffLabel(row){
  if(row?.type==='added')return 'Added';
  if(row?.type==='removed')return 'Removed';
  if(row?.type==='moved')return 'Moved';
  if(row?.type==='changed'&&row?.moved)return 'Changed + moved';
  if(row?.type==='changed')return 'Changed';
  return 'Unchanged';
}
