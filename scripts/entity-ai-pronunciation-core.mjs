import { createHash } from 'node:crypto';
import {
  analyzeEnglishIpa,
  tokenizeEnglishArpabet,
} from './english-phonology.mjs';

export const ENTITY_AI_PRONUNCIATION_SCHEMA='rhymelab-entity-ai-pronunciation-v1';
export const ENTITY_AI_RESULT_COLUMNS=Object.freeze(['id','arp','q','f','alt']);

const VOWELS=new Set([
  'AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW',
]);
const CONSONANTS=new Set([
  'B','CH','D','DH','F','G','HH','JH','K','L','M','N','NG','P','R','S','SH',
  'T','TH','V','W','Y','Z','ZH',
]);

export function sha256Text(value){
  return createHash('sha256').update(String(value)).digest('hex');
}

export function parseTsv(text){
  const lines=String(text??'').split(/\r?\n/u);
  while(lines.length&&lines.at(-1)==='') lines.pop();
  if(!lines.length) return {header:[],rows:[]};
  return {
    header:lines[0].split('\t'),
    rows:lines.slice(1).map((line,index)=>({
      line:index+2,
      values:line.split('\t'),
    })),
  };
}

export function validateEntityAiArpabet(value,{allowBlank=false}={}){
  const raw=String(value??'').trim();
  if(!raw){
    return allowBlank
      ?{valid:true,words:[],tokens:[]}
      :{valid:false,error:'empty_arpabet',words:[],tokens:[]};
  }
  const words=raw.split(/\s*\|\s*/u);
  if(words.some((word)=>!word.trim())){
    return {valid:false,error:'empty_word_boundary_segment',words:[],tokens:[]};
  }

  const tokens=[];
  let totalPrimary=0;
  for(const word of words){
    const wordTokens=word.trim().split(/\s+/u).filter(Boolean);
    if(!wordTokens.length){
      return {valid:false,error:'empty_word',words:[],tokens:[]};
    }
    let primary=0;
    for(const token of wordTokens){
      const match=token.match(/^([A-Z]+)([012])?$/u);
      if(!match){
        return {valid:false,error:`invalid_token:${token}`,words:[],tokens:[]};
      }
      const [,base,digit='']=match;
      if(VOWELS.has(base)){
        if(!digit){
          return {valid:false,error:`vowel_without_stress:${token}`,words:[],tokens:[]};
        }
        if(digit==='1') primary+=1;
      }else if(CONSONANTS.has(base)){
        if(digit){
          return {valid:false,error:`consonant_with_stress:${token}`,words:[],tokens:[]};
        }
      }else{
        return {valid:false,error:`unsupported_phone:${token}`,words:[],tokens:[]};
      }
    }
    totalPrimary+=primary;
    tokens.push(...wordTokens);
  }
  if(totalPrimary<1){
    return {valid:false,error:'pronunciation_without_primary_stress',words:[],tokens:[]};
  }

  return {
    valid:true,
    words:words.map((word)=>word.trim()),
    tokens,
  };
}

export function englishAnalysisToIpa(analysis){
  if(!analysis?.syllables?.length){
    throw new TypeError('englishAnalysisToIpa requires syllables');
  }
  return analysis.syllables.map((syllable)=>{
    const stress=Number(syllable.stressLevel||0)===2
      ?'ˈ'
      :Number(syllable.stressLevel||0)===1
        ?'ˌ'
        :'';
    return stress+[
      ...(syllable.onset||[]),
      syllable.nucleus,
      ...(syllable.coda||[]),
    ].join('');
  }).join('.');
}

function arpabetWordToIpa(word){
  const segments=tokenizeEnglishArpabet(word);
  return segments.map((segment)=>{
    if(!segment.vowel) return segment.token;
    const stress=Number(segment.stress||0)===2
      ?'ˈ'
      :Number(segment.stress||0)===1
        ?'ˌ'
        :'';
    return stress+segment.token;
  }).join('');
}

export function analyzeEntityAiArpabet(value){
  const validated=validateEntityAiArpabet(value);
  if(!validated.valid) throw new Error(validated.error);
  const wordIpa=validated.words.map(arpabetWordToIpa);
  const ipa=wordIpa.join(' ');
  const analysis=analyzeEnglishIpa(ipa,{
    locale:'en-US',
    source:'llm_entity_annotation',
  });
  return {
    arpabet:String(value).trim(),
    ipa,
    analysis,
    phonemes:analysis.canonicalPhonemes,
    syllable_count:Number(analysis.syllableCount||0),
    stress:analysis.stressPattern||null,
    primary_stress:Number(analysis.primaryStressSyllable||0)||null,
    rhyme_tail:analysis.stressedTail||null,
    exact_key:analysis.exactTailKey||null,
  };
}

export function validateEntityAiResultRow(values){
  if(!Array.isArray(values)||values.length!==5){
    return {valid:false,error:'expected_5_columns'};
  }
  const [idRaw,arp,qRaw,flag,alt]=values;
  const id=Number.parseInt(String(idRaw),10);
  if(!Number.isInteger(id)||id<1) return {valid:false,error:'invalid_id'};
  const q=Number.parseInt(String(qRaw),10);
  if(!Number.isInteger(q)||q<0||q>99) return {valid:false,error:'invalid_confidence'};
  if(!['C','A','U'].includes(flag)) return {valid:false,error:'invalid_flag'};

  if(flag==='U'){
    if(String(arp||'').trim()||String(alt||'').trim()){
      return {valid:false,error:'unknown_must_have_blank_pronunciations'};
    }
    return {valid:true,row:{id,arp:'',q,flag,alt:''}};
  }

  const primary=validateEntityAiArpabet(arp);
  if(!primary.valid) return {valid:false,error:`primary_${primary.error}`};

  if(flag==='C'&&String(alt||'').trim()){
    return {valid:false,error:'confident_alt_must_be_blank'};
  }
  if(String(alt||'').trim()){
    const alternate=validateEntityAiArpabet(alt);
    if(!alternate.valid) return {valid:false,error:`alternate_${alternate.error}`};
  }

  return {
    valid:true,
    row:{
      id,
      arp:String(arp).trim(),
      q,
      flag,
      alt:String(alt||'').trim(),
    },
  };
}
