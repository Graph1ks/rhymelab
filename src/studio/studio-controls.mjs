const DENSITIES=Object.freeze(['list','compact','tiles']);

export function normalizeDensity(value){
  return DENSITIES.includes(value)?value:'compact';
}

export function nextDensity(value){
  const density=normalizeDensity(value);
  return density==='compact'?'list':'compact';
}

export function isEditableTarget(target){
  return Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
}

export function setExclusivePressed(buttons,activeValue,key){
  for(const button of buttons){
    const active=button.dataset[key]===activeValue;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
}
