export {
  normalizeDensity,
  nextDensity,
} from '../../packages/shared-core/src/search/result-density.mjs';

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
