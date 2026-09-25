import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOBILE_BREAKPOINT,
  applyMobileViewportState,
  mobileScrollDeltaForRect,
  mobileViewportMetrics,
} from '../packages/platform-web/src/mobile-viewport.mjs';

test('mobile viewport metrics detect software keyboard shrinkage',()=>{
  const windowObj={
    innerWidth:390,
    innerHeight:844,
    visualViewport:{width:390,height:510,offsetTop:0},
  };
  const metrics=mobileViewportMetrics(windowObj);
  assert.equal(metrics.isMobile,true);
  assert.equal(metrics.keyboardOpen,true);
  assert.equal(metrics.height,510);
  assert.equal(MOBILE_BREAKPOINT,800);
});

test('mobile viewport scroll delta keeps active bar inside safe visual bounds',()=>{
  const metrics={isMobile:true,height:500,offsetTop:0};
  assert.equal(
    mobileScrollDeltaForRect({top:430,bottom:530},metrics,{topInset:70,bottomInset:30}),
    60,
  );
  assert.equal(
    mobileScrollDeltaForRect({top:30,bottom:80},metrics,{topInset:70,bottomInset:30}),
    -40,
  );
  assert.equal(
    mobileScrollDeltaForRect({top:100,bottom:200},metrics,{topInset:70,bottomInset:30}),
    0,
  );
});

test('mobile viewport state publishes CSS height and keyboard flag',()=>{
  const values=new Map();
  const root={
    dataset:{},
    style:{setProperty:(key,value)=>values.set(key,value)},
  };
  applyMobileViewportState(root,{height:512.4,keyboardOpen:true});
  assert.equal(values.get('--visual-viewport-height'),'512px');
  assert.equal(root.dataset.mobileKeyboard,'true');
});
