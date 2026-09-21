const DEFAULT_PERFORMANCE=Object.freeze({
  bpm:92,
  grid:16,
  feel:'straight',
  tempoScale:1,
  pauseLength:1,
});

export const PERFORMANCE_CUE_TYPES=Object.freeze(['hit','accent','pause','breath','hold']);

function asInteger(value,fallback=0){
  const number=Number(value);
  return Number.isInteger(number)?number:fallback;
}
function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0))}
function cloneCue(value){
  if(typeof value==='string')return {type:value,length:1};
  if(!value||typeof value!=='object')return null;
  const type=String(value.type||'');
  if(!PERFORMANCE_CUE_TYPES.includes(type))return null;
  return {type,length:Math.max(1,Math.min(4,asInteger(value.length,1)))};
}
function cueKey(barId,step){return `${String(barId)}:${asInteger(step,0)}`}

export function ensurePerformanceSong(song){
  if(!song||typeof song!=='object')throw new TypeError('song is required');
  song.performance=song.performance&&typeof song.performance==='object'?{...song.performance}:{};
  song.performance={
    ...DEFAULT_PERFORMANCE,
    ...song.performance,
    bpm:clamp(song.performance.bpm??DEFAULT_PERFORMANCE.bpm,40,220),
    grid:[8,16].includes(Number(song.performance.grid))?Number(song.performance.grid):16,
    feel:song.performance.feel==='triplet'?'triplet':'straight',
    tempoScale:[0.5,1,2].includes(Number(song.performance.tempoScale))?Number(song.performance.tempoScale):1,
    pauseLength:Math.max(1,Math.min(4,asInteger(song.performance.pauseLength,1))),
  };
  song.performanceCues=song.performanceCues&&typeof song.performanceCues==='object'&&!Array.isArray(song.performanceCues)
    ?{...song.performanceCues}
    :{};
  song.performanceAnchors=song.performanceAnchors&&typeof song.performanceAnchors==='object'&&!Array.isArray(song.performanceAnchors)
    ?{...song.performanceAnchors}
    :{};

  const barIds=Array.isArray(song.barIds)?song.barIds.map(String):[];
  const barSet=new Set(barIds);
  const legacy=song.steps&&typeof song.steps==='object'?song.steps:{};
  for(const [key,value] of Object.entries(legacy)){
    const match=/^(\d+)-(\d+)$/.exec(key);
    if(!match)continue;
    const barId=barIds[Number(match[1])];
    const step=Number(match[2]);
    const cue=cloneCue(value);
    if(!barId||!cue||step<0||step>=16)continue;
    const target=cueKey(barId,step);
    if(!song.performanceCues[target])song.performanceCues[target]=cue;
    if(song.performanceAnchors[barId]==null){
      song.performanceAnchors[barId]=Number(song.barRevisions?.[Number(match[1])]||0);
    }
  }
  song.steps={};

  for(const key of Object.keys(song.performanceCues)){
    const separator=key.lastIndexOf(':');
    const barId=separator>=0?key.slice(0,separator):'';
    const step=separator>=0?Number(key.slice(separator+1)):-1;
    const cue=cloneCue(song.performanceCues[key]);
    if(!barSet.has(barId)||!cue||step<0||step>=16)delete song.performanceCues[key];
    else song.performanceCues[key]=cue;
  }
  for(const barId of Object.keys(song.performanceAnchors)){
    if(!barSet.has(barId))delete song.performanceAnchors[barId];
  }
  return song;
}

export function performanceConfig(song){
  return ensurePerformanceSong(song).performance;
}

export function setPerformanceConfig(song,patch={}){
  ensurePerformanceSong(song);
  const next={...song.performance,...patch};
  song.performance={
    ...DEFAULT_PERFORMANCE,
    ...next,
    bpm:clamp(next.bpm,40,220),
    grid:[8,16].includes(Number(next.grid))?Number(next.grid):16,
    feel:next.feel==='triplet'?'triplet':'straight',
    tempoScale:[0.5,1,2].includes(Number(next.tempoScale))?Number(next.tempoScale):1,
    pauseLength:Math.max(1,Math.min(4,asInteger(next.pauseLength,1))),
  };
  return song.performance;
}

export function getPerformanceCue(song,barId,step){
  ensurePerformanceSong(song);
  return cloneCue(song.performanceCues[cueKey(barId,step)]);
}

