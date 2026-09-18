#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}

const publishDir=resolve(argValue('--publish','data/local/en-publish-v1'));
const out=resolve(argValue('--out','data/local/en-pronunciation-fallback-diagnostic-v1-report.json'));
const exampleLimit=Math.max(1,Math.min(100,Number.parseInt(argValue('--examples','25'),10)||25));

const manifest=JSON.parse(await readFile(join(publishDir,'manifest.json'),'utf8'));

function analyzed(pronunciation){
  return pronunciation?.analysis_status==='ok'&&pronunciation?.analysis;
}
function isUs(pronunciation){
  return analyzed(pronunciation)&&Array.isArray(pronunciation.locales)&&pronunciation.locales.includes('en-US');
}
function isGb(pronunciation){
  return analyzed(pronunciation)&&Array.isArray(pronunciation.locales)&&pronunciation.locales.includes('en-GB');
}
function isUnprofiled(pronunciation){
  return analyzed(pronunciation)&&(!Array.isArray(pronunciation.locales)||pronunciation.locales.length===0);
}

function matches(a,b){
  return {
    exact_tail:a.e===b.e,
    final_tail:a.ft===b.ft,
    vowel_family:a.vf===b.vf,
    vowel_key:a.vk===b.vk,
    syllable_count:a.sc===b.sc,
    stress_pattern:a.st===b.st,
    primary_stress:a.ps===b.ps,
  };
}

function bestComparison(reference,candidates){
  let best=null;
  let bestScore=-1;
  for(const candidate of candidates){
    const match=matches(reference.analysis,candidate.analysis);
    const score=Object.values(match).filter(Boolean).length;
    if(score>bestScore){
      bestScore=score;
      best={reference,candidate,match,score};
    }
  }
  return best;
}

function newBucket(){
  return {
    surfaces:0,
    exact_tail_match:0,
    final_tail_match:0,
    vowel_family_match:0,
    vowel_key_match:0,
    syllable_count_match:0,
    stress_pattern_match:0,
    primary_stress_match:0,
    exact_tail_mismatches:[],
  };
}

function addBucket(bucket,row,references,candidates,label){
  if(!references.length||!candidates.length) return;
  let best=null;
  for(const reference of references){
    const comparison=bestComparison(reference,candidates);
    if(!best||comparison.score>best.score) best=comparison;
  }
  if(!best) return;
  bucket.surfaces+=1;
  for(const key of [
    'exact_tail','final_tail','vowel_family','vowel_key',
    'syllable_count','stress_pattern','primary_stress',
  ]){
    if(best.match[key]) bucket[`${key}_match`]+=1;
  }
  if(!best.match.exact_tail&&bucket.exact_tail_mismatches.length<exampleLimit){
    bucket.exact_tail_mismatches.push({
      surface:row.surface,
      normalized:row.normalized,
      comparison:label,
      us:{
        source:best.reference.source,
        raw:best.reference.raw,
        locales:best.reference.locales,
        analysis:best.reference.analysis,
      },
      fallback:{
        source:best.candidate.source,
        raw:best.candidate.raw,
        locales:best.candidate.locales,
        analysis:best.candidate.analysis,
      },
    });
  }
}

const unprofiledVsUs=newBucket();
const gbVsUs=newBucket();
let publishedRows=0;
let analyzedUsSurfaces=0;
let analyzedUnprofiledSurfaces=0;
let analyzedGbSurfaces=0;

for(const shard of manifest.files||[]){
  const lines=createInterface({input:createReadStream(join(publishDir,shard.file)),crlfDelay:Infinity});
  for await(const line of lines){
    if(!line) continue;
    const row=JSON.parse(line);
    publishedRows+=1;
    const pronunciations=row.pronunciations||[];
    const us=pronunciations.filter(isUs);
    const unprofiled=pronunciations.filter(isUnprofiled);
    const gb=pronunciations.filter(isGb);
    if(us.length) analyzedUsSurfaces+=1;
    if(unprofiled.length) analyzedUnprofiledSurfaces+=1;
    if(gb.length) analyzedGbSurfaces+=1;
    addBucket(unprofiledVsUs,row,us,unprofiled,'unprofiled_vs_en_us');
    addBucket(gbVsUs,row,us,gb,'en_gb_vs_en_us');
  }
}

