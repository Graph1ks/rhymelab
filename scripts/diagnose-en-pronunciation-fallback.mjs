#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { classifyWiktionaryIpaLocale } from './en-writer-source-core.mjs';

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
function hasNoMappedLocale(pronunciation){
  return analyzed(pronunciation)&&(!Array.isArray(pronunciation.locales)||pronunciation.locales.length===0);
}

function ipaBody(raw){
  let value=String(raw||'').trim();
  if(value.length>=2&&value.startsWith('/')&&value.endsWith('/')) value=value.slice(1,-1).trim();
  else if(value.length>=2&&value.startsWith('[')&&value.endsWith(']')) value=value.slice(1,-1).trim();
  return value;
}
function isPartialMarkedPronunciation(pronunciation){
  if(pronunciation?.source!=='wiktionary') return false;
  const body=ipaBody(pronunciation.raw);
  return /^[-‐‑‒–—]/u.test(body)||/[-‐‑‒–—]$/u.test(body);
}
function mappedUnprofiledClass(pronunciation){
  if(!hasNoMappedLocale(pronunciation)) return null;
  if(pronunciation.source==='wiktionary'){
    const sourceLocale=classifyWiktionaryIpaLocale({tags:pronunciation.tags||[]});
    if(sourceLocale.other_profiled) return 'other_profiled';
    if(isPartialMarkedPronunciation(pronunciation)) return 'unqualified_partial';
  }
  return 'unqualified_fullword';
}

function boundaryInsensitiveTail(analysis){
  return String(analysis?.rt||'')
    .split(/\s+/u)
    .filter((token)=>token&&token!=='.')
    .join(' ');
}

function rhymeStressPattern(analysis){
  const pattern=String(analysis?.st||'');
  const start=Math.max(0,Number(analysis?.ps||1)-1);
  return pattern.slice(start);
}

function matches(a,b){
  const flatA=boundaryInsensitiveTail(a);
  const flatB=boundaryInsensitiveTail(b);
  const stressA=rhymeStressPattern(a);
  const stressB=rhymeStressPattern(b);
  return {
    exact_tail:a.e===b.e,
    boundary_insensitive_tail:flatA===flatB,
    boundary_insensitive_tail_plus_stress:flatA===flatB&&stressA===stressB,
    phoneme_sequence:a.ph===b.ph,
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
    boundary_insensitive_tail_match:0,
    boundary_insensitive_tail_plus_stress_match:0,
    phoneme_sequence_match:0,
    final_tail_match:0,
    vowel_family_match:0,
    vowel_key_match:0,
    syllable_count_match:0,
    stress_pattern_match:0,
    primary_stress_match:0,
    exact_tail_mismatch_but_boundary_insensitive_tail_match:0,
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
    'exact_tail','boundary_insensitive_tail','boundary_insensitive_tail_plus_stress','phoneme_sequence',
    'final_tail','vowel_family','vowel_key','syllable_count','stress_pattern','primary_stress',
  ]){
    if(best.match[key]) bucket[`${key}_match`]+=1;
  }
  if(!best.match.exact_tail&&best.match.boundary_insensitive_tail){
    bucket.exact_tail_mismatch_but_boundary_insensitive_tail_match+=1;
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
        tags:best.reference.tags||[],
        analysis:best.reference.analysis,
      },
      fallback:{
        source:best.candidate.source,
        raw:best.candidate.raw,
        locales:best.candidate.locales,
        locale_status:best.candidate.locale_status||null,
        tags:best.candidate.tags||[],
        derived_unprofiled_class:mappedUnprofiledClass(best.candidate),
        analysis:best.candidate.analysis,
      },
    });
  }
}

const unprofiledAllVsUs=newBucket();
const unqualifiedFullwordVsUs=newBucket();
const otherProfiledVsUs=newBucket();
const unqualifiedPartialVsUs=newBucket();
const gbVsUs=newBucket();

