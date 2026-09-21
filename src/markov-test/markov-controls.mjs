export const REQUIRED_MARKOV_CONTROLS=[
  '#markovForm',
  '#seedText',
  '#target',
  '#language',
  '#mode',
  '#rhymePressure',
  '#naturalness',
  '#weirdness',
  '#targetTokens',
  '#allowEntities',
  '#entityCategoryPanel',
  '#allowPhrases',
  '#allowGenerated',
  '#randomSeed',
  '#generateButton',
  '#rerollSeed',
  '#sentenceStage',
  '#resultList',
  '#status',
  '#uiError',
];

export function assertMarkovControlSurface(documentRef=document){
  const missing=REQUIRED_MARKOV_CONTROLS.filter((selector)=>!documentRef.querySelector(selector));
  const presets=[...documentRef.querySelectorAll('[data-preset]')];
  if(!presets.length)missing.push('[data-preset]');
  if(missing.length){
    throw new Error(`RhymeLab Markov UI control surface incomplete: ${missing.join(', ')}`);
  }
  return {
    form:documentRef.querySelector('#markovForm'),
    seedText:documentRef.querySelector('#seedText'),
    target:documentRef.querySelector('#target'),
    language:documentRef.querySelector('#language'),
    mode:documentRef.querySelector('#mode'),
    rhymePressure:documentRef.querySelector('#rhymePressure'),
    naturalness:documentRef.querySelector('#naturalness'),
    weirdness:documentRef.querySelector('#weirdness'),
    targetTokens:documentRef.querySelector('#targetTokens'),
    allowEntities:documentRef.querySelector('#allowEntities'),
    entityCategoryPanel:documentRef.querySelector('#entityCategoryPanel'),
    entityCategoryButtons:[...documentRef.querySelectorAll('[data-entity-category]')],
    allowPhrases:documentRef.querySelector('#allowPhrases'),
    allowGenerated:documentRef.querySelector('#allowGenerated'),
    randomSeed:documentRef.querySelector('#randomSeed'),
    generateButton:documentRef.querySelector('#generateButton'),
    rerollSeed:documentRef.querySelector('#rerollSeed'),
    sentenceStage:documentRef.querySelector('#sentenceStage'),
    resultList:documentRef.querySelector('#resultList'),
    status:documentRef.querySelector('#status'),
    uiError:documentRef.querySelector('#uiError'),
    presets,
  };
}

export function installMarkovControls(documentRef=document,callbacks={}){
  const controls=assertMarkovControlSurface(documentRef);
  controls.form.addEventListener('submit',(event)=>{
    event.preventDefault();
    callbacks.generate?.(event);
  });
  controls.rerollSeed.addEventListener('click',()=>callbacks.reroll?.());
  for(const control of [controls.rhymePressure,controls.naturalness,controls.weirdness,controls.targetTokens]){
    control.addEventListener('input',()=>callbacks.rangeChange?.(control.id,control.value));
  }
  for(const control of [controls.language,controls.mode,controls.allowEntities,controls.allowPhrases,controls.allowGenerated]){
    control.addEventListener('change',()=>callbacks.optionChange?.(control.id,control.type==='checkbox'?control.checked:control.value));
  }
  for(const button of controls.entityCategoryButtons){
    button.addEventListener('click',()=>callbacks.entityCategory?.(button.dataset.entityCategory,button));
  }
  for(const button of controls.presets){
    button.addEventListener('click',()=>callbacks.preset?.(button.dataset.preset));
  }
  documentRef.documentElement.dataset.rhymelabControls='bound';
  return controls;
}
