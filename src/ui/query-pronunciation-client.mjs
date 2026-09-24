export const CLIENT_QUERY_PRONUNCIATION_POLICY='client-total-query-pronunciation-v4';
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

function germanOrthographicPostprocess(surface,ipa){
  const text=simplify(surface,'de');
  let out=String(ipa||'');

  // Product OOV anchors need German Auslautverhärtung. Without this,
  // spellings such as "Warg" resolve to ...g and miss the normal ...k
  // rhyme domain used by source-backed German candidates.
  const final=([
    ['b','p'],
    ['d','t'],
    ['g','k'],
  ]).find(([grapheme])=>text.endsWith(grapheme));
  if(final&&out.endsWith(final[0]))out=out.slice(0,-final[0].length)+final[1];

  // Common monomorphemic/verb-stem -ag anchors are long-a in the German
  // rhyme domain (Tag / Schlag / trag / frag / lag / mag / jag / Prag).
  // Keep -arg separate: its rhotic coda is the important rhyme signal.
  if(/ag$/u.test(text)&&!/arg$/u.test(text)){
    const index=out.lastIndexOf('a');
    if(index>=0&&!out.slice(index,index+2).includes('ː')){
      out=out.slice(0,index)+'aː'+out.slice(index+1);
    }
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

const GENERATED_VOWELS=new Set([
  'a','e','i','o','u','y','ø','œ','ɛ','ɪ','ʊ','ʏ','ɔ','ə','ɐ','ɑ','ɒ','æ',
  'ɚ','ɝ',
]);

function rightEdgeGeneratedStress(ipa,surface,language){
  const raw=String(ipa||'').replaceAll('ˈ','').replaceAll('ˌ','');
  if(!raw)return'';
  const spelling=simplify(surface,language);
  if(spelling.length<10)return'ˈ'+raw;
  const points=[...raw];
  let vowel=-1;
  for(let index=points.length-1;index>=0;index-=1){
    if(GENERATED_VOWELS.has(points[index])){vowel=index;break;}
  }
  if(vowel<=0)return'ˈ'+raw;
  return points.slice(0,vowel).join('')+'ˈ'+points.slice(vowel).join('');
}

export function generateClientIpa(surface,language){
  const code=normalizeLanguage(language);
  const simplified=simplify(surface,code);
  const scanned=scan(simplified,code);
  const ruleIpa=code==='de'?germanOrthographicPostprocess(surface,scanned):scanned;
  const bare=ruleIpa||graphemeFallback(surface,code);
  return {
    language:code,
    surface:String(surface??'').normalize('NFKC').trim(),
    normalized:normalizeClientSurface(surface,code),
    ipa:rightEdgeGeneratedStress(bare,surface,code),
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
  const generated=reference?.generatedPronunciation===true;
  return {
    language,
    surface:String(reference?.surface||surface),
    normalized:normalizeClientSurface(surface,language),
    ipa,
    method:generated?'client_generated_overlay_reference':'client_source_reference',
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    sourceBacked:!generated,
    generatedReference:generated,
    clientOnly:true,
  };
}

function demoteStress(ipa){
  return String(ipa||'').replaceAll('ˈ','ˌ');
}

function primaryStress(ipa){
  const raw=String(ipa||'');
  if(raw.includes('ˈ'))return raw;
  const secondary=raw.lastIndexOf('ˌ');
  if(secondary>=0)return raw.slice(0,secondary)+'ˈ'+raw.slice(secondary+1);
  return raw?'ˈ'+raw:'';
}

function composeRightEdgePronunciations(parts){
  const usable=(parts||[]).filter((part)=>referenceIpa(part)||part?.ipa);
  if(!usable.length)return'';
  return usable.map((part,index)=>{
    const ipa=referenceIpa(part)||String(part?.ipa||'');
    return index===usable.length-1?primaryStress(ipa):demoteStress(ipa);
  }).join('');
}

function createReferenceLookup(lookupReference,language,maxLookups=128){
  const cache=new Map();
  let count=0;
  return async(segment)=>{
    const normalized=normalizeClientSurface(segment,language);
    if(cache.has(normalized))return cache.get(normalized);
    if(count>=maxLookups)return null;
    count+=1;
    const reference=await lookupReference(normalized,language);
    const accepted=referenceIpa(reference)?reference:null;
    cache.set(normalized,accepted);
    return accepted;
  };
}

async function findSourceOnlySegmentation(normalized,language,lookupReference){
  if(typeof lookupReference!=='function'||normalized.length<5)return null;
  const lookup=createReferenceLookup(lookupReference,language,48);
  const memo=new Map();

  const search=async(start,partsLeft)=>{
    const key=start+':'+partsLeft;
    if(memo.has(key))return memo.get(key);
    if(start===normalized.length)return[];
    if(partsLeft<=0)return null;
    for(let end=normalized.length;end>=start+2;end-=1){
      if(end<normalized.length&&normalized.length-end<2)continue;
      const segment=normalized.slice(start,end);
      const reference=await lookup(segment);
      if(!reference)continue;
      if(end===normalized.length){
        const result=[reference];
        memo.set(key,result);
        return result;
      }
      const tail=await search(end,partsLeft-1);
      if(tail?.length){
        const result=[reference,...tail];
        memo.set(key,result);
        return result;
      }
    }
    memo.set(key,null);
    return null;
  };

  for(const maxParts of [2,3,4,5,6]){
    const parts=await search(0,maxParts);
    if(parts?.length>=2)return parts;
  }
  return null;
}

async function findSourceBackedRightEdge(normalized,language,lookupReference){
  if(typeof lookupReference!=='function'||normalized.length<6)return null;
  const lookup=createReferenceLookup(lookupReference,language,96);
  const starts=[];
  for(let start=2;start<=normalized.length-3;start+=1)starts.push(start);

  // Local DB probes are independent. Small batches avoid serial request latency
  // without turning one OOV token into an unbounded fan-out.
  for(let offset=0;offset<starts.length;offset+=8){
    const batch=starts.slice(offset,offset+8);
    const references=await Promise.all(
      batch.map((start)=>lookup(normalized.slice(start))),
    );
    for(let index=0;index<batch.length;index+=1){
      const reference=references[index];
      if(reference)return{start:batch[index],reference};
    }
  }
  return null;
}

async function resolveReferenceCompound(normalized,language,lookupReference){
  const suffix=await findSourceBackedRightEdge(normalized,language,lookupReference);
  if(!suffix)return null;

  const prefixSurface=normalized.slice(0,suffix.start);
  const prefixExact=await lookupReference(prefixSurface,language);
  const prefixExactIpa=referenceIpa(prefixExact);
  let prefixParts=prefixExactIpa?[prefixExact]:null;

  if(!prefixParts&&prefixSurface.length>=5){
    prefixParts=await findSourceOnlySegmentation(
      prefixSurface,
      language,
      lookupReference,
    );
  }

  if(prefixParts?.length){
    const sourceParts=[...prefixParts,suffix.reference];
    return {
      language,
      surface:normalized,
      normalized,
      ipa:composeRightEdgePronunciations(sourceParts),
      method:'client_source_reference_compound_right_edge',
      policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
      sourceBacked:true,
      generatedReference:false,
      clientOnly:true,
      components:sourceParts.map((reference)=>reference.surface).filter(Boolean),
    };
  }

  const prefix=generateClientIpa(prefixSurface,language);
  return {
    language,
    surface:normalized,
    normalized,
    ipa:composeRightEdgePronunciations([prefix,suffix.reference]),
    method:'client_mixed_reference_compound_right_edge',
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    sourceBacked:false,
    generatedReference:true,
    clientOnly:true,
    components:[
      prefix.surface||prefixSurface,
      suffix.reference.surface||normalized.slice(suffix.start),
    ],
    generatedComponents:[prefix.surface||prefixSurface],
    sourceBackedComponents:[suffix.reference.surface||normalized.slice(suffix.start)],
  };
}

async function resolveClientTokenPronunciation(
  surface,
  language,
  {
    lookupReference=null,
    lookupCachedPronunciation=null,
    storeCachedPronunciation=null,
  }={},
){
  const normalized=normalizeClientSurface(surface,language);

  if(typeof lookupCachedPronunciation==='function'){
    const cached=await lookupCachedPronunciation(normalized,language);
    if(cached?.ipa){
      return {
        ...cached,
        language,
        surface:String(surface),
        normalized,
        clientOnly:true,
        cacheHit:true,
      };
    }
  }

  if(typeof lookupReference==='function'){
    const exact=await lookupReference(normalized,language);
    const exactDetail=sourceReferenceDetail(surface,language,exact);
    if(exactDetail)return exactDetail;

    const compound=await resolveReferenceCompound(
      normalized,
      language,
      lookupReference,
    );
    if(compound){
      if(typeof storeCachedPronunciation==='function'){
        await storeCachedPronunciation(compound);
      }
      return compound;
    }
  }

  const generated=generateClientIpa(surface,language);
  if(typeof storeCachedPronunciation==='function'){
    await storeCachedPronunciation(generated);
  }
  return generated;
}

export async function resolveUnknownClientPronunciation(
  surface,
  language,
  {
    lookupReference=null,
    lookupCachedPronunciation=null,
    storeCachedPronunciation=null,
    maxTokens=CLIENT_QUERY_MAX_TOKENS,
  }={},
){
  const code=normalizeLanguage(language);
  const normalized=normalizeClientSurface(surface,code);
  if(!normalized)return null;

  const tokens=tokenizeClientPronunciationInput(surface);
  if(tokens.length>Math.max(1,Number(maxTokens)||CLIENT_QUERY_MAX_TOKENS)){
    throw new RangeError(`Query pronunciation exceeds ${maxTokens} tokens`);
  }

  const tokenOptions={
    lookupReference,
    lookupCachedPronunciation,
    storeCachedPronunciation,
  };

  if(tokens.length<=1){
    return resolveClientTokenPronunciation(tokens[0]||surface,code,tokenOptions);
  }

  const resolved=await Promise.all(
    tokens.map((token)=>resolveClientTokenPronunciation(token,code,tokenOptions)),
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
