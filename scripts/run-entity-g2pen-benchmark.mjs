#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { requiresShell, resolveCondaTool } from './local-command-resolution.mjs';
import { prepareG2pEnNeuralCases } from './g2pen-benchmark-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const benchmarkPath=resolve(
  argValue('--benchmark','data/local/entity-g2p-proper-name-benchmark-v2.json')
);
const preparedInputPath=resolve(
  argValue('--prepared-input','data/work/entity/entity-g2p-g2pen-neural-input-v1.json')
);
const predictionsPath=resolve(
  argValue('--predictions','data/local/entity-g2p-g2pen-neural-predictions-v2.tsv')
);
const metadataPath=resolve(
  argValue('--metadata','data/local/entity-g2p-g2pen-neural-metadata-v1.json')
);
const evaluationPath=resolve(
  argValue('--out','data/local/entity-g2p-g2pen-neural-evaluation-v2.json')
);
const pythonCommand=resolveCondaTool('python',{
  explicit:argValue('--python',null),
});

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

await mkdir(dirname(preparedInputPath),{recursive:true});
await mkdir(dirname(predictionsPath),{recursive:true});
await mkdir(dirname(metadataPath),{recursive:true});
await mkdir(dirname(evaluationPath),{recursive:true});

const benchmark=JSON.parse(await readFile(benchmarkPath,'utf8'));
if(benchmark.schema!=='rhymelab-entity-g2p-proper-name-token-benchmark-v2'){
  throw new Error('Expected proper-name token benchmark v2.');
}
const prepared=prepareG2pEnNeuralCases(benchmark.cases||[]);
const eligiblePct=(benchmark.cases||[]).length
  ?Number((prepared.eligible.length*100/(benchmark.cases||[]).length).toFixed(2))
  :0;
if(eligiblePct<95){
  throw new Error(
    'g2p-en model-input eligibility is only '+eligiblePct+'%. '
    +'Refusing benchmark.'
  );
}
if(prepared.collisions.length){
  throw new Error(
    'g2p-en model-input normalization produced '
    +prepared.collisions.length+' collision(s).'
  );
}
await writeFile(
  preparedInputPath,
  JSON.stringify({
    schema:'rhymelab-g2pen-neural-input-v1',
    benchmark_fingerprint:benchmark.semantic_fingerprint||null,
    cases:prepared.eligible,
  },null,2)+'\n',
);

console.log('\nG2P-EN NEURAL PROPER-NAME BENCHMARK: preflight…');
const pythonVersion=run(
  pythonCommand,
  ['-c','import sys; print(sys.version.split()[0])'],
  {capture:true},
);
const packageVersion=run(
  pythonCommand,
  [
    '-c',
    "from importlib.metadata import version; print(version('g2p-en'))",
  ],
  {capture:true},
);

console.log(JSON.stringify({
  python_command:pythonCommand,
  conda_prefix:process.env.CONDA_PREFIX||null,
  python_version:pythonVersion,
  g2p_en_version:packageVersion,
  neural_path_forced:true,
  benchmark_cases:(benchmark.cases||[]).length,
  model_input_eligible:prepared.eligible.length,
  model_input_ineligible:prepared.ineligible.length,
  model_input_eligibility_pct:eligiblePct,
  model_input_collisions:prepared.collisions.length,
  diacritic_fold_cases:prepared.diacritic_fold_cases,
  ineligible_sample:prepared.ineligible.slice(0,10),
},null,2));

console.log('\nG2P-EN NEURAL PROPER-NAME BENCHMARK: predict…');
run(pythonCommand,[
  'scripts/run-g2pen-neural-benchmark.py',
  '--input',preparedInputPath,
  '--predictions',predictionsPath,
  '--metadata',metadataPath,
]);

const metadata=JSON.parse(await readFile(metadataPath,'utf8'));
if(!metadata.neural_path_forced||metadata.cmudict_lookup_used){
  throw new Error('g2p-en benchmark must force neural OOV prediction only.');
}
if(Number(metadata.eligible_prediction_coverage_pct)<95){
  throw new Error(
    'g2p-en neural prediction coverage is only '
    +metadata.eligible_prediction_coverage_pct
    +'%. Refusing misleading evaluation.'
  );
}

console.log('\nG2P-EN NEURAL PROPER-NAME BENCHMARK: evaluate…');
run(process.execPath,[
  '--no-warnings',
  'scripts/evaluate-entity-g2p-benchmark.mjs',
  '--benchmark',benchmarkPath,
  '--predictions',predictionsPath,
  '--candidate','g2p-en-neural',
  '--model-id',metadata.model_id,
  '--model-version',metadata.package_version,
  '--model-inspect-fingerprint',metadata.checkpoint_sha256,
  '--engine-version',metadata.package_version,
  '--model-input-eligible',String(prepared.eligible.length),
  '--model-input-ineligible',String(prepared.ineligible.length),
  '--model-input-collisions',String(prepared.collisions.length),
  '--eligible-prediction-coverage-pct',String(
    metadata.eligible_prediction_coverage_pct
  ),
  '--diacritic-fold-cases',String(prepared.diacritic_fold_cases),
  '--out',evaluationPath,
]);

console.log('\nG2P-EN NEURAL PROPER-NAME BENCHMARK COMPLETE');
console.log(JSON.stringify({
  evaluation:evaluationPath,
  predictions:predictionsPath,
  metadata:metadataPath,
},null,2));
