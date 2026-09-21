import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_DOM_ACCEPTANCE_SCHEMA,
  runStudioDomAcceptance,
} from '../src/studio/dom-acceptance.mjs';

const REQUIRED=[
  'workspace','lyrics','searchForm','results','resultsScroll','dialog',
  'themeBtn','themeMenuBtn','uiLanguageBtn','exportBtn','commandBtn',
  'settingsBtn','settingsSide','filterBtn','historyBtn','focusBtn',
  'editorDock','detailDock','performView','rhymeView','writeView',
];

function element({id='',text='Control',width=100,height=44}={}){
  return {
    id,
    textContent:text,
    getAttribute(name){
      if(name==='aria-label')return text;
      if(name==='title')return '';
      return null;
    },
    getBoundingClientRect(){return {width,height,top:10,bottom:10+height,left:0,right:width}},
  };
}

test('DOM acceptance reports unavailable environment cleanly',()=>{
  const report=runStudioDomAcceptance({documentObj:null,windowObj:null});
  assert.equal(report.schema,STUDIO_DOM_ACCEPTANCE_SCHEMA);
  assert.deepEqual(report.summary.failing,['dom']);
});

test('DOM acceptance passes required desktop control contract',()=>{
  const controls=new Map(REQUIRED.map((id)=>[id,element({id})]));
  const ids=[...controls.values()];
  const activeBar=element({id:'bar-active'});
  const documentObj={
    documentElement:{dataset:{motion:'auto'}},
    body:{classList:{contains:()=>false}},
    getElementById:(id)=>controls.get(id)||null,
    querySelectorAll(selector){
      if(selector==='[id]')return ids;
      if(selector==='button')return [controls.get('themeBtn'),controls.get('themeMenuBtn'),controls.get('uiLanguageBtn')];
      return [];
    },
    querySelector(selector){
      if(selector==='.lyric-line.active')return activeBar;
      if(selector==='.mobile-nav')return null;
      if(selector==='.editor-scroll')return null;
      return null;
    },
  };
  const windowObj={
    innerWidth:1440,
    innerHeight:900,
    visualViewport:{width:1440,height:900},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1',overflowY:'auto'}),
    matchMedia:()=>({matches:false}),
  };
  const report=runStudioDomAcceptance({documentObj,windowObj});
  assert.equal(report.metrics.mobile,false);
  assert.deepEqual(report.summary.failing,[]);
  assert.equal(report.summary.passing,report.summary.total);
});

test('DOM acceptance detects undersized visible mobile primary controls',()=>{
  const controls=new Map(REQUIRED.map((id)=>[id,element({id})]));
  const tiny=element({id:'tiny-action',width:32,height:32});
  const documentObj={
    documentElement:{dataset:{}},
    body:{classList:{contains:()=>false}},
    getElementById:(id)=>controls.get(id)||null,
    querySelectorAll(selector){
      if(selector==='[id]')return [...controls.values(),tiny];
      if(selector==='button')return [tiny];
      if(selector==='.topbar button')return [tiny];
      return [];
    },
    querySelector(selector){
      if(selector==='.lyric-line.active')return element({id:'active'});
      return null;
    },
  };
  const windowObj={
    innerWidth:390,
    innerHeight:700,
    visualViewport:{width:390,height:700},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1',overflowY:'auto'}),
    matchMedia:()=>({matches:false}),
  };
  const report=runStudioDomAcceptance({documentObj,windowObj});
  assert.equal(report.metrics.mobile,true);
  assert.equal(report.metrics.undersizedTouchTargets,1);
  assert.ok(report.summary.failing.includes('touch-targets'));
});
