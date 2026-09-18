#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { normalizeEnglishSurface } from './en-writer-source-core.mjs';
import { ENGLISH_WRITER_DB_SCHEMA } from './en-writer-db-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]??fallback):fallback;
}
function pct(n,d){return d?Number((100*n/d).toFixed(2)):0;}

const inputArg=argValue('--input');
if(!inputArg){
  throw new Error('Missing --input <wordlist>. Accepts "rarity<TAB>word", "rarity word", or one word per line.');
}
const input=resolve(inputArg);
const dbPath=resolve(argValue('--db','data/local/rhymelab-en-v1.sqlite'));
const candidatesPath=resolve(argValue('--candidates','data/local/en-coverage-candidates-v1.jsonl'));
const out=resolve(argValue('--out','data/local/en-wordlist-coverage-v1-report.json'));
const tsvOut=resolve(argValue('--tsv-out','data/local/en-wordlist-coverage-v1.tsv'));

function parseWordList(text){
  const rows=[];
  let lineNumber=0;
  for(const rawLine of text.split(/\r?\n/u)){
    lineNumber+=1;
    const line=rawLine.trim();
    if(!line||line.startsWith('#')) continue;
    if(/^rarity\s+word$/iu.test(line)) continue;
    if(/^\d+\s+RANDOM ENGLISH WORDS/iu.test(line)) continue;
    let rarity=null;
    let surface=line;
    const tabMatch=line.match(/^(\d+)\t(.+)$/u);
    const spacedMatch=line.match(/^(\d+)\s+(.+)$/u);
    const match=tabMatch||spacedMatch;
    if(match){
      rarity=Number.parseInt(match[1],10);
      surface=match[2].trim();
    }
    const normalized=normalizeEnglishSurface(surface);
    if(!normalized) continue;
    rows.push({line:lineNumber,rarity:Number.isInteger(rarity)?rarity:null,surface,normalized});
  }
  return rows;
}

const list=parseWordList(await readFile(input,'utf8'));
if(!list.length) throw new Error('Wordlist contained no usable rows.');
const uniqueTargets=new Set(list.map((row)=>row.normalized));
const duplicateRows=list.length-uniqueTargets.size;

try{await access(dbPath);}catch{
  throw new Error(`English DB not found: ${dbPath}. Run npm run en:db first.`);
}

const db=new DatabaseSync(dbPath,{readOnly:true});
const meta=(key)=>db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
if(meta('schema')!==ENGLISH_WRITER_DB_SCHEMA){
  db.close();
  throw new Error(`Unexpected English DB schema: ${meta('schema')}`);
}

const formStmt=db.prepare(`
  SELECT id,surface,normalized,poses,lemmas,relation_kinds,lexical_tags,evidence_kinds,
         historical_only,proper_name_only,analyzed_en_us,default_eligible,exclusion_reasons,
         esdb_min_size,esdb_regions,esdb_pos_classes,esdb_archaic,esdb_uncommon,esdb_invalid,
         wordfreq_rank,wordfreq_zipf
  FROM en_form
  WHERE normalized=?
`);
const pronStmt=db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN analysis_status='ok' THEN 1 ELSE 0 END) AS analyzed,
    SUM(CASE WHEN locale_us=1 AND analysis_status='ok' THEN 1 ELSE 0 END) AS analyzed_us,
    SUM(CASE WHEN locale_gb=1 AND analysis_status='ok' THEN 1 ELSE 0 END) AS analyzed_gb,
    SUM(CASE WHEN source_attested_unprofiled=1 AND analysis_status='ok' THEN 1 ELSE 0 END) AS analyzed_unprofiled,
    SUM(CASE WHEN default_profile_eligible=1 THEN 1 ELSE 0 END) AS default_profile
  FROM en_pronunciation
  WHERE form_id=?
