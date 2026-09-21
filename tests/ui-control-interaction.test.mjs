import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function uiRuntimeSource(app){
  const shared=await readFile('src/ui/search-state.mjs','utf8');
  const sharedRuntime=shared
    .replace(/\bexport\s+/gu,'')
    .replace(/\bRHYME_TYPES\b/gu,'SEARCH_STATE_RHYME_TYPES');
  const appRuntime=app
    .replace(/^import .*?;\s*$/gmu,'')
    .replace(/initializeUi\(\)\.catch\(reportUiInitializationFailure\);\s*$/,'');
  return sharedRuntime+'\n'+appRuntime;
}

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
  put('#searchOptionsToggle');
  put('#resultFiltersToggle');
  put('#searchOptionsSection');
  put('#searchOptionsPanel');
  put('#resultFiltersSection');
  put('#resultFiltersPanel');
  put('#resultsToolbar');
  put('#searchStageAnchor');
  put('.search-stage');
  put('#scopeFilter',new FakeElement({value:'all'}));
  put('#typeFilter',new FakeElement({value:'all'}));
  put('#variantMode',new FakeElement({value:'preferred'}));
  put('#syllableFilter',new FakeElement({value:'all'}));
  put('#sortMode',new FakeElement({value:'recommended'}));
  put('#historicalMode');
  put('#generatedMode');
  put('#generatedFilter');
  put('#generatedOnlyMode');
  put('#generatedOnlyFilter');
  put('#statsButton');
  put('#statsClose');
  put('#statsDialog');
  put('#statsContent');
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
  put('#runtimeTiming');
  put('#runtimeTimingCurrent');
  put('#runtimeTimingAverage');
  put('#runtimeTimingSamples');
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

  const testable=await uiRuntimeSource(app);
  const dom=buildFakeDom();
  const localStorage=makeStorage();

  const factory=new Function(
    'document','localStorage','navigator','location','history','fetch','IntersectionObserver',
    `${testable}\nreturn {state,installInteractiveControls,renderRuntimeTiming,syncGeneratedOptinControl};`,
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

  assert.equal(runtime.state.generatedOptIn,true);
  runtime.state.generatedCapability={available:true};
  runtime.syncGeneratedOptinControl();
  assert.equal(dom.singles.get('#generatedMode').checked,true);

  runtime.installInteractiveControls();
  assert.equal(dom.document.documentElement.dataset.rhymelabControls,'bound');

  dom.singles.get('#searchOptionsToggle').dispatch('click');
  assert.equal(runtime.state.searchOptionsExpanded,false);
  assert.equal(localStorage.getItem('rhymelab.searchOptionsExpanded.v2'),'0');
  assert.equal(dom.singles.get('#searchOptionsToggle').getAttribute('aria-expanded'),'false');

  dom.singles.get('#resultFiltersToggle').dispatch('click');
  assert.equal(runtime.state.resultFiltersExpanded,false);
  assert.equal(localStorage.getItem('rhymelab.resultFiltersExpanded.v2'),'0');
  assert.equal(dom.singles.get('#resultFiltersToggle').getAttribute('aria-expanded'),'false');

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

  runtime.state.generatedCapability={available:true};
  dom.singles.get('#generatedOnlyMode').checked=true;
  dom.singles.get('#generatedOnlyMode').dispatch('change');
  assert.equal(runtime.state.generatedOnly,true);
  assert.equal(runtime.state.generatedOptIn,true);
  assert.equal(dom.singles.get('#generatedMode').checked,true);

  dom.singles.get('#generatedMode').checked=false;
  dom.singles.get('#generatedMode').dispatch('change');
  assert.equal(runtime.state.generatedOptIn,false);
  assert.equal(runtime.state.generatedOnly,false);
  assert.equal(dom.singles.get('#generatedOnlyMode').checked,false);

  dom.singles.get('#statsButton').dispatch('click');
  assert.equal(dom.singles.get('#statsDialog').open,true);
  dom.singles.get('#statsClose').dispatch('click');
  assert.equal(dom.singles.get('#statsDialog').open,false);

  runtime.state.runtimeTiming={searchMs:184.4,averageLast100Ms:231.2,sampleCount:37,windowSize:100};
  runtime.renderRuntimeTiming();
  assert.equal(dom.singles.get('#runtimeTimingCurrent').textContent,'184');
  assert.equal(dom.singles.get('#runtimeTimingAverage').textContent,'231');
  assert.equal(dom.singles.get('#runtimeTimingSamples').textContent,'37 / 100');
  assert.equal(dom.singles.get('#runtimeTiming').classList.contains('has-samples'),true);
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
  for(const selector of [
    '#resultsToolbar','#searchOptionsToggle','#resultFiltersToggle','#generatedMode','#generatedOnlyMode',
    '#statsButton','#statsDialog','#statsContent',
    '#runtimeTiming','#runtimeTimingCurrent','#runtimeTimingAverage','#runtimeTimingSamples',
    '#searchOptionsSection','#resultFiltersSection','#searchStageAnchor','.search-stage',
  ]){
    assert.match(app,new RegExp(selector.replaceAll('.','\\.').replace('#','\\#')));
  }
  assert.match(app,/rhymelab\.searchOptionsExpanded\.v2/);
  assert.match(app,/rhymelab\.resultFiltersExpanded\.v2/);
  assert.match(app,/const defaultSearchSectionsExpanded=true/);
  assert.match(app,/captureSharedSearchState/);
  assert.match(app,/searchStateToWriterParams\(searchState\)/);
  assert.doesNotMatch(app,/localStorage\.(?:getItem|setItem)\(['"]rhymelab\.generated/);
});


test('entity result presentation uses concrete taxonomy labels instead of generic Entity', async () => {
  const app=await readFile('src/ui/app.js','utf8');
  const testable=await uiRuntimeSource(app);
  const dom=buildFakeDom();
  const localStorage=makeStorage();

  const factory=new Function(
    'document','localStorage','navigator','location','history','fetch','IntersectionObserver',
    `${testable}\nreturn {state,entityDisplayLabel,resultRow,renderEntityPanel};`,
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

  const rapper={
    resultKind:'entity',
    word:'Kendrick Lamar',
    surface:'Kendrick Lamar',
    language:'en',
    ipa:'kɛndrɪk ləmɑr',
    syllableCount:4,
    primaryCategory:'person.musician',
    entityCategories:[
      {category:'person.musician'},
      {category:'person.rapper'},
    ],
    popularityTier:'A',
    popularityPercentile:0.99,
    entityQid:'Q130798',
    score:0.9,
  };
  assert.equal(runtime.entityDisplayLabel(rapper),'Rapper');

  const cases=[
    ['work.film','Movie'],
    ['work.video_game','Video Game'],
    ['group.music_group','Music Group'],
    ['fictional.character','Character'],
    ['person.actor','Actor'],
    ['person.singer','Singer'],
    ['work.song','Song'],
    ['work.album','Album'],
  ];
  for(const [category,label] of cases){
    assert.equal(runtime.entityDisplayLabel({
      resultKind:'entity',
      primaryCategory:category,
      entityCategories:[{category}],
    }),label);
  }

  assert.equal(runtime.entityDisplayLabel({resultKind:'entity'}),'Named item');

  const rowHtml=runtime.resultRow(rapper,'perfect');
  assert.match(rowHtml,/EN · Rapper/);
  assert.doesNotMatch(rowHtml,/>Entity</);

  runtime.renderEntityPanel(rapper,'perfect');
  const detailHtml=dom.singles.get('#wordPanel').innerHTML;
  assert.match(detailHtml,/>Rapper</);
  assert.doesNotMatch(detailHtml,/>Entity</);

  runtime.state.lang='de';
  assert.equal(runtime.entityDisplayLabel({
    resultKind:'entity',
    primaryCategory:'work.video_game',
    entityCategories:[{category:'work.video_game'}],
  }),'Videospiel');
});

test('surface results render merged Entity tags and choose one default sound section', async () => {
  const app=await readFile('src/ui/app.js','utf8');
  const testable=await uiRuntimeSource(app);
  const dom=buildFakeDom();
  const localStorage=makeStorage();

  const factory=new Function(
    'document','localStorage','navigator','location','history','fetch','IntersectionObserver',
    `${testable}\nreturn {state,resultRow,defaultDisplayType};`,
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

  const rain={
    resultKind:'word',
    resultId:'rain',
    word:'Rain',
    surface:'Rain',
    normalized:'rain',
    language:'en',
    ipa:'reɪn',
    syllableCount:1,
    usageRank:100,
    score:1,
    type:'perfect',
    primaryType:'perfect',
    relationTypes:['assonance'],
    relations:[{type:'assonance',score:1,strength:'strong'}],
    entityCategories:[
      {category:'person.singer'},
      {category:'work.video_game'},
    ],
  };
  const html=runtime.resultRow(rain,'perfect');
  assert.match(html,/EN · Word/);
  assert.match(html,/>Singer</);
  assert.match(html,/>Video Game</);
  assert.equal(runtime.defaultDisplayType(rain),'perfect');

  const relationOnly={
    resultKind:'word',
    word:'Tone',
    normalized:'tone',
    language:'en',
    type:'weak',
    relationTypes:['assonance','consonance'],
    relations:[
      {type:'assonance',score:0.75,strength:'strong'},
      {type:'consonance',score:0.81,strength:'strong'},
    ],
  };
  assert.equal(runtime.defaultDisplayType(relationOnly),'consonance');
});

test('control-surface preflight rejects a missing required control group', async () => {
  const app=await readFile('src/ui/app.js','utf8');
  const testable=await uiRuntimeSource(app);
  const dom=buildFakeDom();
  dom.groups.set('.basis-option',[]);
  const localStorage=makeStorage();

  const factory=new Function(
    'document','localStorage','navigator','location','history','fetch','IntersectionObserver',
    `${testable}\nreturn {installInteractiveControls};`,
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

  assert.throws(
    ()=>runtime.installInteractiveControls(),
    /RhymeLab UI control surface incomplete: \.basis-option/,
  );
});


test('inspector layout keeps long surfaces and provenance badges inside the sidebar', async () => {
  const [styles,index]=await Promise.all([
    readFile('src/ui/styles.css','utf8'),
    readFile('src/ui/index.html','utf8'),
  ]);
  assert.match(styles,/\.word-heading\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(styles,/\.word-heading h2\{[^}]*overflow-wrap:anywhere/);
  assert.match(styles,/\.layer-badges\{[^}]*flex-wrap:wrap/);
  assert.match(styles,/\.layer-badge\{[^}]*max-width:100%/);
  assert.match(index,/class="inspector-column"/);
  assert.match(index,/id="runtimeTiming"/);
});
