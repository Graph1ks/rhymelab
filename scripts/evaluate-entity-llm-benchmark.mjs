#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { analyzeEnglishPronunciation } from './english-phonology.mjs';
import { scoreEnglishRhymeAnalyses } from './english-rhyme-features.mjs';
import {
  analyzeEntityAiArpabet,
  parseTsv,
} from './entity-ai-pronunciation-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const benchmarkPath=resolve(
  argValue('--benchmark','data/local/entity-g2p-proper-name-benchmark-v2.json')
);
const resultPath=argValue('--results');
if(!resultPath) throw new Error('--results <tsv> is required');
const candidate=String(argValue('--candidate','chatgpt-llm-only')).trim();
const outPath=resolve(
  argValue('--out',`data/local/entity-llm-${candidate}-evaluation-v1.json`)
);

const [benchmark,resultText]=await Promise.all([
  readFile(benchmarkPath,'utf8').then(JSON.parse),
  readFile(resolve(resultPath),'utf8'),
]);

const parsed=parseTsv(resultText);
const index=Object.fromEntries(parsed.header.map((name,i)=>[name,i]));
const caseColumn=index.case_id??index.id;
const arpColumn=index.arpabet??index.arp;
const confidenceColumn=index.confidence??index.q;
const statusColumn=index.status??index.f;
if(caseColumn==null||arpColumn==null){
  throw new Error('Result TSV requires case_id/id and arpabet/arp columns');
}

function normalizeConfidence(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return null;
  if(n>=0&&n<=1) return Math.round(n*100);
  if(n>=0&&n<=99) return Math.round(n);
  return null;
}
function normalizeStatus(value){
  const raw=String(value??'').trim().toLocaleLowerCase('en-US');
  if(raw==='c'||raw==='confident') return 'C';
  if(raw==='a'||raw==='ambiguous') return 'A';
  if(raw==='u'||raw==='unknown') return 'U';
  return null;
}

const predictions=new Map();
const parseErrors=[];
for(const {line,values} of parsed.rows){
  const caseId=String(values[caseColumn]||'').trim();
  if(!caseId) continue;
  if(predictions.has(caseId)){
    parseErrors.push({line,case_id:caseId,error:'duplicate_case_id'});
    continue;
  }
  const arpabet=String(values[arpColumn]||'').trim();
  const q=confidenceColumn==null?null:normalizeConfidence(values[confidenceColumn]);
  const status=statusColumn==null?null:normalizeStatus(values[statusColumn]);
  predictions.set(caseId,{arpabet,q,status});
}

function analyzeReference(ref){
  return analyzeEnglishPronunciation(ref.pronunciation,{
    notation:ref.notation,
    locale:'en-US',
    source:`entity_llm_benchmark_${candidate}`,
  });
}
function pct(n,d){return d?Math.round(n*10000/d)/100:0;}

let missing=0;
let invalid=0;
let evaluated=0;
let exactPhones=0;
let exactTail=0;
let syllable=0;
let stress=0;
let primaryStress=0;
let scoreSum=0;
const outcomes=[];
const failures=[];

for(const testCase of benchmark.cases||[]){
  const prediction=predictions.get(testCase.case_id);
  if(!prediction||prediction.status==='U'||!prediction.arpabet){
    missing+=1;
    continue;
  }

  let predicted;
  try{
    predicted=analyzeEntityAiArpabet(prediction.arpabet).analysis;
  }catch(error){
    invalid+=1;
    if(failures.length<50){
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
    try{references.push(analyzeReference(ref));}catch{}
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
      exactPhones:reference.canonicalPhonemes===predicted.canonicalPhonemes,
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
  exactPhones+=best.exactPhones?1:0;
  exactTail+=best.exactTail?1:0;
  syllable+=best.syllable?1:0;
  stress+=best.stress?1:0;
  primaryStress+=best.primaryStress?1:0;
  scoreSum+=Number(best.score.overall||0);
  const outcome={
    case_id:testCase.case_id,
    surface:testCase.surface,
    confidence:prediction.q,
    status:prediction.status,
    exact_phones:best.exactPhones,
    exact_tail:best.exactTail,
    syllable_match:best.syllable,
    stress_match:best.stress,
    primary_stress_match:best.primaryStress,
    rhyme_score:Number(best.score.overall||0),
  };
  outcomes.push(outcome);
  if(
    failures.length<50
    &&(!best.exactTail||!best.exactPhones||!best.syllable||!best.stress)
  ){
    failures.push({
      ...outcome,
      predicted_arpabet:prediction.arpabet,
    });
  }
}

function quality(rows){
  const d=rows.length;
  return {
    retained:d,
    exact_phone_pct:pct(rows.filter((r)=>r.exact_phones).length,d),
    exact_tail_pct:pct(rows.filter((r)=>r.exact_tail).length,d),
    syllable_count_pct:pct(rows.filter((r)=>r.syllable_match).length,d),
    stress_pattern_pct:pct(rows.filter((r)=>r.stress_match).length,d),
    primary_stress_pct:pct(rows.filter((r)=>r.primary_stress_match).length,d),
    mean_rhyme_score:d
      ?Number((rows.reduce((sum,r)=>sum+r.rhyme_score,0)/d).toFixed(6))
      :0,
  };
}

const confidenceThresholds=[99,95,90,80,50].map((threshold)=>{
  const rows=outcomes.filter((row)=>
    row.confidence!=null&&row.confidence>=threshold&&row.status!=='U'
  );
  return {
    threshold,
    ...quality(rows),
    retained_pct:pct(rows.length,evaluated),
  };
});
const statusQuality=Object.fromEntries(
  ['C','A'].map((flag)=>[flag,quality(outcomes.filter((row)=>row.status===flag))])
);

const evidence={
  schema:'rhymelab-entity-llm-pronunciation-benchmark-evaluation-v1',
  candidate,
  generation_contract:'llm_internal_knowledge_only_no_external_pronunciation_tools',
  benchmark_schema:benchmark.schema||null,
  benchmark_fingerprint:benchmark.semantic_fingerprint||null,
  benchmark_status:benchmark.status||null,
  benchmark_cases:(benchmark.cases||[]).length,
  prediction_rows:predictions.size,
  evaluated,
  missing,
  invalid,
  parse_errors:parseErrors,
  metrics:quality(outcomes),
  confidence:{
    direction:'higher_is_better',
    thresholds:confidenceThresholds,
    by_status:statusQuality,
  },
  failure_sample:failures,
  decision_boundary:{
    runtime_promoted:false,
    persisted_as_source_truth:false,
    purpose:'offline external-model reference evidence',
  },
};
const fingerprint=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
const report={...evidence,semantic_fingerprint:fingerprint};
await mkdir(dirname(outPath),{recursive:true});
await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({
  candidate,
  evaluated,
  missing,
  invalid,
  metrics:report.metrics,
  semantic_fingerprint:fingerprint,
  report:outPath,
},null,2));
