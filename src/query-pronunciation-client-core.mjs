import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import { scoreGermanRhymeAnalyses } from '../scripts/german-rhyme-features.mjs';
import { analyzeEnglishIpa } from '../scripts/english-phonology.mjs';
import { scoreEnglishRhymeAnalyses } from '../scripts/english-rhyme-features.mjs';

export const CLIENT_QUERY_PRONUNCIATION_POLICY='client-total-query-pronunciation-v1';
export const CLIENT_QUERY_LANGUAGES=Object.freeze(['de','en']);

function normalizeLanguage(value){
  const language=String(value||'').trim().toLocaleLowerCase('en-US');
  if(!CLIENT_QUERY_LANGUAGES.includes(language)){
    throw new TypeError(`Unsupported client query-pronunciation language: ${value}`);
  }
  return language;
}

export function normalizeClientQuerySurface(value,language){
  const code=normalizeLanguage(language);
  const locale=code==='de'?'de-DE':'en-US';
  return String(value??'')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu,' ')
    .toLocaleLowerCase(locale);
}

function analyze(ipa,language){
  return language==='de'?analyzeGermanIpa(ipa):analyzeEnglishIpa(ipa);
}

function score(a,b,language){
  return language==='de'
    ?scoreGermanRhymeAnalyses(a,b)
    :scoreEnglishRhymeAnalyses(a,b);
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
    case 'a': return 'a'; case 'ä': return 'ɛ'; case 'e': return index===text.length-1?'ə':'ɛ';
    case 'i': return 'ɪ'; case 'o': return 'ɔ'; case 'ö': return 'œ'; case 'u': return 'ʊ';
    case 'ü': return 'ʏ'; case 'y': return 'y'; case 'b': return 'b';
    case 'c': return /[eiyäöü]/u.test(next||'')?'ts':'k'; case 'd': return 'd';
    case 'f': return 'f'; case 'g': return 'g'; case 'h': return 'h'; case 'j': return 'j';
    case 'k': return 'k'; case 'l': return 'l'; case 'm': return 'm'; case 'n': return 'n';
    case 'p': return 'p'; case 'q': return 'k'; case 'r': return 'R'; case 's': return 's';
    case 'ß': return 's'; case 't': return 't'; case 'v': return 'f'; case 'w': return 'v';
    case 'x': return 'ks'; case 'z': return 'ts'; case '-': return '-';
    case "'": case '’': return ''; default: return '';
  }
}

function enSingle(char,next,index,text){
  switch(char){
    case 'a': return 'æ'; case 'e': return index===text.length-1?'':'ɛ'; case 'i': return 'ɪ';
    case 'o': return 'ɑ'; case 'u': return 'ʌ'; case 'y': return index===0?'j':'i';
    case 'b': return 'b'; case 'c': return /[eiy]/u.test(next||'')?'s':'k'; case 'd': return 'd';
    case 'f': return 'f'; case 'g': return /[eiy]/u.test(next||'')?'dʒ':'g'; case 'h': return 'h';
    case 'j': return 'dʒ'; case 'k': return 'k'; case 'l': return 'l'; case 'm': return 'm';
    case 'n': return 'n'; case 'p': return 'p'; case 'q': return 'k'; case 'r': return 'ɹ';
    case 's': return 's'; case 't': return 't'; case 'v': return 'v'; case 'w': return 'w';
    case 'x': return 'ks'; case 'z': return 'z'; case '-': return '-';
    case "'": case '’': return ''; default: return '';
  }
}

function germanContextualPattern(text,index){
  const rest=text.slice(index);
  if(rest.startsWith('ch')){
    const prefix=text.slice(0,index);
    return /(?:a|o|u|au)$/u.test(prefix)?['ch','x']:['ch','ç'];
  }
  if(index===0&&rest.startsWith('sp')) return ['sp','ʃp'];
  if(index===0&&rest.startsWith('st')) return ['st','ʃt'];
  return null;
}

