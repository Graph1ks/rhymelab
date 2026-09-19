#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { getPhonologyProfile } from './phonology-profiles.mjs';
import {
  QUERY_PRONUNCIATION_GOLD_REPORT_SCHEMA,
  QUERY_PRONUNCIATION_GOLD_SAMPLE_SCHEMA,
  evaluateAgainstReferences,
  pct,
} from './query-pronunciation-gold-core.mjs';
import { inspectEspeakQueryPronunciation } from './query-pronunciation-espeak-adapter.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const samplePath=resolve(argValue('--sample','data/local/query-pronunciation-gold-sample-v1.json'));
const outPath=resolve(argValue('--out','data/local/query-pronunciation-espeak-gold-report-v1.json'));
const command=argValue('--command',process.env.RHYMELAB_ESPEAK_COMMAND||null);

await mkdir(dirname(outPath),{recursive:true});
const sample=JSON.parse(await readFile(samplePath,'utf8'));
if(sample.schema!==QUERY_PRONUNCIATION_GOLD_SAMPLE_SCHEMA){
  throw new Error(`Unexpected gold sample schema: ${sample.schema||'missing'}`);
}

function referenceAnalysis(reference,language){
  const profile=getPhonologyProfile(language);
  if(language==='de') return profile.analyzeIpa(reference.pronunciation);
  return profile.analyzePronunciation(reference.pronunciation,{
    notation:reference.notation,
    locale:'en-US',
    source:reference.source||'query_pronunciation_gold_control',
  });
}
function createStats(){
  return {
    cases:0,
    predicted:0,
    evaluated:0,
    unavailable:0,
    invalid_reference_cases:0,
    exact_phones:0,
    exact_tail:0,
    syllable_count:0,
    stress_pattern:0,
    primary_stress:0,
    rhyme_score_sum:0,
  };
}
function finalizeStats(stats){
  return {
    cases:stats.cases,
    predicted:stats.predicted,
    evaluated:stats.evaluated,
    unavailable:stats.unavailable,
    invalid_reference_cases:stats.invalid_reference_cases,
    prediction_coverage_pct:pct(stats.predicted,stats.cases),
    exact_phone_pct:pct(stats.exact_phones,stats.evaluated),
    exact_tail_pct:pct(stats.exact_tail,stats.evaluated),
    syllable_count_pct:pct(stats.syllable_count,stats.evaluated),
    stress_pattern_pct:pct(stats.stress_pattern,stats.evaluated),
    primary_stress_pct:pct(stats.primary_stress,stats.evaluated),
    mean_rhyme_score:stats.evaluated
      ?Number((stats.rhyme_score_sum/stats.evaluated).toFixed(6))
      :0,
  };
}
function keyFor(row){return `${row.language}|${row.syllable_bucket}`;}

const aggregate=createStats();
const groupStats=new Map();
const latencies=[];
const outcomes=[];
const failures=[];
let engineCommand=null;
let engineVersion=null;

for(const row of sample.cases||[]){
  aggregate.cases+=1;
  const group=groupStats.get(keyFor(row))||createStats();
  group.cases+=1;
  groupStats.set(keyFor(row),group);

  const started=performance.now();
  const inspected=inspectEspeakQueryPronunciation(row.surface,row.language,{command});
  const elapsedMs=performance.now()-started;
  latencies.push(elapsedMs);
  engineCommand??=inspected.engineCommand||null;
  engineVersion??=inspected.engineVersion||null;

  if(inspected.status!=='accepted'){
    aggregate.unavailable+=1;
    group.unavailable+=1;
    failures.push({
      case_id:row.case_id,
      language:row.language,
      surface:row.surface,
      syllable_bucket:row.syllable_bucket,
      status:inspected.status,
      raw_ipa:inspected.rawIpa||null,
      normalized_ipa:inspected.ipa||null,
      analyzer_error:inspected.analyzerError||null,
      elapsed_ms:Number(elapsedMs.toFixed(3)),
    });
    continue;
  }
  aggregate.predicted+=1;
  group.predicted+=1;

  const references=[];
  for(const reference of row.references||[]){
    try{references.push(referenceAnalysis(reference,row.language));}
    catch{}
  }
  if(!references.length){
    aggregate.invalid_reference_cases+=1;
    group.invalid_reference_cases+=1;
    failures.push({
      case_id:row.case_id,
      language:row.language,
      surface:row.surface,
      syllable_bucket:row.syllable_bucket,
      status:'invalid_reference_controls',
      elapsed_ms:Number(elapsedMs.toFixed(3)),
    });
    continue;
  }

  const profile=getPhonologyProfile(row.language);
  const best=evaluateAgainstReferences(
    inspected.analysis,
    references,
    profile.scoreAnalyses,
  );
  const rhymeScore=Number(best.score?.overall||0);
  aggregate.evaluated+=1;
  group.evaluated+=1;
  aggregate.exact_phones+=best.exactPhones?1:0;
  group.exact_phones+=best.exactPhones?1:0;
  aggregate.exact_tail+=best.exactTail?1:0;
  group.exact_tail+=best.exactTail?1:0;
  aggregate.syllable_count+=best.syllable?1:0;
  group.syllable_count+=best.syllable?1:0;
  aggregate.stress_pattern+=best.stress?1:0;
  group.stress_pattern+=best.stress?1:0;
  aggregate.primary_stress+=best.primaryStress?1:0;
  group.primary_stress+=best.primaryStress?1:0;
  aggregate.rhyme_score_sum+=rhymeScore;
  group.rhyme_score_sum+=rhymeScore;

  outcomes.push({
    case_id:row.case_id,
    language:row.language,
    surface:row.surface,
    normalized:row.normalized,
    syllable_bucket:row.syllable_bucket,
    reference_count:references.length,
    raw_ipa:inspected.rawIpa||null,
    ipa:inspected.ipa,
    normalization_changed:(inspected.rawIpa||'')!==(inspected.ipa||''),
    exact_phones:best.exactPhones,
    exact_tail:best.exactTail,
    syllable_count_match:best.syllable,
    stress_pattern_match:best.stress,
    primary_stress_match:best.primaryStress,
    rhyme_score:Number(rhymeScore.toFixed(6)),
    predicted_syllable_count:Number(inspected.analysis.syllableCount||0),
    predicted_primary_stress:Number(inspected.analysis.primaryStressSyllable||0)||null,
    predicted_stress_pattern:inspected.analysis.stressPattern||null,
    predicted_exact_tail_key:inspected.analysis.exactTailKey||null,
    best_reference_syllable_count:Number(best.reference.syllableCount||0),
    best_reference_primary_stress:Number(best.reference.primaryStressSyllable||0)||null,
    best_reference_stress_pattern:best.reference.stressPattern||null,
    best_reference_exact_tail_key:best.reference.exactTailKey||null,
    elapsed_ms:Number(elapsedMs.toFixed(3)),
  });
}

