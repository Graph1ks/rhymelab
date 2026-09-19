#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const benchmarkPath=resolve(
  argValue('--benchmark','data/local/entity-g2p-proper-name-benchmark-v2.json')
);
const reviewPath=resolve(
  argValue('--review','benchmarks/entity-g2p/proper-name-v3-review.json')
);
const outPath=resolve(
  argValue('--out','data/local/entity-g2p-proper-name-benchmark-v3-draft.json')
);

const [benchmark,review]=await Promise.all([
  readFile(benchmarkPath,'utf8').then(JSON.parse),
  readFile(reviewPath,'utf8').then(JSON.parse),
]);

if(benchmark.schema!=='rhymelab-entity-g2p-proper-name-token-benchmark-v2'){
  throw new Error(`Unexpected benchmark schema: ${benchmark.schema||'missing'}`);
}
if(review.schema!=='rhymelab-entity-proper-name-benchmark-v3-review-v1'){
  throw new Error(`Unexpected review schema: ${review.schema||'missing'}`);
}

const byCase=new Map((review.candidates||[]).map((row)=>[row.case_id,row]));
const applied=[];
const pending=[];
const missing=[];
const cases=(benchmark.cases||[]).map((testCase)=>{
  const entry=byCase.get(testCase.case_id);
  if(!entry) return testCase;
  if(entry.surface&&entry.surface!==testCase.surface){
    throw new Error(
      `Review surface mismatch for ${entry.case_id}: ${entry.surface} != ${testCase.surface}`
    );
  }
  if(entry.status==='accepted'){
    if(!Array.isArray(entry.references)||!entry.references.length){
      throw new Error(`Accepted review ${entry.case_id} requires replacement references`);
    }
    const references=entry.references.map((ref)=>{
      if(!['ipa','arpabet'].includes(ref.notation)||!String(ref.pronunciation||'').trim()){
        throw new Error(`Invalid accepted reference for ${entry.case_id}`);
      }
      return {
        source_kind:ref.source_kind||'context_review',
        locale:'en-US',
        notation:ref.notation,
        pronunciation:String(ref.pronunciation).trim(),
        evidence_id:ref.evidence_id??null,
      };
    });
    applied.push({
      case_id:entry.case_id,
      surface:testCase.surface,
      reason:entry.reason||null,
      old_references:testCase.references,
      new_references:references,
    });
    return {
      ...testCase,
      control_source:'context_review',
      references,
      v3_review:{
        status:'accepted',
        reason:entry.reason||null,
      },
    };
  }
  pending.push({
    case_id:entry.case_id,
    surface:testCase.surface,
    reason:entry.reason||null,
  });
  return {
    ...testCase,
    v3_review:{
      status:'pending',
      reason:entry.reason||null,
    },
  };
});

for(const entry of review.candidates||[]){
  if(!(benchmark.cases||[]).some((row)=>row.case_id===entry.case_id)){
    missing.push(entry.case_id);
  }
}
if(missing.length){
  throw new Error(`Review references missing benchmark cases: ${missing.join(', ')}`);
}

const status=pending.length?'review_pending':'prepared';
const evidence={
  schema:'rhymelab-entity-g2p-proper-name-token-benchmark-v3-draft',
  status,
  policy:'entity-context-aware-gold-repair-v1',
  supersedes_fingerprint:benchmark.semantic_fingerprint||null,
  source_benchmark_schema:benchmark.schema,
  cases,
  review:{
    file:reviewPath,
    applied_count:applied.length,
    pending_count:pending.length,
    applied,
    pending,
  },
  safeguards:{
    original_v2_mutated:false,
    pending_cases_silently_changed:false,
    runtime_accepted:false,
    generated_model_output_used_as_gold:false,
  },
};
const fingerprint=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
const report={...evidence,semantic_fingerprint:fingerprint};

await mkdir(dirname(outPath),{recursive:true});
await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({
  status,
  cases:cases.length,
  applied:applied.length,
  pending:pending.length,
  semantic_fingerprint:fingerprint,
  out:outPath,
},null,2));
if(status!=='prepared') process.exitCode=2;