let publishedRows=0;
let analyzedUsSurfaces=0;
let analyzedNoMappedLocaleSurfaces=0;
let analyzedUnqualifiedFullwordSurfaces=0;
let analyzedOtherProfiledSurfaces=0;
let analyzedUnqualifiedPartialSurfaces=0;
let analyzedGbSurfaces=0;

const variantInventory={
  analyzed_no_mapped_locale:0,
  analyzed_unqualified_fullword:0,
  analyzed_other_profiled:0,
  analyzed_unqualified_partial:0,
};

for(const shard of manifest.files||[]){
  const lines=createInterface({input:createReadStream(join(publishDir,shard.file)),crlfDelay:Infinity});
  for await(const line of lines){
    if(!line) continue;
    const row=JSON.parse(line);
    publishedRows+=1;
    const pronunciations=row.pronunciations||[];
    const us=pronunciations.filter(isUs);
    const gb=pronunciations.filter(isGb);
    const noMapped=pronunciations.filter(hasNoMappedLocale);
    const fullword=noMapped.filter((item)=>mappedUnprofiledClass(item)==='unqualified_fullword');
    const otherProfiled=noMapped.filter((item)=>mappedUnprofiledClass(item)==='other_profiled');
    const partial=noMapped.filter((item)=>mappedUnprofiledClass(item)==='unqualified_partial');

    if(us.length) analyzedUsSurfaces+=1;
    if(gb.length) analyzedGbSurfaces+=1;
    if(noMapped.length) analyzedNoMappedLocaleSurfaces+=1;
    if(fullword.length) analyzedUnqualifiedFullwordSurfaces+=1;
    if(otherProfiled.length) analyzedOtherProfiledSurfaces+=1;
    if(partial.length) analyzedUnqualifiedPartialSurfaces+=1;

    variantInventory.analyzed_no_mapped_locale+=noMapped.length;
    variantInventory.analyzed_unqualified_fullword+=fullword.length;
    variantInventory.analyzed_other_profiled+=otherProfiled.length;
    variantInventory.analyzed_unqualified_partial+=partial.length;

    addBucket(unprofiledAllVsUs,row,us,noMapped,'unprofiled_all_vs_en_us');
    addBucket(unqualifiedFullwordVsUs,row,us,fullword,'unqualified_fullword_vs_en_us');
    addBucket(otherProfiledVsUs,row,us,otherProfiled,'other_profiled_vs_en_us');
    addBucket(unqualifiedPartialVsUs,row,us,partial,'unqualified_partial_vs_en_us');
    addBucket(gbVsUs,row,us,gb,'en_gb_vs_en_us');
  }
}

function pct(value,total){
  return total?Number((value*100/total).toFixed(2)):0;
}
function finalize(bucket){
  const exactMismatches=bucket.surfaces-bucket.exact_tail_match;
  return {
    ...bucket,
    exact_tail_match_pct:pct(bucket.exact_tail_match,bucket.surfaces),
    boundary_insensitive_tail_match_pct:pct(bucket.boundary_insensitive_tail_match,bucket.surfaces),
    boundary_insensitive_tail_plus_stress_match_pct:pct(bucket.boundary_insensitive_tail_plus_stress_match,bucket.surfaces),
    phoneme_sequence_match_pct:pct(bucket.phoneme_sequence_match,bucket.surfaces),
    exact_tail_mismatch_but_boundary_insensitive_tail_match_pct_of_exact_mismatches:
      pct(bucket.exact_tail_mismatch_but_boundary_insensitive_tail_match,exactMismatches),
    final_tail_match_pct:pct(bucket.final_tail_match,bucket.surfaces),
    vowel_family_match_pct:pct(bucket.vowel_family_match,bucket.surfaces),
    vowel_key_match_pct:pct(bucket.vowel_key_match,bucket.surfaces),
    syllable_count_match_pct:pct(bucket.syllable_count_match,bucket.surfaces),
    stress_pattern_match_pct:pct(bucket.stress_pattern_match,bucket.surfaces),
    primary_stress_match_pct:pct(bucket.primary_stress_match,bucket.surfaces),
  };
}

