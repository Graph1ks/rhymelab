import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeClassList {
  constructor(){ this.values=new Set(); }
  toggle(name,force){
    const enabled=force===undefined?!this.values.has(name):Boolean(force);
    if(enabled)this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
  add(name){ this.values.add(name); }
  remove(name){ this.values.delete(name); }
  contains(name){ return this.values.has(name); }
}

class FakeElement {
  constructor({dataset={},value='',checked=false}={}){
    this.dataset={...dataset};
    this.value=value;
    this.checked=checked;
    this.disabled=false;
    this.classList=new FakeClassList();
    this.attributes=new Map();
    this.listeners=new Map();
    this.options=[];
    this.innerHTML='';
    this.textContent='';
    this.placeholder='';
    this.lang='';
  }
  addEventListener(type,handler){
    if(!this.listeners.has(type))this.listeners.set(type,[]);
    this.listeners.get(type).push(handler);
  }
  dispatch(type,extra={}){
    const event={
      type,
      target:this,
      relatedTarget:null,
      preventDefault(){},
      ...extra,
    };
    for(const handler of this.listeners.get(type)||[])handler(event);
  }
  setAttribute(name,value){ this.attributes.set(name,String(value)); }
  getAttribute(name){ return this.attributes.get(name); }
  showModal(){ this.open=true; }
  close(){ this.open=false; }
  prepend(){}
  closest(){ return null; }
  contains(){ return false; }
}

function buildFakeDom(){
  const singles=new Map();
  const groups=new Map();
  const put=(selector,element=new FakeElement())=>{singles.set(selector,element);return element;};
  const group=(selector,rows)=>{groups.set(selector,rows);return rows;};

  put('#searchForm');
  put('#searchInput');
  put('#searchButton');
  put('#scopeFilter',new FakeElement({value:'all'}));
  put('#typeFilter',new FakeElement({value:'all'}));
  put('#variantMode',new FakeElement({value:'preferred'}));
  put('#syllableFilter',new FakeElement({value:'all'}));
  put('#sortMode',new FakeElement({value:'recommended'}));
  put('#historicalMode');
  put('#entityCategory',new FakeElement({value:'all'}));
  put('#entityCategoryFilter');
  put('#variantFilter');
  put('#historicalFilter');
  put('#sourcesButton');
  put('#sourcesClose');
  put('#sourcesDialog');
  put('#sourcesList');
  put('#results');
  put('#availabilityBar');
  put('#scrollSentinel');
  put('#wordPanel');
  put('#emptyState');
  put('#workspace');
  put('#loading');
  put('#error');
  put('.shell');

  const uiLang=group('.ui-lang-option',[
    new FakeElement({dataset:{uiLang:'de'}}),
    new FakeElement({dataset:{uiLang:'en'}}),
  ]);
  const view=group('.view-option',[
    new FakeElement({dataset:{view:'list'}}),
    new FakeElement({dataset:{view:'compact'}}),
  ]);
  const basis=group('.basis-option',[
    new FakeElement({dataset:{basis:'de'}}),
    new FakeElement({dataset:{basis:'en'}}),
    new FakeElement({dataset:{basis:'both'}}),
  ]);
  const resultLanguage=group('.result-language-option',[
    new FakeElement({dataset:{resultLanguage:'de'}}),
    new FakeElement({dataset:{resultLanguage:'en'}}),
    new FakeElement({dataset:{resultLanguage:'both'}}),
  ]);
  const scope=group('.scope-option',[
    new FakeElement({dataset:{scope:'all'}}),
    new FakeElement({dataset:{scope:'words'}}),
    new FakeElement({dataset:{scope:'phrases'}}),
    new FakeElement({dataset:{scope:'entities'}}),
  ]);
  group('[data-i18n]',[]);
  group('[data-i18n-option]',[]);
  group('[data-i18n-aria-label]',[]);
  group('#syllableFilter option',[
    new FakeElement({value:'all'}),
    new FakeElement({value:'same'}),
    new FakeElement({value:'near1'}),
    new FakeElement({value:'near2'}),
    new FakeElement({value:'near3'}),
  ]);

  const documentElement=new FakeElement();
  const body=new FakeElement();
  const document={
    documentElement,
    body,
    querySelector(selector){
      if(singles.has(selector))return singles.get(selector);
      const rows=groups.get(selector);
      return rows?.[0]||null;
    },
    querySelectorAll(selector){
      return groups.get(selector)||[];
    },
    createElement(){ return new FakeElement(); },
  };
  return {document,singles,groups,uiLang,view,basis,resultLanguage,scope};
}

function makeStorage(){
  const values=new Map();
  return {
    getItem(key){ return values.has(key)?values.get(key):null; },
    setItem(key,value){ values.set(key,String(value)); },
    values,
  };
}

test('unified UI primary controls bind and change state at runtime', async () => {
  const app=await readFile('src/ui/app.js','utf8');
  assert.doesNotMatch(app,/\$\$\$/);

  const testable=app.replace(/initializeUi\(\)\.catch\(reportUiInitializationFailure\);\s*$/,'');
  const dom=buildFakeDom();
  const localStorage=makeStorage();

  const factory=new Function(
    'document','localStorage','navigator','location','history','fetch','IntersectionObserver',
    `${testable}\nreturn {state,installInteractiveControls};`,
  );
  const runtime=factory(
    dom.document,
    localStorage,
    {language:'en-US'},
    {href:'http://127.0.0.1:3030/'},
    {replaceState(){}},
    async()=>({ok:true,json:async()=>({})}),
    class {},
  );

  runtime.installInteractiveControls();
  assert.equal(dom.document.documentElement.dataset.rhymelabControls,'bound');

  dom.basis[1].dispatch('click');
  assert.equal(runtime.state.basis,'en');
  assert.equal(localStorage.getItem('rhymelab.searchBasis'),'en');
  assert.equal(dom.basis[1].classList.contains('active'),true);

  dom.resultLanguage[2].dispatch('click');
  assert.equal(runtime.state.resultLanguage,'both');
  assert.equal(localStorage.getItem('rhymelab.resultLanguage'),'both');
  assert.equal(dom.resultLanguage[2].classList.contains('active'),true);

  dom.scope[3].dispatch('click');
  assert.equal(dom.singles.get('#scopeFilter').value,'entities');
  assert.equal(dom.scope[3].classList.contains('active'),true);

  dom.uiLang[0].dispatch('click');
  assert.equal(runtime.state.lang,'de');
  assert.equal(localStorage.getItem('rhymelab.language'),'de');
  assert.equal(dom.uiLang[0].classList.contains('active'),true);

  dom.view[1].dispatch('click');
  assert.equal(runtime.state.view,'compact');
  assert.equal(localStorage.getItem('rhymelab.resultView'),'compact');
  assert.equal(dom.view[1].classList.contains('active'),true);
});

test('unified UI control binding preflights the complete interactive surface', async () => {
  const app=await readFile('src/ui/app.js','utf8');
  assert.match(app,/function assertInteractiveControlSurface\(/);
  assert.match(app,/function installInteractiveControls\(/);
  assert.match(app,/dataset\.rhymelabControls='bound'/);
  assert.match(app,/dataset\.rhymelabControls='failed'/);
  for(const selector of [
    '.ui-lang-option',
    '.view-option',
    '.basis-option',
    '.result-language-option',
    '.scope-option',
  ]){
    assert.match(app,new RegExp(selector.replaceAll('.','\\.')));
  }
});
