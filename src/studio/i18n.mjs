import {
  normalizeStudioUiLanguage as normalizeUiLanguage,
  translateStudioUiText as translateUiText,
} from '../../packages/shared-core/src/i18n/i18n.mjs';

export * from '../../packages/shared-core/src/i18n/i18n.mjs';

const SKIP_SELECTOR=[
  'textarea','input','code','pre','kbd',
  '[data-i18n-skip]',
  '[data-insert]','[data-save]','[data-detail]',
  '.result-word','.songcard h3','.revision p',
  '#songTitle','.project-list','.anchorword','#mobileAnchor','#lyrics',
  '.analysis-end-word','.analysis-word-title','.analysis-pair-words b',
  '.rhyme-chain-group b','.bar-inspector-head p','.detail-preview',
  '.library-folder-label b','.library-folder-label em','.bar-navigator-copy',
].join(',');

function shouldSkip(element){
  if(!element?.closest)return false;
  return Boolean(element.closest(SKIP_SELECTOR));
}

export function createStudioDomLocalizer({
  root=globalThis.document?.body,
  documentElement=globalThis.document?.documentElement,
  initialLanguage='de',
}={}){
  let language=normalizeUiLanguage(initialLanguage);
  const textSources=new WeakMap(),textRendered=new WeakMap();
  const attributeSources=new WeakMap(),attributeRendered=new WeakMap();
  const attrs=['title','aria-label','placeholder'];

  function sourceForAttr(element,name,current){
    let sources=attributeSources.get(element);
    if(!sources){sources=new Map();attributeSources.set(element,sources)}
    let rendered=attributeRendered.get(element);
    if(!rendered){rendered=new Map();attributeRendered.set(element,rendered)}
    if(!sources.has(name)||rendered.get(name)!==current)sources.set(name,current);
    return {source:sources.get(name),rendered};
  }

  function localizeText(node){
    const parent=node.parentElement;
    if(!parent||shouldSkip(parent))return;
    const current=node.nodeValue||'',last=textRendered.get(node);
    if(!textSources.has(node)||last!==current)textSources.set(node,current);
    const source=textSources.get(node);
    const target=translateUiText(source,language);
    textRendered.set(node,target);
    if(current!==target)node.nodeValue=target;
  }

  function localizeAttributes(element){
    if(!element||shouldSkip(element))return;
    for(const name of attrs){
      if(!element.hasAttribute?.(name))continue;
      const current=element.getAttribute(name)||'';
      const {source,rendered}=sourceForAttr(element,name,current);
      const target=translateUiText(source,language);
      rendered.set(name,target);
      if(current!==target)element.setAttribute(name,target);
    }
  }

  function localizeSubtree(node){
    if(!node)return;
    if(node.nodeType===3){localizeText(node);return}
    if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return;
    if(node.nodeType===1)localizeAttributes(node);
    const walker=(node.ownerDocument||globalThis.document)?.createTreeWalker?.(
      node,
      globalThis.NodeFilter?.SHOW_ELEMENT|globalThis.NodeFilter?.SHOW_TEXT || 5,
    );
    if(!walker)return;
    let current;
    while((current=walker.nextNode())){
      if(current.nodeType===3)localizeText(current);
      else localizeAttributes(current);
    }
  }

  const observer=typeof MutationObserver!=='undefined'&&root
    ?new MutationObserver((records)=>{
      for(const record of records){
        if(record.type==='characterData')localizeText(record.target);
        else if(record.type==='attributes')localizeAttributes(record.target);
        else for(const node of record.addedNodes)localizeSubtree(node);
      }
    })
    :null;

  observer?.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrs});
  if(documentElement)documentElement.lang=language;
  localizeSubtree(root);

  return {
    get language(){return language},
    setLanguage(value){
      language=normalizeUiLanguage(value);
      if(documentElement)documentElement.lang=language;
      localizeSubtree(root);
      return language;
    },
    refresh(){localizeSubtree(root)},
    disconnect(){observer?.disconnect()},
  };
}
