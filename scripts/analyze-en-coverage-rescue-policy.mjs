#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}

const input=resolve(argValue('--input','data/local/en-coverage-candidates-v1.jsonl'));
const out=resolve(argValue('--out','data/local/en-coverage-rescue-policy-v1-report.json'));
const samplePerClass=Math.max(1,Math.min(50,Number.parseInt(argValue('--sample','12'),10)||12));

const rankBands=[
  {label:'1-10k',min:1,max:10000},
  {label:'10k-25k',min:10001,max:25000},
  {label:'25k-50k',min:25001,max:50000},
  {label:'50k-100k',min:50001,max:100000},
  {label:'100k-150k',min:100001,max:150000},
  {label:'150k-250k',min:150001,max:250000},
  {label:'250k-tail',min:250001,max:Number.MAX_SAFE_INTEGER},
];

const morphologyBlockTags=new Set([
  'abbreviation','initialism','acronym','letter','number','symbol',
  'contraction','misspelling',
]);

function bandFor(rank){
  return rankBands.find((band)=>rank>=band.min&&rank<=band.max)?.label||'outside';
}

function tags(row){
  return new Set((row.lexical_tags||[]).map((value)=>String(value).toLocaleLowerCase('en-US')));
}

function strictMorphologyCandidate(row){
  if(row.status!=='regular_inflection_shape_with_analyzed_en_us_lemma') return false;
  const tagSet=tags(row);
  for(const tag of morphologyBlockTags) if(tagSet.has(tag)) return false;
  const candidates=row.morphology_recovery_candidates||[];
  if(candidates.length!==1) return false;
  const shape=candidates[0]?.shape;
  if(['s_suffix','es_suffix','y_to_ies'].includes(shape)){
    return tagSet.has('plural')
      || (tagSet.has('third-person')&&tagSet.has('singular')&&tagSet.has('present'));
  }
  if(['ed_suffix','e_to_ed','y_to_ied'].includes(shape)){
    return tagSet.has('past')||tagSet.has('participle');
  }
  if(['ing_suffix','drop_e_ing','ie_to_ying'].includes(shape)){
    return tagSet.has('gerund')||tagSet.has('participle');
  }
  return false;
}

function classFor(row){
  if(row.status==='possessive_with_cmudict_and_analyzed_en_us_base'){
    return 'tier_a_exact_cmudict_possessive';
  }
  if(row.status==='orthographic_variant_with_analyzed_en_us_lemma'){
    return 'tier_a_punctuation_only_alias';
  }
  if(strictMorphologyCandidate(row)){
    return 'tier_b_strict_source_backed_inflection';
  }
  if(row.status==='published_no_analyzed_en_us_pronunciation'){
    if(row.published_locale_gap==='analyzed_unprofiled_no_en_us'){
      return 'tier_b_analyzed_unprofiled_ipa';
    }
    if(row.published_locale_gap==='analyzed_en_gb_and_unprofiled_no_en_us'){
      return 'tier_b_analyzed_en_gb_plus_unprofiled';
    }
    if(row.published_locale_gap==='analyzed_en_gb_no_en_us'){
      return 'tier_c_analyzed_en_gb_only';
    }
    if(row.published_locale_gap==='only_unresolved_or_unparseable'){
      return 'unresolved_pronunciation';
    }
  }
  if(row.status==='non_wiktionary_esdb_current_plus_cmudict'){
    return 'tier_c_esdb_current_plus_exact_cmudict';
  }
  if(row.status==='non_wiktionary_cmudict_only'){
    return 'review_exact_cmudict_without_lexical_guard';
  }
  if(row.status==='no_source_backed_pronunciation'&&tags(row).has('initialism')){
    return 'review_deterministic_initialism_composition';
  }
  if(row.status==='published_explicit_proper_name_only'){
    return 'review_proper_name_channel';
  }
  return null;
}

function minimalRow(row){
  return {
    rank:row.rank,
    surface:row.surface,
    status:row.status,
    zipf:row.zipf,
    band:bandFor(row.rank),
    lexical_tags:row.lexical_tags||[],
    relation_kinds:row.relation_kinds||[],
    analyzed_en_us_lemma_candidates:row.analyzed_en_us_lemma_candidates||[],
    morphology_recovery_candidates:row.morphology_recovery_candidates||[],
    orthographic_variant_recovery_candidates:row.orthographic_variant_recovery_candidates||[],
    possessive_recovery_candidates:row.possessive_recovery_candidates||[],
    published_locale_gap:row.published_locale_gap||null,
    cmudict:Boolean(row.cmudict),
    esdb_current:Boolean(row.esdb_current),
  };
}

