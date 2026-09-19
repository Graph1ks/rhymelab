function pct(n,d){return d?Math.round(n*10000/d)/100:0;}

export function hasFiniteG2pScore(value){
  return value!==null
    &&value!==''
    &&value!==undefined
    &&Number.isFinite(Number(value));
}

function metrics(rows){
  const total=rows.length;
  const scoreSum=rows.reduce((sum,row)=>sum+Number(row.rhyme_score||0),0);
  return {
    retained:total,
    exact_phone_pct:pct(rows.filter((row)=>row.exact_phones).length,total),
    exact_tail_pct:pct(rows.filter((row)=>row.exact_tail).length,total),
    syllable_count_pct:pct(rows.filter((row)=>row.syllable_match).length,total),
    stress_pattern_pct:pct(rows.filter((row)=>row.stress_match).length,total),
    primary_stress_pct:pct(rows.filter((row)=>row.primary_stress_match).length,total),
    mean_rhyme_score:total?Number((scoreSum/total).toFixed(6)):0,
  };
}

export function buildG2pScoreCalibration(
  outcomes,
  {
    retentionFractions=[0.1,0.25,0.5,0.75,0.9,1],
  }={},
){
  const scored=outcomes
    .filter((row)=>hasFiniteG2pScore(row.g2p_score))
    .map((row)=>({...row,g2p_score:Number(row.g2p_score)}))
    .sort((a,b)=>a.g2p_score-b.g2p_score||String(a.case_id).localeCompare(String(b.case_id),'en'));

  const points=[];
  for(const fraction of retentionFractions){
    if(!scored.length) break;
    const index=Math.max(0,Math.ceil(scored.length*fraction)-1);
    const threshold=scored[index].g2p_score;
    const selected=scored.filter((row)=>row.g2p_score<=threshold);
    points.push({
      target_retention_pct:Number((fraction*100).toFixed(2)),
      score_threshold_max:threshold,
      retained_pct_of_scored:pct(selected.length,scored.length),
      ...metrics(selected),
    });
  }

  const uniqueThresholds=[...new Set(scored.map((row)=>row.g2p_score))];
  let best90=null;
  let best85=null;
  for(const threshold of uniqueThresholds){
    const selected=scored.filter((row)=>row.g2p_score<=threshold);
    const m=metrics(selected);
    const row={
      score_threshold_max:threshold,
      retained_pct_of_scored:pct(selected.length,scored.length),
      ...m,
    };
    if(m.exact_tail_pct>=90 && (!best90||row.retained>best90.retained)) best90=row;
    if(m.exact_tail_pct>=85 && (!best85||row.retained>best85.retained)) best85=row;
  }

  return {
    score_direction:'lower_is_better',
    scored_cases:scored.length,
    score_min:scored.length?scored[0].g2p_score:null,
    score_max:scored.length?scored.at(-1).g2p_score:null,
    retention_points:points,
    max_retention_at_exact_tail_90pct:best90,
    max_retention_at_exact_tail_85pct:best85,
  };
}
