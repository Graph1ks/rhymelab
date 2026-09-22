let activeController=null;
let nextId=0;

function optionRows(select){return Array.from(select?.options||[])}
function optionEnabled(option){return Boolean(option&&!option.disabled&&!option.hidden)}
function cleanValues(values){return Array.from(new Set((Array.isArray(values)?values:[values]).map((value)=>String(value??'')).filter(Boolean)))}

export function readSelectedValues(select){
  const options=optionRows(select);
  if(select?.multiple)return options.filter((option)=>option.selected).map((option)=>String(option.value));
  const selected=options.find((option)=>option.selected)||options.find((option)=>String(option.value)===String(select?.value??''));
  return selected?[String(selected.value)]:[];
}

export function writeSelectedValues(select,values){
  if(!select)return[];
  const wanted=new Set(cleanValues(values));
  const options=optionRows(select);
  if(select.multiple){
    for(const option of options)option.selected=wanted.has(String(option.value));
  }else{
    const value=cleanValues(values)[0]??'';
    select.value=value;
    for(const option of options)option.selected=String(option.value)===value;
  }
  return readSelectedValues(select);
}

export function formatSelectedLabel(select,{placeholder='All'}={}){
  const selected=optionRows(select).filter((option)=>option.selected);
  if(!selected.length){
    const byValue=optionRows(select).find((option)=>String(option.value)===String(select?.value??''));
    return byValue?.textContent?.trim()||placeholder;
  }
  const labels=selected.map((option)=>String(option.textContent||option.label||option.value).trim()).filter(Boolean);
  if(!select?.multiple)return labels[0]||placeholder;
  if(labels.length<=2)return labels.join(' · ')||placeholder;
  return labels.slice(0,2).join(' · ')+' · +'+(labels.length-2);
}

export function nextEnabledIndex(options,current,key){
  const rows=Array.from(options||[]);
  const enabled=rows.map((option,index)=>optionEnabled(option)?index:-1).filter((index)=>index>=0);
  if(!enabled.length)return-1;
  if(key==='Home')return enabled[0];
  if(key==='End')return enabled.at(-1);
  const step=key==='ArrowUp'?-1:1;
  let position=enabled.indexOf(Number(current));
  if(position<0)return step<0?enabled.at(-1):enabled[0];
  position=(position+step+enabled.length)%enabled.length;
  return enabled[position];
}

export function createListboxState(getOptions){
  let open=false;
  let activeIndex=-1;
  return{
    get open(){return open},
    get activeIndex(){return activeIndex},
    openAt(index=-1){
      open=true;
      const rows=Array.from(getOptions?.()||[]);
      activeIndex=optionEnabled(rows[index])?index:nextEnabledIndex(rows,-1,'ArrowDown');
      return activeIndex;
    },
    move(key){activeIndex=nextEnabledIndex(getOptions?.()||[],activeIndex,key);return activeIndex},
    setActive(index){const rows=Array.from(getOptions?.()||[]);if(optionEnabled(rows[index]))activeIndex=index;return activeIndex},
    close(){open=false;activeIndex=-1},
  };
}

export function shouldUseMobileSheet({multiple=false,mobileSheet=false,viewportWidth=1024,breakpoint=720}={}){
  return Boolean((multiple||mobileSheet)&&Number(viewportWidth)<=Number(breakpoint));
}

function resolveText(value,fallback=''){const resolved=typeof value==='function'?value():value;return String(resolved??fallback)}
function dispatchChange(select){
  const doc=select?.ownerDocument||globalThis.document;
  const EventCtor=doc?.defaultView?.Event||globalThis.Event;
  if(EventCtor)select.dispatchEvent(new EventCtor('change',{bubbles:true}));
}
function reducedMotion(win){return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)}

