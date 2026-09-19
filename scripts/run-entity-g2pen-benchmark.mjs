#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { requiresShell, resolveCondaTool } from './local-command-resolution.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const benchmarkPath=resolve(
  argValue('--benchmark','data/local/entity-g2p-proper-name-benchmark-v2.json')
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

await mkdir(dirname(predictionsPath),{recursive:true});
await mkdir(dirname(metadataPath),{recursive:true});
await mkdir(dirname(evaluationPath),{recursive:true});

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
},null,2));

console.log('\nG2P-EN NEURAL PROPER-NAME BENCHMARK: predict…');
run(pythonCommand,[
  'scripts/run-g2pen-neural-benchmark.py',
  '--benchmark',benchmarkPath,
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
  '--model-input-eligible',String(metadata.model_input_eligible),
  '--model-input-ineligible',String(metadata.model_input_ineligible),
  '--model-input-collisions','0',
  '--eligible-prediction-coverage-pct',String(
    metadata.eligible_prediction_coverage_pct
  ),
  '--diacritic-fold-cases',String(metadata.diacritic_fold_cases||0),
  '--out',evaluationPath,
]);

console.log('\nG2P-EN NEURAL PROPER-NAME BENCHMARK COMPLETE');
console.log(JSON.stringify({
  evaluation:evaluationPath,
  predictions:predictionsPath,
  metadata:metadataPath,
},null,2));
