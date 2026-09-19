#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { normalizeEnglishSurface } from './en-writer-source-core.mjs';
import {
  requiresShell,
  resolveCondaTool,
} from './local-command-resolution.mjs';
import {
  inspectMfaEnglishUsArpa,
  prepareMfaEnglishUsArpaInput,
} from './mfa-model-inspect-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const benchmarkPath=resolve(
  argValue('--benchmark','data/local/entity-g2p-proper-name-benchmark-v2.json')
);
const inputPath=resolve(
  argValue('--input','data/local/entity-g2p-proper-name-benchmark-v2-input.tsv')
);
const workDir=resolve(
  argValue('--work-dir','data/work/entity/g2p-mfa-en-us-arpa-v2')
);
const predictionsPath=resolve(
  argValue('--predictions','data/local/entity-g2p-mfa-en-us-arpa-predictions-v2.tsv')
);
const evaluationPath=resolve(
  argValue('--out','data/local/entity-g2p-mfa-en-us-arpa-evaluation-v2.json')
);
const mfaCommand=resolveCondaTool('mfa',{
  explicit:argValue('--mfa',null),
});
const pythonCommand=resolveCondaTool('python');
const modelId='english_us_arpa';
const modelVersion='2.0.0a';

function run(command,commandArgs,{capture=false}={}){
  const result=spawnSync(command,commandArgs,{
    encoding:'utf8',
    stdio:capture?'pipe':'inherit',
    shell:requiresShell(command),
  });
  if(result.error) throw result.error;
  if(result.status!==0){
    const stderr=capture?String(result.stderr||'').trim():'';
    throw new Error(
      command+' '+commandArgs.join(' ')+' failed with exit code '+result.status
      +(stderr?'\n'+stderr:'')
    );
  }
  return capture?String(result.stdout||'').trim():'';
}

const benchmark=JSON.parse(await readFile(benchmarkPath,'utf8'));
if(benchmark.schema!=='rhymelab-entity-g2p-proper-name-token-benchmark-v2'){
  throw new Error(
    'Expected corrected proper-name token benchmark v2, got '
    +(benchmark.schema||'missing')
  );
}
if(benchmark.duplicate_normalized!==0){
  throw new Error('Benchmark v2 must contain zero duplicate normalized controls.');
}

const benchmarkCasesById=new Map(
  (benchmark.cases||[]).map((row)=>[row.case_id,row])
);
const inputLines=(await readFile(inputPath,'utf8'))
  .split(/\r?\n/u)
  .filter(Boolean);
const cases=[];
for(const line of inputLines){
  if(line.startsWith('case_id\t')) continue;
  const [caseId,...surfaceParts]=line.split('\t');
  const surface=surfaceParts.join('\t').trim();
  if(!caseId||!surface) continue;
  if(/\s/u.test(surface)){
    throw new Error(
      'MFA token benchmark received whitespace-containing surface for '
      +caseId+': '+surface
    );
  }
  const benchmarkCase=benchmarkCasesById.get(caseId);
  if(!benchmarkCase){
    throw new Error('Benchmark input TSV contains unknown case_id '+caseId);
  }
  cases.push({
    case_id:caseId,
    surface,
    normalized:String(
      benchmarkCase.normalized||normalizeEnglishSurface(surface)
    ),
  });
}
if(cases.length!==benchmark.actual_size){
  throw new Error(
    'Benchmark/input mismatch: JSON has '+benchmark.actual_size
    +', TSV has '+cases.length
  );
}