const sortedLatency=[...latencies].sort((a,b)=>a-b);
function percentile(values,p){
  if(!values.length) return 0;
  const index=Math.min(values.length-1,Math.max(0,Math.floor((values.length-1)*p)));
  return Number(values[index].toFixed(3));
}
const byLanguage={};
const byBucket={};
for(const [key,stats] of groupStats.entries()){
  const [language,bucket]=key.split('|');
  byLanguage[language]??=createStats();
  const lang=byLanguage[language];
  for(const metric of Object.keys(lang)) lang[metric]+=Number(stats[metric]||0);
  byBucket[language]??={};
  byBucket[language][bucket]=finalizeStats(stats);
}
for(const language of Object.keys(byLanguage)){
  byLanguage[language]=finalizeStats(byLanguage[language]);
}

const evidence={
  schema:QUERY_PRONUNCIATION_GOLD_REPORT_SCHEMA,
  status:aggregate.evaluated===aggregate.cases?'complete':'partial',
  purpose:'Source-backed held-out lexical control benchmark for optional eSpeak-NG query pronunciation. This does not turn generated pronunciation into lexical truth.',
  source_sample_schema:sample.schema,
  source_sample_fingerprint:sample.semantic_fingerprint||null,
  candidate:{
    engine:'eSpeak-NG',
    command:engineCommand||command||'auto-detect',
    version:engineVersion,
    bundled:false,
    runtime_required:false,
  },
  metrics:finalizeStats(aggregate),
  by_language:byLanguage,
  by_syllable_bucket:byBucket,
  latency_ms:{
    p50:percentile(sortedLatency,0.5),
    p95:percentile(sortedLatency,0.95),
    max:sortedLatency.length?Number(sortedLatency.at(-1).toFixed(3)):0,
  },
  normalization_changed:outcomes.filter((row)=>row.normalization_changed).length,
  normalization_changed_pct:pct(
    outcomes.filter((row)=>row.normalization_changed).length,
    outcomes.length,
  ),
  failures,
  mismatch_sample:outcomes
    .filter((row)=>!row.exact_tail||!row.syllable_count_match||!row.stress_pattern_match)
    .slice(0,100),
  outcomes,
  decision_boundary:{
    automatic_runtime_promotion:false,
    generated_candidate_overlay_promoted:false,
    acceptance_threshold:null,
    interpretation:'quality evidence only; unresolved OOV rows still lack direct lexical gold',
  },
};
const semanticFingerprint=createHash('sha256')
  .update(JSON.stringify(evidence))
  .digest('hex');
const report={...evidence,semantic_fingerprint:semanticFingerprint};
await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');

console.log(JSON.stringify({
  schema:report.schema,
  status:report.status,
  metrics:report.metrics,
  by_language:report.by_language,
  latency_ms:report.latency_ms,
  normalization_changed:report.normalization_changed,
  normalization_changed_pct:report.normalization_changed_pct,
  semantic_fingerprint:semanticFingerprint,
  report:outPath,
},null,2));
