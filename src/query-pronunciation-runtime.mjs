import { spawnSync } from 'node:child_process';
import { getPhonologyProfile } from '../scripts/phonology-profiles.mjs';

export const QUERY_PRONUNCIATION_POLICY='total-query-pronunciation-v1';
export const QUERY_PRONUNCIATION_CACHE_LIMIT=4096;
export const QUERY_PRONUNCIATION_LANGUAGES=Object.freeze(['de','en']);

const cache=new Map();
const commandVersionCache=new Map();
let autoEspeakCommandState=undefined;

function normalizeLanguage(value){
  const language=String(value||'').trim().toLocaleLowerCase('en-US');
  if(!QUERY_PRONUNCIATION_LANGUAGES.includes(language)){
    throw new TypeError(`Unsupported query-pronunciation language: ${value}`);
  }
  return language;
}

function normalizeSurface(value,language){
  const locale=language==='de'?'de-DE':'en-US';
  return String(value??'')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu,' ')
    .toLocaleLowerCase(locale);
}

function compactCache(){
  while(cache.size>QUERY_PRONUNCIATION_CACHE_LIMIT){
    cache.delete(cache.keys().next().value);
  }
}

function normalizeEspeakIpa(value,language){
  let ipa=String(value??'')
    .normalize('NFC')
    .replace(/[\r\n]+/gu,' ')
    .replace(/[‖|]+/gu,' ')
    .replace(/_/gu,' ')
    .replace(/\s+/gu,' ')
    .trim();

  if(language==='en'){
    ipa=ipa
      .replaceAll('ɫ','l')
      .replaceAll('ɾ','t')
      .replaceAll('ᵻ','ɪ')
      .replaceAll('ᵊ','ə')
      .replaceAll('ɡ','g')
      .replaceAll('əː','ɜ')
      .replaceAll('ɹ̩','ɚ');
  }else{
    ipa=ipa
      .replaceAll('ɡ','g')
      .replaceAll('ɾ','r')
      .replaceAll('ɫ','l')
      .replaceAll('ᵊ','ə');
  }

  return ipa;
}

function espeakCommands(explicitCommand=null){
  if(explicitCommand) return [String(explicitCommand)];
  if(process.env.RHYMELAB_ESPEAK_COMMAND){
    return [String(process.env.RHYMELAB_ESPEAK_COMMAND)];
  }
  return process.platform==='win32'
    ?['espeak-ng.exe','espeak-ng','espeak.exe','espeak']
    :['espeak-ng','espeak'];
}

function runCommand(command,args,runner){
  if(typeof runner==='function') return runner(command,args);
  return spawnSync(command,args,{
    encoding:'utf8',
    windowsHide:true,
    timeout:2500,
    maxBuffer:1024*1024,
  });
}

function engineVersion(command,runner){
  if(typeof runner==='function') return null;
  if(commandVersionCache.has(command)) return commandVersionCache.get(command);
  const result=runCommand(command,['--version'],runner);
  const version=result?.status===0
    ?String(result.stdout||result.stderr||'').split(/\r?\n/u)[0].trim()||null
    :null;
  commandVersionCache.set(command,version);
  return version;
}

function analyzeIpa(ipa,language){
  const profile=getPhonologyProfile(language);
  const analysis=profile.analyzeIpa(ipa);
  return {profile,analysis};
}

export function tryEspeakQueryPronunciation(
  surface,
  language,
  {
    command=null,
    runner=null,
  }={},
){
  const code=normalizeLanguage(language);
  const voice=code==='de'?'de':'en-us';
  const autoDiscovery=runner==null&&!command&&!process.env.RHYMELAB_ESPEAK_COMMAND;
  if(autoDiscovery&&autoEspeakCommandState===null) return null;
  const candidates=autoDiscovery&&typeof autoEspeakCommandState==='string'
    ?[autoEspeakCommandState]
    :espeakCommands(command);

  for(const candidate of candidates){
    const result=runCommand(candidate,['-q','--ipa=3','-v',voice,String(surface)],runner);
    if(result?.error||result?.status!==0) continue;
    const ipa=normalizeEspeakIpa(result.stdout,code);
    if(!ipa) continue;
    try{
      const {analysis}=analyzeIpa(ipa,code);
      if(autoDiscovery) autoEspeakCommandState=candidate;
      return {
        method:'espeak_ng',
        engine:'espeak-ng',
        engineCommand:candidate,
        engineVersion:engineVersion(candidate,runner),
        ipa,
        analysis,
      };
    }catch{
      continue;
    }
  }
  if(autoDiscovery) autoEspeakCommandState=null;
  return null;
}