console.log('\nMFA PROPER-NAME TOKEN BENCHMARK: preflight…');
run(mfaCommand,['--help'],{capture:true});
const mfaVersion=run(
  pythonCommand,
  [
    '-c',
    "from importlib.metadata import version; print(version('montreal-forced-aligner'))",
  ],
  {capture:true},
);
const modelInspect=run(
  mfaCommand,
  ['model','inspect','g2p',modelId],
  {capture:true},
);
const modelIdentity=inspectMfaEnglishUsArpa(modelInspect);
if(!modelIdentity.valid){
  throw new Error(
    'MFA model '+modelId+' does not match the expected English US ARPA family.\n'
    +'Expected architecture=pynini, the complete 69-phone ARPA inventory, '
    +'and the 27 expected lowercase graphemes.\n'
    +'Install/reinstall with:\n'
    +'  mfa model download g2p '+modelId+' --version '+modelVersion+'\n'
    +'Then rerun this command.\n\nParsed identity:\n'
    +JSON.stringify(modelIdentity,null,2)
  );
}

const preparedCases=cases.map((row)=>({
  ...row,
  mfa_input:prepareMfaEnglishUsArpaInput(
    row.normalized,
    modelIdentity.graphemes,
  ),
}));
const eligibleCases=preparedCases.filter((row)=>row.mfa_input.eligible);
const ineligibleCases=preparedCases.filter((row)=>!row.mfa_input.eligible);
const normalizationCounts=new Map();
const modelInputCases=new Map();
for(const row of eligibleCases){
  const strategy=row.mfa_input.strategy;
  normalizationCounts.set(strategy,(normalizationCounts.get(strategy)||0)+1);
  const list=modelInputCases.get(row.mfa_input.model_input)||[];
  list.push(row.case_id);
  modelInputCases.set(row.mfa_input.model_input,list);
}
const modelInputCollisions=[...modelInputCases.values()]
  .filter((caseIds)=>caseIds.length>1);
const modelInputs=[...modelInputCases.keys()].sort((a,b)=>a.localeCompare(b,'en'));
const modelEligibilityPct=cases.length
  ?Number((eligibleCases.length*100/cases.length).toFixed(2))
  :0;
if(modelEligibilityPct<95){
  throw new Error(
    'MFA ARPA model-input eligibility is only '+modelEligibilityPct+'%. '
    +'Refusing to run a benchmark whose orthographies are mostly outside '
    +'the selected model family.\n\nSample ineligible cases:\n'
    +JSON.stringify(
      ineligibleCases.slice(0,20).map((row)=>({
        case_id:row.case_id,
        surface:row.surface,
        normalized:row.normalized,
        unsupported_graphemes:row.mfa_input.unsupported_graphemes,
      })),
      null,
      2,
    )
  );
}

await mkdir(workDir,{recursive:true});
await mkdir(dirname(predictionsPath),{recursive:true});
await mkdir(dirname(evaluationPath),{recursive:true});
const wordListPath=resolve(workDir,'words.txt');
const dictionaryPath=resolve(workDir,'generated.dict');
await rm(dictionaryPath,{force:true});
await writeFile(
  wordListPath,
  modelInputs.join('\n')+'\n',
);

console.log(JSON.stringify({
  mfa_command:mfaCommand,
  python_command:pythonCommand,
  conda_prefix:process.env.CONDA_PREFIX||null,
  mfa_version:mfaVersion,
  model:modelId,
  public_model_version:modelVersion,
  inspect_reported_version:modelIdentity.reported_version,
  inspect_architecture:modelIdentity.architecture,
  inspect_phone_count:modelIdentity.phone_count,
  inspect_grapheme_count:modelIdentity.grapheme_count,
  model_inspect_fingerprint:modelIdentity.inspect_fingerprint,
  benchmark_cases:cases.length,
  model_input_eligible_cases:eligibleCases.length,
  model_input_ineligible_cases:ineligibleCases.length,
  model_input_eligibility_pct:modelEligibilityPct,
  model_input_unique:modelInputs.length,
  model_input_collisions:modelInputCollisions.length,
  normalization_counts:Object.fromEntries(
    [...normalizationCounts.entries()].sort((a,b)=>a[0].localeCompare(b[0],'en'))
  ),
  ineligible_sample:ineligibleCases.slice(0,10).map((row)=>({
    case_id:row.case_id,
    surface:row.surface,
    unsupported_graphemes:row.mfa_input.unsupported_graphemes,
  })),
  word_list:wordListPath,
},null,2));

