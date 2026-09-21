import {
  END_TOKEN,
  START_TOKEN,
  clamp,
  isPunctuationToken,
  lexicalNorms,
  tokenizeSurface,
} from './markov-model-core.mjs';
import {
  MARKOV_LYRIC_PROFILE,
  MARKOV_LYRIC_PROFILE_POLICY,
  lyricLengthFit,
  lyricTargetBounds,
} from './markov-lyric-profile.mjs';
import {createSeededRandom} from './markov-model-runtime.mjs';
import {
  MARKOV_LYRIC_STRUCTURE_POLICY,
  lyricRhymeDistanceWeights,
  lyricSectionDefaults,
  lyricStructureFor,
} from './markov-lyric-structure-profile.mjs';

export const LYRIC_DECODER_POLICY='rhymelab-constrained-lyric-decoder-v2';
export const LYRIC_DECODER_RUNTIME='rhymelab-constrained-lyric-runtime-v2';

function normalizeKind(row){
  const kind=String(row?.resultKind||'word').toLocaleLowerCase('en-US');
  if(kind==='phrase')return 'phrase';
  if(kind==='entity')return 'entity';
  return 'word';
}

function relationScore(row,type){
  const relation=(row?.relations||[])
    .find((entry)=>String(entry?.type||'').toLocaleLowerCase('en-US')===type);
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
  return `${normalizeKind(row)}:${String(row?.normalized||row?.surface||row?.word||'')
    .normalize('NFKC').trim().toLocaleLowerCase('en-US')}`;
}

function tailFamilyKey(candidate){
  const ipa=String(candidate.raw?.preferredIpa||candidate.raw?.ipa||'')
    .normalize('NFKC').replace(/\s+/gu,' ').trim();
  if(ipa)return ipa.split(' ').slice(-2).join(' ');
  return candidate.tokens.slice(-2).map((row)=>row.norm).join(' ');
}

function entityCategoriesFor(row){
  return (Array.isArray(row?.entityCategories)?row.entityCategories:[])
    .map((entry)=>typeof entry==='string'?entry:entry?.category)
    .map((value)=>String(value||'').trim())
    .filter(Boolean);
}