const DE_MULTI=Object.freeze([
  ['dsch','dʒ'],['tsch','tʃ'],['sch','ʃ'],
  ['eigh','aɪ'],['igh','ɪç'],
  ['qu','kv'],['pf','pf'],['ph','f'],['th','t'],['ck','k'],['ng','ŋ'],['nk','ŋk'],
  ['ei','aɪ'],['ai','aɪ'],['ey','aɪ'],['ay','aɪ'],
  ['au','aʊ'],['eu','ɔʏ'],['äu','ɔʏ'],['ie','iː'],
  ['aa','aː'],['ee','eː'],['oo','oː'],
]);

const EN_MULTI=Object.freeze([
  ['tion','ʃən'],['sion','ʒən'],['ture','tʃɚ'],
  ['igh','aɪ'],['tch','tʃ'],['dge','dʒ'],['ch','tʃ'],['sh','ʃ'],['th','θ'],['ph','f'],
  ['ng','ŋ'],['qu','kw'],['ck','k'],['wr','ɹ'],['kn','n'],['wh','w'],
  ['ee','i'],['ea','i'],['oo','u'],['ai','eɪ'],['ay','eɪ'],['oa','oʊ'],
  ['ow','aʊ'],['ou','aʊ'],['oi','ɔɪ'],['oy','ɔɪ'],['au','ɔ'],['aw','ɔ'],
  ['ir','ɝ'],['ur','ɝ'],['er','ɝ'],['ar','ɑɹ'],['or','ɔɹ'],
]);

function deSingle(char,next,index,text){
  switch(char){
    case 'a': return 'a';
    case 'ä': return 'ɛ';
    case 'e': return index===text.length-1?'ə':'ɛ';
    case 'i': return 'ɪ';
    case 'o': return 'ɔ';
    case 'ö': return 'œ';
    case 'u': return 'ʊ';
    case 'ü': return 'ʏ';
    case 'y': return 'y';
    case 'b': return 'b';
    case 'c': return /[eiyäöü]/u.test(next||'')?'ts':'k';
    case 'd': return 'd';
    case 'f': return 'f';
    case 'g': return 'g';
    case 'h': return 'h';
    case 'j': return 'j';
    case 'k': return 'k';
    case 'l': return 'l';
    case 'm': return 'm';
    case 'n': return 'n';
    case 'p': return 'p';
    case 'q': return 'k';
    case 'r': return 'R';
    case 's': return 's';
    case 'ß': return 's';
    case 't': return 't';
    case 'v': return 'f';
    case 'w': return 'v';
    case 'x': return 'ks';
    case 'z': return 'ts';
    case '-': return '-';
    case "'": case '’': return '';
    default: return '';
  }
}

