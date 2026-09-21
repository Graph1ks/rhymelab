import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  REQUIRED_MARKOV_CONTROLS,
  assertMarkovControlSurface,
  installMarkovControls,
} from '../src/markov-test/markov-controls.mjs';

class FakeElement{
  constructor({value='',checked=false,type='text',dataset={}}={}){
    this.value=value;
    this.checked=checked;
    this.type=type;
    this.dataset={...dataset};
    this.disabled=false;
    this.listeners=new Map();
  }
  addEventListener(type,handler){
    if(!this.listeners.has(type))this.listeners.set(type,[]);
    this.listeners.get(type).push(handler);
  }
  dispatch(type){
    const event={type,target:this,preventDefault(){}};
    for(const handler of this.listeners.get(type)||[])handler(event);
  }
}

function fakeDocument(){
  const singles=new Map();
  for(const selector of REQUIRED_MARKOV_CONTROLS){
    let type='text';
    if(['#allowEntities','#allowPhrases','#allowGenerated'].includes(selector))type='checkbox';
    const element=new FakeElement({type,checked:type==='checkbox'});
    element.id=selector.slice(1);
    singles.set(selector,element);
  }
  const presets=[
    new FakeElement({dataset:{preset:'balanced'}}),
    new FakeElement({dataset:{preset:'chain'}}),
  ];
  return {
    documentElement:{dataset:{}},
    querySelector(selector){return singles.get(selector)||null;},
    querySelectorAll(selector){return selector==='[data-preset]'?presets:[];},
    singles,
    presets,
  };
}

test('Markov test page binds its primary controls and dispatches runtime state changes',()=>{
  const document=fakeDocument();
  const calls=[];
  installMarkovControls(document,{
    generate:()=>calls.push(['generate']),
    reroll:()=>calls.push(['reroll']),
    rangeChange:(id,value)=>calls.push(['range',id,value]),
    optionChange:(id,value)=>calls.push(['option',id,value]),
    preset:(name)=>calls.push(['preset',name]),
  });
  assert.equal(document.documentElement.dataset.rhymelabControls,'bound');
  document.singles.get('#markovForm').dispatch('submit');
  document.singles.get('#rerollSeed').dispatch('click');
  document.singles.get('#rhymePressure').value='88';
  document.singles.get('#rhymePressure').dispatch('input');
  document.singles.get('#mode').value='chain';
  document.singles.get('#mode').dispatch('change');
  document.singles.get('#allowEntities').checked=false;
  document.singles.get('#allowEntities').dispatch('change');
  document.presets[1].dispatch('click');
  assert.deepEqual(calls,[
    ['generate'],
    ['reroll'],
    ['range','rhymePressure','88'],
    ['option','mode','chain'],
    ['option','allowEntities',false],
    ['preset','chain'],
  ]);
});

test('Markov control preflight rejects incomplete UI surfaces',()=>{
  const document=fakeDocument();
  document.singles.delete('#generateButton');
  assert.throws(()=>assertMarkovControlSurface(document),/#generateButton/u);
});

test('Markov test surface preserves mobile behavior and uses the Markov API',async()=>{
  const [html,styles,app,core]=await Promise.all([
    readFile('src/markov-test/index.html','utf8'),
    readFile('src/markov-test/styles.css','utf8'),
    readFile('src/markov-test/app.js','utf8'),
    readFile('src/markov-test/markov-core.mjs','utf8'),
  ]);
  for(const selector of REQUIRED_MARKOV_CONTROLS){
    if(!selector.startsWith('#'))continue;
    assert.match(html,new RegExp(`id=["']${selector.slice(1)}["']`));
  }
  assert.match(html,/id=["']modelState["']/u);
  assert.match(html,/id=["']modelNote["']/u);
  assert.match(styles,/@media\(max-width:620px\)/u);
  assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/u);
  assert.match(styles,/\.hero-sentence\.animate-in \.sentence-token/u);
  assert.match(styles,/\.token-corpus/u);
  assert.match(styles,/@media\(min-width:1200px\) and \(min-height:760px\) and \(max-height:980px\)/u);
  assert.match(styles,/height:100dvh/u);
  assert.match(styles,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/u);
  assert.match(styles,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
  assert.doesNotMatch(styles,/overflow-y:\s*(?:scroll|auto)/u);
  assert.match(app,/\/api\/markov\/generate/u);
  assert.match(app,/Markov transition database missing/u);
  assert.match(app,/npm run markov:model:build/u);
  assert.match(app,/DECODER V2/u);
  assert.match(app,/novelty windows/u);
  assert.match(app,/line shapes/u);
  assert.match(app,/note\.title=note\.textContent\.trim\(\)/u);
  assert.doesNotMatch(app,/accepted Leipzig sentences/u);
  assert.doesNotMatch(core,/MODEL_LINES/u);
  assert.doesNotMatch(core,/<CONTENT>/u);
});
