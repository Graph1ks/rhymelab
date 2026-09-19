import { createHash } from 'node:crypto';
import {
  analyzeEnglishIpa,
  tokenizeEnglishArpabet,
} from './english-phonology.mjs';

export const ENTITY_AI_PRONUNCIATION_SCHEMA='rhymelab-entity-ai-pronunciation-v1';
export const ENTITY_AI_RESULT_COLUMNS=Object.freeze(['id','arp','q','f','alt']);
export const ENTITY_AI_CONFIDENCE_THRESHOLDS=Object.freeze([99,95,90,85,80,75,70,60,50]);

function nestedValue(object,path){
  let value=object;
  for(const part of String(path).split('.')){
    if(value==null||typeof value!=='object'||!(part in value)) return undefined;
    value=value[part];
  }
  return value;
}

function firstDefined(object,paths){
  for(const path of paths){
    const value=nestedValue(object,path);
    if(value!==undefined) return value;
  }
  return undefined;
}

function strictInteger(value){
  if(value===null||value===undefined||value==='') return null;
  const number=Number(value);
  return Number.isInteger(number)?number:null;
}

export function classifyEntityAiSurface(value){
  const text=String(value??'').normalize('NFKC').trim();
  if(!text) return ['empty_surface'];
  const chars=[...text];
  const letters=chars.filter((char)=>/\p{L}/u.test(char));
  const tags=[
    /\s/u.test(text)?'multiword':'single_word',
    chars.every((char)=>char.codePointAt(0)<=0x7f)?'ascii_only':'non_ascii',
  ];
  if(/\p{N}/u.test(text)) tags.push('contains_digit');
  if(/['’ʼ]/u.test(text)) tags.push('contains_apostrophe');
  if(/[-‐‑‒–—]/u.test(text)) tags.push('contains_hyphen');
  if(chars.some((char)=>!/[\p{L}\p{N}\s'’ʼ\-‐‑‒–—]/u.test(char))){
    tags.push('contains_other_punctuation_or_symbol');
  }
  if(letters.some((char)=>!/\p{Script=Latin}/u.test(char))){
    tags.push('contains_non_latin_letter');
  }
  if(chars.length>=25) tags.push('length_25_plus');
  return tags;
}

export function validateEntityAiArtifactManifest(
  manifest,
  {resultsSha,resultIds=[],decisionCounts={C:0,A:0,U:0}}={},
){
  const errors=[];
  const status=String(firstDefined(manifest,['status'])??'');
  if(!['complete','partial'].includes(status)) errors.push('manifest_status_invalid');

  const inputArchive=String(firstDefined(manifest,['input_archive'])??'');
  if(inputArchive!=='inputs.zip') errors.push('manifest_input_archive_must_be_inputs_zip');

  const inputFilename=String(firstDefined(manifest,[
    'selected_input_tsv_filename','selected_input_tsv','input_filename','input_file',
  ])??'').trim();
  if(!inputFilename) errors.push('manifest_input_filename_missing');

  const declaredSha=String(firstDefined(manifest,[
    'results_sha256','results_tsv_sha256','sha256',
  ])??'').toLocaleLowerCase('en-US');
  if(!/^[a-f0-9]{64}$/u.test(declaredSha)){
    errors.push('manifest_results_sha256_missing_or_invalid');
  }else if(resultsSha&&declaredSha!==String(resultsSha).toLocaleLowerCase('en-US')){
    errors.push('manifest_results_sha256_mismatch');
  }

  const configuredStartId=strictInteger(firstDefined(manifest,[
    'configured_START_ID','configured_start_id','START_ID','start_id',
  ]));
  const inputRows=strictInteger(firstDefined(manifest,['input_row_count','input_rows']));
  const completedRows=strictInteger(firstDefined(manifest,['completed_row_count','completed_rows']));
  const firstId=strictInteger(firstDefined(manifest,['first_input_id','first_id']));
  const lastInputId=strictInteger(firstDefined(manifest,['last_input_id','last_id']));
  const firstCompletedId=strictInteger(firstDefined(manifest,['first_completed_id']));
  const lastCompletedId=strictInteger(firstDefined(manifest,['last_completed_id']));
  const nextRaw=firstDefined(manifest,['next_unprocessed_id']);
  const nextUnprocessedId=nextRaw===null?null:strictInteger(nextRaw);

  for(const [name,value] of Object.entries({
    configured_start_id:configuredStartId,
    input_rows:inputRows,
    completed_rows:completedRows,
    first_input_id:firstId,
    last_input_id:lastInputId,
    first_completed_id:firstCompletedId,
    last_completed_id:lastCompletedId,
  })){
    if(value==null||value<1) errors.push('manifest_'+name+'_missing_or_invalid');
  }

  const ids=resultIds.map((value)=>strictInteger(value));
  if(ids.some((value)=>value==null||value<1)) errors.push('result_ids_invalid');
  if(new Set(ids).size!==ids.length) errors.push('result_ids_duplicate');
  if(completedRows!=null&&completedRows!==ids.length) errors.push('manifest_completed_rows_mismatch');

  if(firstId!=null&&lastInputId!=null&&inputRows!=null&&lastInputId-firstId+1!==inputRows){
    errors.push('manifest_input_range_not_contiguous');
  }
  if(configuredStartId!=null&&firstId!=null&&configuredStartId!==firstId){
    errors.push('manifest_start_id_mismatch');
  }
  if(ids.length&&firstId!=null){
    for(let index=0;index<ids.length;index+=1){
      if(ids[index]!==firstId+index){
        errors.push('result_ids_not_contiguous_from_batch_start');
        break;
      }
    }
  }
  if(ids.length&&firstCompletedId!=null&&ids[0]!==firstCompletedId){
    errors.push('manifest_first_completed_id_mismatch');
  }
  if(ids.length&&lastCompletedId!=null&&ids.at(-1)!==lastCompletedId){
    errors.push('manifest_last_completed_id_mismatch');
  }

  if(status==='complete'){
    if(inputRows!=null&&ids.length!==inputRows) errors.push('complete_result_row_count_mismatch');
    if(ids.length&&lastInputId!=null&&ids.at(-1)!==lastInputId) errors.push('complete_last_id_mismatch');
    if(nextRaw!==null) errors.push('complete_next_unprocessed_id_must_be_null');
  }else if(status==='partial'){
    if(inputRows!=null&&ids.length>=inputRows) errors.push('partial_result_must_not_cover_full_batch');
    if(lastCompletedId!=null&&nextUnprocessedId!==lastCompletedId+1){
      errors.push('partial_next_unprocessed_id_mismatch');
    }
  }

  const filename=inputFilename.split(/[\\/]/u).at(-1)||'';
  const rangeMatch=filename.match(/^batch_\d+_(\d+)-(\d+)\.tsv$/u);
  if(!rangeMatch){
    errors.push('manifest_input_filename_range_invalid');
  }else if(firstId!=null&&lastInputId!=null){
    if(Number(rangeMatch[1])!==firstId||Number(rangeMatch[2])!==lastInputId){
      errors.push('manifest_input_filename_range_mismatch');
    }
  }

  const manifestCounts={
    C:strictInteger(firstDefined(manifest,['count_C','C_count','confident_count','counts.C','counts.confident'])),
    A:strictInteger(firstDefined(manifest,['count_A','A_count','ambiguous_count','counts.A','counts.ambiguous'])),
    U:strictInteger(firstDefined(manifest,['count_U','U_count','unknown_count','counts.U','counts.unknown'])),
  };
  for(const flag of ['C','A','U']){
    if(manifestCounts[flag]==null||manifestCounts[flag]<0){
      errors.push('manifest_count_'+flag+'_missing_or_invalid');
    }else if(Number(decisionCounts[flag]||0)!==manifestCounts[flag]){
      errors.push('manifest_count_'+flag+'_mismatch');
    }
  }

  const zeroCounters={
    duplicate_id_count:firstDefined(manifest,['duplicate_id_count','duplicate_ids','duplicate_count']),
    missing_id_count:firstDefined(manifest,['missing_id_count','missing_ids','missing_count']),
    extra_id_count:firstDefined(manifest,['extra_id_count','extra_ids','extra_count']),
    invalid_row_count:firstDefined(manifest,['invalid_row_count','invalid_rows','invalid_count']),
  };
  for(const [name,raw] of Object.entries(zeroCounters)){
    const value=strictInteger(raw);
    if(value==null||value<0) errors.push('manifest_'+name+'_missing_or_invalid');
    else if(value!==0) errors.push('manifest_'+name+'_must_be_zero');
  }

  return {
    valid:errors.length===0,
    errors:[...new Set(errors)],
    normalized:{
      status,
      input_archive:inputArchive,
      input_filename:inputFilename,
      results_sha256:declaredSha,
      configured_start_id:configuredStartId,
      input_rows:inputRows,
      completed_rows:completedRows,
      first_input_id:firstId,
      last_input_id:lastInputId,
      first_completed_id:firstCompletedId,
      last_completed_id:lastCompletedId,
      next_unprocessed_id:nextUnprocessedId,
      counts:manifestCounts,
    },
  };
}

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
