export const ENGLISH_WRITER_RANKING_V2_POLICY='en-writer-ranking-v2-candidate';

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
    unknown_usage_penalty:0,
    near_tie_band:0,
  }),
  Object.freeze({
    id:'guarded_commonness_06',
    phonetic:0.80,
    syllable:0.14,
    commonness:0.06,
    unknown_usage_penalty:0.015,
    near_tie_band:0.03,
  }),
  Object.freeze({
    id:'guarded_commonness_10',
    phonetic:0.76,
    syllable:0.14,
    commonness:0.10,
    unknown_usage_penalty:0.020,
    near_tie_band:0.03,
  }),
  Object.freeze({
    id:'guarded_commonness_14',
    phonetic:0.72,
    syllable:0.14,
    commonness:0.14,
    unknown_usage_penalty:0.025,
    near_tie_band:0.03,
  }),
]);

export const ENGLISH_DIVERSITY_WEIGHTS=Object.freeze([0,0.08,0.12,0.16,0.20]);

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

export function hasUsageEvidence(zipf,rank){
  return (zipf!==null&&zipf!==undefined&&Number.isFinite(Number(zipf)))
    ||(rank!==null&&rank!==undefined&&Number.isFinite(Number(rank))&&Number(rank)>0);
}

export function commonnessUtility(zipf,rank){
  if(zipf!==null&&zipf!==undefined&&Number.isFinite(Number(zipf))){
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
    ?Math.min(...relationTypes.map((type)=>ENGLISH_RHYME_TIER[type]??99))
    :99;
}

export function qualityEvidence(candidate,queryNormalized,config){
  const phonetic=clamp01(candidate?.score?.overall);
  const syllable=clamp01(candidate?.score?.syllable);
  const commonness=commonnessUtility(candidate.wordfreq_zipf,candidate.wordfreq_rank);
  const usage_known=hasUsageEvidence(candidate.wordfreq_zipf,candidate.wordfreq_rank);
  const lexical_overlap=lexicalSimilarity(queryNormalized,candidate.normalized);
  const usage_uncertainty_penalty=usage_known?0:Number(config.unknown_usage_penalty||0);
  const utility=
    Number(config.phonetic||0)*phonetic
    +Number(config.syllable||0)*syllable
    +Number(config.commonness||0)*commonness
    -usage_uncertainty_penalty;
  return {
    phonetic,
    syllable,
    commonness,
    usage_known,
    lexical_overlap,
    usage_uncertainty_penalty,
    utility:Number(utility.toFixed(8)),
  };
}

function stableTie(a,b){
  return Number(b.evidence.utility)-Number(a.evidence.utility)
    ||Number(b.evidence.phonetic)-Number(a.evidence.phonetic)
    ||Number(Boolean(b.evidence.usage_known))-Number(Boolean(a.evidence.usage_known))
    ||Number(a.wordfreq_rank??Number.MAX_SAFE_INTEGER)-Number(b.wordfreq_rank??Number.MAX_SAFE_INTEGER)
    ||Number(a.pronunciation_id??Number.MAX_SAFE_INTEGER)-Number(b.pronunciation_id??Number.MAX_SAFE_INTEGER)
    ||String(a.normalized).localeCompare(String(b.normalized),'en');
}

export function rankQualityRows(rows,config){
  const band=Math.max(0,Number(config.near_tie_band||0));
  const sorted=[...rows].sort((a,b)=>
    Number(a.tier)-Number(b.tier)
    ||Number(b.evidence.phonetic)-Number(a.evidence.phonetic)
    ||Number(a.pronunciation_id??Number.MAX_SAFE_INTEGER)-Number(b.pronunciation_id??Number.MAX_SAFE_INTEGER)
    ||String(a.normalized).localeCompare(String(b.normalized),'en')
  );
  const ranked=[];
  let index=0;
  let bandId=0;
  while(index<sorted.length){
    const tier=sorted[index].tier;
    const tierRows=[];
    while(index<sorted.length&&sorted[index].tier===tier){
      tierRows.push(sorted[index]);
      index+=1;
    }
    let offset=0;
    while(offset<tierRows.length){
      const anchor=Number(tierRows[offset].evidence.phonetic);
      const group=[];
      while(
        offset<tierRows.length
        &&anchor-Number(tierRows[offset].evidence.phonetic)<=band+1e-12
      ){
        group.push(tierRows[offset]);
        offset+=1;
      }
      group.sort(stableTie);
      for(const row of group){
        ranked.push({
          ...row,
          quality_band:bandId,
          quality_band_anchor:Number(anchor.toFixed(8)),
        });
      }
      bandId+=1;
    }
  }
  return ranked;
}

function lemmaSet(row){
  return new Set(parseJsonArray(row.lemmas).map((item)=>String(item).toLocaleLowerCase('en-US')));
}

function preparedRedundancyState(row){
  const normalized=String(row?.normalized||'');
  return {
    row,
    normalized,
    lemmas:lemmaSet(row),
    bigrams:bigrams(normalized),
    maxRedundancy:0,
  };
}

function lexicalSimilarityPrepared(a,b){
  if(!a.normalized||!b.normalized) return 0;
  if(a.normalized===b.normalized) return 1;
  if(!a.bigrams.size||!b.bigrams.size) return 0;
  let overlap=0;
  const smaller=a.bigrams.size<=b.bigrams.size?a.bigrams:b.bigrams;
  const larger=smaller===a.bigrams?b.bigrams:a.bigrams;
  for(const item of smaller) if(larger.has(item)) overlap+=1;
  return clamp01((2*overlap)/(a.bigrams.size+b.bigrams.size));
}

function candidateRedundancyPrepared(a,b){
  if(a.normalized===b.normalized) return 1;
  const smaller=a.lemmas.size<=b.lemmas.size?a.lemmas:b.lemmas;
  const larger=smaller===a.lemmas?b.lemmas:a.lemmas;
  for(const lemma of smaller) if(larger.has(lemma)) return 0.95;

  const lexical=lexicalSimilarityPrepared(a,b);
  const max=Math.max(a.normalized.length,b.normalized.length,1);
  let prefixLength=0;
  const prefixLimit=Math.min(a.normalized.length,b.normalized.length);
  while(
    prefixLength<prefixLimit
    &&a.normalized[prefixLength]===b.normalized[prefixLength]
  ) prefixLength+=1;
  return clamp01(Math.max(lexical,(prefixLength/max)*0.9));
}

export function candidateRedundancy(a,b){
  return candidateRedundancyPrepared(
    preparedRedundancyState(a),
    preparedRedundancyState(b),
  );
}

export function diversifyRanked(rows,{weight=0.12,limit=20}={}){
  const diversityWeight=Number(weight||0);
  const remaining=(rows||[]).map(preparedRedundancyState);
  const selected=[];

  while(remaining.length&&selected.length<limit){
    const base=remaining[0].row;
    let bestIndex=0;
    let bestScore=-Infinity;

    for(let i=0;i<remaining.length;i+=1){
      const candidate=remaining[i];
      const row=candidate.row;
      if(row.tier!==base.tier||row.quality_band!==base.quality_band) break;
      const diversifiedScore=row.evidence.utility-diversityWeight*candidate.maxRedundancy;
      if(
        diversifiedScore>bestScore
        ||(
          diversifiedScore===bestScore
          &&stableTie(row,remaining[bestIndex].row)<0
        )
      ){
        bestScore=diversifiedScore;
        bestIndex=i;
      }
    }

    const [picked]=remaining.splice(bestIndex,1);
    const pickedRow=picked.row;
    selected.push({
      ...pickedRow,
      max_redundancy:Number(picked.maxRedundancy.toFixed(6)),
      diversified_score:Number(
        (pickedRow.evidence.utility-diversityWeight*picked.maxRedundancy).toFixed(8)
      ),
    });

    // Each candidate/picked pair is evaluated exactly once. This preserves the
    // original greedy objective while avoiding repeated work against the full
    // selected prefix on every selection round.
    for(const candidate of remaining){
      const redundancy=candidateRedundancyPrepared(candidate,picked);
      if(redundancy>candidate.maxRedundancy){
        candidate.maxRedundancy=redundancy;
      }
    }
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
    if(!row.evidence?.usage_known) unranked+=1;
    if(Number(row.evidence?.lexical_overlap||0)>=0.65) highOverlap+=1;
    const ls=lemmaSet(row);
    let repeat=false;
    for(const lemma of ls){
      if((lemmas.get(lemma)||0)>0) repeat=true;
      lemmas.set(lemma,(lemmas.get(lemma)||0)+1);
    }
    if(repeat) repeatedLemmaRows+=1;
    if(page.slice(0,i).some((other)=>lexicalSimilarity(row.normalized,other.normalized)>=0.80)){
      nearDuplicates+=1;
    }
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
      }else if(
        a.tier===b.tier
        &&Number.isInteger(a.quality_band)
        &&Number.isInteger(b.quality_band)
        &&a.quality_band>b.quality_band
      ){
        violations.push({above:a.normalized,below:b.normalized,reason:'quality_band_order'});
      }else if(
        a.tier===b.tier
        &&a.quality_band===b.quality_band
        &&Math.abs(Number(a.evidence.phonetic)-Number(b.evidence.phonetic))>nearTieBand+1e-12
      ){
        violations.push({
          above:a.normalized,
          below:b.normalized,
          reason:'quality_band_too_wide',
          delta:Number(Math.abs(Number(a.evidence.phonetic)-Number(b.evidence.phonetic)).toFixed(6)),
        });
      }
    }
  }
  return violations;
}
