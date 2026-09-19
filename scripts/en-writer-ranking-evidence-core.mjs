export const ENGLISH_RANKING_EVIDENCE_POLICY='en-writer-ranking-evidence-v1-candidate';

export const ENGLISH_RHYME_TIER=Object.freeze({
  multisyllabic_perfect:0,
  perfect:0,
  multisyllabic_slant:1,
  family:2,
  slant:3,
  assonance:4,
  consonance:5,
  weak:99,
});

export const ENGLISH_QUALITY_CANDIDATES=Object.freeze([
  Object.freeze({
    id:'phonetic_control',
    phonetic:1,
    syllable:0,
    commonness:0,
    lexical_overlap:0,
    near_tie_band:0,
  }),
  Object.freeze({
    id:'de_architecture_control',
    phonetic:0.72,
    syllable:0.16,
    commonness:0.12,
    lexical_overlap:0.16,
    near_tie_band:0.03,
  }),
  Object.freeze({
    id:'conservative_commonness',
    phonetic:0.78,
    syllable:0.16,
    commonness:0.06,
    lexical_overlap:0.16,
    near_tie_band:0.03,
  }),
]);

export const ENGLISH_DIVERSITY_WEIGHTS=Object.freeze([0,0.10,0.18,0.26]);

function clamp01(value){
  return Math.max(0,Math.min(1,Number(value)||0));
}

