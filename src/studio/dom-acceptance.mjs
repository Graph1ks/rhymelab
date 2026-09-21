export const STUDIO_DOM_ACCEPTANCE_SCHEMA='rhymelab-studio-dom-acceptance-v1';

const REQUIRED_IDS=Object.freeze([
  'workspace','lyrics','searchForm','results','resultsScroll','dialog',
  'themeBtn','themeMenuBtn','uiLanguageBtn','exportBtn','commandBtn',
  'settingsBtn','settingsSide','filterBtn','historyBtn','focusBtn',
  'editorDock','detailDock','performView','rhymeView','writeView',
]);

const PRIMARY_TOUCH_SELECTORS=Object.freeze([
  '.topbar button',
  '.modebar button',
  '.quicktools button',
  '.filterline button',
  '.view-choices button',
  '.dock-top button',
  '.songcard-actions button',
  '.analysis-head button',
  '.perform-transport button',
  '.cue-tools button',
]);

function visible(element,windowObj){
  if(!element||!windowObj?.getComputedStyle)return false;
  const style=windowObj.getComputedStyle(element);
  if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
  const rect=element.getBoundingClientRect?.();
  return Boolean(rect&&rect.width>0&&rect.height>0);
}

function pass(id,label,detail=''){return {id,label,ok:true,detail}}
function fail(id,label,detail=''){return {id,label,ok:false,detail}}

export function runStudioDomAcceptance({
  documentObj=globalThis.document,
  windowObj=globalThis.window,
  mobileBreakpoint=800,
}={}){
  const checks=[];
  if(!documentObj||!windowObj){
    return {
      schema:STUDIO_DOM_ACCEPTANCE_SCHEMA,
      checks:[fail('dom','DOM available','document/window missing')],
      summary:{passing:0,total:1,failing:['dom']},
      metrics:{},
    };
  }

  const missing=REQUIRED_IDS.filter((id)=>!documentObj.getElementById(id));
  checks.push(missing.length
    ?fail('required-controls','Required controls','missing: '+missing.join(', '))
    :pass('required-controls','Required controls',String(REQUIRED_IDS.length)+' present'));

  const ids=[...documentObj.querySelectorAll('[id]')].map((node)=>node.id).filter(Boolean);
  const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
  checks.push(duplicateIds.length
    ?fail('duplicate-ids','Unique DOM IDs','duplicates: '+duplicateIds.join(', '))
    :pass('duplicate-ids','Unique DOM IDs',String(ids.length)+' unique'));

  const unlabeledButtons=[...documentObj.querySelectorAll('button')].filter((button)=>{
    if(!visible(button,windowObj))return false;
    const text=String(button.textContent||'').trim();
    const aria=String(button.getAttribute('aria-label')||'').trim();
    const title=String(button.getAttribute('title')||'').trim();
    return !text&&!aria&&!title;
  });
  checks.push(unlabeledButtons.length
    ?fail('button-labels','Visible button labels',String(unlabeledButtons.length)+' unlabeled')
    :pass('button-labels','Visible button labels','all visible buttons labelled'));

  const themeTrigger=documentObj.getElementById('themeMenuBtn');
  checks.push(themeTrigger
    ?pass('no-hover-theme','Touch Quickstyles trigger','explicit menu trigger present')
    :fail('no-hover-theme','Touch Quickstyles trigger','themeMenuBtn missing'));

  const languageTrigger=documentObj.getElementById('uiLanguageBtn');
  checks.push(languageTrigger
    ?pass('language-switch','DE/EN quick switch','uiLanguageBtn present')
    :fail('language-switch','DE/EN quick switch','uiLanguageBtn missing'));

  const width=Number(windowObj.visualViewport?.width||windowObj.innerWidth||0);
  const mobile=width<=mobileBreakpoint;
  let undersized=[];
  if(mobile){
    const targets=[...new Set(PRIMARY_TOUCH_SELECTORS.flatMap((selector)=>[
      ...documentObj.querySelectorAll(selector),
    ]))].filter((element)=>visible(element,windowObj));
    undersized=targets.filter((element)=>{
      const rect=element.getBoundingClientRect();
      return rect.width<43.5||rect.height<43.5;
    }).map((element)=>element.id||element.getAttribute('aria-label')||String(element.textContent||'').trim().slice(0,30));
    checks.push(undersized.length
      ?fail('touch-targets','Primary touch targets ≥44px',undersized.slice(0,8).join(', '))
      :pass('touch-targets','Primary touch targets ≥44px','visible primary controls pass'));
  }else{
    checks.push(pass('touch-targets','Primary touch targets ≥44px','desktop viewport; mobile CSS gate not active'));
  }

  const keyboardOpen=documentObj.documentElement?.dataset?.mobileKeyboard==='true';
  const mobileNav=documentObj.querySelector('.mobile-nav');
  const navHidden=!mobileNav||!visible(mobileNav,windowObj);
  checks.push(keyboardOpen
    ?(navHidden
      ?pass('keyboard-nav','Keyboard overlay protection','mobile nav hidden while keyboard open')
      :fail('keyboard-nav','Keyboard overlay protection','mobile nav visible while keyboard open'))
    :pass('keyboard-nav','Keyboard overlay protection','keyboard not reported open'));

  const dockOpen=documentObj.body?.classList?.contains('editor-dock-open');
  const editorScroll=documentObj.querySelector('.editor-scroll');
  if(mobile&&dockOpen&&editorScroll){
    const overflow=windowObj.getComputedStyle(editorScroll).overflowY;
    checks.push(overflow==='hidden'
      ?pass('single-scroll','Single mobile main scroller','editor locked while dock owns scroll')
      :fail('single-scroll','Single mobile main scroller','editor overflow-y='+overflow));
  }else{
    checks.push(pass('single-scroll','Single mobile main scroller',dockOpen?'desktop dock':'no mobile dock conflict'));
  }

  const activeLine=documentObj.querySelector('.lyric-line.active');
  checks.push(activeLine
    ?pass('active-bar','Active Bar surface','active lyric line present')
    :fail('active-bar','Active Bar surface','no active lyric line'));

  const reducedMotion=windowObj.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const motionState=documentObj.documentElement?.dataset?.motion||'auto';
  checks.push(pass('motion','Motion preference',reducedMotion?'OS reduced motion':motionState));

  return {
    schema:STUDIO_DOM_ACCEPTANCE_SCHEMA,
    checks,
    metrics:{
      viewportWidth:width,
      viewportHeight:Number(windowObj.visualViewport?.height||windowObj.innerHeight||0),
      mobile,
      keyboardOpen,
      undersizedTouchTargets:undersized.length,
    },
    summary:{
      passing:checks.filter((check)=>check.ok).length,
      total:checks.length,
      failing:checks.filter((check)=>!check.ok).map((check)=>check.id),
    },
  };
}
