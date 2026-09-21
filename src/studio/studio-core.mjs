export const $=(selector,root=document)=>root.querySelector(selector);
export const queryAll=(selector,root=document)=>Array.from(root.querySelectorAll(selector));

export function esc(value){
  return String(value).replace(/[&<>"']/g,(char)=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;',
  })[char]);
}

export function icon(name){
  return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}
