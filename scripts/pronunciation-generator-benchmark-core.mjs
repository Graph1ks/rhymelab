export function pct(n,d){return d?Number((Number(n)*100/Number(d)).toFixed(2)):0;}

export function percentile(values,p){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*p)));
  return Number(sorted[index].toFixed(3));
}

export function compareAnalyses(left,right,scoreAnalyses){
  if(!left||!right)return null;
  const score=scoreAnalyses(left,right);
  return {
    exact_phones:String(left.canonicalPhonemes||'')===String(right.canonicalPhonemes||''),
    exact_tail:String(left.exactTailKey||'')===String(right.exactTailKey||''),
    syllable_count:Number(left.syllableCount||0)===Number(right.syllableCount||0),
    stress_pattern:String(left.stressPattern||'')===String(right.stressPattern||''),
    primary_stress:Number(left.primaryStressSyllable||0)===Number(right.primaryStressSyllable||0),
    rhyme_score:Number(Number(score?.overall||0).toFixed(6)),
  };
}

export function createAgreementStats(){
  return {cases:0,espeak_accepted:0,client_accepted:0,both_accepted:0,exact_phones:0,exact_tail:0,syllable_count:0,stress_pattern:0,primary_stress:0,rhyme_score_sum:0};
}

export function addAgreement(stats,{espeakAccepted,clientAccepted,comparison}){
  stats.cases+=1;
  if(espeakAccepted)stats.espeak_accepted+=1;
  if(clientAccepted)stats.client_accepted+=1;
  if(!comparison)return;
  stats.both_accepted+=1;
  for(const key of ['exact_phones','exact_tail','syllable_count','stress_pattern','primary_stress']){
    if(comparison[key])stats[key]+=1;
  }
  stats.rhyme_score_sum+=Number(comparison.rhyme_score||0);
}

export function finalizeAgreement(stats){
  return {
    cases:stats.cases,
    espeak_coverage_pct:pct(stats.espeak_accepted,stats.cases),
    client_coverage_pct:pct(stats.client_accepted,stats.cases),
    both_accepted:stats.both_accepted,
    exact_phone_agreement_pct:pct(stats.exact_phones,stats.both_accepted),
    exact_tail_agreement_pct:pct(stats.exact_tail,stats.both_accepted),
    syllable_count_agreement_pct:pct(stats.syllable_count,stats.both_accepted),
    stress_pattern_agreement_pct:pct(stats.stress_pattern,stats.both_accepted),
    primary_stress_agreement_pct:pct(stats.primary_stress,stats.both_accepted),
    mean_mutual_rhyme_score:stats.both_accepted?Number((stats.rhyme_score_sum/stats.both_accepted).toFixed(6)):0,
  };
}

export function createGoldStats(){
  return {cases:0,predicted:0,evaluated:0,exact_phones:0,exact_tail:0,syllable_count:0,stress_pattern:0,primary_stress:0,rhyme_score_sum:0};
}

export function addGold(stats,best){
  stats.cases+=1;
  if(!best)return;
  stats.predicted+=1;
  stats.evaluated+=1;
  if(best.exactPhones)stats.exact_phones+=1;
  if(best.exactTail)stats.exact_tail+=1;
  if(best.syllable)stats.syllable_count+=1;
  if(best.stress)stats.stress_pattern+=1;
  if(best.primaryStress)stats.primary_stress+=1;
  stats.rhyme_score_sum+=Number(best.score?.overall||0);
}

export function finalizeGold(stats){
  return {
    cases:stats.cases,
    prediction_coverage_pct:pct(stats.predicted,stats.cases),
    evaluated:stats.evaluated,
    exact_phone_pct:pct(stats.exact_phones,stats.evaluated),
    exact_tail_pct:pct(stats.exact_tail,stats.evaluated),
    syllable_count_pct:pct(stats.syllable_count,stats.evaluated),
    stress_pattern_pct:pct(stats.stress_pattern,stats.evaluated),
    primary_stress_pct:pct(stats.primary_stress,stats.evaluated),
    mean_rhyme_score:stats.evaluated?Number((stats.rhyme_score_sum/stats.evaluated).toFixed(6)):0,
  };
}
