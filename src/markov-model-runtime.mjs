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
  lexicalNorms,
  readMeta,
  sequenceHash,
  shapeKeyForTokens,
  stateKey,
  tokenizeSurface,
} from './markov-model-core.mjs';
import {
  MARKOV_LYRIC_PROFILE,
  MARKOV_LYRIC_PROFILE_POLICY,
  lyricLengthFit,
  lyricTargetBounds,
} from './markov-lyric-profile.mjs';

export const DEFAULT_MARKOV_MODEL_DB_PATH='data/local/rhymelab-markov-v2.sqlite';
export const MARKOV_GENERATOR_RUNTIME='rhymelab-constrained-runtime-v2';

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
  const order=Math.max(1,Math.min(MARKOV_MODEL_ORDER,Number(meta.order)||MARKOV_MODEL_ORDER));
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
  const sourceSequenceStmt=db.prepare(
    'SELECT count FROM source_sequence_hash WHERE source_kind=? AND hash=?'
  );
  const sourceWindowStmt=db.prepare(
    'SELECT count FROM source_window_hash WHERE source_kind=? AND window_size=? AND hash=?'
  );
  const shapePatternStmt=db.prepare(`
    SELECT shape_key,count
    FROM shape_pattern
    WHERE token_count=?
    ORDER BY count DESC,shape_key
    LIMIT ?
  `);
  const choiceCache=new Map();
  const tokenCache=new Map();
  const shapeCache=new Map();

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
    const len=Math.min(order,clean.length);
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
    for(let len=Math.min(order,clean.length);len>=1;len-=1){
      const selected=direction==='reverse'?clean.slice(0,len):clean.slice(-len);
      const result=choices(direction,selected,{limit});
      if(result.rows.length)return result;
    }
    return {contextLen:0,stateKey:'',rows:[],total:0};
  }

  function transitionProbability(direction,context,nextToken){
    const clean=context.filter(Boolean);
    const target=normalizeModelToken(nextToken,language);
    for(let len=Math.min(order,clean.length);len>=1;len-=1){
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

  function sourceNovelty(tokens,{maxWindow=8,minWindow=4}={}){
    const lexical=lexicalNorms(tokens);
    const emptyKinds={
      lyric:{exact:false,longestRun:0,matchedWindows:0},
      sentence:{exact:false,longestRun:0,matchedWindows:0},
      phrase:{exact:false,longestRun:0,matchedWindows:0},
    };
    if(!lexical.length){
      return {
        exactSource:false,
        longestSourceRun:0,
        matchedWindows:0,
        novelty:1,
        phraseRun:0,
        phraseSupport:0,
        byKind:emptyKinds,
      };
    }

    const fullHash=sequenceHash(lexical);
    const upper=Math.min(Math.max(minWindow,Number(maxWindow)||8),lexical.length);
    const byKind={};
    for(const kind of ['lyric','sentence','phrase']){
      const detail={
        exact:Boolean(sourceSequenceStmt.get(kind,fullHash)),
        longestRun:0,
        matchedWindows:0,
      };
      for(let size=upper;size>=Math.min(minWindow,lexical.length);size-=1){
        let foundAtSize=false;
        for(let start=0;start+size<=lexical.length;start+=1){
          const hash=sequenceHash(lexical.slice(start,start+size));
          if(sourceWindowStmt.get(kind,size,hash)){
            detail.matchedWindows+=1;
            foundAtSize=true;
          }
        }
        if(foundAtSize&&!detail.longestRun)detail.longestRun=size;
      }
      byKind[kind]=detail;
    }

    const strictKinds=[byKind.lyric,byKind.sentence];
    const exactSource=strictKinds.some((row)=>row.exact);
    const longestSourceRun=Math.max(...strictKinds.map((row)=>row.longestRun));
    const matchedWindows=strictKinds.reduce((sum,row)=>sum+row.matchedWindows,0);
    const novelty=clamp(1-(longestSourceRun/Math.max(lexical.length,1)));
    const phraseRun=byKind.phrase.longestRun;
    const phraseSupport=clamp(phraseRun/Math.max(1,Math.min(8,lexical.length)));
    return {
      exactSource,
      longestSourceRun,
      matchedWindows,
      novelty,
      phraseRun,
      phraseSupport,
      byKind,
    };
  }

  function shapeEvidence(tokens,{limit=64}={}){
    const lexical=lexicalNorms(tokens);
    if(!lexical.length)return {shapeKey:'',fit:0,support:0,patterns:0};
    const key=shapeKeyForTokens(lexical,language);
    const cacheKey=`${lexical.length}|${Math.max(1,Math.min(128,Number(limit)||64))}`;
    let patterns=shapeCache.get(cacheKey);
    if(!patterns){
      patterns=shapePatternStmt.all(lexical.length,Math.max(1,Math.min(128,Number(limit)||64)))
        .map((row)=>({shapeKey:String(row.shape_key),count:Number(row.count)||0}));
      shapeCache.set(cacheKey,patterns);
    }
    let bestFit=0;
    let bestSupport=0;
    const maxCount=patterns[0]?.count||1;
    for(const pattern of patterns){
      const other=pattern.shapeKey;
      if(other.length!==key.length)continue;
      let same=0;
      for(let i=0;i<key.length;i+=1)if(key[i]===other[i])same+=1;
      const fit=key.length?same/key.length:0;
      if(fit>bestFit||(fit===bestFit&&pattern.count>bestSupport)){
        bestFit=fit;
        bestSupport=pattern.count;
      }
    }
    return {
      shapeKey:key,
      fit:clamp(bestFit),
      support:logScaled(bestSupport,maxCount),
      patterns:patterns.length,
    };
  }

  function sequenceForwardScore(tokens){
    const lexical=lexicalNorms(tokens);
    if(lexical.length<2)return {probability:0,zeroRate:1,averageContext:0,steps:0};
    let log=0;
    let zeros=0;
    let contexts=0;
    let steps=0;
    for(let index=1;index<lexical.length;index+=1){
      const context=lexical.slice(Math.max(0,index-order),index);
      const detail=transitionProbability('forward',context,lexical[index]);
      steps+=1;
      contexts+=detail.contextLen;
      if(detail.probability<=0){
        zeros+=1;
        log+=Math.log(1e-9);
      }else{
        log+=Math.log(Math.max(detail.probability,1e-9));
      }
    }
    return {
      probability:Math.exp(log/Math.max(1,steps)),
      zeroRate:zeros/Math.max(1,steps),
      averageContext:contexts/Math.max(1,steps),
      steps,
    };
  }

  function bridgeChoices(leftContext,rightContext,{limit=64}={}){
    const forward=choicesWithBackoff('forward',leftContext,{limit});
    const reverse=choicesWithBackoff('reverse',rightContext,{limit});
    const rightMap=new Map(reverse.rows.map((row)=>[row.token,row]));
    const rows=[];
    for(const left of forward.rows){
      const right=rightMap.get(left.token);
      if(!right)continue;
      const lp=left.count/Math.max(1,forward.total);
      const rp=right.count/Math.max(1,reverse.total);
      rows.push({
        token:left.token,
        forwardProbability:lp,
        reverseProbability:rp,
        score:Math.sqrt(lp*rp),
        forwardContextLen:forward.contextLen,
        reverseContextLen:reverse.contextLen,
      });
    }
    rows.sort((a,b)=>b.score-a.score||a.token.localeCompare(b.token));
    return rows;
  }

  return {
    available:true,
    db,
    path,
    meta,
    language,
    order,
    choices,
    choicesWithBackoff,
    transitionProbability,
    tokenInfo,
    tokenSupport,
    sourceNovelty,
    shapeEvidence,
    sequenceForwardScore,
    bridgeChoices,
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
      source_status_command:'npm run serving:v1:product:status',
      source_requirement:'The default model is built from Phrase/Mosaic rows inside the canonical data/local/rhymelab-serving-v1.sqlite database. Owner-private lyrics are calibration-only and are never used as model transitions.',
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
    order:runtime.order,
    source_manifest:runtime.meta.source_manifest||null,
    source_sentences:Number(runtime.meta.source_sentences||0),
    accepted_sentences:Number(runtime.meta.accepted_sentences||0),
    semantic_fingerprint:runtime.meta.semantic_fingerprint||null,
    tokens:runtime.stats.tokens,
    retained_states:runtime.stats.retainedStates,
    transitions:runtime.stats.transitions,
    source_sequences:runtime.stats.sourceSequences,
    source_windows:runtime.stats.sourceWindows,
    shape_patterns:runtime.stats.shapePatterns,
    lyric_profile:MARKOV_LYRIC_PROFILE_POLICY,
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
  const clean=context.filter(Boolean);

  // Back off *after* applying generation constraints. Previously an order-2
  // state whose only predecessor was <s> stopped the walk even when <s> was
  // forbidden and a valid order-1 predecessor existed.
  for(let len=Math.min(runtime.order,clean.length);len>=1;len-=1){
    const selected=clean.slice(0,len);
    const result=runtime.choices('reverse',selected,{limit:64});
    if(!result.rows.length)continue;
    const rows=[];
    for(const row of result.rows){
      if(row.token===END_TOKEN)continue;
      if(row.token===START_TOKEN&&!allowStart)continue;
      const repetitions=seen?.get(row.token)||0;
      if(repetitions>=2&&!isPunctuationToken(row.token))continue;
      const probability=row.count/Math.max(1,result.total);
      const support=runtime.tokenSupport(row.token);
      const repeatPenalty=repetitions?0.32*repetitions:0;
      const score=Math.max(
        1e-8,
        probability*(0.6+natural*0.8)+support*(0.06+natural*0.2)-repeatPenalty,
      );
      rows.push({token:row.token,probability,score,count:row.count});
    }
    if(!rows.length)continue;
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
  return {token:null,probability:0,contextLen:0};
}

function normalizeSeedTokens(seedText,language){
  return tokenizeSurface(seedText,{language,maximumTokens:32}).map((row)=>row.norm);
}

function boundaryFit(runtime,seedTokens,prefixTokens){
  if(!seedTokens.length||!prefixTokens.length)return 1;
  const context=seedTokens.slice(-runtime.order);
  let current=[...context];
  let log=0;
  let count=0;
  for(const token of prefixTokens.slice(0,Math.min(runtime.order+1,prefixTokens.length))){
    const detail=runtime.transitionProbability('forward',current,token);
    if(detail.probability<=0)return 0;
    log+=Math.log(detail.probability);
    count+=1;
    current.push(token);
    if(current.length>runtime.order)current.shift();
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
    const context=sequence.slice(Math.max(0,index-runtime.order),index);
    const detail=runtime.transitionProbability('forward',context,sequence[index]);
    if(detail.probability>0){log+=Math.log(detail.probability);count+=1;}
    else {log+=Math.log(1e-5);count+=1;}
  }
  return count?Math.exp(log/count):0;
}

function generateBackwardPrefix(runtime,tail,random,options){
  const seedTokens=normalizeSeedTokens(options.seedText,options.language);
  const weird=clamp(options.weirdness/100);
  const bounds=lyricTargetBounds(options.targetTokens,{weirdness:weird});
  const fixedTokens=seedTokens.length+tail.candidate.tokens.length;
  const targetPrefix=Math.max(0,bounds.target-fixedTokens);
  const minPrefix=Math.max(0,bounds.min-fixedTokens);
  const maxPrefix=Math.max(
    minPrefix,
    Math.min(28-fixedTokens,Math.max(targetPrefix,bounds.max-fixedTokens)),
  );
  const suffix=tail.candidate.tokens.map((row)=>row.norm);
  if(suffix.length===1)suffix.push(END_TOKEN);
  const prefix=[];
  const probs=[];
  const seen=new Map(tail.candidate.tokens.map((row)=>[row.norm,1]));
  let reachedStart=false;
  for(let step=0;step<maxPrefix;step+=1){
    const context=suffix.slice(0,runtime.order);
    const allowStart=prefix.length>=minPrefix;
    const chosen=nextReverseToken(runtime,context,random,options,{allowStart,seen});
    if(!chosen.token)break;
    if(chosen.token===START_TOKEN){reachedStart=true;break;}
    prefix.unshift(chosen.token);
    suffix.unshift(chosen.token);
    probs.unshift(chosen.probability);
    seen.set(chosen.token,(seen.get(chosen.token)||0)+1);

    if(prefix.length>=targetPrefix){
      if(seedTokens.length){
        const fit=boundaryFit(runtime,seedTokens,prefix);
        const stopChance=clamp(0.18+fit*0.65+clamp(options.naturalness/100)*0.12);
        if(random()<stopChance)break;
      }else{
        // A requested length is a generation constraint, not just a score.
        // Once the target is reached, prefer stopping near it rather than
        // wandering until a phrase boundary far beyond the slider value.
        const overshoot=prefix.length-targetPrefix;
        const stopChance=clamp(0.58+overshoot*0.2+(1-weird)*0.12);
        if(random()<stopChance)break;
      }
    }
  }
  const boundary=boundaryFit(runtime,seedTokens,prefix);
  const transitionNaturalness=probs.length
    ?Math.exp(probs.reduce((sum,p)=>sum+Math.log(Math.max(p,1e-9)),0)/probs.length)
    :0;
  return {prefix,probs,reachedStart,boundary,transitionNaturalness,seedTokens,bounds};
}

function formatTokens(rows,language){
  const locale=language==='en'?'en-US':'de-DE';
  let text='';
  for(const row of rows){
    const token=String(row.text||'');
    if(!token)continue;
    if(isPunctuationToken(token))text=text.replace(/\s+$/u,'')+token+' ';
    else text+=`${token} `;
  }
  text=text.trim().replace(/\s+/gu,' ');
  if(!text)return '';
  const chars=[...text];
  chars[0]=chars[0].toLocaleUpperCase(locale);
  text=chars.join('');
  if(!/[.!?…]$/u.test(text))text+='.';
  return text;
}

function buildTokenRows(runtime,backward,tail,options){
  const rows=[];
  const seed=String(options.seedText||'').trim().replace(/[.!?…,:;]+$/u,'');
  if(seed)rows.push({text:seed,kind:'seed',generated:false});
  for(const norm of backward.prefix){
    rows.push({text:runtime.surfaceFor(norm),norm,kind:'corpus',generated:false});
  }
  rows.push({
    text:tail.candidate.surface,
    norm:tail.candidate.tokens.map((row)=>row.norm).join(' '),
    kind:tail.candidate.kind,
    generated:tail.candidate.generated,
    score:tail.candidate.writerScore,
    placeholder:'<RHYME>',
  });
  return rows.filter((row)=>row.text);
}

function localReplacementFit(runtime,leftContext,candidateTokens,rightTokens){
  let context=[...leftContext].slice(-runtime.order);
  let log=0;
  let count=0;
  const sequence=[...candidateTokens,...rightTokens.slice(0,2)];
  for(const token of sequence){
    const detail=runtime.transitionProbability('forward',context,token);
    if(detail.probability<=0)return 0;
    log+=Math.log(detail.probability);
    count+=1;
    context.push(token);
    if(context.length>runtime.order)context.shift();
  }
  return count?Math.exp(log/count):0;
}

function maybeInjectEcho(runtime,tokenRows,pool,tail,random,options){
  const pressure=clamp(options.rhymePressure/100);
  const natural=clamp(options.naturalness/100);
  const weird=clamp(options.weirdness/100);
  const forced=['chain','internal','assonance','consonance'].includes(options.mode);
  if(!forced&&random()>0.18+weird*0.28)return {rows:tokenRows,echoScore:0};
  const corpusIndices=[];
  for(let i=0;i<tokenRows.length;i+=1){if(tokenRows[i].kind==='corpus'&&!isPunctuationToken(tokenRows[i].norm))corpusIndices.push(i);}
  if(corpusIndices.length<3)return {rows:tokenRows,echoScore:0};
  const rhymeCandidates=pool
    .filter((candidate)=>candidate.key!==tail.candidate.key)
    .filter((candidate)=>candidate.tokens.length<=4)
    .map((candidate)=>({candidate,phonetic:modeScore(candidate.raw,options.mode)}))
    .sort((a,b)=>b.phonetic-a.phonetic||b.candidate.usage-a.candidate.usage)
    .slice(0,Math.round(10+weird*18));
  let best=null;
  for(const {candidate,phonetic} of rhymeCandidates){
    if(candidate.kind==='entity'&&!options.allowEntities)continue;
    if(candidate.kind==='phrase'&&!options.allowPhrases)continue;
    const candNorms=candidate.tokens.map((row)=>row.norm);
    if(candNorms.some((token)=>!runtime.tokenInfo(token))&&natural>0.45)continue;
    for(const index of corpusIndices){
      if(index===tokenRows.length-1)continue;
      const before=tokenRows.slice(0,index).flatMap((row)=>row.kind==='seed'?normalizeSeedTokens(row.text,options.language):row.norm?[row.norm]:[]);
      const after=tokenRows.slice(index+1).flatMap((row)=>row.kind==='corpus'&&row.norm?[row.norm]:row.placeholder==='<RHYME>'?tail.candidate.tokens.map((t)=>t.norm):[]);
      const left=before.slice(-runtime.order);
      const oldNorm=tokenRows[index].norm;
      const baseline=localReplacementFit(runtime,left,[oldNorm],after);
      const fit=localReplacementFit(runtime,left,candNorms,after);
      if(fit<=0)continue;
      const relative=baseline>0?clamp(Math.sqrt(fit/baseline),0,1):clamp(fit*8);
      const utility=clamp(phonetic*(0.45+pressure*0.45)+relative*(0.18+natural*0.42)+candidate.usage*0.08);
      if(natural>0.72&&relative<0.34)continue;
      const row={candidate,index,phonetic,fit,relative,utility};
      if(!best||row.utility>best.utility||row.utility===best.utility&&candidate.surface.localeCompare(best.candidate.surface)<0)best=row;
    }
  }
  if(!best)return {rows:tokenRows,echoScore:0};
  const rows=tokenRows.map((row)=>({...row}));
  rows[best.index]={
    text:best.candidate.surface,
    norm:best.candidate.tokens.map((row)=>row.norm).join(' '),
    kind:best.candidate.kind,
    generated:best.candidate.generated,
    score:best.candidate.writerScore,
    placeholder:'<ECHO>',
  };
  return {rows,echoScore:best.phonetic,echoNaturalness:best.relative};
}

function sourceCounts(tokens){
  const counts={corpus:0,word:0,phrase:0,entity:0,seed:0,generated:0};
  for(const token of tokens){
    if(Object.hasOwn(counts,token.kind))counts[token.kind]+=1;
    if(token.generated)counts.generated+=1;
  }
  return counts;
}

function scoreCandidate(backward,tail,echo,tokenRows,options,runtime){
  const naturalControl=clamp(options.naturalness/100);
  const pressure=clamp(options.rhymePressure/100);
  const bounds=lyricTargetBounds(options.targetTokens,{weirdness:clamp(options.weirdness/100)});
  const target=bounds.target;
  const actual=tokenRows.reduce((sum,row)=>sum+(row.kind==='seed'?normalizeSeedTokens(row.text,options.language).length:tokenizeSurface(row.text,{language:options.language}).length),0);
  const lengthFit=lyricLengthFit(actual,target);
  const lengthWithinTarget=actual>=bounds.min&&actual<=bounds.max;
  const transitionScore=clamp(Math.sqrt(backward.transitionNaturalness));
  const startScore=String(options.seedText||'').trim()?clamp(Math.sqrt(backward.boundary)):backward.reachedStart?1:0.35;
  const tailFit=clamp(Math.pow(Math.max(terminalTailFit(runtime,tail.candidate.tokens),1e-6),0.35));
  const naturalness=clamp(transitionScore*0.46+startScore*0.24+tailFit*0.16+tail.candidate.usage*0.14);
  const rhyme=clamp(tail.phonetic*0.78+(echo.echoScore||0)*0.22);
  const naturalWeight=0.38+naturalControl*0.36;
  const rhymeWeight=0.2+pressure*0.34;
  const lengthWeight=0.12;
  const supportWeight=0.08;
  const utility=clamp((
    naturalness*naturalWeight
    +rhyme*rhymeWeight
    +lengthFit*lengthWeight
    +tail.modelSupport*supportWeight
  )/(naturalWeight+rhymeWeight+lengthWeight+supportWeight));
  return {
    utility,
    naturalness,
    rhyme,
    transition:transitionScore,
    boundary:startScore,
    tailFit,
    echo:echo.echoScore||0,
    echoNaturalness:echo.echoNaturalness||0,
    lengthFit,
    actualLength:actual,
    targetLength:target,
    minimumLength:bounds.min,
    maximumLength:bounds.max,
    lengthWithinTarget,
  };
}

export function generateCorpusMarkovCandidates(runtime,{
  rows=[],
  language='de',
  seedText='',
  target='',
  seed=1337,
  targetTokens=MARKOV_LYRIC_PROFILE.defaultTargetTokens,
  rhymePressure=65,
  naturalness=72,
  weirdness=38,
  mode='balanced',
  allowEntities=true,
  allowPhrases=true,
  count=8,
  attempts=48,
}={}){
  if(!runtime?.available)throw new Error('Markov corpus model is unavailable. Run: npm run markov:model:build');
  if(language!==runtime.language)throw new Error(`Markov corpus model language ${runtime.language} cannot generate ${language}.`);
  const options={language,seedText,target,seed,targetTokens,rhymePressure,naturalness,weirdness,mode,allowEntities,allowPhrases};
  const pool=normalizedWriterPool(rows,options);
  if(!pool.length)return [];
  const desired=Math.max(1,Math.min(12,Number(count)||8));
  const tries=Math.max(desired,Math.min(128,Number(attempts)||48));
  const generated=[];
  const seenSentences=new Set();
  const usedTails=new Set();
  for(let attempt=0;attempt<tries;attempt+=1){
    const seedMaterial=[MARKOV_MODEL_POLICY,runtime.meta.semantic_fingerprint||'',language,seedText,target,seed,targetTokens,rhymePressure,naturalness,weirdness,mode,attempt].join('|');
    const random=createSeededRandom(seedMaterial);
    let tail=chooseTail(runtime,pool,random,options,usedTails);
    if(!tail){
      usedTails.clear();
      tail=chooseTail(runtime,pool,random,options,usedTails);
    }
    if(!tail)break;
    usedTails.add(tail.candidate.key);
    const backward=generateBackwardPrefix(runtime,tail,random,options);
    if(!backward.prefix.length&&String(seedText||'').trim()==='')continue;
    if(String(seedText||'').trim()&&Number(naturalness)>=70&&backward.boundary<=0)continue;
    let tokenRows=buildTokenRows(runtime,backward,tail,options);
    const echo=maybeInjectEcho(runtime,tokenRows,pool,tail,random,options);
    tokenRows=echo.rows;
    const sentence=formatTokens(tokenRows,language);
    if(!sentence||seenSentences.has(sentence))continue;
    seenSentences.add(sentence);
    const scores=scoreCandidate(backward,tail,echo,tokenRows,options,runtime);
    if(!scores.lengthWithinTarget)continue;
    generated.push({
      id:`mk-${hashString(`${seedMaterial}|${sentence}`).toString(16)}`,
      sentence,
      tokens:tokenRows,
      scores,
      sourceCounts:sourceCounts(tokenRows),
      model:{
        policy:MARKOV_MODEL_POLICY,
        runtime:MARKOV_GENERATOR_RUNTIME,
        schema:runtime.meta.schema,
        order:runtime.order,
        language,
        fingerprint:runtime.meta.semantic_fingerprint||null,
        sourceSentences:Number(runtime.meta.source_sentences||0),
        lyricProfile:MARKOV_LYRIC_PROFILE_POLICY,
      },
      seed:Number(seed)||0,
      mode,
      tail:{surface:tail.candidate.surface,kind:tail.candidate.kind,score:tail.phonetic,modelSupport:tail.modelSupport},
    });
  }
  return generated
    .sort((a,b)=>b.scores.utility-a.scores.utility||b.scores.naturalness-a.scores.naturalness||b.scores.rhyme-a.scores.rhyme||a.sentence.localeCompare(b.sentence))
    .slice(0,desired)
    .map((row,index)=>({...row,rank:index+1}));
}
