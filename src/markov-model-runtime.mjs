import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  END_TOKEN,
  MARKOV_MODEL_ORDER,
  MARKOV_MODEL_POLICY,
  MARKOV_MODEL_SCHEMA,
  START_TOKEN,
  clamp,
  isBoundaryToken,
  isPunctuationToken,
  modelStats,
  normalizeModelToken,
  readMeta,
  stateKey,
  tokenizeSurface,
} from './markov-model-core.mjs';

export const DEFAULT_MARKOV_MODEL_DB_PATH='data/local/rhymelab-markov-v1.sqlite';
export const MARKOV_GENERATOR_RUNTIME='rhymelab-markov-runtime-v1';

function hashString(value){
  let hash=2166136261>>>0;
  for(const ch of String(value??'')){
    hash^=ch.codePointAt(0);
    hash=Math.imul(hash,16777619)>>>0;
  }
  return hash>>>0;
}

export function createSeededRandom(seed){
  let state=hashString(seed)||0x6d2b79f5;
  return ()=>{
    state|=0;
    state=state+0x6D2B79F5|0;
    let t=state;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function normalizeKind(row){
  const kind=String(row?.resultKind||'word').toLocaleLowerCase('en-US');
  if(kind==='phrase')return 'phrase';
  if(kind==='entity')return 'entity';
  return 'word';
}

function relationScore(row,type){
  const relation=(row?.relations||[]).find((entry)=>String(entry?.type||'').toLocaleLowerCase('en-US')===type);
  return clamp(relation?.score??0);
}

function usageQuality(row){
  if(Number.isFinite(Number(row?.popularityPercentile)))return clamp(Number(row.popularityPercentile));
  if(Number.isFinite(Number(row?.leipzigCommonness)))return clamp(Number(row.leipzigCommonness));
  const rank=Number(row?.usageRank);
  if(Number.isFinite(rank)&&rank>0)return clamp(1-(Math.log10(rank+1)/7));
  const count=Number(row?.usageCount);
  if(Number.isFinite(count)&&count>0)return clamp(Math.log10(count+1)/6);
  return 0.5;
}

function modeScore(row,mode){
  const base=clamp(row?.score??0);
  const kind=normalizeKind(row);
  const primary=String(row?.primaryType||row?.type||'').toLocaleLowerCase('en-US');
  const assonance=relationScore(row,'assonance');
  const consonance=relationScore(row,'consonance');
  switch(mode){
    case 'multi': return /multi/u.test(primary)?Math.max(base,0.94):base*0.72;
    case 'mosaic': return kind==='phrase'?Math.max(base,0.9):base*0.48;
    case 'slant': return /slant|family/u.test(primary)?Math.max(base,0.9):base*0.68;
    case 'assonance': return Math.max(assonance,base*0.55);
    case 'chain': return Math.max(assonance,base*0.62);
    case 'consonance': return Math.max(consonance,base*0.55);
    case 'internal': return clamp(Math.max(assonance,consonance)*0.7+base*0.3);
    case 'end': return base;
    default: return clamp(base*0.72+assonance*0.16+consonance*0.12);
  }
}

function candidateKey(row){
  return `${normalizeKind(row)}:${String(row?.normalized||row?.surface||row?.word||'').normalize('NFKC').trim().toLocaleLowerCase('en-US')}`;
}

function normalizedWriterPool(rows,{language='de',allowEntities=true,allowPhrases=true,target=''}={}){
  const targetNorm=String(target||'').normalize('NFKC').trim().toLocaleLowerCase(language==='en'?'en-US':'de-DE');
  const seen=new Set();
  const out=[];
  for(const row of rows||[]){
    const kind=normalizeKind(row);
    if(kind==='entity'&&!allowEntities)continue;
    if(kind==='phrase'&&!allowPhrases)continue;
    const surface=String(row?.surface||row?.word||'').normalize('NFKC').trim();
    if(!surface)continue;
    const key=candidateKey(row);
    if(seen.has(key))continue;
    seen.add(key);
    const normalized=String(row?.normalized||surface).normalize('NFKC').trim().toLocaleLowerCase(language==='en'?'en-US':'de-DE');
    if(normalized===targetNorm)continue;
    const tokens=tokenizeSurface(surface,{language,maximumTokens:8});
    if(!tokens.length)continue;
    out.push({
      raw:row,
      key,
      kind,
      surface,
      normalized,
      tokens,
      writerScore:clamp(row?.score??0),
      usage:usageQuality(row),
      generated:Boolean(row?.generatedPronunciation||String(row?.lexiconLayer||'').includes('generated')),
    });
  }
  return out;
}

function logScaled(value,maximum){
  const n=Math.max(0,Number(value)||0);
  const max=Math.max(1,Number(maximum)||1);
  return clamp(Math.log1p(n)/Math.log1p(max));
}

export function createMarkovRuntime(db,{path=':memory:'}={}){
  const meta=readMeta(db);
  if(meta.schema!==MARKOV_MODEL_SCHEMA){
    throw new Error(`Unsupported Markov model schema: ${meta.schema||'missing'}`);
  }
  if(meta.policy!==MARKOV_MODEL_POLICY){
    throw new Error(`Unsupported Markov model policy: ${meta.policy||'missing'}`);
  }
  const language=meta.language||'de';
  const choiceStmt=db.prepare(`
    SELECT next_token,count
    FROM transition
    WHERE direction=? AND context_len=? AND state_key=?
    ORDER BY count DESC,next_token
    LIMIT ?
  `);
  const transitionCountStmt=db.prepare(`
    SELECT count
    FROM transition
    WHERE direction=? AND context_len=? AND state_key=? AND next_token=?
  `);
  const tokenStmt=db.prepare('SELECT norm,count,preferred_surface FROM token WHERE norm=?');
  const maxTokenCount=Number(db.prepare('SELECT MAX(count) AS n FROM token').get()?.n||1);
  const choiceCache=new Map();
  const tokenCache=new Map();

  function tokenInfo(norm){
    const key=normalizeModelToken(norm,language);
    if(tokenCache.has(key))return tokenCache.get(key);
    const row=tokenStmt.get(key)||null;
    tokenCache.set(key,row);
    return row;
  }

  function surfaceFor(norm){
    if(isBoundaryToken(norm))return '';
    const row=tokenInfo(norm);
    return String(row?.preferred_surface||norm);
  }

  function choices(direction,context,{limit=48}={}){
    const clean=context.filter(Boolean);
    const len=Math.min(MARKOV_MODEL_ORDER,clean.length);
    if(!len)return {contextLen:0,stateKey:'',rows:[],total:0};
    const selected=direction==='reverse'?clean.slice(0,len):clean.slice(-len);
    const key=stateKey(selected);
    const cacheKey=`${direction}|${len}|${key}|${limit}`;
    if(choiceCache.has(cacheKey))return choiceCache.get(cacheKey);
    const rows=choiceStmt.all(direction,len,key,Math.max(1,Math.min(128,Number(limit)||48)))
      .map((row)=>({token:String(row.next_token),count:Number(row.count)||0}));
    const total=rows.reduce((sum,row)=>sum+row.count,0);
    const result={contextLen:len,stateKey:key,rows,total};
    choiceCache.set(cacheKey,result);
    return result;
  }

  function choicesWithBackoff(direction,context,{limit=48}={}){
    const clean=context.filter(Boolean);
    for(let len=Math.min(MARKOV_MODEL_ORDER,clean.length);len>=1;len-=1){
      const selected=direction==='reverse'?clean.slice(0,len):clean.slice(-len);
      const result=choices(direction,selected,{limit});
      if(result.rows.length)return result;
    }
    return {contextLen:0,stateKey:'',rows:[],total:0};
  }

  function transitionProbability(direction,context,nextToken){
    const clean=context.filter(Boolean);
    const target=normalizeModelToken(nextToken,language);
    for(let len=Math.min(MARKOV_MODEL_ORDER,clean.length);len>=1;len-=1){
      const selected=direction==='reverse'?clean.slice(0,len):clean.slice(-len);
      const key=stateKey(selected);
      const row=transitionCountStmt.get(direction,len,key,target);
      if(!row)continue;
      const result=choices(direction,selected,{limit:128});
      const total=result.total||1;
      return {probability:clamp(Number(row.count)/total),contextLen:len,count:Number(row.count)||0,total};
    }
    return {probability:0,contextLen:0,count:0,total:0};
  }

  function tokenSupport(norm){
    const row=tokenInfo(norm);
    return row?logScaled(row.count,maxTokenCount):0;
  }

  return {
    available:true,
    db,
    path,
    meta,
    language,
    choices,
    choicesWithBackoff,
    transitionProbability,
    tokenInfo,
    tokenSupport,
    surfaceFor,
    stats:modelStats(db),
    close(){try{db.close();}catch{}},
  };
}

export function openMarkovModel(path=DEFAULT_MARKOV_MODEL_DB_PATH){
  const absolute=resolve(path);
  if(!existsSync(absolute)){
    return {
      available:false,
      path:absolute,
      reason:'model_missing',
      error:null,
      stats:null,
      close(){},
    };
  }
  try{
    const db=new DatabaseSync(absolute,{readOnly:true});
    return createMarkovRuntime(db,{path:absolute});
  }catch(error){
    return {
      available:false,
      path:absolute,
      reason:'model_invalid',
      error:error instanceof Error?error.message:String(error),
      stats:null,
      close(){},
    };
  }
}

export function markovModelHealth(runtime){
  if(!runtime?.available){
    return {
      available:false,
      reason:runtime?.reason||'model_missing',
      error:runtime?.error||null,
      database:runtime?.path||resolve(DEFAULT_MARKOV_MODEL_DB_PATH),
      build_command:'npm run markov:model:build',
      bootstrap_command:'npm run phrase:catalog:bootstrap && npm run markov:model:build',
    };
  }
  let bytes=null;
  try{bytes=statSync(runtime.path).size;}catch{}
  return {
    available:true,
    runtime:MARKOV_GENERATOR_RUNTIME,
    policy:runtime.meta.policy,
    schema:runtime.meta.schema,
    database:runtime.path,
    database_bytes:bytes,
    language:runtime.language,
    order:Number(runtime.meta.order||MARKOV_MODEL_ORDER),
    source_manifest:runtime.meta.source_manifest||null,
    source_sentences:Number(runtime.meta.source_sentences||0),