export function enhanceSelect(select,config={}){
  if(!select||select.__rhymelabCustomSelect)return select?.__rhymelabCustomSelect||null;
  const doc=select.ownerDocument||globalThis.document;
  const win=doc?.defaultView||globalThis.window;
  if(!doc?.createElement||!doc?.body?.appendChild||!select.parentNode)return null;

  const uid=select.id||('rhymelab-select-'+(++nextId));
  const field=config.field||select.closest?.('.filter-field,.search-filter-field')||select.parentElement;
  const fieldLabel=field?.querySelector?.('span');
  const labelId=fieldLabel?.id||(fieldLabel?(fieldLabel.id=uid+'__label'):'');
  const trigger=doc.createElement('button');
  const valueNode=doc.createElement('span');
  const chevron=doc.createElement('span');
  const popover=doc.createElement('div');
  const sheetHead=doc.createElement('div');
  const sheetTitle=doc.createElement('strong');
  const sheetClose=doc.createElement('button');
  const listbox=doc.createElement('div');
  const footer=doc.createElement('div');
  const reset=doc.createElement('button');
  const model=createListboxState(()=>optionRows(select));
  let optionButtons=[];
  let closeTimer=0;

  trigger.type='button';
  trigger.id=uid+'__trigger';
  trigger.className='custom-select-trigger';
  trigger.setAttribute('role','combobox');
  trigger.setAttribute('aria-haspopup','listbox');
  trigger.setAttribute('aria-expanded','false');
  trigger.setAttribute('aria-controls',uid+'__listbox');
  valueNode.id=uid+'__value';
  valueNode.className='custom-select-value';
  chevron.className='custom-select-chevron';
  chevron.setAttribute('aria-hidden','true');
  chevron.textContent='⌄';
  trigger.append(valueNode,chevron);
  if(labelId)trigger.setAttribute('aria-labelledby',labelId+' '+valueNode.id);

  popover.className='custom-select-popover';
  popover.dataset.selectId=uid;
  popover.hidden=true;
  sheetHead.className='custom-select-sheet-head';
  sheetTitle.className='custom-select-sheet-title';
  sheetClose.type='button';
  sheetClose.className='custom-select-sheet-close';
  sheetClose.setAttribute('aria-label',resolveText(config.closeLabel,'Close'));
  sheetClose.textContent='×';
  sheetHead.append(sheetTitle,sheetClose);

  listbox.id=uid+'__listbox';
  listbox.className='custom-select-listbox';
  listbox.setAttribute('role','listbox');
  if(select.multiple)listbox.setAttribute('aria-multiselectable','true');

  footer.className='custom-select-footer';
  reset.type='button';
  reset.className='custom-select-clear';
  reset.textContent=resolveText(config.resetLabel,'Reset selection');
  footer.append(reset);
  popover.append(sheetHead,listbox,footer);

  select.classList.add('native-select-backing');
  select.setAttribute('aria-hidden','true');
  select.tabIndex=-1;
  select.insertAdjacentElement?.('afterend',trigger);
  if(!trigger.parentNode)select.parentNode.insertBefore(trigger,select.nextSibling);
  doc.body.appendChild(popover);

  function selectedIndex(){
    const rows=optionRows(select);
    const selected=rows.findIndex((option)=>option.selected);
    return selected>=0?selected:rows.findIndex((option)=>String(option.value)===String(select.value));
  }
  function placeholder(){return resolveText(config.placeholder,fieldLabel?.textContent?.trim()||'Select')}
  function title(){return resolveText(config.title,fieldLabel?.textContent?.trim()||select.getAttribute?.('aria-label')||'Select')}
  function isSheet(){
    return shouldUseMobileSheet({
      multiple:select.multiple,
      mobileSheet:Boolean(config.mobileSheet),
      viewportWidth:win?.innerWidth||1024,
      breakpoint:config.mobileSheetBreakpoint||720,
    });
  }
  function syncActive(){
    optionButtons.forEach((button,index)=>{
      const active=model.open&&index===model.activeIndex;
      button.classList.toggle('is-active',active);
      button.tabIndex=-1;
    });
    if(model.open&&model.activeIndex>=0){
      const active=optionButtons[model.activeIndex];
      if(active){trigger.setAttribute('aria-activedescendant',active.id);active.scrollIntoView?.({block:'nearest'})}
    }else trigger.removeAttribute('aria-activedescendant');
  }
  function renderOptions(){
    const rows=optionRows(select);
    optionButtons=[];
    listbox.replaceChildren();
    rows.forEach((option,index)=>{
      const button=doc.createElement('button');
      const indicator=doc.createElement('span');
      const text=doc.createElement('span');
      button.type='button';
      button.id=uid+'__option_'+index;
      button.className='custom-select-option';
      button.dataset.optionIndex=String(index);
      button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(Boolean(option.selected)));
      button.setAttribute('aria-disabled',String(Boolean(option.disabled)));
      button.disabled=Boolean(option.disabled);
      button.hidden=Boolean(option.hidden);
      indicator.className='custom-select-indicator';
      indicator.setAttribute('aria-hidden','true');
      indicator.textContent=option.selected?'✓':'';
      text.className='custom-select-option-label';
      text.textContent=String(option.textContent||option.label||option.value);
      button.append(indicator,text);
      button.addEventListener('pointermove',()=>{model.setActive(index);syncActive()});
      button.addEventListener('click',(event)=>{event.preventDefault();choose(index)});
      listbox.appendChild(button);
      optionButtons[index]=button;
    });
  }
  function sync(){
    renderOptions();
    valueNode.textContent=formatSelectedLabel(select,{placeholder:placeholder()});
    trigger.disabled=Boolean(select.disabled);
    trigger.setAttribute('aria-disabled',String(Boolean(select.disabled)));
    trigger.classList.toggle('has-selection',readSelectedValues(select).length>0);
    sheetTitle.textContent=title();
    sheetClose.setAttribute('aria-label',resolveText(config.closeLabel,'Close'));
    reset.textContent=resolveText(config.resetLabel,'Reset selection');
    reset.hidden=!select.multiple||readSelectedValues(select).length===0;
    footer.hidden=!select.multiple;
    if(model.open){
      if(!optionEnabled(optionRows(select)[model.activeIndex]))model.openAt(selectedIndex());
      syncActive();
      position();
    }
    return controller;
  }
  function choose(index){
    const rows=optionRows(select);
    const option=rows[index];
    if(!optionEnabled(option))return;
    if(select.multiple){
      const current=new Set(readSelectedValues(select));
      const value=String(option.value);
      if(current.has(value))current.delete(value);else current.add(value);
      writeSelectedValues(select,[...current]);
      model.setActive(index);
      dispatchChange(select);
      sync();
      trigger.focus?.({preventScroll:true});
    }else{
      writeSelectedValues(select,[String(option.value)]);
      dispatchChange(select);
      sync();
      close({focus:true});
    }
  }
  function position(){
    if(!model.open||popover.hidden)return;
    const viewportWidth=win?.innerWidth||doc.documentElement?.clientWidth||1024;
    const viewportHeight=win?.innerHeight||doc.documentElement?.clientHeight||768;
    const sheet=isSheet();
    popover.classList.toggle('is-sheet',sheet);
    popover.classList.remove('is-above');
    if(sheet){
      popover.style.left='12px';popover.style.right='12px';popover.style.top='auto';
      popover.style.bottom='calc(10px + env(safe-area-inset-bottom))';popover.style.width='auto';
      popover.style.maxHeight='min(58dvh,520px)';listbox.style.maxHeight='min(44dvh,390px)';
      return;
    }
    const rect=trigger.getBoundingClientRect();
    const width=Math.min(Math.max(rect.width,240),Math.max(180,viewportWidth-16));
    const below=Math.max(0,viewportHeight-rect.bottom-8);
    const above=Math.max(0,rect.top-8);
    const desired=Math.min(360,Math.max(150,optionRows(select).length*40+12));
    const openAbove=below<Math.min(desired,210)&&above>below;
    const available=Math.max(120,(openAbove?above:below)-4);
    const maxHeight=Math.min(360,available);
    popover.classList.toggle('is-above',openAbove);
    popover.style.right='auto';popover.style.bottom='auto';popover.style.width=width+'px';popover.style.maxHeight=maxHeight+'px';
    listbox.style.maxHeight=Math.max(88,maxHeight-(select.multiple?54:10))+'px';
    const measuredHeight=Math.min(popover.offsetHeight||desired,maxHeight);
    const left=Math.max(8,Math.min(rect.left,viewportWidth-width-8));
    const top=openAbove?Math.max(8,rect.top-measuredHeight-7):Math.min(viewportHeight-measuredHeight-8,rect.bottom+7);
    popover.style.left=Math.round(left)+'px';popover.style.top=Math.round(top)+'px';
  }
  function outsidePointer(event){if(trigger.contains?.(event.target)||popover.contains?.(event.target))return;close({focus:false})}
  function addOpenListeners(){doc.addEventListener('pointerdown',outsidePointer,true);win?.addEventListener?.('resize',position,{passive:true});win?.addEventListener?.('scroll',position,true)}
  function removeOpenListeners(){doc.removeEventListener('pointerdown',outsidePointer,true);win?.removeEventListener?.('resize',position);win?.removeEventListener?.('scroll',position,true)}
  function open({key=null}={}){
    if(select.disabled)return;
    if(activeController&&activeController!==controller)activeController.close({focus:false});
    clearTimeout(closeTimer);
    activeController=controller;
    popover.hidden=false;
    popover.classList.remove('is-closing');
    model.openAt(selectedIndex());
    if(key==='Home'||key==='End')model.move(key);
    trigger.setAttribute('aria-expanded','true');
    renderOptions();syncActive();position();addOpenListeners();
  }
  function close({focus=false}={}){
    if(!model.open&&popover.hidden)return;
    model.close();
    trigger.setAttribute('aria-expanded','false');
    trigger.removeAttribute('aria-activedescendant');
    removeOpenListeners();
    if(activeController===controller)activeController=null;
    popover.classList.add('is-closing');
    const finish=()=>{if(!model.open){popover.hidden=true;popover.classList.remove('is-closing')}};
    if(reducedMotion(win))finish();else closeTimer=setTimeout(finish,90);
    if(focus)trigger.focus?.({preventScroll:true});
  }

  trigger.addEventListener('click',(event)=>{event.preventDefault();if(model.open)close({focus:true});else open()});
  trigger.addEventListener('keydown',(event)=>{
    const key=event.key;
    if(['ArrowDown','ArrowUp','Home','End'].includes(key)){event.preventDefault();if(!model.open)open({key});else{model.move(key);syncActive()}return}
    if(key==='Enter'||key===' '||key==='Spacebar'){event.preventDefault();if(!model.open)open();else if(model.activeIndex>=0)choose(model.activeIndex);return}
    if(key==='Escape'&&model.open){event.preventDefault();close({focus:true});return}
    if(key==='Tab'&&model.open)close({focus:false});
  });
  sheetClose.addEventListener('click',()=>close({focus:true}));
  reset.addEventListener('click',(event)=>{event.preventDefault();writeSelectedValues(select,[]);dispatchChange(select);sync();trigger.focus?.({preventScroll:true})});
  select.addEventListener('change',sync);

  const Observer=win?.MutationObserver||globalThis.MutationObserver;
  const observer=Observer?new Observer(()=>sync()):null;
  observer?.observe(select,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','label','selected']});

  const controller={
    select,trigger,popover,listbox,model,open,close,sync,position,
    destroy(){
      close({focus:false});observer?.disconnect?.();trigger.remove();popover.remove();
      select.classList.remove('native-select-backing');select.removeAttribute('aria-hidden');select.removeAttribute('tabindex');
      delete select.__rhymelabCustomSelect;
    },
  };
  select.__rhymelabCustomSelect=controller;
  sync();
  return controller;
}

export function syncEnhancedSelects(controllers){for(const controller of controllers||[])controller?.sync?.()}
