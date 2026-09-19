export const CLIENT_QUERY_PRONUNCIATION_POLICY='client-total-query-pronunciation-v2';
export const CLIENT_QUERY_MAX_TOKENS=64;

const LANGUAGES=new Set(['de','en']);

function normalizeLanguage(value){
  const language=String(value||'').trim().toLocaleLowerCase('en-US');
  if(!LANGUAGES.has(language)) throw new TypeError(`Unsupported query language: ${value}`);
  return language;
}

export function normalizeClientSurface(value,language){
  const code=normalizeLanguage(language);
  return String(value??'')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu,' ')
    .toLocaleLowerCase(code==='de'?'de-DE':'en-US');
}

export function tokenizeClientPronunciationInput(value){
  const text=String(value??'').normalize('NFKC').trim();
  if(!text)return[];
  return text.match(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu)||[];
}

const DE_MULTI=Object.freeze([
  ['dsch','dʒ'],['tsch','tʃ'],['sch','ʃ'],['qu','kv'],['pf','pf'],['ph','f'],
  ['th','t'],['ck','k'],['ng','ŋ'],['nk','ŋk'],['ei','aɪ'],['ai','aɪ'],
  ['ey','aɪ'],['ay','aɪ'],['au','aʊ'],['eu','ɔʏ'],['äu','ɔʏ'],['ie','iː'],
  ['aa','aː'],['ee','eː'],['oo','oː'],
]);

const EN_MULTI=Object.freeze([
  ['tion','ʃən'],['sion','ʒən'],['ture','tʃɚ'],['igh','aɪ'],['tch','tʃ'],
  ['dge','dʒ'],['ch','tʃ'],['sh','ʃ'],['th','θ'],['ph','f'],['ng','ŋ'],
  ['qu','kw'],['ck','k'],['wr','ɹ'],['kn','n'],['wh','w'],['ee','i'],
  ['ea','i'],['oo','u'],['ai','eɪ'],['ay','eɪ'],['oa','oʊ'],['ow','aʊ'],
  ['ou','aʊ'],['oi','ɔɪ'],['oy','ɔɪ'],['au','ɔ'],['aw','ɔ'],['ir','ɝ'],
  ['ur','ɝ'],['er','ɝ'],['ar','ɑɹ'],['or','ɔɹ'],
]);

function deSingle(char,next,index,text){
  switch(char){
    case 'a':return'a';case'ä':return'ɛ';case'e':return index===text.length-1?'ə':'ɛ';
    case'i':return'ɪ';case'o':return'ɔ';case'ö':return'œ';case'u':return'ʊ';
    case'ü':return'ʏ';case'y':return'y';case'b':return'b';
    case'c':return/[eiyäöü]/u.test(next||'')?'ts':'k';case'd':return'd';
    case'f':return'f';case'g':return'g';case'h':return'h';case'j':return'j';
    case'k':return'k';case'l':return'l';case'm':return'm';case'n':return'n';
    case'p':return'p';case'q':return'k';case'r':return'R';case's':return's';
    case'ß':return's';case't':return't';case'v':return'f';case'w':return'v';
    case'x':return'ks';case'z':return'ts';case'-':return'';case"'":case'’':return'';
    default:return'';
  }
}

function enSingle(char,next,index,text){
  switch(char){
    case'a':return'æ';case'e':return index===text.length-1?'':'ɛ';case'i':return'ɪ';
    case'o':return'ɑ';case'u':return'ʌ';case'y':return index===0?'j':'i';
    case'b':return'b';case'c':return/[eiy]/u.test(next||'')?'s':'k';case'd':return'd';
    case'f':return'f';case'g':return/[eiy]/u.test(next||'')?'dʒ':'g';case'h':return'h';
    case'j':return'dʒ';case'k':return'k';case'l':return'l';case'm':return'm';
    case'n':return'n';case'p':return'p';case'q':return'k';case'r':return'ɹ';
    case's':return's';case't':return't';case'v':return'v';case'w':return'w';
    case'x':return'ks';case'z':return'z';case'-':return'';case"'":case'’':return'';
    default:return'';
  }
}

function germanContext(text,index){
  const rest=text.slice(index);
  if(rest.startsWith('ch')){
    const prefix=text.slice(0,index);
    return /(?:a|o|u|au)$/u.test(prefix)?['ch','x']:['ch','ç'];
  }
  if(index===0&&rest.startsWith('sp'))return['sp','ʃp'];
  if(index===0&&rest.startsWith('st'))return['st','ʃt'];
  return null;
}

