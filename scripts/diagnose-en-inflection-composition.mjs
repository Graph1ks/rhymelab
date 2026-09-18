#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { analyzeEnglishPronunciation } from './english-phonology.mjs';
import {
  composeEnglishInflectionIpaVariants,
  isStrictEnglishInflectionRecovery,
  regularEnglishInflectionShape,
} from './en-pronunciation-recovery.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}

const publishDir=resolve(argValue('--publish','data/local/en-publish-v1'));
const out=resolve(argValue('--out','data/local/en-inflection-composition-diagnostic-v1-report.json'));
const exampleLimit=Math.max(1,Math.min(100,Number.parseInt(argValue('--examples','25'),10)||25));

const manifest=JSON.parse(await readFile(join(publishDir,'manifest.json'),'utf8'));
const rows=new Map();

for(const shard of manifest.files||[]){
  const lines=createInterface({input:createReadStream(join(publishDir,shard.file)),crlfDelay:Infinity});
  for await(const line of lines){
    if(!line) continue;
    const row=JSON.parse(line);
    rows.set(row.normalized,row);
  }
}

function analyzedEnUs(row){
  return (row?.pronunciations||[]).filter((p)=>
    p.analysis_status==='ok'
    && p.analysis
    && Array.isArray(p.locales)
    && p.locales.includes('en-US'));
}

function exactCmudictEnUs(row){
  return analyzedEnUs(row).filter((p)=>p.source==='cmudict');
}

function fullAnalysis(p){
  return analyzeEnglishPronunciation(p.raw,{
    notation:p.notation,
    locale:'en-US',
    source:p.source,
  });
}

function flatTail(analysis){
  return String(analysis?.stressedTail||'')
    .split(/\s+/u)
    .filter((token)=>token&&token!=='.')
    .join(' ');
}

function comparison(a,b){
  return {
    phoneme_sequence:a.canonicalPhonemes===b.canonicalPhonemes,
    exact_tail:a.exactTailKey===b.exactTailKey,
    boundary_insensitive_tail:flatTail(a)===flatTail(b),
    syllable_count:a.syllableCount===b.syllableCount,
    stress_pattern:a.stressPattern===b.stressPattern,
    vowel_family:a.vowelFamilyKey===b.vowelFamilyKey,
  };
}

function newBucket(){
  return {
    surfaces:0,
    phoneme_sequence_match:0,
    exact_tail_match:0,
    boundary_insensitive_tail_match:0,
    syllable_count_match:0,
    stress_pattern_match:0,
    vowel_family_match:0,
  };
}

function add(bucket,match){
  bucket.surfaces+=1;
  for(const key of Object.keys(match)) if(match[key]) bucket[`${key}_match`]+=1;
}

function pct(n,d){return d?Number((n*100/d).toFixed(2)):0;}
function finalize(bucket){
  return {
    ...bucket,
    phoneme_sequence_match_pct:pct(bucket.phoneme_sequence_match,bucket.surfaces),
    exact_tail_match_pct:pct(bucket.exact_tail_match,bucket.surfaces),
    boundary_insensitive_tail_match_pct:pct(bucket.boundary_insensitive_tail_match,bucket.surfaces),
    syllable_count_match_pct:pct(bucket.syllable_count_match,bucket.surfaces),
    stress_pattern_match_pct:pct(bucket.stress_pattern_match,bucket.surfaces),
    vowel_family_match_pct:pct(bucket.vowel_family_match,bucket.surfaces),
  };
}

const all=newBucket();
const cmuBase=newBucket();
const byShape=new Map();
const bySuffixRule=new Map();
const mismatches=[];
let candidateRelations=0;
let skippedAmbiguousShape=0;
let skippedMissingLemma=0;
let skippedNoBaseEnUs=0;
let skippedNoTargetCmu=0;

