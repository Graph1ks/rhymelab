#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { normalizeEnglishSurface } from './en-writer-source-core.mjs';

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
const mfaCommand=String(argValue('--mfa','mfa'));
const modelId='english_us_arpa';
const modelVersion='2.0.0a';

function run(command,commandArgs,{capture=false}={}){
  const result=spawnSync(command,commandArgs,{
    encoding:'utf8',
    stdio:capture?'pipe':'inherit',
    shell:false,
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
  cases.push({
    case_id:caseId,
    surface,
    normalized:normalizeEnglishSurface(surface),
  });
}
if(cases.length!==benchmark.actual_size){
  throw new Error(
    'Benchmark/input mismatch: JSON has '+benchmark.actual_size
    +', TSV has '+cases.length
  );
}

console.log('\nMFA PROPER-NAME TOKEN BENCHMARK: preflight…');
const mfaVersion=run(mfaCommand,['--version'],{capture:true});
const modelInspect=run(
  mfaCommand,
  ['model','inspect','g2p',modelId],
  {capture:true},
);
if(!modelInspect.includes(modelVersion)){
  throw new Error(
    'MFA model '+modelId+' is not verified as pinned version '+modelVersion+'.\n'
    +'Install it once with:\n'
    +'  mfa model download g2p '+modelId+' --version '+modelVersion+'\n'
    +'Then rerun this command.\n\nModel inspect output:\n'
    +modelInspect
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
  cases.map((row)=>row.surface).join('\n')+'\n',
);

console.log(JSON.stringify({
  mfa_version:mfaVersion,
  model:modelId,
  model_version:modelVersion,
  benchmark_cases:cases.length,
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
for(const row of cases){
  const pronunciation=generated.get(row.normalized);
  if(!pronunciation) continue;
  predictionLines.push(
    row.case_id+'\tarpabet\t'+pronunciation
  );
  generatedCases+=1;
}
await writeFile(predictionsPath,predictionLines.join('\n')+'\n');

console.log(JSON.stringify({
  generated_dictionary_rows:generated.size,
  mapped_prediction_rows:generatedCases,
  missing_prediction_rows:cases.length-generatedCases,
  predictions:predictionsPath,
},null,2));

console.log('\nMFA PROPER-NAME TOKEN BENCHMARK: evaluate against explicit Kaikki proper-name IPA controls…');
run(process.execPath,[
  '--no-warnings',
  'scripts/evaluate-entity-g2p-benchmark.mjs',
  '--benchmark',benchmarkPath,
  '--predictions',predictionsPath,
  '--candidate','mfa-en-us-arpa',
  '--model-id',modelId,
  '--model-version',modelVersion,
  '--engine-version',mfaVersion,
  '--out',evaluationPath,
]);

console.log('\nMFA PROPER-NAME TOKEN BENCHMARK COMPLETE');
console.log(JSON.stringify({
  evaluation:evaluationPath,
  predictions:predictionsPath,
},null,2));