function simplifiedLatin(value,language){
  const text=normalizeClientQuerySurface(value,language);
  if(language==='de') return text.replace(/[^a-zäöüß'’\-]/gu,'');
  return text.normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^a-z'’\-]/gu,'');
}

function scanRules(text,language){
  const multi=language==='de'?DE_MULTI:EN_MULTI;
  const single=language==='de'?deSingle:enSingle;
  let out='';
  for(let i=0;i<text.length;){
    if(language==='de'){
      const contextual=germanContextualPattern(text,i);
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

function fallbackSyllabicIpa(surface,language){
  const text=simplifiedLatin(surface,language);
  const consonants=language==='de'
    ?{b:'b',c:'k',d:'d',f:'f',g:'g',h:'h',j:'j',k:'k',l:'l',m:'m',n:'n',p:'p',q:'k',r:'R',s:'s',t:'t',v:'f',w:'v',x:'ks',z:'ts',ß:'s'}
    :{b:'b',c:'k',d:'d',f:'f',g:'g',h:'h',j:'dʒ',k:'k',l:'l',m:'m',n:'n',p:'p',q:'k',r:'ɹ',s:'s',t:'t',v:'v',w:'w',x:'ks',z:'z'};
  const vowelMap=language==='de'
    ?{a:'a',e:'ɛ',i:'ɪ',o:'ɔ',u:'ʊ',y:'y',ä:'ɛ',ö:'œ',ü:'ʏ'}
    :{a:'æ',e:'ɛ',i:'ɪ',o:'ɑ',u:'ʌ',y:'i'};
  const chunks=[];
  for(const char of text){
    if(/[aeiouyäöü]/u.test(char)) chunks.push(vowelMap[char]||'ə');
    else if(consonants[char]) chunks.push(consonants[char]+'ə');
  }
  return chunks.join('')||'ə';
}

export function deterministicClientPronunciation(surface,language){
  const code=normalizeLanguage(language);
  const text=simplifiedLatin(surface,code);
  let ipa='ˈ'+(scanRules(text,code)||fallbackSyllabicIpa(surface,code));
  try{
    return {method:'deterministic_rules',ipa,analysis:analyze(ipa,code)};
  }catch{
    ipa='ˈ'+fallbackSyllabicIpa(surface,code);
    return {method:'deterministic_grapheme_fallback',ipa,analysis:analyze(ipa,code)};
  }
}

function detail(surface,language,ipa,analysis,meta={}){
  const code=normalizeLanguage(language);
  return {
    surface:String(surface??'').normalize('NFKC').trim(),
    normalized:normalizeClientQuerySurface(surface,code),
    language:code,
    ipa,
    preferredIpa:ipa,
    syllableCount:Number(analysis.syllableCount||0),
    primaryStressSyllable:Number(analysis.primaryStressSyllable||0)||null,
    stressPattern:analysis.stressPattern||null,
    exactTailKey:analysis.exactTailKey||null,
    generatedPronunciation:meta.generatedPronunciation===true,
    resolvable:true,
    queryPronunciation:{
      policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
      method:meta.method||'unknown',
      sourceBacked:meta.sourceBacked===true,
      generated:meta.generatedPronunciation===true,
      components:meta.components||null,
      clientOnly:true,
      networkRequired:false,
      hostExecutableRequired:false,
      persisted:false,
      canonicalLexicalFact:meta.canonicalLexicalFact===true,
    },
  };
}

function referenceToDetail(reference,language){
  if(!reference?.ipa) return null;
  const analysis=analyze(reference.ipa,language);
  return detail(reference.surface||reference.word||reference.normalized,language,reference.ipa,analysis,{
    method:'source_reference',
    sourceBacked:true,
    generatedPronunciation:false,
    canonicalLexicalFact:true,
  });
}

function compoundSegments(normalized,language,lookupReference,maxParts=4){
  const memo=new Map();
  function walk(index,partsLeft){
    const key=`${index}|${partsLeft}`;
    if(memo.has(key)) return memo.get(key);
    if(index===normalized.length) return [];
    if(partsLeft===0) return null;
    let best=null;
    for(let end=normalized.length;end>index;end-=1){
      const token=normalized.slice(index,end);
      if(token.length<2) continue;
      const ref=lookupReference(token,language);
      if(!ref?.ipa) continue;
      const rest=walk(end,partsLeft-1);
      if(rest===null) continue;
      const candidate=[ref,...rest];
      if(!best||candidate.length<best.length) best=candidate;
    }
    memo.set(key,best);
    return best;
  }
  const found=walk(0,maxParts);
  return found&&found.length>=2?found:null;
}

export function resolveClientQueryPronunciation(surface,language,{lookupReference=null,maxCompoundParts=4}={}){
  const code=normalizeLanguage(language);
  const normalized=normalizeClientQuerySurface(surface,code);
  if(!normalized) return null;

  if(typeof lookupReference==='function'){
    const exact=lookupReference(normalized,code);
    if(exact?.ipa) return referenceToDetail(exact,code);

    const parts=compoundSegments(normalized,code,lookupReference,maxCompoundParts);
    if(parts){
      const ipa=parts.map((row,index)=>{
        const value=String(row.ipa);
        return index===0?value:value.replaceAll('ˈ','ˌ');
      }).join('-');
      const analysis=analyze(ipa,code);
      return detail(surface,code,ipa,analysis,{
        method:'source_reference_compound',
        sourceBacked:true,
        generatedPronunciation:true,
        canonicalLexicalFact:false,
        components:parts.map((row)=>row.surface||row.word||row.normalized),
      });
    }
  }

  const generated=deterministicClientPronunciation(surface,code);
  return detail(surface,code,generated.ipa,generated.analysis,{
    method:generated.method,
    sourceBacked:false,
    generatedPronunciation:true,
    canonicalLexicalFact:false,
  });
}

export function resolveClientQueryLanguages(surface,basis,options={}){
  const languages=basis==='both'?['de','en']:[normalizeLanguage(basis)];
  return Object.fromEntries(
    languages.map((language)=>[language,resolveClientQueryPronunciation(surface,language,options)]),
  );
}

export function rankClientRhymeCandidates(queryDetail,candidates,{limit=24}={}){
  if(!queryDetail?.ipa) return [];
  const language=normalizeLanguage(queryDetail.language);
  const queryAnalysis=analyze(queryDetail.ipa,language);
  const rows=[];
  for(const candidate of candidates||[]){
    if(String(candidate.language||language)!==language||!candidate.ipa) continue;
    const normalized=normalizeClientQuerySurface(candidate.surface||candidate.word,language);
    if(normalized===queryDetail.normalized) continue;
    try{
      const candidateAnalysis=analyze(candidate.ipa,language);
      const rhyme=score(queryAnalysis,candidateAnalysis,language);
      rows.push({
        ...candidate,
        normalized,
        score:Number(rhyme.overall||0),
        type:rhyme.type||'weak',
        exactTailKey:candidateAnalysis.exactTailKey||null,
        syllableCount:candidateAnalysis.syllableCount,
      });
    }catch{}
  }
  return rows
    .sort((a,b)=>b.score-a.score||String(a.normalized).localeCompare(String(b.normalized),language))
    .slice(0,Math.max(1,Number(limit)||24));
}