`);

const candidateByNormalized=new Map();
let candidatesAvailable=true;
try{
  await access(candidatesPath);
  const lines=createInterface({input:createReadStream(candidatesPath),crlfDelay:Infinity});
  for await(const line of lines){
    if(!line) continue;
    let row;
    try{row=JSON.parse(line);}catch{continue;}
    if(uniqueTargets.has(row.normalized)) candidateByNormalized.set(row.normalized,row);
    if(candidateByNormalized.size===uniqueTargets.size) break;
  }
}catch{
  candidatesAvailable=false;
}

function parseJson(value,fallback=[]){
  try{return JSON.parse(value);}catch{return fallback;}
}
function numberOrZero(value){return Number(value||0);}

const results=[];
try{
  for(const item of list){
    const form=formStmt.get(item.normalized)||null;
    const pronunciation=form?pronStmt.get(form.id):null;
    const candidate=candidateByNormalized.get(item.normalized)||null;
    const pron=pronunciation?{
      total:numberOrZero(pronunciation.total),
      analyzed:numberOrZero(pronunciation.analyzed),
      analyzed_en_us:numberOrZero(pronunciation.analyzed_us),
      analyzed_en_gb:numberOrZero(pronunciation.analyzed_gb),
      analyzed_unprofiled:numberOrZero(pronunciation.analyzed_unprofiled),
      default_profile:numberOrZero(pronunciation.default_profile),
    }:null;

    let selection_status;
    if(form?.default_eligible) selection_status='default_selected';
    else if(form) selection_status='published_non_default';
    else if(candidate) selection_status=`coverage_candidate_${candidate.status||'unclassified'}`;
    else selection_status='absent_from_db_and_coverage_sidecar';

    results.push({
      ...item,
      in_database:Boolean(form),
      in_default_selection:Boolean(form?.default_eligible),
      in_wordfreq_coverage_sidecar:Boolean(candidate),
      selection_status,
      database:form?{
        stored_surface:form.surface,
        poses:parseJson(form.poses),
        lemmas:parseJson(form.lemmas),
        relation_kinds:parseJson(form.relation_kinds),
        lexical_tags:parseJson(form.lexical_tags),
        evidence_kinds:parseJson(form.evidence_kinds),
        historical_only:Boolean(form.historical_only),
        proper_name_only:Boolean(form.proper_name_only),
        analyzed_en_us:Boolean(form.analyzed_en_us),
        default_eligible:Boolean(form.default_eligible),
        exclusion_reasons:parseJson(form.exclusion_reasons),
        esdb_min_size:form.esdb_min_size,
        esdb_regions:parseJson(form.esdb_regions),
        esdb_pos_classes:parseJson(form.esdb_pos_classes),
        esdb_archaic:Boolean(form.esdb_archaic),
        esdb_uncommon:Boolean(form.esdb_uncommon),
        esdb_invalid:Boolean(form.esdb_invalid),
        wordfreq_rank:form.wordfreq_rank,
        wordfreq_zipf:form.wordfreq_zipf,
        pronunciations:pron,
      }:null,
      coverage_candidate:candidate?{
        rank:candidate.rank,
        zipf:candidate.zipf,
        status:candidate.status,
        lexical_headword:Boolean(candidate.lexical_headword),
        lexical_listed_form:Boolean(candidate.lexical_listed_form),
        wiktionary_ipa:Boolean(candidate.wiktionary_ipa),
        wiktionary_us_ipa:Boolean(candidate.wiktionary_us_ipa),
        wiktionary_gb_ipa:Boolean(candidate.wiktionary_gb_ipa),
        wiktionary_unqualified_ipa:Boolean(candidate.wiktionary_unqualified_ipa),
        cmudict:Boolean(candidate.cmudict),
        esdb:Boolean(candidate.esdb),
        esdb_current:Boolean(candidate.esdb_current),
        relation_kinds:candidate.relation_kinds||[],
        lemma_candidates:candidate.lemma_candidates||[],
        morphology_recovery_candidates:candidate.morphology_recovery_candidates||[],
        orthographic_variant_recovery_candidates:candidate.orthographic_variant_recovery_candidates||[],
        possessive_recovery_candidates:candidate.possessive_recovery_candidates||[],
        published_locale_gap:candidate.published_locale_gap||null,
        publish_exclusion_reasons:candidate.publish_exclusion_reasons||[],
      }:null,
    });
  }
}finally{
  db.close();
}

function summarize(rows){
  const total=rows.length;
  const dbCount=rows.filter((row)=>row.in_database).length;
  const defaultCount=rows.filter((row)=>row.in_default_selection).length;
  const sidecarCount=rows.filter((row)=>row.in_wordfreq_coverage_sidecar).length;
  const dbNonDefault=rows.filter((row)=>row.in_database&&!row.in_default_selection).length;
  const missingDb=rows.filter((row)=>!row.in_database).length;
  const analyzedUs=rows.filter((row)=>row.database?.pronunciations?.analyzed_en_us>0).length;
  const analyzedAny=rows.filter((row)=>row.database?.pronunciations?.analyzed>0).length;
  return {
    total,
    in_database:{count:dbCount,pct:pct(dbCount,total)},
    default_selected:{count:defaultCount,pct:pct(defaultCount,total)},
    published_non_default:{count:dbNonDefault,pct:pct(dbNonDefault,total)},
    missing_from_database:{count:missingDb,pct:pct(missingDb,total)},
    in_wordfreq_coverage_sidecar:{count:sidecarCount,pct:pct(sidecarCount,total)},
    with_any_analyzed_pronunciation:{count:analyzedAny,pct:pct(analyzedAny,total)},
    with_analyzed_en_us_pronunciation:{count:analyzedUs,pct:pct(analyzedUs,total)},
  };
}

const rarityValues=[...new Set(results.map((row)=>row.rarity).filter(Number.isInteger))].sort((a,b)=>a-b);
const byRarity=Object.fromEntries(rarityValues.map((rarity)=>[
  String(rarity),
  summarize(results.filter((row)=>row.rarity===rarity)),
]));

const report={
  schema:'rhymelab-en-wordlist-coverage-v1',
  input,
  database:dbPath,
  database_schema:ENGLISH_WRITER_DB_SCHEMA,
  database_publish_fingerprint:meta('publish_fingerprint'),
  coverage_candidates:candidatesAvailable?candidatesPath:null,
  coverage_candidates_available:candidatesAvailable,
  rows:list.length,
  unique_normalized_surfaces:uniqueTargets.size,
  duplicate_normalized_rows:duplicateRows,
  summary:summarize(results),
  by_rarity:byRarity,
  counts_by_selection_status:Object.fromEntries(
    [...new Set(results.map((row)=>row.selection_status))]
      .sort()
      .map((status)=>[status,results.filter((row)=>row.selection_status===status).length])
  ),
  missing_from_database:results.filter((row)=>!row.in_database).map((row)=>({
    rarity:row.rarity,surface:row.surface,normalized:row.normalized,
    in_wordfreq_coverage_sidecar:row.in_wordfreq_coverage_sidecar,
    coverage_candidate:row.coverage_candidate,
  })),
  published_non_default:results.filter((row)=>row.in_database&&!row.in_default_selection).map((row)=>({
    rarity:row.rarity,surface:row.surface,normalized:row.normalized,database:row.database,
  })),
  rows_detail:results,
};

await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n','utf8');

const header=[
  'rarity','surface','normalized','in_database','in_default_selection','in_wordfreq_coverage_sidecar',
  'selection_status','wordfreq_rank','wordfreq_zipf','analyzed_pronunciations','analyzed_en_us_pronunciations',
  'analyzed_unprofiled_pronunciations','coverage_status','exclusion_reasons',
];
function safeTsv(value){
  return String(value??'').replace(/[\t\r\n]+/gu,' ');
}
const tsvLines=[header.join('\t')];
for(const row of results){
  tsvLines.push([
    row.rarity??'',row.surface,row.normalized,row.in_database?1:0,row.in_default_selection?1:0,
    row.in_wordfreq_coverage_sidecar?1:0,row.selection_status,
    row.database?.wordfreq_rank??'',row.database?.wordfreq_zipf??'',
    row.database?.pronunciations?.analyzed??0,row.database?.pronunciations?.analyzed_en_us??0,
    row.database?.pronunciations?.analyzed_unprofiled??0,row.coverage_candidate?.status??'',
    (row.database?.exclusion_reasons||[]).join(','),
  ].map(safeTsv).join('\t'));
}
await mkdir(dirname(tsvOut),{recursive:true});
await writeFile(tsvOut,tsvLines.join('\n')+'\n','utf8');

console.log('\nPHASE 12B6 ENGLISH WORDLIST COVERAGE');
console.log(JSON.stringify({
  schema:report.schema,
  rows:report.rows,
  unique_normalized_surfaces:report.unique_normalized_surfaces,
  coverage_candidates_available:report.coverage_candidates_available,
  summary:report.summary,
  by_rarity:report.by_rarity,
  missing_from_database:report.missing_from_database.length,
  published_non_default:report.published_non_default.length,
  report:out,
  tsv:tsvOut,
},null,2));