for(const row of rows.values()){
  const relationKinds=new Set(row?.lexical?.relation_kinds||[]);
  if(!relationKinds.has('form_of')&&!relationKinds.has('listed_form_of')) continue;

  const pairs=(row?.lexical?.lemmas||[])
    .map((lemma)=>({lemma,shape:regularEnglishInflectionShape(row.normalized,lemma)}))
    .filter((item)=>item.shape&&isStrictEnglishInflectionRecovery({
      surface:row.normalized,
      lemma:item.lemma,
      tags:row?.lexical?.tags||[],
    }));

  if(!pairs.length) continue;
  candidateRelations+=1;
  if(pairs.length!==1){skippedAmbiguousShape+=1;continue;}

  const [{lemma,shape}]=pairs;
  const base=rows.get(lemma);
  if(!base){skippedMissingLemma+=1;continue;}
  const basePronunciations=analyzedEnUs(base);
  if(!basePronunciations.length){skippedNoBaseEnUs+=1;continue;}
  const targetPronunciations=exactCmudictEnUs(row);
  if(!targetPronunciations.length){skippedNoTargetCmu+=1;continue;}

  let best=null;
  for(const basePron of basePronunciations){
    let baseAnalysis;
    try{baseAnalysis=fullAnalysis(basePron);}catch{continue;}
    let composedVariants;
    try{composedVariants=composeEnglishInflectionIpaVariants(baseAnalysis,shape);}catch{continue;}

    for(const composed of composedVariants){
      let composedAnalysis;
      try{composedAnalysis=analyzeEnglishPronunciation(composed.raw,{notation:'ipa',locale:'en-US',source:'derived_inflection'});}catch{continue;}
      for(const targetPron of targetPronunciations){
        let targetAnalysis;
        try{targetAnalysis=fullAnalysis(targetPron);}catch{continue;}
        const match=comparison(composedAnalysis,targetAnalysis);
        const score=Object.values(match).filter(Boolean).length;
        if(!best||score>best.score){
          best={score,match,basePron,baseAnalysis,composed,composedAnalysis,targetPron,targetAnalysis};
        }
      }
    }
  }
  if(!best) continue;

  add(all,best.match);
  if(best.basePron.source==='cmudict') add(cmuBase,best.match);

  if(!byShape.has(shape)) byShape.set(shape,newBucket());
  add(byShape.get(shape),best.match);
  if(!bySuffixRule.has(best.composed.suffix_rule)) bySuffixRule.set(best.composed.suffix_rule,newBucket());
  add(bySuffixRule.get(best.composed.suffix_rule),best.match);

  if(!best.match.phoneme_sequence&&mismatches.length<exampleLimit){
    mismatches.push({
      surface:row.surface,
      normalized:row.normalized,
      lemma,
      shape,
      lexical_tags:row?.lexical?.tags||[],
      base:{
        source:best.basePron.source,
        raw:best.basePron.raw,
        phonemes:best.baseAnalysis.canonicalPhonemes,
      },
      composed:{
        raw:best.composed.raw,
        suffix_rule:best.composed.suffix_rule,
        suffix_variant:best.composed.suffix_variant,
        suffix_ipa:best.composed.suffix_ipa,
        phonemes:best.composedAnalysis.canonicalPhonemes,
        stressed_tail:best.composedAnalysis.stressedTail,
      },
      target_cmudict:{
        raw:best.targetPron.raw,
        phonemes:best.targetAnalysis.canonicalPhonemes,
        stressed_tail:best.targetAnalysis.stressedTail,
      },
      match:best.match,
    });
  }
}

const report={
  schema:'rhymelab-en-inflection-composition-diagnostic-v2',
  publish_fingerprint:manifest.semantic_fingerprint,
  publish_policy:manifest.policy,
  purpose:'Held-in source control for proposed deterministic -s/-es/-ed/-ing composition. Exact CMUdict surface pronunciations are the control target. Epenthetic plural/past suffixes preserve both common reduced-vowel variants (/ɪ/ and /ə/); the best supported variant is compared against the control. No publish eligibility changes are made by this diagnostic.',
  gate:{
    production_enabled:false,
    broad_g2p:false,
    rule:'Do not enable morphology pronunciation composition until owner evidence shows sufficiently high variant-set phoneme/rhyme-tail agreement and remaining mismatch classes are reviewed.',
  },
  counts:{
    publish_rows:rows.size,
    strict_candidate_relations:candidateRelations,
    skipped_ambiguous_shape:skippedAmbiguousShape,
    skipped_missing_lemma:skippedMissingLemma,
    skipped_no_base_en_us:skippedNoBaseEnUs,
    skipped_no_target_cmudict:skippedNoTargetCmu,
  },
  comparisons:{
    all_source_backed_en_us_base:finalize(all),
    cmudict_base_only:finalize(cmuBase),
    by_shape:Object.fromEntries([...byShape.entries()].sort().map(([key,value])=>[key,finalize(value)])),
    by_suffix_rule:Object.fromEntries([...bySuffixRule.entries()].sort().map(([key,value])=>[key,finalize(value)])),
  },
  phoneme_mismatch_examples:mismatches,
};

await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n','utf8');

console.log('\nPHASE 12B7 ENGLISH INFLECTION COMPOSITION DIAGNOSTIC');
console.log(JSON.stringify({
  schema:report.schema,
  publish_fingerprint:report.publish_fingerprint,
  strict_candidate_relations:candidateRelations,
  comparisons:report.comparisons,
  mismatch_examples:mismatches.slice(0,10),
  report:out,
},null,2));
