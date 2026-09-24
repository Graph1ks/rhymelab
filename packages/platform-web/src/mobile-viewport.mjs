export const MOBILE_BREAKPOINT=800;
export const MOBILE_KEYBOARD_THRESHOLD=120;

function finite(value,fallback=0){
  const number=Number(value);
  return Number.isFinite(number)?number:fallback;
}

export function mobileViewportMetrics(windowObj=globalThis.window){
  if(!windowObj)return {
    width:0,height:0,offsetTop:0,layoutHeight:0,isMobile:false,keyboardOpen:false,
  };
  const viewport=windowObj.visualViewport;
  const width=finite(viewport?.width,finite(windowObj.innerWidth,0));
  const height=finite(viewport?.height,finite(windowObj.innerHeight,0));
  const offsetTop=finite(viewport?.offsetTop,0);
  const layoutHeight=finite(windowObj.innerHeight,height);
  const isMobile=width<=MOBILE_BREAKPOINT;
  const keyboardOpen=isMobile&&layoutHeight-height>MOBILE_KEYBOARD_THRESHOLD;
  return {width,height,offsetTop,layoutHeight,isMobile,keyboardOpen};
}

export function mobileScrollDeltaForRect(rect,metrics,{topInset=68,bottomInset=84}={}){
  if(!rect||!metrics?.isMobile)return 0;
  const viewportTop=finite(metrics.offsetTop,0)+Math.max(0,finite(topInset,0));
  const viewportBottom=finite(metrics.offsetTop,0)+finite(metrics.height,0)-Math.max(0,finite(bottomInset,0));
  if(finite(rect.bottom,0)>viewportBottom)return finite(rect.bottom,0)-viewportBottom;
  if(finite(rect.top,0)<viewportTop)return finite(rect.top,0)-viewportTop;
  return 0;
}

export function applyMobileViewportState(documentElement,metrics){
  if(!documentElement||!metrics)return;
  documentElement.style?.setProperty?.('--visual-viewport-height',Math.max(1,Math.round(metrics.height))+'px');
  documentElement.dataset.mobileKeyboard=metrics.keyboardOpen?'true':'false';
}

export function installMobileViewportController({
  windowObj=globalThis.window,
  documentElement=globalThis.document?.documentElement,
  onChange=()=>{},
}={}){
  if(!windowObj)return ()=>{};
  let frame=0;
  const update=()=>{
    if(frame)windowObj.cancelAnimationFrame?.(frame);
    frame=windowObj.requestAnimationFrame
      ?windowObj.requestAnimationFrame(()=>{
        frame=0;
        const metrics=mobileViewportMetrics(windowObj);
        applyMobileViewportState(documentElement,metrics);
        onChange(metrics);
      })
      :0;
    if(!windowObj.requestAnimationFrame){
      const metrics=mobileViewportMetrics(windowObj);
      applyMobileViewportState(documentElement,metrics);
      onChange(metrics);
    }
  };
  const viewport=windowObj.visualViewport;
  viewport?.addEventListener?.('resize',update,{passive:true});
  viewport?.addEventListener?.('scroll',update,{passive:true});
  windowObj.addEventListener?.('resize',update,{passive:true});
  windowObj.addEventListener?.('orientationchange',update,{passive:true});
  update();
  return ()=>{
    if(frame)windowObj.cancelAnimationFrame?.(frame);
    viewport?.removeEventListener?.('resize',update);
    viewport?.removeEventListener?.('scroll',update);
    windowObj.removeEventListener?.('resize',update);
    windowObj.removeEventListener?.('orientationchange',update);
  };
}
