export const STUDIO_DEVICE_ACCEPTANCE_SCHEMA='rhymelab-studio-device-acceptance-v1';
export const STUDIO_DEVICE_ACCEPTANCE_VERSION=1;

export const STUDIO_DEVICE_GATES=Object.freeze([
  Object.freeze({
    id:'editor.ime',
    label:'IME composition input',
    instruction:'Compose text with an IME, commit it, undo once, redo once, and verify one coherent edit transaction.',
  }),
  Object.freeze({
    id:'perform.metronome',
    label:'Web Audio metronome',
    instruction:'Start/stop the metronome, change BPM/feel/tempo scale, and verify audible timing follows the current grid.',
  }),
  Object.freeze({
    id:'mobile.navigation',
    label:'Mobile bottom navigation',
    instruction:'Switch Studio, Results, Library and Saved from the bottom navigation without losing active Bar or selection.',
  }),
  Object.freeze({
    id:'mobile.swap',
    label:'Single-surface editor/results swap',
    instruction:'Open Results from a selected range, insert a result, and verify Studio returns to the exact insertion target.',
  }),
  Object.freeze({
    id:'mobile.keyboard',
    label:'Software-keyboard viewport',
    instruction:'Focus Bars near the bottom of the document and verify the active line remains reachable above the software keyboard.',
  }),
  Object.freeze({
    id:'mobile.touch',
    label:'Primary touch targets',
    instruction:'Operate primary Studio controls by touch and verify controls are comfortably tappable with no clipped rails.',
  }),
  Object.freeze({
    id:'mobile.no-hover',
    label:'No hover-only primary action',
    instruction:'Use Quickstyles, Library actions, result actions and Perform controls using touch only.',
  }),
]);

function text(value,max=400){
  return String(value??'').trim().slice(0,max);
}

export function createStudioDeviceAcceptance({
  environment={},
  results={},
  notes='',
  testedAt=Date.now(),
}={}){
  const normalizedResults={};
  for(const gate of STUDIO_DEVICE_GATES){
    const row=results?.[gate.id];
    normalizedResults[gate.id]={
      passed:row===true||row?.passed===true,
      note:text(row?.note),
    };
  }
  return {
    schema:STUDIO_DEVICE_ACCEPTANCE_SCHEMA,
    version:STUDIO_DEVICE_ACCEPTANCE_VERSION,
    testedAt:Number(testedAt)||Date.now(),
    environment:{
      userAgent:text(environment.userAgent,1000),
      language:text(environment.language,80),
      platform:text(environment.platform,120),
      viewportWidth:Number(environment.viewportWidth)||0,
      viewportHeight:Number(environment.viewportHeight)||0,
      devicePixelRatio:Number(environment.devicePixelRatio)||1,
      maxTouchPoints:Number(environment.maxTouchPoints)||0,
    },
    results:normalizedResults,
    notes:text(notes,4000),
  };
}

export function studioDeviceAcceptanceSummary(report){
  const parsed=parseStudioDeviceAcceptance(report);
  const passed=STUDIO_DEVICE_GATES.filter((gate)=>parsed.results[gate.id]?.passed).map((gate)=>gate.id);
  const pending=STUDIO_DEVICE_GATES.filter((gate)=>!parsed.results[gate.id]?.passed).map((gate)=>gate.id);
  return {
    total:STUDIO_DEVICE_GATES.length,
    passed:passed.length,
    passedIds:passed,
    pending,
    ready:pending.length===0,
  };
}

export function parseStudioDeviceAcceptance(input){
  const value=typeof input==='string'?JSON.parse(input):input;
  if(!value||typeof value!=='object'||value.schema!==STUDIO_DEVICE_ACCEPTANCE_SCHEMA){
    throw new Error('Unbekanntes Studio Device-Acceptance-Format.');
  }
  if(Number(value.version)!==STUDIO_DEVICE_ACCEPTANCE_VERSION){
    throw new Error('Nicht unterstützte Device-Acceptance-Version: '+String(value.version));
  }
  return createStudioDeviceAcceptance(value);
}

export function studioDeviceAcceptanceFilename(date=new Date()){
  const stamp=date instanceof Date&&!Number.isNaN(date.valueOf())
    ?date.toISOString().slice(0,19).replaceAll(':','-')
    :'acceptance';
  return `rhymelab-studio-device-acceptance-${stamp}.json`;
}
