#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeEnglishPronunciation } from './english-phonology.mjs';
import { scoreEnglishRhymeAnalyses } from './english-rhyme-features.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fixturePath=resolve(ROOT,process.argv[2]||'fixtures/en/phonology-v1.json');
const outputPath=resolve(ROOT,process.argv[3]||'data/local/en-phonology-fixture-v1-report.json');
const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
const analyses=new Map(fixture.entries.map(entry=>[
  entry.id,
  analyzeEnglishPronunciation(entry.pronunciation,{notation:entry.notation,locale:entry.locale,source:entry.source}),
]));
const checks=[];
function check(id,label,passed,details={}){checks.push({id,label,passed:Boolean(passed),...details});}
for(const e of fixture.pair_expectations){
  const left=analyses.get(e.left),right=analyses.get(e.right),score=scoreEnglishRhymeAnalyses(left,right);
  if(e.type) check(e.id,'type',score.type===e.type,{expected:e.type,actual:score.type});
  if(e.not_type) check(e.id,'not_type',score.type!==e.not_type,{forbidden:e.not_type,actual:score.type});
  if(e.exact_tail) check(e.id,'exact_tail',left.exactTailKey===right.exactTailKey);
  if(e.not_exact) check(e.id,'not_exact',left.exactTailKey!==right.exactTailKey);
  if(e.relation) check(e.id,`relation:${e.relation}`,score.relations[e.relation]?.matched===true);
  if(e.exclude_relation) check(e.id,`exclude_relation:${e.exclude_relation}`,score.relations[e.exclude_relation]?.matched===false);
}
for(const e of fixture.variant_expectations){
  const left=analyses.get(e.left),right=analyses.get(e.right);
  if(e.distinct_tail) check(e.id,'distinct_tail',left.exactTailKey!==right.exactTailKey);
  if(e.distinct_stress) check(e.id,'distinct_stress',left.stressPattern!==right.stressPattern);
  if(e.locales) check(e.id,'locales',left.locale===e.locales[0]&&right.locale===e.locales[1],{actual:[left.locale,right.locale]});
  if(e.rhotic) check(e.id,'rhotic',left.rhotic===e.rhotic[0]&&right.rhotic===e.rhotic[1],{actual:[left.rhotic,right.rhotic]});
}
const pairResults=fixture.pair_expectations.map(e=>{
  const left=analyses.get(e.left),right=analyses.get(e.right),score=scoreEnglishRhymeAnalyses(left,right);
  return {id:e.id,left:e.left,right:e.right,type:score.type,overall:Number(score.overall.toFixed(4)),relations:score.relationTypes,left_tail:left.exactTailKey,right_tail:right.exactTailKey};
});
const failed=checks.filter(x=>!x.passed);
const report={
  schema:'rhymelab-en-phonology-fixture-report-v1',
  fixture:fixture.schema,
  status:failed.length?'failed':'ok',
  candidate_only:true,
  default_locale:fixture.default_locale,
  entries:fixture.entries.length,
  checks:checks.length,
  failed_checks:failed,
  pair_results:pairResults,
  safeguards:{product_enabled:false,g2p_enabled:false,german_profile_mutated:false},
};
await mkdir(dirname(outputPath),{recursive:true});
await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');
console.log('PHASE 12B3 ENGLISH PHONOLOGY FIXTURE');
console.log(JSON.stringify({status:report.status,entries:report.entries,checks:report.checks,failures:failed.length,report:outputPath},null,2));
if(failed.length) process.exitCode=1;
