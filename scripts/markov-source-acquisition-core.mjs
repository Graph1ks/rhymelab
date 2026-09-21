import {createHash} from 'node:crypto';

export const MARKOV_SOURCE_STAGE_SCHEMA='rhymelab-markov-source-stage-v1';

const URL_RE=/https?:\/\/|www\./iu;
const CONTROL_RE=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const LETTER_RE=/\p{L}/gu;
const GERMAN_HINT_RE=/[äöüßÄÖÜ]|\b(?:der|die|das|den|dem|des|ein|eine|einer|einen|und|oder|aber|nicht|ist|sind|war|wird|ich|du|er|sie|wir|ihr|mit|von|für|auf|im|in|zu|zum|zur)\b/iu;

export function normalizeSourceSentence(value){
  return String(value??'')
    .normalize('NFKC')
    .replace(CONTROL_RE,' ')
    .replace(/[\t\r\n]+/gu,' ')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/gu,' ')
    .replace(/\s+/gu,' ')
    .trim();
}

export function sentenceIdentity(value,locale='de-DE'){
  const normalized=normalizeSourceSentence(value)
    .toLocaleLowerCase(locale)
    .replace(/[“”„‟«»‹›"'’‘`´]/gu,'')
    .replace(/\s+/gu,' ')
    .trim();
  return createHash('sha256').update(normalized).digest('hex');
}

export function tokenCount(value){
  const matches=normalizeSourceSentence(value).match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu);
  return matches?.length||0;
}

export function assessGermanSentence(value,{
  minTokens=4,
  maxTokens=32,
  minChars=18,
  maxChars=320,
}={}){
  const sentence=normalizeSourceSentence(value);
  if(!sentence)return {accepted:false,reason:'empty',sentence,tokens:0};
  if(sentence.length<minChars)return {accepted:false,reason:'too_short_chars',sentence,tokens:tokenCount(sentence)};
  if(sentence.length>maxChars)return {accepted:false,reason:'too_long_chars',sentence,tokens:tokenCount(sentence)};
  if(URL_RE.test(sentence))return {accepted:false,reason:'url',sentence,tokens:tokenCount(sentence)};
  if(/(?:[_=*#<>|]){3,}/u.test(sentence))return {accepted:false,reason:'markup_noise',sentence,tokens:tokenCount(sentence)};
  if(/(.)\1{5,}/u.test(sentence))return {accepted:false,reason:'repeated_character_noise',sentence,tokens:tokenCount(sentence)};

  const tokens=tokenCount(sentence);
  if(tokens<minTokens)return {accepted:false,reason:'too_few_tokens',sentence,tokens};
  if(tokens>maxTokens)return {accepted:false,reason:'too_many_tokens',sentence,tokens};

  const letters=(sentence.match(LETTER_RE)||[]).length;
  const visible=[...sentence].filter((char)=>!(/\s/u.test(char))).length;
  if(!visible||letters/visible<0.58)return {accepted:false,reason:'low_letter_ratio',sentence,tokens};

  const alphaTokens=sentence.match(/\p{L}+/gu)||[];
  const upperHeavy=alphaTokens.filter((word)=>word.length>=3&&word===word.toLocaleUpperCase('de-DE')).length;
  if(alphaTokens.length>=4&&upperHeavy/alphaTokens.length>0.55){
    return {accepted:false,reason:'upper_noise',sentence,tokens};
  }

  const hasGermanHint=GERMAN_HINT_RE.test(sentence);
  const latinLetters=(sentence.match(/[A-Za-zÄÖÜäöüß]/gu)||[]).length;
  if(!hasGermanHint&&letters>=12&&latinLetters/letters<0.88){
    return {accepted:false,reason:'non_german_script_mix',sentence,tokens};
  }

  return {accepted:true,reason:'ok',sentence,tokens};
}

export function parseLeipzigSentenceFile(text){
  const out=[];
  for(const line of String(text??'').split(/\r?\n/u)){
    if(!line)continue;
    const tab=line.indexOf('\t');
    if(tab<0)continue;
    const id=line.slice(0,tab).trim();
    const sentence=line.slice(tab+1).trim();
    if(sentence)out.push({id,sentence});
  }
  return out;
}

export function parseTatoebaDetailedFile(text,{language='deu'}={}){
  const out=[];
  for(const line of String(text??'').split(/\r?\n/u)){
    if(!line)continue;
    const fields=line.split('\t');
    if(fields.length<3)continue;
    const [id,lang,sentence,username='',dateAdded='',dateModified='']=fields;
    if(lang!==language)continue;
    if(!sentence?.trim())continue;
    out.push({
      id:String(id),
      sentence:sentence.trim(),
      username:String(username),
      dateAdded:String(dateAdded),
      dateModified:String(dateModified),
    });
  }
  return out;
}

export function extractTarMember(tarBuffer,predicate){
  const buffer=Buffer.isBuffer(tarBuffer)?tarBuffer:Buffer.from(tarBuffer);
  for(let offset=0;offset+512<=buffer.length;){
    const header=buffer.subarray(offset,offset+512);
    if(header.every((byte)=>byte===0))break;
    const name=header.subarray(0,100).toString('utf8').replace(/\0.*$/u,'');
    const sizeText=header.subarray(124,136).toString('ascii').replace(/\0.*$/u,'').trim();
    const size=Number.parseInt(sizeText||'0',8)||0;
    const dataStart=offset+512;
    const dataEnd=dataStart+size;
    if(dataEnd>buffer.length)throw new Error('Invalid tar member size for '+name);
    if(predicate(name))return {name,data:buffer.subarray(dataStart,dataEnd)};
    offset=dataStart+Math.ceil(size/512)*512;
  }
  return null;
}

export function sourceStageRows(rows,{
  seen=new Set(),
  sourceCode='source',
  maxRows=Infinity,
  assessOptions={},
}={}){
  const accepted=[];
  const rejected={};
  let duplicates=0;
  let scanned=0;
  for(const row of rows){
    scanned+=1;
    const assessed=assessGermanSentence(row?.sentence,assessOptions);
    if(!assessed.accepted){
      rejected[assessed.reason]=(rejected[assessed.reason]||0)+1;
      continue;
    }
    const hash=sentenceIdentity(assessed.sentence);
    if(seen.has(hash)){
      duplicates+=1;
      continue;
    }
    seen.add(hash);
    accepted.push({
      ...row,
      sourceCode,
      sentence:assessed.sentence,
      sentenceHash:hash,
      tokenCount:assessed.tokens,
    });
    if(accepted.length>=maxRows)break;
  }
  return {
    rows:accepted,
    stats:{
      scanned,
      accepted:accepted.length,
      duplicates,
      rejected,
    },
  };
}

export function sha256Buffer(value){
  return createHash('sha256').update(value).digest('hex');
}