function pct(value,total){
  return total?Number((value*100/total).toFixed(2)):0;
}
function finalize(bucket){
  return {
    ...bucket,
    exact_tail_match_pct:pct(bucket.exact_tail_match,bucket.surfaces),
    final_tail_match_pct:pct(bucket.final_tail_match,bucket.surfaces),
    vowel_family_match_pct:pct(bucket.vowel_family_match,bucket.surfaces),
    vowel_key_match_pct:pct(bucket.vowel_key_match,bucket.surfaces),
    syllable_count_match_pct:pct(bucket.syllable_count_match,bucket.surfaces),
    stress_pattern_match_pct:pct(bucket.stress_pattern_match,bucket.surfaces),
    primary_stress_match_pct:pct(bucket.primary_stress_match,bucket.surfaces),
  };
}

const report={
  schema:'rhymelab-en-pronunciation-fallback-diagnostic-v1',
  publish_schema:manifest.schema,
  publish_policy:manifest.policy,
  publish_fingerprint:manifest.semantic_fingerprint,
  published_rows:publishedRows,
  surface_inventory:{
    analyzed_en_us:analyzedUsSurfaces,
    analyzed_unprofiled:analyzedUnprofiledSurfaces,
    analyzed_en_gb:analyzedGbSurfaces,
  },
  comparisons:{
    unprofiled_vs_en_us:finalize(unprofiledVsUs),
    en_gb_vs_en_us:finalize(gbVsUs),
  },
  interpretation_contract:{
    exact_tail_match:
      'Strongest direct evidence that a fallback pronunciation preserves the same indexed exact rhyme domain as at least one source-backed en-US variant.',
    mismatch:
      'A mismatch is review evidence, not proof that either source is wrong; dialect and genuine pronunciation variants can differ.',
    acceptance:
      'Do not relabel unprofiled or en-GB pronunciation as en-US. A future fallback profile must preserve provenance and remain distinguishable from explicit en-US.',
  },
};

await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n','utf8');

console.log('\nPHASE 12B6 ENGLISH PRONUNCIATION FALLBACK DIAGNOSTIC');
console.log(JSON.stringify({
  schema:report.schema,
  publish_fingerprint:report.publish_fingerprint,
  published_rows:report.published_rows,
  surface_inventory:report.surface_inventory,
  unprofiled_vs_en_us:{
    surfaces:report.comparisons.unprofiled_vs_en_us.surfaces,
    exact_tail_match_pct:report.comparisons.unprofiled_vs_en_us.exact_tail_match_pct,
    syllable_count_match_pct:report.comparisons.unprofiled_vs_en_us.syllable_count_match_pct,
    stress_pattern_match_pct:report.comparisons.unprofiled_vs_en_us.stress_pattern_match_pct,
    vowel_family_match_pct:report.comparisons.unprofiled_vs_en_us.vowel_family_match_pct,
  },
  en_gb_vs_en_us:{
    surfaces:report.comparisons.en_gb_vs_en_us.surfaces,
    exact_tail_match_pct:report.comparisons.en_gb_vs_en_us.exact_tail_match_pct,
    syllable_count_match_pct:report.comparisons.en_gb_vs_en_us.syllable_count_match_pct,
    stress_pattern_match_pct:report.comparisons.en_gb_vs_en_us.stress_pattern_match_pct,
    vowel_family_match_pct:report.comparisons.en_gb_vs_en_us.vowel_family_match_pct,
  },
  report:out,
},null,2));
