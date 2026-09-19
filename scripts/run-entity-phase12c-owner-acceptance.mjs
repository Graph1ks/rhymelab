#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}

const entityDb=resolve(argValue('--entity-db','data/local/rhymelab-entities-v1.sqlite'));
const englishDb=resolve(argValue('--en-db','data/local/rhymelab-en-v1.sqlite'));
const englishMarker=resolve(
  argValue('--en-marker','data/local/en-product-enabled-v1.json')
);
const sourceIndex=resolve(
  argValue('--source-index','data/work/entity/entity-pronunciation-source-expansion-v1.sqlite')
);
const germanDb=resolve(argValue('--de-db','data/local/rhymelab-v5.sqlite'));
const outDir=resolve(argValue('--out-dir','data/local/phase12c-owner'));
const finalReport=resolve(
  argValue('--out','data/local/phase12c-owner-acceptance-v1-report.json')
);

await mkdir(outDir,{recursive:true});
const runtimeReport=resolve(outDir,'entity-multilingual-runtime-v1-report.json');
const verificationReport=resolve(outDir,'entity-multilingual-runtime-verification-v1-report.json');
const writerReport=resolve(outDir,'entity-writer-acceptance-v1-report.json');

function runStep(id,script,stepArgs){
  console.error(`\n[phase12c-owner] ${id}`);
  const child=spawnSync(process.execPath,[script,...stepArgs],{
    stdio:'inherit',
    cwd:process.cwd(),
  });
  return {
    id,
    exit_code:child.status??1,
    signal:child.signal||null,
    passed:child.status===0,
  };
}

const steps=[];
steps.push(runStep(
  'materialize_multilingual_entity_runtime',
  'scripts/materialize-entity-multilingual-runtime.mjs',
  [
    '--entities',entityDb,
    '--en-db',englishDb,
    '--en-marker',englishMarker,
    '--source-index',sourceIndex,
    '--report',runtimeReport,
  ],
));

if(steps.at(-1).passed){
  steps.push(runStep(
    'verify_multilingual_entity_runtime',
    'scripts/verify-entity-multilingual-runtime.mjs',
    ['--entities',entityDb,'--report',runtimeReport,'--out',verificationReport],
  ));
}

if(steps.at(-1).passed){
  steps.push(runStep(
    'accept_entity_writer',
    'scripts/accept-entity-writer-phase12c.mjs',
    [
      '--de-db',germanDb,
      '--en-db',englishDb,
      '--en-marker',englishMarker,
      '--entity-db',entityDb,
      '--out',writerReport,
    ],
  ));
}

async function readJson(path){
  if(!existsSync(path)) return null;
  return JSON.parse(await readFile(path,'utf8'));
}

const runtime=await readJson(runtimeReport);
const verification=await readJson(verificationReport);
const writer=await readJson(writerReport);
const passed=steps.length===3
  &&steps.every((row)=>row.passed)
  &&runtime?.status==='ok'
  &&verification?.status==='ok'
  &&writer?.status==='ok';

const report={
  schema:'rhymelab-phase12c-owner-acceptance-v1',
  status:passed?'ok':'failed',
  built_at:new Date().toISOString(),
  steps,
  reports:{
    runtime:runtimeReport,
    verification:verificationReport,
    writer:writerReport,
  },
  runtime_summary:runtime?{
    frozen_de_runtime_preserved:runtime.frozen_de_runtime_preserved,
    english_names_considered:runtime.english?.names_considered??null,
    english_names_ready:runtime.english?.names_ready??null,
    english_unresolved_names:runtime.english?.unresolved_names??null,
    english_phonetic_analyses:runtime.english?.phonetic_analyses??null,
    english_rhyme_anchors:runtime.english?.rhyme_anchors??null,
    english_semantic_fingerprint:runtime.english?.semantic_fingerprint??null,
    generated_g2p_used:runtime.safeguards?.generated_g2p_used??null,
    llm_annotation_used:runtime.safeguards?.llm_annotation_used??null,
    ai_staging_runtime_promoted:runtime.safeguards?.ai_staging_runtime_promoted??null,
  }:null,
  verification_summary:verification?{
    status:verification.status,
    failed_checks:verification.failed_checks,
    de_runtime_fingerprint:verification.de_runtime_fingerprint,
    en_runtime_fingerprint:verification.en_runtime_fingerprint,
    en_names_ready:verification.en_names_ready,
    en_analyses:verification.en_analyses,
    en_anchors:verification.en_anchors,
  }:null,
  writer_summary:writer?{
    status:writer.status,
    failed_checks:writer.failed_checks,
    coverage:writer.coverage,
    ranking:writer.ranking,
    repeatability:writer.repeatability,
    timing:writer.timing,
    semantic_fingerprint:writer.semantic_fingerprint,
  }:null,
  pending_external_evidence:{
    ai_staging_data:false,
    benchmark_v3_context_gold_review:true,
    blocks_source_runtime_acceptance:false,
    blocks_ai_evidence_acceptance:true,
  },
  next_gate:passed
    ?'return_this_report_for_review_then_finalize_pr_112'
    :'return_this_report_or_console_failure_for_targeted_iteration',
};

await mkdir(dirname(finalReport),{recursive:true});
await writeFile(finalReport,JSON.stringify(report,null,2)+'\n','utf8');
console.log('\nPHASE 12C OWNER ACCEPTANCE SUMMARY');
console.log(JSON.stringify({...report,report:finalReport},null,2));
if(!passed) process.exitCode=1;
