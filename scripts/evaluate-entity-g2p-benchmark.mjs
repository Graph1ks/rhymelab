#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { analyzeEnglishPronunciation } from './english-phonology.mjs';
import { scoreEnglishRhymeAnalyses } from './english-rhyme-features.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const benchmarkPath=resolve(
  argValue('--benchmark','data/local/entity-g2p-proper-name-benchmark-v2.json')
);
const predictionPath=argValue('--predictions');
const candidateId=String(argValue('--candidate','candidate')).trim();
const outPath=resolve(
  argValue('--out',`data/local/entity-g2p-${candidateId}-evaluation-v2.json`)
);
const modelId=argValue('--model-id',null);
const modelVersion=argValue('--model-version',null);
const modelInspectVersion=argValue('--model-inspect-version',null);
const modelInspectFingerprint=argValue('--model-inspect-fingerprint',null);
const engineVersion=argValue('--engine-version',null);
const modelInputEligible=Number.parseInt(argValue('--model-input-eligible','0'),10)||0;
const modelInputIneligible=Number.parseInt(argValue('--model-input-ineligible','0'),10)||0;
const modelInputCollisions=Number.parseInt(argValue('--model-input-collisions','0'),10)||0;
const eligiblePredictionCoveragePct=Number(
  argValue('--eligible-prediction-coverage-pct','0')
)||0;
const diacriticFoldCases=Number.parseInt(argValue('--diacritic-fold-cases','0'),10)||0;
if(!predictionPath) throw new Error('--predictions <tsv> is required');

const benchmark=JSON.parse(await readFile(benchmarkPath,'utf8'));
const lines=(await readFile(resolve(predictionPath),'utf8'))
  .split(/\r?\n/u)
  .filter(Boolean);
const predictions=new Map();
for(const line of lines){
  if(line.startsWith('case_id\t')) continue;
  const [caseId,notation,...rest]=line.split('\t');
  const pronunciation=rest.join('\t').trim();
  if(!caseId||!notation||!pronunciation) continue;
  predictions.set(caseId,{notation,pronunciation});
}

function analyze(value,notation){
  return analyzeEnglishPronunciation(value,{
    notation,
    locale:'en-US',
    source:`entity_g2p_benchmark_${candidateId}`,
  });
}
function phoneKey(analysis){
  return String(analysis.canonicalPhonemes||'');
}

let missing=0;
let invalid=0;
let evaluated=0;
let exactPhones=0;
let exactTail=0;
let syllable=0;
let stress=0;
let primaryStress=0;
let scoreSum=0;
const failures=[];

for(const testCase of benchmark.cases||[]){
  const prediction=predictions.get(testCase.case_id);
  if(!prediction){
    missing+=1;
    continue;
  }
  let predicted;
  try{ predicted=analyze(prediction.pronunciation,prediction.notation); }
  catch(error){
    invalid+=1;
    if(failures.length<30){
      failures.push({
        case_id:testCase.case_id,
        surface:testCase.surface,
        failure:'invalid_prediction',
        message:error instanceof Error?error.message:String(error),
      });
    }
    continue;
  }

  const references=[];
  for(const ref of testCase.references||[]){
    try{ references.push(analyze(ref.pronunciation,ref.notation)); }
    catch{}
  }
  if(!references.length){
    invalid+=1;
    continue;
  }

  let best=null;
  for(const reference of references){
    const score=scoreEnglishRhymeAnalyses(reference,predicted);
    const row={
      reference,
      score,
      exactPhones:phoneKey(reference)===phoneKey(predicted),
      exactTail:reference.exactTailKey===predicted.exactTailKey,
      syllable:reference.syllableCount===predicted.syllableCount,
      stress:reference.stressPattern===predicted.stressPattern,
      primaryStress:
        reference.primaryStressSyllable===predicted.primaryStressSyllable,
    };
    if(
      !best
      ||Number(row.score.overall)>Number(best.score.overall)
      ||(
        Number(row.score.overall)===Number(best.score.overall)
        &&Number(row.exactPhones)>Number(best.exactPhones)
      )
    ) best=row;
  }

  evaluated+=1;
  if(best.exactPhones) exactPhones+=1;
  if(best.exactTail) exactTail+=1;
  if(best.syllable) syllable+=1;
  if(best.stress) stress+=1;
  if(best.primaryStress) primaryStress+=1;
  scoreSum+=Number(best.score.overall||0);

  if(
    failures.length<30
    &&(!best.exactTail||!best.syllable||!best.stress)
  ){
    failures.push({
      case_id:testCase.case_id,
      surface:testCase.surface,
      predicted:prediction,
      best_reference_score:Number(best.score.overall.toFixed(4)),
      exact_phones:best.exactPhones,
      exact_tail:best.exactTail,
      syllable_match:best.syllable,
      stress_match:best.stress,
    });
  }
}

function pct(n,d){return d?Math.round(n*10000/d)/100:0;}
const evidence={
  schema:'rhymelab-entity-g2p-candidate-evaluation-v2',
  candidate:candidateId,
  candidate_metadata:{
    model_id:modelId,
    public_model_version:modelVersion,
    inspect_reported_version:modelInspectVersion,
    inspect_fingerprint:modelInspectFingerprint,
    engine_version:engineVersion,
    model_input:{
      eligible_cases:modelInputEligible,
      ineligible_cases:modelInputIneligible,
      collisions:modelInputCollisions,
      eligible_prediction_coverage_pct:eligiblePredictionCoveragePct,
      diacritic_fold_cases:diacriticFoldCases,
    },
  },
  benchmark_schema:benchmark.schema||null,
  benchmark_fingerprint:benchmark.semantic_fingerprint||null,
  benchmark_cases:(benchmark.cases||[]).length,
  prediction_rows:predictions.size,
  evaluated,
  missing,
  invalid,
  metrics:{
    exact_phone_pct:pct(exactPhones,evaluated),
    exact_tail_pct:pct(exactTail,evaluated),
    syllable_count_pct:pct(syllable,evaluated),
    stress_pattern_pct:pct(stress,evaluated),
    primary_stress_pct:pct(primaryStress,evaluated),
    mean_rhyme_score:evaluated
      ?Number((scoreSum/evaluated).toFixed(6))
      :0,
  },
  failure_sample:failures,
  decision_boundary:{
    runtime_promoted:false,
    generated_pronunciations_persisted:false,
    purpose:'proper-name token G2P benchmark evidence only',
  },
};
const fingerprint=createHash('sha256')
  .update(JSON.stringify(evidence))
  .digest('hex');
const report={...evidence,semantic_fingerprint:fingerprint};
await mkdir(dirname(outPath),{recursive:true});
await writeFile(outPath,JSON.stringify(report,null,2)+'\n');

console.log('\nENTITY PROPER-NAME G2P CANDIDATE EVALUATION');
console.log(JSON.stringify({
  candidate:candidateId,
  evaluated,
  missing,
  invalid,
  metrics:report.metrics,
  semantic_fingerprint:fingerprint,
  report:outPath,
},null,2));