export function parseJsonArray(value){
  try{
    const parsed=JSON.parse(value||'[]');
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
}

export function commonnessUtility(zipf,rank){
  if(zipf!==null&&zipf!==undefined&&Number.isFinite(Number(zipf))){
    // wordfreq Zipf values are treated only as bounded ordering evidence.
    return clamp01((Number(zipf)-1.5)/5);
  }
  if(rank!==null&&rank!==undefined&&Number.isFinite(Number(rank))&&Number(rank)>0){
    const normalized=1-(Math.log10(Number(rank)+9)-1)/5.5;
    return clamp01(normalized);
  }
  return 0.25;
}

function bigrams(value){
  const s=String(value||'');
  if(s.length<2) return new Set(s?[s]:[]);
  const out=new Set();
  for(let i=0;i<s.length-1;i+=1) out.add(s.slice(i,i+2));
  return out;
}

export function lexicalSimilarity(a,b){
  const x=String(a||''),y=String(b||'');
  if(!x||!y) return 0;
  if(x===y) return 1;
  const xb=bigrams(x),yb=bigrams(y);
  if(!xb.size||!yb.size) return 0;
  let overlap=0;
  for(const item of xb) if(yb.has(item)) overlap+=1;
  return clamp01((2*overlap)/(xb.size+yb.size));
}

export function relationTier(score){
  const primary=String(score?.type||'weak');
  if(primary!=='weak') return ENGLISH_RHYME_TIER[primary]??99;
  const relationTypes=Array.isArray(score?.relationTypes)?score.relationTypes:[];
  return relationTypes.length
    ? Math.min(...relationTypes.map((type)=>ENGLISH_RHYME_TIER[type]??99))
    : 99;
}

export function qualityEvidence(candidate,queryNormalized,config){
  const phonetic=clamp01(candidate?.score?.overall);
  const syllable=clamp01(candidate?.score?.syllable);
  const commonness=commonnessUtility(candidate.wordfreq_zipf,candidate.wordfreq_rank);
  const lexical_overlap=lexicalSimilarity(queryNormalized,candidate.normalized);
  const utility=
    config.phonetic*phonetic
    +config.syllable*syllable
    +config.commonness*commonness
    -config.lexical_overlap*lexical_overlap;
  return {
    phonetic,
    syllable,
    commonness,
    lexical_overlap,
    utility:Number(utility.toFixed(8)),
  };
}

export function qualityComparator(config){
  const band=Number(config.near_tie_band||0);
  return (a,b)=>{
    const tierDelta=Number(a.tier)-Number(b.tier);
    if(tierDelta) return tierDelta;
    const scoreDelta=Number(b.evidence.phonetic)-Number(a.evidence.phonetic);
    if(Math.abs(scoreDelta)>band) return scoreDelta;
    return Number(b.evidence.utility)-Number(a.evidence.utility)
      ||Number(b.evidence.phonetic)-Number(a.evidence.phonetic)
      ||Number(a.wordfreq_rank??Number.MAX_SAFE_INTEGER)-Number(b.wordfreq_rank??Number.MAX_SAFE_INTEGER)
      ||String(a.normalized).localeCompare(String(b.normalized),'en');
  };
}

function lemmaSet(row){
  return new Set(parseJsonArray(row.lemmas).map((item)=>String(item).toLocaleLowerCase('en-US')));
}

export function candidateRedundancy(a,b){
  if(a.normalized===b.normalized) return 1;
  const al=lemmaSet(a),bl=lemmaSet(b);
  if([...al].some((lemma)=>bl.has(lemma))) return 0.95;
  const lexical=lexicalSimilarity(a.normalized,b.normalized);
  const prefix=(()=>{
    const x=String(a.normalized||''),y=String(b.normalized||'');
    const max=Math.max(x.length,y.length,1);
    let n=0;
    while(n<Math.min(x.length,y.length)&&x[n]===y[n]) n+=1;
    return n/max;
  })();
  return clamp01(Math.max(lexical,prefix*0.9));
}

export function diversifyRanked(rows,{weight=0.18,limit=20,nearTieBand=0.03}={}){
  const remaining=[...rows];
  const selected=[];
  while(remaining.length&&selected.length<limit){
    const base=remaining[0];
    let bestIndex=0;
    let bestScore=-Infinity;
    for(let i=0;i<remaining.length;i+=1){
      const row=remaining[i];
      if(row.tier!==base.tier) break;
      if(base.evidence.phonetic-row.evidence.phonetic>nearTieBand) break;
      const maxRedundancy=selected.length
        ? Math.max(...selected.map((picked)=>candidateRedundancy(row,picked)))
        : 0;
      const diversifiedScore=row.evidence.utility-weight*maxRedundancy;
      if(diversifiedScore>bestScore){
        bestScore=diversifiedScore;
        bestIndex=i;
      }
    }
    const [picked]=remaining.splice(bestIndex,1);
    const maxRedundancy=selected.length
      ? Math.max(...selected.map((row)=>candidateRedundancy(picked,row)))
      : 0;
    selected.push({
      ...picked,
      max_redundancy:Number(maxRedundancy.toFixed(6)),
      diversified_score:Number((picked.evidence.utility-weight*maxRedundancy).toFixed(8)),
    });
  }
  return selected;
}

export function pageMetrics(rows,limit=20){
  const page=rows.slice(0,limit);
  const normalized=new Set();
  const lemmas=new Map();
  let duplicates=0;
  let repeatedLemmaRows=0;
  let nearDuplicates=0;
  let unranked=0;
  let highOverlap=0;
  for(let i=0;i<page.length;i+=1){
    const row=page[i];
    if(normalized.has(row.normalized)) duplicates+=1;
    normalized.add(row.normalized);
    if(row.wordfreq_rank==null) unranked+=1;
    if(Number(row.evidence?.lexical_overlap||0)>=0.65) highOverlap+=1;
    const ls=lemmaSet(row);
    let repeat=false;
    for(const lemma of ls){
      if((lemmas.get(lemma)||0)>0) repeat=true;
      lemmas.set(lemma,(lemmas.get(lemma)||0)+1);
    }
    if(repeat) repeatedLemmaRows+=1;
    if(page.slice(0,i).some((other)=>lexicalSimilarity(row.normalized,other.normalized)>=0.80)) nearDuplicates+=1;
  }
  const mean=(values)=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  return {
    rows:page.length,
    exact_duplicate_rows:duplicates,
    near_duplicate_rows:nearDuplicates,
    repeated_lemma_rows:repeatedLemmaRows,
    unranked_rows:unranked,
    high_query_overlap_rows:highOverlap,
    mean_phonetic:mean(page.map((row)=>Number(row.evidence?.phonetic||0))),
    mean_commonness:mean(page.map((row)=>Number(row.evidence?.commonness||0))),
    mean_max_redundancy:mean(page.map((row)=>Number(row.max_redundancy||0))),
    tier_distribution:Object.fromEntries(
      [...new Set(page.map((row)=>row.tier))].sort((a,b)=>a-b)
        .map((tier)=>[String(tier),page.filter((row)=>row.tier===tier).length])
    ),
  };
}

export function guardViolations(rows,{nearTieBand=0.03,limit=20}={}){
  const page=rows.slice(0,limit);
  const violations=[];
  for(let i=0;i<page.length;i+=1){
    for(let j=i+1;j<page.length;j+=1){
      const a=page[i],b=page[j];
      if(a.tier>b.tier){
        violations.push({above:a.normalized,below:b.normalized,reason:'worse_tier_above_better_tier'});
      }else if(a.tier===b.tier&&b.evidence.phonetic-a.evidence.phonetic>nearTieBand){
        violations.push({
          above:a.normalized,
          below:b.normalized,
          reason:'outside_phonetic_near_tie_band',
          delta:Number((b.evidence.phonetic-a.evidence.phonetic).toFixed(6)),
        });
      }
    }
  }
  return violations;
}
