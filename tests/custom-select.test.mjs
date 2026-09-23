import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  createListboxState,
  formatSelectedLabel,
  nextEnabledIndex,
  readSelectedValues,
  shouldUseMobileSheet,
  writeSelectedValues,
} from '../src/ui/custom-select.mjs';

function selectFixture({multiple=false,values=['a','b','c','d'],selected=['a'],disabled=[]}={}){
  const options=values.map((value)=>({value,textContent:value.toUpperCase(),selected:selected.includes(value),disabled:disabled.includes(value),hidden:false}));
  return{multiple,options,value:selected[0]||''};
}

test('custom listbox opens, closes and navigates enabled options with Arrow/Home/End',()=>{
  const select=selectFixture({selected:['b'],disabled:['c']});
  const model=createListboxState(()=>select.options);
  assert.equal(model.open,false);
  assert.equal(model.openAt(1),1);
  assert.equal(model.move('ArrowDown'),3);
  assert.equal(model.move('ArrowDown'),0);
  assert.equal(model.move('ArrowUp'),3);
  assert.equal(model.move('Home'),0);
  assert.equal(model.move('End'),3);
  model.close();
  assert.equal(model.open,false);
  assert.equal(model.activeIndex,-1);
  assert.equal(nextEnabledIndex(select.options,1,'ArrowDown'),3);
});

test('backing select remains authoritative for single and multi selected value sync',()=>{
  const single=selectFixture({selected:['a']});
  assert.deepEqual(writeSelectedValues(single,['d']),['d']);
  assert.equal(single.value,'d');
  assert.deepEqual(readSelectedValues(single),['d']);
  const multi=selectFixture({multiple:true,selected:['a','c']});
  assert.deepEqual(readSelectedValues(multi),['a','c']);
  assert.deepEqual(writeSelectedValues(multi,['b','d']),['b','d']);
});

test('programmatic hydration and DE/EN option text updates are reflected by label formatting',()=>{
  const select=selectFixture({selected:['b']});
  select.options[1].textContent='Standard';
  assert.equal(formatSelectedLabel(select,{placeholder:'Alle'}),'Standard');
  select.options[1].textContent='Preferred';
  assert.equal(formatSelectedLabel(select,{placeholder:'All'}),'Preferred');
  const multi=selectFixture({multiple:true,selected:['a','b','c','d']});
  multi.options.forEach((option,index)=>option.textContent=['Artist','Rapper','Actor','Film'][index]);
  assert.equal(formatSelectedLabel(multi,{placeholder:'All categories'}),'Artist · Rapper · +2');
});

test('mobile multi-select uses bottom-sheet mode only at the configured breakpoint',()=>{
  assert.equal(shouldUseMobileSheet({multiple:true,viewportWidth:640,breakpoint:720}),true);
  assert.equal(shouldUseMobileSheet({multiple:true,viewportWidth:1024,breakpoint:720}),false);
  assert.equal(shouldUseMobileSheet({multiple:false,mobileSheet:true,viewportWidth:640,breakpoint:720}),true);
});

test('custom select source contains keyboard, outside-click, mutation sync and reduced-motion hooks',async()=>{
  const [source,studioCss,uiCss]=await Promise.all([
    readFile('src/ui/custom-select.mjs','utf8'),
    readFile('src/studio/styles.css','utf8'),
    readFile('src/ui/styles.css','utf8'),
  ]);
  assert.match(source,/aria-expanded/);
  assert.match(source,/aria-controls/);
  assert.match(source,/aria-activedescendant/);
  assert.match(source,/role','listbox/);
  assert.match(source,/pointerdown/);
  assert.match(source,/key==='Escape'/);
  assert.match(source,/key==='Enter'/);
  assert.match(source,/key==='Tab'/);
  assert.match(source,/MutationObserver/);
  assert.match(source,/is-sheet/);
  assert.match(studioCss,/@media\(max-width:800px\)[\s\S]*?min-height:44px/);
  assert.match(studioCss,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(uiCss,/custom-select-open/);
});