function enSingle(char,next,index,text){
  switch(char){
    case 'a': return 'æ';
    case 'e': return index===text.length-1?'':'ɛ';
    case 'i': return 'ɪ';
    case 'o': return 'ɑ';
    case 'u': return 'ʌ';
    case 'y': return index===0?'j':'i';
    case 'b': return 'b';
    case 'c': return /[eiy]/u.test(next||'')?'s':'k';
    case 'd': return 'd';
    case 'f': return 'f';
    case 'g': return /[eiy]/u.test(next||'')?'dʒ':'g';
    case 'h': return 'h';
    case 'j': return 'dʒ';
    case 'k': return 'k';
    case 'l': return 'l';
    case 'm': return 'm';
    case 'n': return 'n';
    case 'p': return 'p';
    case 'q': return 'k';
    case 'r': return 'ɹ';
    case 's': return 's';
    case 't': return 't';
    case 'v': return 'v';
    case 'w': return 'w';
    case 'x': return 'ks';
    case 'z': return 'z';
    case '-': return '-';
    case "'": case '’': return '';
    default: return '';
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

function scanRules(text,language){
  const multi=language==='de'?DE_MULTI:EN_MULTI;
  const single=language==='de'?deSingle:enSingle;
  let out='';
  for(let i=0;i<text.length;){
    if(language==='de'){
      const contextual=germanContextualPattern(text,i);
      if(contextual){
        out+=contextual[1];
        i+=contextual[0].length;
        continue;
      }
    }
    const pair=multi.find(([source])=>text.startsWith(source,i));
    if(pair){
      out+=pair[1];
      i+=pair[0].length;
      continue;
    }
    const char=[...text.slice(i)][0];
    const next=[...text.slice(i+char.length)][0]||'';
    out+=single(char,next,i,text);
    i+=char.length;
  }
  return out;
}

function simplifiedLatin(value,language){
  const text=normalizeSurface(value,language);
  if(language==='de') return text.replace(/[^a-zäöüß'’\-]/gu,'');
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu,'')
    .replace(/[^a-z'’\-]/gu,'');
}

function fallbackSyllabicIpa(surface,language){
  const text=simplifiedLatin(surface,language);
  const consonants=language==='de'
    ?{b:'b',c:'k',d:'d',f:'f',g:'g',h:'h',j:'j',k:'k',l:'l',m:'m',n:'n',p:'p',q:'k',r:'R',s:'s',t:'t',v:'f',w:'v',x:'ks',z:'ts',ß:'s'}
    :{b:'b',c:'k',d:'d',f:'f',g:'g',h:'h',j:'dʒ',k:'k',l:'l',m:'m',n:'n',p:'p',q:'k',r:'ɹ',s:'s',t:'t',v:'v',w:'w',x:'ks',z:'z'};
  const vowel=language==='de'?'ə':'ə';
  const chunks=[];
  for(const char of text){
    if(/[aeiouyäöü]/u.test(char)){
      chunks.push(language==='de'
        ?({a:'a',e:'ɛ',i:'ɪ',o:'ɔ',u:'ʊ',y:'y',ä:'ɛ',ö:'œ',ü:'ʏ'}[char]||vowel)
        :({a:'æ',e:'ɛ',i:'ɪ',o:'ɑ',u:'ʌ',y:'i'}[char]||vowel));
    }else if(consonants[char]){
      chunks.push(consonants[char]+vowel);
    }
  }
  return chunks.join('')||vowel;
}

export function deterministicRuleQueryPronunciation(surface,language){
  const code=normalizeLanguage(language);
  const text=simplifiedLatin(surface,code);
  let ipa=scanRules(text,code);
  if(!ipa) ipa=fallbackSyllabicIpa(surface,code);
  ipa='ˈ'+ipa;
  try{
    const {analysis}=analyzeIpa(ipa,code);
    return {
      method:'deterministic_rules',
      engine:'rhymelab-query-rules',
      engineCommand:null,
      engineVersion:QUERY_PRONUNCIATION_POLICY,
      ipa,
      analysis,
    };
  }catch{
    const guaranteed='ˈ'+fallbackSyllabicIpa(surface,code);
    const {analysis}=analyzeIpa(guaranteed,code);
    return {
      method:'deterministic_grapheme_fallback',
      engine:'rhymelab-query-rules',
      engineCommand:null,
      engineVersion:QUERY_PRONUNCIATION_POLICY,
      ipa:guaranteed,
      analysis,
    };
  }
}

function detailFromGenerated(surface,language,resolved){
  const code=normalizeLanguage(language);
  const normalized=normalizeSurface(surface,code);
  const locale=code==='de'?'de-DE':'en-US';
  const analysis=resolved.analysis;
  return {
    kind:'word',
    language:code,
    surface:String(surface??'').normalize('NFKC').trim(),
    normalized,
    preferredIpa:resolved.ipa,
    ipa:resolved.ipa,
    syllableCount:Number(analysis.syllableCount||0),
    primaryStressSyllable:Number(analysis.primaryStressSyllable||0)||null,
    stressPattern:analysis.stressPattern||null,
    primaryStressSyllables:Number(analysis.primaryStressSyllable||0)
      ?[Number(analysis.primaryStressSyllable)]
      :[],
    secondaryStressSyllables:(analysis.syllables||[])
      .filter((syllable)=>Number(syllable.stressLevel||0)===1)
      .map((syllable)=>Number(syllable.position)),
    historical:false,
    modernEligible:true,
    lexiconLayer:'generated_query',
    partOfSpeech:null,
    lemma:null,
    resolvable:true,
    generatedPronunciation:true,
    pronunciationProvenance:`generated_query_${resolved.method}`,
    queryPronunciation:{
      policy:QUERY_PRONUNCIATION_POLICY,
      generated:true,
      ephemeral:true,
      method:resolved.method,
      engine:resolved.engine,
      engineVersion:resolved.engineVersion||null,
      language:code,
      locale,
      persisted:false,
      canonicalLexicalFact:false,
    },
    pronunciations:[{
      ipa:resolved.ipa,
      preferred:true,
      source:resolved.engine==='espeak-ng'?'Local eSpeak-NG query fallback':'RhymeLab deterministic query fallback',
      locale,
      register:null,
      dialect:null,
      generated:true,
    }],
  };
}

export function resolveUnknownQueryPronunciation(
  surface,
  language,
  {
    preferEspeak=true,
    espeakCommand=null,
    runner=null,
    useCache=true,
  }={},
){
  const code=normalizeLanguage(language);
  const normalized=normalizeSurface(surface,code);
  if(!normalized) return null;
  const key=`${code}\u0000${normalized}`;
  if(useCache&&runner==null&&cache.has(key)) return cache.get(key);

  const resolved=preferEspeak
    ?tryEspeakQueryPronunciation(surface,code,{command:espeakCommand,runner})
      ||deterministicRuleQueryPronunciation(surface,code)
    :deterministicRuleQueryPronunciation(surface,code);
  const detail=detailFromGenerated(surface,code,resolved);

  if(useCache&&runner==null){
    cache.set(key,detail);
    compactCache();
  }
  return detail;
}

export function clearQueryPronunciationCache(){
  cache.clear();
  autoEspeakCommandState=undefined;
}