function simplify(value,language){
  const text=normalizeClientSurface(value,language);
  if(language==='de')return text.replace(/[^a-zäöüß'’\-]/gu,'');
  return text.normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^a-z'’\-]/gu,'');
}

function scan(text,language){
  const multi=language==='de'?DE_MULTI:EN_MULTI;
  const single=language==='de'?deSingle:enSingle;
  let out='';
  for(let i=0;i<text.length;){
    if(language==='de'){
      const contextual=germanContext(text,i);
      if(contextual){out+=contextual[1];i+=contextual[0].length;continue;}
    }
    const pair=multi.find(([source])=>text.startsWith(source,i));
    if(pair){out+=pair[1];i+=pair[0].length;continue;}
    const char=[...text.slice(i)][0];
    const next=[...text.slice(i+char.length)][0]||'';
    out+=single(char,next,i,text);
    i+=char.length;
  }
  return out;
}

function graphemeFallback(surface,language){
  const text=simplify(surface,language);
  const consonants=language==='de'
    ?{b:'b',c:'k',d:'d',f:'f',g:'g',h:'h',j:'j',k:'k',l:'l',m:'m',n:'n',p:'p',q:'k',r:'R',s:'s',t:'t',v:'f',w:'v',x:'ks',z:'ts',ß:'s'}
    :{b:'b',c:'k',d:'d',f:'f',g:'g',h:'h',j:'dʒ',k:'k',l:'l',m:'m',n:'n',p:'p',q:'k',r:'ɹ',s:'s',t:'t',v:'v',w:'w',x:'ks',z:'z'};
  const vowels=language==='de'
    ?{a:'a',e:'ɛ',i:'ɪ',o:'ɔ',u:'ʊ',y:'y',ä:'ɛ',ö:'œ',ü:'ʏ'}
    :{a:'æ',e:'ɛ',i:'ɪ',o:'ɑ',u:'ʌ',y:'i'};
  const chunks=[];
  for(const char of text){
    if(vowels[char])chunks.push(vowels[char]);
    else if(consonants[char])chunks.push(consonants[char]+'ə');
  }
  return chunks.join('')||'ə';
}

export function generateClientIpa(surface,language){
  const code=normalizeLanguage(language);
  const simplified=simplify(surface,code);
  const ruleIpa=scan(simplified,code);
  return {
    language:code,
    surface:String(surface??'').normalize('NFKC').trim(),
    normalized:normalizeClientSurface(surface,code),
    ipa:'ˈ'+(ruleIpa||graphemeFallback(surface,code)),
    method:ruleIpa?'client_rules':'client_grapheme_fallback',
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    sourceBacked:false,
    clientOnly:true,
  };
}

function referenceIpa(reference){
  return String(reference?.preferredIpa||reference?.ipa||'').trim();
}

function sourceReferenceDetail(surface,language,reference){
  const ipa=referenceIpa(reference);
  if(!ipa)return null;
  return {
    language,
    surface:String(reference?.surface||surface),
    normalized:normalizeClientSurface(surface,language),
    ipa,
    method:'client_source_reference',
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    sourceBacked:true,
    clientOnly:true,
  };
}

function demoteStress(ipa){
  return String(ipa||'').replaceAll('ˈ','ˌ');
}

async function findTwoPartReferenceCompound(normalized,language,lookupReference){
  if(typeof lookupReference!=='function'||normalized.length<5)return null;
  const candidates=[];
  for(let split=2;split<=normalized.length-2;split+=1){
    const left=normalized.slice(0,split);
    const right=normalized.slice(split);
    candidates.push({left,right,quality:Math.min(left.length,right.length)});
  }
  candidates.sort((a,b)=>b.quality-a.quality||b.left.length-a.left.length);

  for(const candidate of candidates.slice(0,8)){
    const [left,right]=await Promise.all([
      lookupReference(candidate.left,language),
      lookupReference(candidate.right,language),
    ]);
    const leftIpa=referenceIpa(left);
    const rightIpa=referenceIpa(right);
    if(!leftIpa||!rightIpa)continue;
    return {
      language,
      surface:normalized,
      normalized,
      ipa:`${leftIpa}${demoteStress(rightIpa)}`,
      method:'client_source_reference_compound',
      policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
      sourceBacked:true,
      clientOnly:true,
      components:[
        left.surface||candidate.left,
        right.surface||candidate.right,
      ],
    };
  }
  return null;
}

async function resolveClientTokenPronunciation(surface,language,lookupReference){
  const normalized=normalizeClientSurface(surface,language);
  if(typeof lookupReference==='function'){
    const exact=await lookupReference(normalized,language);
    const exactDetail=sourceReferenceDetail(surface,language,exact);
    if(exactDetail)return exactDetail;

    const compound=await findTwoPartReferenceCompound(
      normalized,
      language,
      lookupReference,
    );
    if(compound)return compound;
  }
  return generateClientIpa(surface,language);
}

export async function resolveUnknownClientPronunciation(
  surface,
  language,
  {lookupReference=null,maxTokens=CLIENT_QUERY_MAX_TOKENS}={},
){
  const code=normalizeLanguage(language);
  const normalized=normalizeClientSurface(surface,code);
  if(!normalized)return null;

  const tokens=tokenizeClientPronunciationInput(surface);
  if(tokens.length>Math.max(1,Number(maxTokens)||CLIENT_QUERY_MAX_TOKENS)){
    throw new RangeError(`Query pronunciation exceeds ${maxTokens} tokens`);
  }

  if(tokens.length<=1){
    return resolveClientTokenPronunciation(tokens[0]||surface,code,lookupReference);
  }

  const resolved=await Promise.all(
    tokens.map((token)=>resolveClientTokenPronunciation(token,code,lookupReference)),
  );
  const generatedTokens=resolved
    .filter((token)=>!token.sourceBacked)
    .map((token)=>token.surface);
  const sourceBackedTokens=resolved
    .filter((token)=>token.sourceBacked)
    .map((token)=>token.surface);

  return {
    language:code,
    surface:String(surface??'').normalize('NFKC').trim().replace(/\s+/gu,' '),
    normalized,
    ipa:resolved.map((token)=>token.ipa).join(' '),
    method:'client_token_chain',
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    sourceBacked:generatedTokens.length===0,
    clientOnly:true,
    tokenCount:resolved.length,
    components:resolved.map((token)=>token.surface),
    sourceBackedTokens,
    generatedTokens,
    tokens:resolved.map((token)=>({
      surface:token.surface,
      normalized:token.normalized,
      ipa:token.ipa,
      method:token.method,
      sourceBacked:token.sourceBacked,
      components:token.components||null,
    })),
  };
}