console.log('\nMFA PROPER-NAME TOKEN BENCHMARK: generate single-best pronunciations…');
run(mfaCommand,[
  'g2p',
  wordListPath,
  modelId,
  dictionaryPath,
  '--num_pronunciations','1',
]);

const generated=new Map();
for(const line of (await readFile(dictionaryPath,'utf8')).split(/\r?\n/u)){
  const trimmed=line.trim();
  if(!trimmed) continue;
  const parts=trimmed.split(/\s+/u);
  if(parts.length<2) continue;
  const surface=parts.shift();
  const normalized=normalizeEnglishSurface(surface);
  const pronunciation=parts.join(' ');
  if(normalized&&!generated.has(normalized)){
    generated.set(normalized,pronunciation);
  }
}

const predictionLines=['case_id\tnotation\tpronunciation'];
let generatedCases=0;
const missingEligibleCases=[];
for(const row of eligibleCases){
  const pronunciation=generated.get(row.mfa_input.model_input);
  if(!pronunciation){
    missingEligibleCases.push(row);
    continue;
  }
  predictionLines.push(
    row.case_id+'\tarpabet\t'+pronunciation
  );
  generatedCases+=1;
}
await writeFile(predictionsPath,predictionLines.join('\n')+'\n');

const eligiblePredictionCoveragePct=eligibleCases.length
  ?Number((generatedCases*100/eligibleCases.length).toFixed(2))
  :0;
console.log(JSON.stringify({
  generated_dictionary_rows:generated.size,
  mapped_prediction_rows:generatedCases,
  model_input_eligible_cases:eligibleCases.length,
  model_input_ineligible_cases:ineligibleCases.length,
  eligible_prediction_coverage_pct:eligiblePredictionCoveragePct,
  missing_eligible_prediction_rows:missingEligibleCases.length,
  missing_eligible_sample:missingEligibleCases.slice(0,20).map((row)=>({
    case_id:row.case_id,
    surface:row.surface,
    model_input:row.mfa_input.model_input,
  })),
  predictions:predictionsPath,
},null,2));

if(eligiblePredictionCoveragePct<95){
  throw new Error(
    'MFA generated predictions for only '+eligiblePredictionCoveragePct
    +'% of model-eligible benchmark cases. Refusing to emit a misleading '
    +'quality evaluation. Inspect generated.dict / the missing sample above.'
  );
}

console.log('\nMFA PROPER-NAME TOKEN BENCHMARK: evaluate against explicit Kaikki proper-name IPA controls…');
run(process.execPath,[
  '--no-warnings',
  'scripts/evaluate-entity-g2p-benchmark.mjs',
  '--benchmark',benchmarkPath,
  '--predictions',predictionsPath,
  '--candidate','mfa-en-us-arpa',
  '--model-id',modelId,
  '--model-version',modelVersion,
  '--model-inspect-version',modelIdentity.reported_version||'',
  '--model-inspect-fingerprint',modelIdentity.inspect_fingerprint,
  '--engine-version',mfaVersion,
  '--model-input-eligible',String(eligibleCases.length),
  '--model-input-ineligible',String(ineligibleCases.length),
  '--model-input-collisions',String(modelInputCollisions.length),
  '--eligible-prediction-coverage-pct',String(eligiblePredictionCoveragePct),
  '--diacritic-fold-cases',String(
    normalizationCounts.get('lowercase_diacritic_fold')||0
  ),
  '--out',evaluationPath,
]);

console.log('\nMFA PROPER-NAME TOKEN BENCHMARK COMPLETE');
console.log(JSON.stringify({
  evaluation:evaluationPath,
  predictions:predictionsPath,
},null,2));