function normalizePool(rows,{language='de',allowEntities=true,entityCategories=[],allowPhrases=true,target=''}={}){
  const locale=language==='en'?'en-US':'de-DE';
  const targetNorm=String(target||'').normalize('NFKC').trim().toLocaleLowerCase(locale);
  const seen=new Set();
  const out=[];
  for(const row of rows||[]){
    const kind=normalizeKind(row);
    if(kind==='entity'&&!allowEntities)continue;
    if(kind==='entity'&&Array.isArray(entityCategories)&&entityCategories.length){
      const categories=entityCategoriesFor(row);
      if(!categories.some((category)=>entityCategories.includes(category)))continue;
    }
    if(kind==='phrase'&&!allowPhrases)continue;
    const surface=String(row?.surface||row?.word||'').normalize('NFKC').trim();
    if(!surface)continue;
    const normalized=String(row?.normalized||surface).normalize('NFKC').trim().toLocaleLowerCase(locale);
    if(normalized===targetNorm)continue;
    const key=candidateKey(row);
    if(seen.has(key))continue;
    seen.add(key);
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

function modelSupport(runtime,candidate){
  const tokenSupport=candidate.tokens.length
    ?candidate.tokens.reduce((sum,row)=>sum+runtime.tokenSupport(row.norm),0)/candidate.tokens.length
    :0;
  const context=candidate.tokens.map((row)=>row.norm).slice(0,runtime.order);
  const reverse=runtime.choicesWithBackoff('reverse',context,{limit:16});
  const branchSupport=reverse.rows.length
    ?clamp(Math.log1p(reverse.total)/Math.log(32))
    :0;
  return clamp(tokenSupport*0.72+branchSupport*0.28);
}

function buildTailReservoir(runtime,pool,options){
  const natural=clamp(options.naturalness/100);
  const weird=clamp(options.weirdness/100);
  const pressure=clamp(options.rhymePressure/100);
  const scored=[];
  for(const candidate of pool){
    const support=modelSupport(runtime,candidate);
    const phonetic=modeScore(candidate.raw,options.mode);
    const kindBonus=candidate.kind==='phrase'&&options.mode==='mosaic'?0.08:0;
    const quality=clamp(
      phonetic*(0.5+pressure*0.32)
      +candidate.usage*(0.16+natural*0.12)
      +support*(0.18+natural*0.18)
      +kindBonus,
    );
    scored.push({
      candidate,
      phonetic,
      support,
      quality,
      family:tailFamilyKey(candidate),
      finalToken:candidate.tokens.at(-1)?.norm||candidate.normalized,
    });
  }
  scored.sort((a,b)=>b.quality-a.quality||b.phonetic-a.phonetic||a.candidate.surface.localeCompare(b.candidate.surface));
  if(!scored.length)return [];
  const best=scored[0].quality||1;
  const qualityFloor=best*(0.44+natural*0.18);
  const minReservoir=Math.min(scored.length,24);
  const maxReservoir=Math.min(scored.length,Math.round(48+weird*80));
  const filtered=scored.filter((row)=>row.quality>=qualityFloor);
  return scored.slice(0,Math.max(minReservoir,Math.min(maxReservoir,filtered.length)));
}

function temperatureWeight(value,temperature){
  return Math.pow(Math.max(1e-9,value),1/Math.max(0.08,temperature));
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

function chooseTail(reservoir,random,options,usage){
  if(!reservoir.length)return null;
  const weird=clamp(options.weirdness/100);
  const temperature=0.78+weird*1.35;
  const rows=reservoir.map((row,index)=>{
    const exactUses=usage.exact.get(row.candidate.normalized)||0;
    const finalUses=usage.final.get(row.finalToken)||0;
    const familyUses=usage.family.get(row.family)||0;
    const diversityPenalty=1/(1+exactUses*3.2+finalUses*1.15+familyUses*0.45);
    const rankPenalty=1/(1+index*0.012);
    return {
      ...row,
      weight:temperatureWeight(row.quality,temperature)*diversityPenalty*rankPenalty,
    };
  });
  const chosen=weightedChoice(rows,random);
  if(!chosen)return null;
  usage.exact.set(chosen.candidate.normalized,(usage.exact.get(chosen.candidate.normalized)||0)+1);
  usage.final.set(chosen.finalToken,(usage.final.get(chosen.finalToken)||0)+1);
  usage.family.set(chosen.family,(usage.family.get(chosen.family)||0)+1);
  return chosen;
}

function seedTokens(seedText,language){
  return tokenizeSurface(seedText,{language,maximumTokens:32}).map((row)=>row.norm);
}

function repetitionPenalty(prefix,token){
  if(isPunctuationToken(token))return 0;
  const occurrences=prefix.filter((value)=>value===token).length;
  if(occurrences>=2)return Infinity;
  let penalty=occurrences?0.65:0;
  if(prefix.length>=2&&prefix.at(-1)===token)penalty+=1.2;
  return penalty;
}

function reverseOptions(runtime,context,random,options,prefix,{allowStart=false}={}){
  const natural=clamp(options.naturalness/100);
  const weird=clamp(options.weirdness/100);
  const clean=context.filter(Boolean);
  const merged=new Map();
  for(let contextLen=Math.min(runtime.order,clean.length);contextLen>=1;contextLen-=1){
    const selected=clean.slice(0,contextLen);
    const result=runtime.choices('reverse',selected,{limit:96});
    if(!result.rows.length)continue;
    const eligible=result.rows.filter((row)=>{
      if(row.token===END_TOKEN)return false;
      if(row.token===START_TOKEN&&!allowStart)return false;
      return Number.isFinite(repetitionPenalty(prefix,row.token));
    });
    if(!eligible.length)continue;
    const bestProbability=eligible[0].count/Math.max(1,result.total);
    const floorRatio=0.015+natural*0.12;
    for(const row of eligible){
      const probability=row.count/Math.max(1,result.total);
      if(probability<bestProbability*floorRatio)continue;
      const support=runtime.tokenSupport(row.token);
      const repeat=repetitionPenalty(prefix,row.token);
      const contextStrength=contextLen/runtime.order;
      const base=Math.max(1e-9,probability)
        *(0.78+contextStrength*(0.32+natural*0.52))
        *(0.85+support*0.3)
        *Math.exp(-repeat);
      const current=merged.get(row.token);
      const candidate={token:row.token,probability,contextLen,count:row.count,base};
      if(!current||candidate.contextLen>current.contextLen||candidate.base>current.base){
        merged.set(row.token,candidate);
      }
    }
    // Strong high-order evidence should dominate, but a narrow high-order state
    // is allowed to borrow alternatives from one lower order.
    if(merged.size>=10||contextLen<=1)break;
  }
  const temperature=0.72+weird*1.45;
  const rows=[...merged.values()].map((row)=>({
    ...row,
    score:Math.log(Math.max(row.base,1e-12))
      +(weird*(random()-0.5)*0.7),
    weight:temperatureWeight(row.base,temperature),
  }));
  rows.sort((a,b)=>b.score-a.score||b.contextLen-a.contextLen||b.count-a.count||a.token.localeCompare(b.token));
  const branch=Math.max(5,Math.min(20,Math.round(7+weird*13)));
  return rows.slice(0,branch);
}

function beamReverse(runtime,tail,random,options){
  const fixedSeed=seedTokens(options.seedText,options.language);
  const weird=clamp(options.weirdness/100);
  const bounds=lyricTargetBounds(options.targetTokens,{weirdness:weird});
  const desired=bounds.target;
  const tailNorms=tail.candidate.tokens.map((row)=>row.norm);
  const needed=desired-fixedSeed.length-tailNorms.length;
  if(needed<0)return [];
  if(needed===0){
    const full=[...fixedSeed,...tailNorms];
    return [{prefix:[],full,logScore:0,contextMean:0}];
  }

  const suffix=[...tailNorms,END_TOKEN];
  const beamWidth=Math.max(10,Math.min(36,Math.round(14+weird*22)));
  let beam=[{prefix:[],suffix,logScore:0,contextTotal:0,steps:0}];

  for(let step=0;step<needed;step+=1){
    const next=[];
    for(const state of beam){
      const context=state.suffix.slice(0,runtime.order);
      let optionsHere=reverseOptions(runtime,context,random,options,state.prefix,{
        allowStart:false,
      });

      // The final slot next to a fixed opener is a true bidirectional
      // completion: it must be observed after the left context and before the
      // already-built right context.
      if(fixedSeed.length&&step===needed-1){
        const bridges=runtime.bridgeChoices(fixedSeed.slice(-runtime.order),context,{limit:96})
          .filter((row)=>row.token!==START_TOKEN&&row.token!==END_TOKEN)
          .map((row)=>({
            token:row.token,
            probability:Math.sqrt(row.forwardProbability*row.reverseProbability),
            contextLen:Math.min(row.forwardContextLen,row.reverseContextLen),
            count:1,
            score:Math.log(Math.max(row.score,1e-12))+0.4,
            weight:row.score,
          }));
        if(bridges.length)optionsHere=bridges;
      }

      for(const choice of optionsHere){
        if(choice.token===START_TOKEN)continue;
        const prefix=[choice.token,...state.prefix];
        next.push({
          prefix,
          suffix:[choice.token,...state.suffix],
          logScore:state.logScore+Math.log(Math.max(choice.probability,1e-9))
            +(choice.contextLen/runtime.order)*0.24,
          contextTotal:state.contextTotal+choice.contextLen,
          steps:state.steps+1,
        });
      }
    }
    if(!next.length)return [];
    next.sort((a,b)=>{
      const av=a.logScore/Math.max(1,a.steps);
      const bv=b.logScore/Math.max(1,b.steps);
      return bv-av||b.contextTotal-a.contextTotal||a.prefix.join(' ').localeCompare(b.prefix.join(' '));
    });

    const deduped=[];
    const seen=new Set();
    for(const row of next){
      const key=row.prefix.slice(0,Math.min(runtime.order+1,row.prefix.length)).join('\u0001');
      if(seen.has(key))continue;
      seen.add(key);
      deduped.push(row);
      if(deduped.length>=beamWidth)break;
    }
    beam=deduped;
  }

  return beam.map((row)=>({
    ...row,
    full:[...fixedSeed,...row.prefix,...tailNorms],
    contextMean:row.steps?row.contextTotal/row.steps:0,
  }));
}

function internalEntityVariants(runtime,beam,pool,tail,random,options){
  if(!options.allowEntities||!beam.prefix.length)return [beam];
  const explicitCategories=Array.isArray(options.entityCategories)?options.entityCategories:[];
  const entities=pool
    .filter((candidate)=>candidate.kind==='entity')
    .filter((candidate)=>candidate.normalized!==tail.candidate.normalized)
    .filter((candidate)=>{
      if(!explicitCategories.length)return true;
      const categories=entityCategoriesFor(candidate.raw);
      return categories.some((category)=>explicitCategories.includes(category));
    })
    .filter((candidate)=>candidate.tokens.length>=1&&candidate.tokens.length<=Math.min(4,beam.prefix.length))
    .map((candidate)=>({
      candidate,
      quality:clamp(
        candidate.writerScore*0.48
        +candidate.usage*0.22
        +modelSupport(runtime,candidate)*0.30
      ),
    }))
    .sort((a,b)=>b.quality-a.quality||a.candidate.surface.localeCompare(b.candidate.surface))
    .slice(0,24);

  if(!entities.length)return [beam];

  const fixedSeed=seedTokens(options.seedText,options.language);
  const tailNorms=tail.candidate.tokens.map((row)=>row.norm);
  const variants=[beam];

  for(const row of entities){
    const candidate=row.candidate;
    const length=candidate.tokens.length;
    const entityNorms=candidate.tokens.map((token)=>token.norm);
    for(let start=0;start+length<=beam.prefix.length;start+=1){
      const prefix=[
        ...beam.prefix.slice(0,start),
        ...entityNorms,
        ...beam.prefix.slice(start+length),
      ];
      const full=[...fixedSeed,...prefix,...tailNorms];
      const forward=runtime.sequenceForwardScore(full);
      if(forward.zeroRate>0.18)continue;
      const support=clamp(1-forward.zeroRate);
      const localScore=row.quality*0.58+support*0.34+random()*0.08;
      variants.push({
        ...beam,
        prefix,
        full,
        internalEntity:{
          start,
          length,
          candidate,
          score:localScore,
        },
      });
    }
  }

  variants.sort((a,b)=>{
    const as=Number(a.internalEntity?.score??0.52);
    const bs=Number(b.internalEntity?.score??0.52);
    return bs-as;
  });
  const kept=[beam];
  for(const variant of variants){
    if(!variant.internalEntity)continue;
    kept.push(variant);
    if(kept.length>=6)break;
  }
  return kept;
}

function startBoundary(runtime,prefix){
  if(!prefix.length)return 0;
  const context=prefix.slice(0,runtime.order);
  const detail=runtime.transitionProbability('reverse',context,START_TOKEN);
  return detail.probability>0?clamp(Math.sqrt(detail.probability)):0;
}

function tailBoundary(runtime,tailNorms){
  const context=tailNorms.slice(-runtime.order);
  const detail=runtime.transitionProbability('forward',context,END_TOKEN);
  return detail.probability>0?clamp(Math.pow(detail.probability,0.35)):0;
}

function buildTokenRows(runtime,beam,tail,options){
  const rows=[];
  const seed=String(options.seedText||'').trim().replace(/[.!?…,:;]+$/u,'');
  if(seed)rows.push({text:seed,kind:'seed',generated:false});
  const splice=beam.internalEntity||null;
  for(let index=0;index<beam.prefix.length;index+=1){
    if(splice&&index===splice.start){
      rows.push({
        text:splice.candidate.surface,
        norm:splice.candidate.tokens.map((row)=>row.norm).join(' '),
        kind:'entity',
        generated:splice.candidate.generated,
        score:splice.candidate.writerScore,
        entityCategories:entityCategoriesFor(splice.candidate.raw).slice(0,8),
        placeholder:'<ENTITY>',
      });
      index+=splice.length-1;
      continue;
    }
    rows.push({text:runtime.surfaceFor(beam.prefix[index]),norm:beam.prefix[index],kind:'corpus',generated:false});
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

function sourceCounts(tokens){
  const counts={corpus:0,word:0,phrase:0,entity:0,seed:0,generated:0};
  for(const token of tokens){
    if(Object.hasOwn(counts,token.kind))counts[token.kind]+=1;
    if(token.generated)counts.generated+=1;
  }
  return counts;
}

function scoreDraft(runtime,beam,tail,tokenRows,options){
  const naturalControl=clamp(options.naturalness/100);
  const pressure=clamp(options.rhymePressure/100);
  const weird=clamp(options.weirdness/100);
  const target=Math.max(3,Math.min(28,Number(options.targetTokens)||MARKOV_LYRIC_PROFILE.defaultTargetTokens));
  const actual=beam.full.length;
  const lengthFit=lyricLengthFit(actual,target);
  const forward=runtime.sequenceForwardScore(beam.full);
  const novelty=runtime.sourceNovelty(beam.full,{maxWindow:8,minWindow:4});
  const shape=runtime.shapeEvidence(beam.full,{limit:96});
  const fixedSeed=seedTokens(options.seedText,options.language);
  let start=startBoundary(runtime,beam.prefix);
  if(fixedSeed.length){
    const first=beam.prefix[0]||tail.candidate.tokens[0]?.norm;
    const detail=first
      ?runtime.transitionProbability('forward',fixedSeed.slice(-runtime.order),first)
      :{probability:0};
    start=detail.probability>0?clamp(Math.sqrt(detail.probability)):0;
  }
  const terminal=tailBoundary(runtime,tail.candidate.tokens.map((row)=>row.norm));
  const contextDepth=clamp(beam.contextMean/runtime.order);

  const copyLimit=target>=14?7:target>=10?6:5;
  const copiedTooFar=novelty.exactSource||novelty.longestSourceRun>=copyLimit;
  const phraseSupport=clamp(novelty.phraseSupport||0);
  const transition=clamp(
    Math.pow(Math.max(forward.probability,1e-9),0.24)
      *(1-forward.zeroRate),
  );
  const naturalness=clamp(
    transition*0.42
    +contextDepth*0.18
    +(shape.patterns?shape.fit:0.5)*0.15
    +phraseSupport*0.05
    +start*0.09
    +terminal*0.06
    +tail.candidate.usage*0.05,
  );
  const rhyme=clamp(tail.phonetic);
  const sourceNovelty=novelty.exactSource?0:clamp(
    novelty.novelty*0.72+(1-Math.min(1,novelty.matchedWindows/6))*0.28,
  );
  const naturalWeight=0.38+naturalControl*0.3;
  const rhymeWeight=0.22+pressure*0.32;
  const structureWeight=0.12;
  const noveltyWeight=0.12+weird*0.05;
  const supportWeight=0.08;
  const utility=clamp((
    naturalness*naturalWeight
    +rhyme*rhymeWeight
    +(shape.patterns?shape.fit:0.5)*structureWeight
    +sourceNovelty*noveltyWeight
    +tail.support*supportWeight
  )/(naturalWeight+rhymeWeight+structureWeight+noveltyWeight+supportWeight));

  return {
    utility,
    naturalness,
    rhyme,
    transition,
    contextDepth,
    shapeFit:shape.fit,
    shapeSupport:shape.support,
    sourceNovelty,
    phraseSupport,
    copiedPhraseRun:novelty.phraseRun||0,
    copiedSourceRun:novelty.longestSourceRun,
    exactSource:novelty.exactSource,
    lengthFit,
    actualLength:actual,
    targetLength:target,
    minimumLength:target,
    maximumLength:target,
    lengthWithinTarget:actual===target,
    startBoundary:start,
    tailFit:terminal,
    zeroTransitionRate:forward.zeroRate,
    copiedTooFar,
  };
}

function tokenSet(candidate){
  return new Set(lexicalNorms(candidate.tokens.flatMap((row)=>{
    if(row.kind==='seed')return tokenizeSurface(row.text,{language:candidate.model.language}).map((token)=>token.norm);
    if(row.placeholder==='<RHYME>')return tokenizeSurface(row.text,{language:candidate.model.language}).map((token)=>token.norm);
    return row.norm?[row.norm]:[];
  })));
}

function suffix(candidate,n){
  const tokens=lexicalNorms(candidate.flatNorms||[]);
  return tokens.slice(-n).join(' ');
}

function jaccard(left,right){
  if(!left.size&&!right.size)return 1;
  let intersect=0;
  for(const value of left)if(right.has(value))intersect+=1;
  return intersect/Math.max(1,left.size+right.size-intersect);
}

export function candidateSimilarity(left,right){
  const leftSet=left._tokenSet||tokenSet(left);
  const rightSet=right._tokenSet||tokenSet(right);
  let similarity=jaccard(leftSet,rightSet)*0.42;
  const leftNorms=left.flatNorms||[];
  const rightNorms=right.flatNorms||[];
  const sameFinal=leftNorms.at(-1)&&leftNorms.at(-1)===rightNorms.at(-1);
  const sameBigram=leftNorms.length>=2&&rightNorms.length>=2
    &&leftNorms.slice(-2).join('\u0001')===rightNorms.slice(-2).join('\u0001');
  const sameTrigram=leftNorms.length>=3&&rightNorms.length>=3
    &&leftNorms.slice(-3).join('\u0001')===rightNorms.slice(-3).join('\u0001');
  if(sameFinal)similarity+=0.2;
  if(sameBigram)similarity+=0.22;
  if(sameTrigram)similarity+=0.16;
  if(left.tail.normalized===right.tail.normalized)similarity=1;
  else if(left.tail.family&&left.tail.family===right.tail.family)similarity+=0.08;
  return clamp(similarity);
}

function diversify(drafts,desired,options){
  const weird=clamp(options.weirdness/100);
  const pool=drafts
    .map((row)=>({...row,_tokenSet:tokenSet(row)}))
    .sort((a,b)=>b.scores.utility-a.scores.utility||b.scores.naturalness-a.scores.naturalness||a.sentence.localeCompare(b.sentence));
  const selected=[];
  const usedTail=new Set();
  const diversityWeight=0.28+weird*0.18;
  while(pool.length&&selected.length<desired){
    let bestIndex=-1;
    let bestScore=-Infinity;
    for(let index=0;index<pool.length;index+=1){
      const candidate=pool[index];
      const exactTailUsed=usedTail.has(candidate.tail.normalized);
      let maxSimilarity=0;
      for(const chosen of selected)maxSimilarity=Math.max(maxSimilarity,candidateSimilarity(candidate,chosen));
      const duplicatePenalty=exactTailUsed?0.38:0;
      const score=candidate.scores.utility-maxSimilarity*diversityWeight-duplicatePenalty;
      if(score>bestScore){
        bestScore=score;
        bestIndex=index;
      }
    }
    if(bestIndex<0)break;
    const [picked]=pool.splice(bestIndex,1);
    let maxSimilarity=0;
    for(const chosen of selected)maxSimilarity=Math.max(maxSimilarity,candidateSimilarity(picked,chosen));
    if(selected.length&&maxSimilarity>=0.92)continue;
    picked.scores.resultDiversity=clamp(1-maxSimilarity);
    picked.scores.selectionUtility=clamp(bestScore);
    selected.push(picked);
    usedTail.add(picked.tail.normalized);
  }
  return selected.map(({_tokenSet,...row},index)=>({...row,rank:index+1}));
}

export function planLyricSection({
  language='de',
  scheme='ABAB',
  lines,
  targetTokens,
  section='verse',
  seed=0,
}={}){
  const lang=language==='en'?'en':'de';
  const defaults=lyricSectionDefaults(lang,section);
  const labels=String(scheme||'ABAB').toLocaleUpperCase('en-US').replace(/[^A-Z]/gu,'').split('');
  const count=Math.max(1,Math.min(64,Number(lines)||defaults.lines||labels.length||4));
  const requestedTokens=Math.max(
    3,
    Math.min(28,Number(targetTokens)||defaults.targetTokens||MARKOV_LYRIC_PROFILE.defaultTargetTokens),
  );
  const random=createSeededRandom(
    `${LYRIC_DECODER_POLICY}|${MARKOV_LYRIC_STRUCTURE_POLICY}|${lang}|${section}|${scheme}|${seed}|${requestedTokens}`
  );
  const plans=[];
  for(let index=0;index<count;index+=1){
    const slot=labels[index%Math.max(1,labels.length)]||String.fromCharCode(65+(index%4));
    const variance=section==='hook'?0:random()<0.32?(random()<0.5?-1:1):0;
    plans.push({
      line:index+1,
      rhymeSlot:slot,
      targetTokens:Math.max(3,Math.min(28,requestedTokens+variance)),
      section,
      repetitionWeight:section==='hook'?MARKOV_LYRIC_PROFILE.repetition.second:0,
    });
  }
  return {
    policy:LYRIC_DECODER_POLICY,
    structurePolicy:MARKOV_LYRIC_STRUCTURE_POLICY,
    language:lang,
    section,
    scheme:labels.join('')||'ABAB',
    defaults,
    rhymeDistanceWeights:lyricRhymeDistanceWeights(lang),
    lines:plans,
  };
}

function weightedObjectChoice(weights,random){
  const rows=Object.entries(weights||{}).filter(([,value])=>Number(value)>0);
  if(!rows.length)return null;
  const total=rows.reduce((sum,[,value])=>sum+Number(value),0);
  let point=random()*total;
  for(const [key,value] of rows){
    point-=Number(value);
    if(point<=0)return key;
  }
  return rows.at(-1)?.[0]||null;
}

export function planLyricSong({
  language='de',
  sections,
  seed=0,
  scheme='ABAB',
  schemeBySection={},
}={}){
  const lang=language==='en'?'en':'de';
  const profile=lyricStructureFor(lang);
  const desired=Math.max(
    2,
    Math.min(16,Number(sections)||Math.round(profile.songSections.median)||5),
  );
  const random=createSeededRandom(
    `${LYRIC_DECODER_POLICY}|${MARKOV_LYRIC_STRUCTURE_POLICY}|song|${lang}|${seed}|${desired}`
  );

  const sectionTypes=[];
  let current=weightedObjectChoice(profile.startSectionWeights,random)||'verse';
  sectionTypes.push(current);

  while(sectionTypes.length<desired){
    const isFinal=sectionTypes.length===desired-1;
    const transitions=profile.sectionTransitions[current]||{};
    let weights=transitions;
    if(isFinal){
      const endingWeighted={};
      for(const [type,weight] of Object.entries(transitions)){
        const endWeight=Number(profile.endSectionWeights[type]||0);
        endingWeighted[type]=Number(weight)*(0.35+endWeight*2.5);
      }
      if(Object.values(endingWeighted).some((value)=>value>0))weights=endingWeighted;
      else weights=profile.endSectionWeights;
    }
    current=weightedObjectChoice(weights,random)
      ||weightedObjectChoice(profile.endSectionWeights,random)
      ||'verse';
    sectionTypes.push(current);
  }

  const planned=sectionTypes.map((type,index)=>{
    const defaults=lyricSectionDefaults(lang,type);
    return {
      index:index+1,
      type,
      ...planLyricSection({
        language:lang,
        section:type,
        lines:defaults.lines,
        targetTokens:defaults.targetTokens,
        scheme:schemeBySection[type]||scheme,
        seed:Number(seed)+index*1543,
      }),
    };
  });

  return {
    policy:LYRIC_DECODER_POLICY,
    structurePolicy:MARKOV_LYRIC_STRUCTURE_POLICY,
    language:lang,
    sectionCount:planned.length,
    rhymeDistanceWeights:lyricRhymeDistanceWeights(lang),
    sections:planned,
  };
}

export function generateLyricCandidatesV2(runtime,{
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
  entityCategories=[],
  allowPhrases=true,
  count=8,
  attempts=128,
}={}){
  if(!runtime?.available)throw new Error('Markov transition model unavailable. Run: npm run markov:model:build');
  if(language!==runtime.language)throw new Error(`Markov model language ${runtime.language} cannot generate ${language}.`);

  const options={
    language,seedText,target,seed,targetTokens,rhymePressure,naturalness,weirdness,
    mode,allowEntities,entityCategories,allowPhrases,
  };
  const pool=normalizePool(rows,options);
  if(!pool.length)return [];
  const reservoir=buildTailReservoir(runtime,pool,options);
  if(!reservoir.length)return [];

  const desired=Math.max(1,Math.min(12,Number(count)||8));
  const tries=Math.max(desired*4,Math.min(256,Number(attempts)||128));
  const usage={exact:new Map(),final:new Map(),family:new Map()};
  const drafts=[];
  const seen=new Set();

  for(let attempt=0;attempt<tries;attempt+=1){
    const seedMaterial=[
      LYRIC_DECODER_POLICY,
      runtime.meta.semantic_fingerprint||'',
      language,seedText,target,seed,targetTokens,rhymePressure,naturalness,weirdness,mode,attempt,
    ].join('|');
    const random=createSeededRandom(seedMaterial);
    const tail=chooseTail(reservoir,random,options,usage);
    if(!tail)break;
    const beams=beamReverse(runtime,tail,random,options);
    if(!beams.length)continue;

    const beamCandidates=[];
    for(const baseBeam of beams.slice(0,12)){
      const variants=internalEntityVariants(runtime,baseBeam,pool,tail,random,options);
      for(const beam of variants){
        const tokenRows=buildTokenRows(runtime,beam,tail,options);
        const sentence=formatTokens(tokenRows,language);
        if(!sentence||seen.has(sentence))continue;
        const scores=scoreDraft(runtime,beam,tail,tokenRows,options);
        if(!scores.lengthWithinTarget||scores.copiedTooFar)continue;
        if(Number(naturalness)>=70&&scores.zeroTransitionRate>0.08)continue;
        if(Number(naturalness)>=82&&scores.naturalness<0.42)continue;
        beamCandidates.push({beam,tokenRows,sentence,scores});
      }
    }
    beamCandidates.sort((a,b)=>b.scores.utility-a.scores.utility||b.scores.naturalness-a.scores.naturalness);
    const best=beamCandidates[0];
    if(!best)continue;
    seen.add(best.sentence);
    const flatNorms=best.beam.full;
    drafts.push({
      id:`lx2-${Math.abs(createSeededRandom(`${seedMaterial}|${best.sentence}`)()*0xffffffff>>>0).toString(16)}`,
      sentence:best.sentence,
      tokens:best.tokenRows,
      flatNorms,
      scores:best.scores,
      sourceCounts:sourceCounts(best.tokenRows),
      model:{
        policy:LYRIC_DECODER_POLICY,
        runtime:LYRIC_DECODER_RUNTIME,
        schema:runtime.meta.schema,
        order:runtime.order,
        language,
        fingerprint:runtime.meta.semantic_fingerprint||null,
        sourceSentences:Number(runtime.meta.source_sentences||0),
        lyricProfile:MARKOV_LYRIC_PROFILE_POLICY,
        lyricStructure:MARKOV_LYRIC_STRUCTURE_POLICY,
        tailReservoir:reservoir.length,
      },
      seed:Number(seed)||0,
      mode,
      tail:{
        surface:tail.candidate.surface,
        normalized:tail.candidate.normalized,
        kind:tail.candidate.kind,
        score:tail.phonetic,
        modelSupport:tail.support,
        family:tail.family,
      },
    });
  }

  return diversify(drafts,desired,options);
}


export function analyzeLyricCandidateSet(candidates=[]){
  const rows=Array.isArray(candidates)?candidates.filter(Boolean):[];
  if(!rows.length){
    return {
      count:0,
      uniqueTailRatio:0,
      uniqueFinalTokenRatio:0,
      meanPairwiseSimilarity:0,
      maxPairwiseSimilarity:0,
      exactLengthRate:0,
      sourceCopyRate:0,
      meanNaturalness:0,
      meanRhyme:0,
    };
  }
  const tails=new Set();
  const finals=new Set();
  let exactLength=0;
  let copied=0;
  let naturalness=0;
  let rhyme=0;
  for(const row of rows){
    tails.add(String(row?.tail?.normalized||row?.tail?.surface||''));
    finals.add(String((row?.flatNorms||[]).at(-1)||''));
    if(row?.scores?.actualLength===row?.scores?.targetLength)exactLength+=1;
    if(row?.scores?.copiedTooFar||row?.scores?.exactSource)copied+=1;
    naturalness+=Number(row?.scores?.naturalness||0);
    rhyme+=Number(row?.scores?.rhyme||0);
  }
  let pairCount=0;
  let similarityTotal=0;
  let maxPairwiseSimilarity=0;
  for(let i=0;i<rows.length;i+=1){
    for(let j=i+1;j<rows.length;j+=1){
      const similarity=candidateSimilarity(rows[i],rows[j]);
      pairCount+=1;
      similarityTotal+=similarity;
      maxPairwiseSimilarity=Math.max(maxPairwiseSimilarity,similarity);
    }
  }
  return {
    count:rows.length,
    uniqueTailRatio:tails.size/rows.length,
    uniqueFinalTokenRatio:finals.size/rows.length,
    meanPairwiseSimilarity:pairCount?similarityTotal/pairCount:0,
    maxPairwiseSimilarity,
    exactLengthRate:exactLength/rows.length,
    sourceCopyRate:copied/rows.length,
    meanNaturalness:naturalness/rows.length,
    meanRhyme:rhyme/rows.length,
  };
}

export function generateLyricSectionV2(runtime,{
  language='de',
  scheme='ABAB',
  section='verse',
  lines,
  targetTokens,
  slots={},
  seed=1337,
  rhymePressure=72,
  naturalness=76,
  weirdness=38,
  mode='balanced',
  allowEntities=true,
  entityCategories=[],
  allowPhrases=true,
  candidatesPerLine=8,
  attemptsPerLine=192,
}={}){
  const lang=runtime?.language==='en'?'en':(language==='en'?'en':'de');
  const plan=planLyricSection({language:lang,scheme,lines,targetTokens,section,seed});
  const selected=[];
  const usedTailBySlot=new Map();
  const failures=[];

  for(const linePlan of plan.lines){
    const slotConfig=slots?.[linePlan.rhymeSlot];
    const rows=Array.isArray(slotConfig?.rows)?slotConfig.rows:[];
    const target=String(slotConfig?.target||'').trim();
    if(!rows.length||!target){
      failures.push({
        line:linePlan.line,
        rhymeSlot:linePlan.rhymeSlot,
        reason:'missing_slot_candidates',
      });
      continue;
    }

    const lineSeed=Number(seed)||0;
    const candidates=generateLyricCandidatesV2(runtime,{
      rows,
      language:lang,
      target,
      seed:lineSeed+linePlan.line*1009,
      targetTokens:linePlan.targetTokens,
      rhymePressure,
      naturalness,
      weirdness,
      mode,
      allowEntities,
      entityCategories,
      allowPhrases,
      count:Math.max(3,Math.min(12,Number(candidatesPerLine)||8)),
      attempts:Math.max(64,Math.min(256,Number(attemptsPerLine)||192)),
    });

    const usedForSlot=usedTailBySlot.get(linePlan.rhymeSlot)||new Set();
    let best=null;
    for(const candidate of candidates){
      const exactTailUsed=usedForSlot.has(candidate.tail.normalized);
      if(exactTailUsed)continue;

      let maxSimilarity=0;
      let previousSameSlotFamily=false;
      let crossSlotFamilyCollision=false;
      for(const previous of selected){
        maxSimilarity=Math.max(maxSimilarity,candidateSimilarity(candidate,previous.candidate));
        if(previous.plan.rhymeSlot===linePlan.rhymeSlot
          &&previous.candidate.tail.family===candidate.tail.family){
          previousSameSlotFamily=true;
        }
        if(previous.plan.rhymeSlot!==linePlan.rhymeSlot
          &&previous.candidate.tail.family===candidate.tail.family){
          crossSlotFamilyCollision=true;
        }
      }

      const overlapPenalty=maxSimilarity*(section==='hook'?0.18:0.34);
      const familyBonus=previousSameSlotFamily?0.04:0;
      const familyCollisionPenalty=crossSlotFamilyCollision?0.12:0;
      const score=Number(candidate.scores.selectionUtility??candidate.scores.utility)
        -overlapPenalty
        +familyBonus
        -familyCollisionPenalty;

      if(!best||score>best.score){
        best={candidate,score,maxSimilarity,previousSameSlotFamily,crossSlotFamilyCollision};
      }
    }

    if(!best){
      failures.push({
        line:linePlan.line,
        rhymeSlot:linePlan.rhymeSlot,
        reason:'no_diverse_candidate',
      });
      continue;
    }

    usedForSlot.add(best.candidate.tail.normalized);
    usedTailBySlot.set(linePlan.rhymeSlot,usedForSlot);
    selected.push({
      plan:linePlan,
      candidate:best.candidate,
      sectionSelectionScore:clamp(best.score),
      previousLineSimilarity:best.maxSimilarity,
      rhymeFamilyContinued:best.previousSameSlotFamily,
      crossSlotFamilyCollision:best.crossSlotFamilyCollision,
    });
  }

  const candidateRows=selected.map((row)=>row.candidate);
  return {
    policy:LYRIC_DECODER_POLICY,
    plan,
    complete:selected.length===plan.lines.length,
    lines:selected,
    failures,
    metrics:analyzeLyricCandidateSet(candidateRows),
  };
}