const report={
  schema:'rhymelab-en-pronunciation-fallback-diagnostic-v2',
  publish_schema:manifest.schema,
  publish_policy:manifest.policy,
  publish_fingerprint:manifest.semantic_fingerprint,
  published_rows:publishedRows,
  surface_inventory:{
    analyzed_en_us:analyzedUsSurfaces,
    analyzed_en_gb:analyzedGbSurfaces,
    analyzed_no_mapped_locale:analyzedNoMappedLocaleSurfaces,
    analyzed_unqualified_fullword:analyzedUnqualifiedFullwordSurfaces,
    analyzed_other_profiled:analyzedOtherProfiledSurfaces,
    analyzed_unqualified_partial:analyzedUnqualifiedPartialSurfaces,
  },
  variant_inventory:variantInventory,
  comparisons:{
    unprofiled_all_vs_en_us:finalize(unprofiledAllVsUs),
    unqualified_fullword_vs_en_us:finalize(unqualifiedFullwordVsUs),
    other_profiled_vs_en_us:finalize(otherProfiledVsUs),
    unqualified_partial_vs_en_us:finalize(unqualifiedPartialVsUs),
    en_gb_vs_en_us:finalize(gbVsUs),
  },
  interpretation_contract:{
    unqualified_fullword:
      'No mapped locale or other regional/profile qualifier is present, and the IPA is not visibly marked as a partial pronunciation. This is the only no-locale class eligible for future General-English fallback consideration.',
    other_profiled:
      'Wiktionary tags contain a non-US/GB regional or pronunciation-profile qualifier (for example Canadian, Australian, rhotic or non-rhotic). Preserve separately; do not call it unprofiled General English.',
    unqualified_partial:
      'The no-locale IPA is visibly prefix/suffix/partial marked with a leading or trailing dash. It is not a full-word fallback pronunciation.',
    exact_tail_match:
      'Current production exact-key agreement. This key includes analyzer syllable boundaries and can therefore disagree even when the rhyme-tail segment sequence is identical.',
    boundary_insensitive_tail_match:
      'Diagnostic-only agreement after removing syllable-boundary markers from the stressed rhyme tail.',
    acceptance:
      'Do not relabel any fallback as en-US. Consider only true unqualified full-word IPA for a future provenance-preserving General-English fallback, after this segmented agreement benchmark is reviewed.',
  },
};

await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n','utf8');

const compact=(bucket)=>({
  surfaces:bucket.surfaces,
  exact_tail_match_pct:bucket.exact_tail_match_pct,
  boundary_insensitive_tail_match_pct:bucket.boundary_insensitive_tail_match_pct,
  boundary_insensitive_tail_plus_stress_match_pct:bucket.boundary_insensitive_tail_plus_stress_match_pct,
  phoneme_sequence_match_pct:bucket.phoneme_sequence_match_pct,
  syllable_count_match_pct:bucket.syllable_count_match_pct,
  stress_pattern_match_pct:bucket.stress_pattern_match_pct,
  vowel_family_match_pct:bucket.vowel_family_match_pct,
});

console.log('\nPHASE 12B6 ENGLISH PRONUNCIATION FALLBACK DIAGNOSTIC');
console.log(JSON.stringify({
  schema:report.schema,
  publish_fingerprint:report.publish_fingerprint,
  published_rows:report.published_rows,
  surface_inventory:report.surface_inventory,
  variant_inventory:report.variant_inventory,
  unprofiled_all_vs_en_us:compact(report.comparisons.unprofiled_all_vs_en_us),
  unqualified_fullword_vs_en_us:compact(report.comparisons.unqualified_fullword_vs_en_us),
  other_profiled_vs_en_us:compact(report.comparisons.other_profiled_vs_en_us),
  unqualified_partial_vs_en_us:compact(report.comparisons.unqualified_partial_vs_en_us),
  en_gb_vs_en_us:compact(report.comparisons.en_gb_vs_en_us),
  report:out,
},null,2));