const classes=new Map();
let rowsRead=0;
let malformed=0;
const inputLines=createInterface({input:createReadStream(input),crlfDelay:Infinity});
for await(const line of inputLines){
  if(!line) continue;
  let row;
  try{row=JSON.parse(line);}catch{malformed+=1;continue;}
  rowsRead+=1;
  const rescueClass=classFor(row);
  if(!rescueClass) continue;
  let item=classes.get(rescueClass);
  if(!item){
    item={
      count:0,
      by_rank_band:Object.fromEntries(rankBands.map((band)=>[band.label,0])),
      top_ranked:[],
      examples:[],
    };
    classes.set(rescueClass,item);
  }
  item.count+=1;
  const band=bandFor(row.rank);
  if(Object.hasOwn(item.by_rank_band,band)) item.by_rank_band[band]+=1;
  const compact=minimalRow(row);
  item.top_ranked.push(compact);
  item.top_ranked.sort((a,b)=>a.rank-b.rank||a.surface.localeCompare(b.surface,'en'));
  if(item.top_ranked.length>samplePerClass) item.top_ranked.length=samplePerClass;
  if(item.examples.length<samplePerClass) item.examples.push(compact);
}

const orderedClassNames=[
  'tier_a_exact_cmudict_possessive',
  'tier_a_punctuation_only_alias',
  'tier_b_strict_source_backed_inflection',
  'tier_b_analyzed_unprofiled_ipa',
  'tier_b_analyzed_en_gb_plus_unprofiled',
  'tier_c_analyzed_en_gb_only',
  'tier_c_esdb_current_plus_exact_cmudict',
  'review_exact_cmudict_without_lexical_guard',
  'review_deterministic_initialism_composition',
  'review_proper_name_channel',
  'unresolved_pronunciation',
];

const classReport={};
for(const name of orderedClassNames){
  const item=classes.get(name);
  if(!item) continue;
  item.examples.sort((a,b)=>a.rank-b.rank||a.surface.localeCompare(b.surface,'en'));
  classReport[name]=item;
}

function count(name){return classReport[name]?.count||0;}
const tierA=count('tier_a_exact_cmudict_possessive')+count('tier_a_punctuation_only_alias');
const tierB=tierA
  +count('tier_b_strict_source_backed_inflection')
  +count('tier_b_analyzed_unprofiled_ipa')
  +count('tier_b_analyzed_en_gb_plus_unprofiled');

const report={
  schema:'rhymelab-en-coverage-rescue-policy-v1',
  input,
  rows_read:rowsRead,
  malformed_lines:malformed,
  policy:{
    tier_a:'No guessed pronunciation: exact CMUdict possessives or punctuation-only aliases to an analyzed en-US lemma.',
    tier_b:'Deterministic source-backed recovery candidates requiring an explicit implementation/benchmark gate before default promotion.',
    tier_c:'Useful evidence but not automatically ordinary default English; retain provenance and review channel policy.',
    morphology_gate:{
      blocked_tags:[...morphologyBlockTags].sort(),
      plural_or_third_person_shapes:['s_suffix','es_suffix','y_to_ies'],
      past_shapes:['ed_suffix','e_to_ed','y_to_ied'],
      progressive_shapes:['ing_suffix','drop_e_ing','ie_to_ying'],
    },
  },
  totals:{
    tier_a_immediate_candidates:tierA,
    tier_a_plus_tier_b_candidates:tierB,
  },
  classes:classReport,
};

await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n','utf8');

console.log('\nPHASE 12B6 ENGLISH RESCUE POLICY COUNTS');
console.log(JSON.stringify({
  schema:report.schema,
  rows_read:rowsRead,
  tier_a_immediate_candidates:tierA,
  tier_a_plus_tier_b_candidates:tierB,
  classes:Object.fromEntries(Object.entries(classReport).map(([name,item])=>[name,item.count])),
  report:out,
},null,2));
