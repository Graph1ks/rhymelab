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
    accepted_sentences:Number(runtime.meta.accepted_sentences||0),
    semantic_fingerprint:runtime.meta.semantic_fingerprint||null,
    tokens:runtime.stats.tokens,
    retained_states:runtime.stats.retainedStates,
    transitions:runtime.stats.transitions,
  };
}

function candidateModelSupport(runtime,candidate){
  const supports=candidate.tokens.map((token)=>runtime.tokenSupport(token.norm));
  if(!supports.length)return 0;
  const tokenSupport=supports.reduce((sum,value)=>sum+value,0)/supports.length;
  let terminal=0;
  if(candidate.tokens.length===1){
    const terminalChoices=runtime.choicesWithBackoff('reverse',[candidate.tokens[0].norm,END_TOKEN],{limit:8});
    terminal=terminalChoices.rows.length?0.75:0;
  }else{
    const pair=candidate.tokens.slice(0,2).map((token)=>token.norm);
    terminal=runtime.choicesWithBackoff('reverse',pair,{limit:8}).rows.length?0.8:0;
  }
  return clamp(tokenSupport*0.72+terminal*0.28);
}

function weightedChoice(rows,random){
  if(!rows.length)return null;
  const total=rows.reduce((sum,row)=>sum+Math.max(0,row.weight),0);
  if(total<=0)return rows[0];
  let point=random()*total;
  for(const row of rows){
    point-=Math.max(0,row.weight);
    if(point<=0)return row;
  }
  return rows.at(-1);
}

function chooseTail(runtime,pool,random,options,usedKeys){
  const pressure=clamp(options.rhymePressure/100);
  const natural=clamp(options.naturalness/100);
  const weird=clamp(options.weirdness/100);
  const rows=[];
  for(const candidate of pool){
    if(usedKeys.has(candidate.key))continue;
    const modelSupport=candidateModelSupport(runtime,candidate);
    if(natural>=0.72&&modelSupport<0.2)continue;
    const phonetic=modeScore(candidate.raw,options.mode);
    const kindBonus=candidate.kind==='phrase'&&options.mode==='mosaic'?0.12:0;
    const utility=clamp(
      phonetic*(0.42+pressure*0.46)
      +candidate.usage*(0.12+natural*0.22)
      +modelSupport*(0.16+natural*0.32)
      +kindBonus,
    );
    rows.push({candidate,phonetic,modelSupport,utility});
  }
  if(!rows.length)return null;
  rows.sort((a,b)=>b.utility-a.utility||b.phonetic-a.phonetic||a.candidate.surface.localeCompare(b.candidate.surface));
  const depth=Math.max(1,Math.min(rows.length,Math.round(2+weird*14)));
  const shortlist=rows.slice(0,depth).map((row,index)=>({
    ...row,
    weight:Math.pow(Math.max(0.001,row.utility),2.5-natural*1.3)/(1+index*0.12),
  }));
  return weightedChoice(shortlist,random);
}

function nextReverseToken(runtime,context,random,options,{allowStart=true,seen}={}){
  const natural=clamp(options.naturalness/100);
  const weird=clamp(options.weirdness/100);
  const result=runtime.choicesWithBackoff('reverse',context,{limit:64});
  if(!result.rows.length)return {token:null,probability:0,contextLen:0};
  const rows=[];
  for(const row of result.rows){
    if(row.token===END_TOKEN)continue;
    if(row.token===START_TOKEN&&!allowStart)continue;
    const repetitions=seen?.get(row.token)||0;
    if(repetitions>=2&&!isPunctuationToken(row.token))continue;
    const probability=row.count/Math.max(1,result.total);
    const support=runtime.tokenSupport(row.token);
    const repeatPenalty=repetitions?0.32*repetitions:0;
    const score=Math.max(1e-8,probability*(0.6+natural*0.8)+support*(0.06+natural*0.2)-repeatPenalty);
    rows.push({token:row.token,probability,score,count:row.count});
  }
  if(!rows.length)return {token:null,probability:0,contextLen:result.contextLen};
  rows.sort((a,b)=>b.score-a.score||b.count-a.count||a.token.localeCompare(b.token));
  const depth=Math.max(1,Math.min(rows.length,Math.round(1+weird*12+(1-natural)*5)));
  const temperature=0.5+(1-natural)*0.8+weird*0.35;
  const shortlist=rows.slice(0,depth).map((row)=>({
    ...row,
    weight:Math.pow(Math.max(row.score,1e-8),1/temperature),
  }));
  const chosen=weightedChoice(shortlist,random)||shortlist[0];
  return {...chosen,contextLen:result.contextLen};
}

function normalizeSeedTokens(seedText,language){
  return tokenizeSurface(seedText,{language,maximumTokens:32}).map((row)=>row.norm);
}

function boundaryFit(runtime,seedTokens,prefixTokens){
  if(!seedTokens.length||!prefixTokens.length)return 1;
  const context=seedTokens.slice(-MARKOV_MODEL_ORDER);
  let current=[...context];
  let log=0;
  let count=0;
  for(const token of prefixTokens.slice(0,Math.min(3,prefixTokens.length))){
    const detail=runtime.transitionProbability('forward',current,token);
    if(detail.probability<=0)return 0;
    log+=Math.log(detail.probability);
    count+=1;
    current.push(token);
    if(current.length>MARKOV_MODEL_ORDER)current.shift();
  }
  return count?Math.exp(log/count):0;
}

function terminalTailFit(runtime,tailTokens){
  const norms=tailTokens.map((row)=>row.norm);
  if(!norms.length)return 0;
  let sequence=[...norms,END_TOKEN];
  let log=0;
  let count=0;
  for(let index=1;index<sequence.length;index+=1){
    const context=sequence.slice(Math.max(0,index-MARKOV_MODEL_ORDER),index);
    const detail=runtime.transitionProbability('forward',context,sequence[index]);
    if(detail.probability>0){log+=Math.log(detail.probability);count+=1;}
    else {log+=Math.log(1e-5);count+=1;}
  }
  return count?Math.exp(log/count):0;
}

function generateBackwardPrefix(runtime,tail,random,options){
  const seedTokens=normalizeSeedTokens(options.seedText,options.language);
  const target=Math.max(4,Math.min(28,Number(options.targetTokens)||10));
  const targetPrefix=Math.max(1,target-seedTokens.length-tail.candidate.tokens.length);
  const maxPrefix=Math.max(targetPrefix+4,Math.ceil(targetPrefix*(1.25+clamp(options.weirdness/100)*0.25)));
  const minPrefix=Math.max(1,Math.floor(targetPrefix*0.55));
  const suffix=tail.candidate.tokens.map((row)=>row.norm);
  if(suffix.length===1)suffix.push(END_TOKEN);
  const prefix=[];
  const probs=[];
  const seen=new Map(tail.candidate.tokens.map((row)=>[row.norm,1]));