export function setPerformanceCue(song,barId,step,type,{length}={}){
  ensurePerformanceSong(song);
  const index=song.barIds.indexOf(String(barId));
  const limit=song.performance.grid;
  const position=asInteger(step,-1);
  if(index<0||position<0||position>=limit)return null;
  const key=cueKey(barId,position);
  if(type==='erase'||!PERFORMANCE_CUE_TYPES.includes(String(type))){
    delete song.performanceCues[key];
    markPerformanceReviewed(song,barId);
    return null;
  }
  const cue={
    type:String(type),
    length:String(type)==='pause'
      ?Math.max(1,Math.min(4,asInteger(length,song.performance.pauseLength)))
      :1,
  };
  song.performanceCues[key]=cue;
  markPerformanceReviewed(song,barId);
  return cue;
}

export function movePerformanceCue(song,barId,fromStep,toStep){
  ensurePerformanceSong(song);
  const source=getPerformanceCue(song,barId,fromStep);
  if(!source)return false;
  const limit=song.performance.grid;
  const target=asInteger(toStep,-1);
  if(target<0||target>=limit)return false;
  delete song.performanceCues[cueKey(barId,fromStep)];
  song.performanceCues[cueKey(barId,target)]=source;
  markPerformanceReviewed(song,barId);
  return true;
}

export function clearPerformanceBar(song,barId){
  ensurePerformanceSong(song);
  const prefix=String(barId)+':';
  let removed=0;
  for(const key of Object.keys(song.performanceCues)){
    if(key.startsWith(prefix)){delete song.performanceCues[key];removed++}
  }
  markPerformanceReviewed(song,barId);
  return removed;
}

export function markPerformanceReviewed(song,barId){
  ensurePerformanceSong(song);
  const index=song.barIds.indexOf(String(barId));
  if(index<0)return false;
  song.performanceAnchors[String(barId)]=Number(song.barRevisions?.[index]||0);
  return true;
}

export function performanceNeedsReview(song,barId){
  ensurePerformanceSong(song);
  const index=song.barIds.indexOf(String(barId));
  if(index<0)return false;
  const prefix=String(barId)+':';
  const hasCues=Object.keys(song.performanceCues).some((key)=>key.startsWith(prefix));
  if(!hasCues)return false;
  const anchored=Number(song.performanceAnchors[String(barId)]);
  const revision=Number(song.barRevisions?.[index]||0);
  return !Number.isFinite(anchored)||anchored!==revision;
}

export function autoMapPerformanceBar(song,barId,syllableCount){
  ensurePerformanceSong(song);
  clearPerformanceBar(song,barId);
  const steps=song.performance.grid;
  const count=Math.max(0,Math.min(steps,asInteger(syllableCount,0)));
  if(!count)return [];
  const used=new Set();
  const placed=[];
  for(let index=0;index<count;index++){
    let step=Math.min(steps-1,Math.floor(index*steps/count));
    while(used.has(step)&&step<steps-1)step++;
    used.add(step);
    const type=step%(steps/4)===0?'accent':'hit';
    song.performanceCues[cueKey(barId,step)]={type,length:1};
    placed.push(step);
  }
  markPerformanceReviewed(song,barId);
  return placed;
}

export function performanceBarMetrics(song,barId){
  ensurePerformanceSong(song);
  const cues=[];
  for(let step=0;step<song.performance.grid;step++){
    const cue=getPerformanceCue(song,barId,step);
    if(cue)cues.push({step,...cue});
  }
  return {
    cues:cues.length,
    accents:cues.filter((row)=>row.type==='accent').length,
    pauses:cues.filter((row)=>row.type==='pause').length,
    breaths:cues.filter((row)=>row.type==='breath').length,
    holds:cues.filter((row)=>row.type==='hold').length,
    density:song.performance.grid?cues.length/song.performance.grid:0,
    needsReview:performanceNeedsReview(song,barId),
  };
}

export function performanceStepDurationMs(song,step=0){
  const config=performanceConfig(song);
  const subdivisions=config.grid/4;
  const base=(60000/config.bpm)/subdivisions/config.tempoScale;
  if(config.feel!=='triplet')return base;
  return base*(Number(step)%2===0?4/3:2/3);
}

export function performanceCueSymbol(cue){
  const type=typeof cue==='string'?cue:cue?.type;
  return ({hit:'●',accent:'▲',pause:'Ⅱ',breath:'◌',hold:'→'})[type]||'·';
}
