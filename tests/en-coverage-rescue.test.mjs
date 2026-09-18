import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  ENGLISH_WRITER_DB_SCHEMA,
  createEnglishWriterDbStorage,
  insertEnglishPublishRow,
  prepareEnglishWriterDbInserts,
} from '../scripts/en-writer-db-core.mjs';

const rescueScript=resolve('scripts/analyze-en-coverage-rescue-policy.mjs');
const fallbackScript=resolve('scripts/diagnose-en-pronunciation-fallback.mjs');
const wordlistScript=resolve('scripts/audit-en-wordlist-coverage.mjs');

test('English rescue policy diagnostic classifies bounded recovery channels',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-en-rescue-'));
  const input=join(dir,'candidates.jsonl');
  const out=join(dir,'report.json');
  const rows=[
    {
      rank:100,surface:"team's",normalized:"team's",zipf:4,
      status:'possessive_with_cmudict_and_analyzed_en_us_base',
      lexical_tags:[],relation_kinds:[],cmudict:true,esdb_current:false,
      possessive_recovery_candidates:[{lemma:'team',kind:'possessive_surface'}],
    },
    {
      rank:200,surface:'dont',normalized:'dont',zipf:4,
      status:'orthographic_variant_with_analyzed_en_us_lemma',
      lexical_tags:['contraction'],relation_kinds:['alt_of'],cmudict:false,esdb_current:false,
      analyzed_en_us_lemma_candidates:["don't"],
      orthographic_variant_recovery_candidates:[{lemma:"don't",kind:'punctuation_only_variant'}],
    },
    {
      rank:300,surface:'tweeting',normalized:'tweeting',zipf:4,
      status:'regular_inflection_shape_with_analyzed_en_us_lemma',
      lexical_tags:['form-of','gerund','participle','present'],relation_kinds:['form_of'],
      analyzed_en_us_lemma_candidates:['tweet'],
      morphology_recovery_candidates:[{lemma:'tweet',shape:'ing_suffix'}],
    },
    {
      rank:400,surface:'theres',normalized:'theres',zipf:4,
      status:'regular_inflection_shape_with_analyzed_en_us_lemma',
      lexical_tags:['contraction','form-of','plural'],relation_kinds:['form_of'],
      analyzed_en_us_lemma_candidates:['there'],
      morphology_recovery_candidates:[{lemma:'there',shape:'s_suffix'}],
    },
    {
      rank:500,surface:'undead',normalized:'undead',zipf:4,
      status:'published_no_analyzed_en_us_pronunciation',
      lexical_tags:[],relation_kinds:[],published_locale_gap:'analyzed_unprofiled_no_en_us',
    },
  ];
  await writeFile(input,rows.map((row)=>JSON.stringify(row)).join('\n')+'\n');
  execFileSync(process.execPath,[rescueScript,'--input',input,'--out',out],{stdio:'pipe'});
  const report=JSON.parse(await readFile(out,'utf8'));
  assert.equal(report.rows_read,5);
  assert.equal(report.classes.tier_a_exact_cmudict_possessive.count,1);
  assert.equal(report.classes.tier_a_punctuation_only_alias.count,1);
  assert.equal(report.classes.tier_b_strict_source_backed_inflection.count,1);
  assert.equal(report.classes.tier_b_analyzed_unprofiled_ipa.count,1);
  assert.equal(report.totals.tier_a_immediate_candidates,2);
  assert.equal(report.totals.tier_a_plus_tier_b_candidates,4);
});

test('English pronunciation fallback diagnostic compares rhyme-domain preservation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-en-fallback-'));
  const publish=join(dir,'publish');
  await mkdir(publish,{recursive:true});
  const shard='shard-000001.jsonl';
  const analysis=(e,ft,vf,vk,sc,st,ps,rt=e,ph=e)=>({e,ft,vf,vk,sc,st,ps,rt,ph});
  const rows=[
    {
      surface:'alpha',normalized:'alpha',
      pronunciations:[
        {source:'cmudict',raw:'A',locales:['en-US'],analysis_status:'ok',analysis:analysis('TAIL','tail','VF','VK',2,'20',1,'t . a i l','t a i l')},
        {source:'wiktionary',raw:'/a/',locales:[],analysis_status:'ok',analysis:analysis('TAIL','tail','VF','VK',2,'20',1,'t . a i l','t a i l')},
        {source:'wiktionary',raw:'/b/',locales:['en-GB'],analysis_status:'ok',analysis:analysis('OTHER','other','VG','VG',2,'20',1,'o . t h e r','o t h e r')},
      ],
    },
  ];
  await writeFile(join(publish,shard),rows.map((row)=>JSON.stringify(row)).join('\n')+'\n');
  await writeFile(join(publish,'manifest.json'),JSON.stringify({
    schema:'rhymelab-en-publish-v1',
    policy:'fixture',
    semantic_fingerprint:'fixture-fingerprint',
    files:[{file:shard}],
  })+'\n');
  const out=join(dir,'fallback-report.json');
  execFileSync(process.execPath,[fallbackScript,'--publish',publish,'--out',out],{stdio:'pipe'});
  const report=JSON.parse(await readFile(out,'utf8'));
  assert.equal(report.comparisons.unprofiled_all_vs_en_us.surfaces,1);
  assert.equal(report.comparisons.unprofiled_all_vs_en_us.exact_tail_match_pct,100);
  assert.equal(report.comparisons.unprofiled_all_vs_en_us.boundary_insensitive_tail_match_pct,100);
  assert.equal(report.comparisons.en_gb_vs_en_us.surfaces,1);
  assert.equal(report.comparisons.en_gb_vs_en_us.exact_tail_match_pct,0);
});


test('English pronunciation fallback diagnostic detects boundary-only exact-key disagreement',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-en-boundary-'));
  const publish=join(dir,'publish');
  await mkdir(publish,{recursive:true});
  const shard='shard-000001.jsonl';
  const rows=[{
    surface:'abacus',
    normalized:'abacus',
    pronunciations:[
      {
        source:'cmudict',raw:'AE1 B AH0 K AH0 S',locales:['en-US'],analysis_status:'ok',
        analysis:{e:'æ.bə.kəs',ft:'ə s',vf:'AE-SCHWA-SCHWA',vk:'æ-ə-ə',sc:3,st:'200',ps:1,rt:'æ . b ə . k ə s',ph:'æ b ə k ə s'},
      },
      {
        source:'wiktionary',raw:'/ˈæb.ə.kəs/',locales:[],analysis_status:'ok',
        analysis:{e:'æb.ə.kəs',ft:'ə s',vf:'AE-SCHWA-SCHWA',vk:'æ-ə-ə',sc:3,st:'200',ps:1,rt:'æ b . ə . k ə s',ph:'æ b ə k ə s'},
      },
    ],
  }];
  await writeFile(join(publish,shard),rows.map((row)=>JSON.stringify(row)).join('\n')+'\n');
  await writeFile(join(publish,'manifest.json'),JSON.stringify({
    schema:'rhymelab-en-publish-v1',policy:'fixture',semantic_fingerprint:'boundary-fixture',files:[{file:shard}],
  })+'\n');
  const out=join(dir,'fallback-report.json');
  execFileSync(process.execPath,[fallbackScript,'--publish',publish,'--out',out],{stdio:'pipe'});
  const report=JSON.parse(await readFile(out,'utf8'));
  const comparison=report.comparisons.unprofiled_all_vs_en_us;
  assert.equal(comparison.exact_tail_match_pct,0);
  assert.equal(comparison.boundary_insensitive_tail_match_pct,100);
  assert.equal(comparison.boundary_insensitive_tail_plus_stress_match_pct,100);
  assert.equal(comparison.phoneme_sequence_match_pct,100);
  assert.equal(comparison.exact_tail_mismatch_but_boundary_insensitive_tail_match,1);
});

test('English wordlist coverage audit separates DB presence, default selection and sidecar status',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-en-wordlist-'));
  const dbPath=join(dir,'en.sqlite');
  const candidates=join(dir,'candidates.jsonl');
  const input=join(dir,'words.tsv');
  const out=join(dir,'report.json');
  const tsv=join(dir,'report.tsv');

  const db=new DatabaseSync(dbPath);
  createEnglishWriterDbStorage(db);
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('schema',ENGLISH_WRITER_DB_SCHEMA);
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('publish_fingerprint','fixture-publish');
  const insert=prepareEnglishWriterDbInserts(db);
  const analysis={ph:'s t ɛ d i',sc:2,st:'20',ps:1,rt:'ɛ . d i',ft:'i',e:'ɛ.di',m:'ɛ.di',vk:'ɛ-i',vf:'E-IY',ck:'',rs:2,rh:0};
  insertEnglishPublishRow(insert,{
    publish_order:1,surface:'steady',normalized:'steady',surface_variants:['steady'],
    lexical:{poses:['adj'],lemmas:[],relation_kinds:[],tags:[],evidence_kinds:['wiktionary_headword'],current_evidence_count:1,historical_evidence_count:0,proper_name_evidence_count:0,common_lexical_evidence_count:1},
    pronunciations:[{source:'cmudict',notation:'arpabet',raw:'S T EH1 D IY0',locales:['en-US'],tags:[],evidence_count:1,analysis_status:'ok',analysis}],
    esdb:null,usage:{rank:100,zipf:4.5},
    eligibility:{historical_only:false,proper_name_only:false,analyzed_en_us:true,default_eligible:true,exclusion_reasons:[]},
  });
  insertEnglishPublishRow(insert,{
    publish_order:2,surface:'yclept',normalized:'yclept',surface_variants:['yclept'],
    lexical:{poses:['verb'],lemmas:[],relation_kinds:[],tags:['archaic'],evidence_kinds:['wiktionary_headword'],current_evidence_count:0,historical_evidence_count:1,proper_name_evidence_count:0,common_lexical_evidence_count:1},
    pronunciations:[{source:'cmudict',notation:'arpabet',raw:'Y K L EH1 P T',locales:['en-US'],tags:[],evidence_count:1,analysis_status:'ok',analysis}],
    esdb:null,usage:null,
    eligibility:{historical_only:true,proper_name_only:false,analyzed_en_us:true,default_eligible:false,exclusion_reasons:['historical_only']},
  });
  db.close();

  await writeFile(candidates,JSON.stringify({
    rank:999,surface:'zarf',normalized:'zarf',zipf:2.1,status:'no_source_backed_pronunciation',
    lexical_headword:true,lexical_listed_form:false,wiktionary_ipa:false,wiktionary_us_ipa:false,
    wiktionary_gb_ipa:false,wiktionary_unqualified_ipa:false,cmudict:false,esdb:true,esdb_current:true,
    relation_kinds:[],lemma_candidates:[],morphology_recovery_candidates:[],orthographic_variant_recovery_candidates:[],
    possessive_recovery_candidates:[],published_locale_gap:null,publish_exclusion_reasons:[],
  })+'\n');
  await writeFile(input,'No web source was used.\nrarity\tword\nTier counts are descriptive metadata.\n1\tsteady\n9\tyclept\n10\tzarf\n');

  execFileSync(process.execPath,[
    wordlistScript,'--input',input,'--db',dbPath,'--candidates',candidates,'--out',out,'--tsv-out',tsv,
  ],{stdio:'pipe'});
  const report=JSON.parse(await readFile(out,'utf8'));
  assert.equal(report.rows,3);
  assert.equal(report.structured_rarity_input,true);
  assert.equal(report.ignored_metadata_lines,2);
  assert.equal(report.summary.in_database.count,2);
  assert.equal(report.summary.default_selected.count,1);
  assert.equal(report.summary.published_non_default.count,1);
  assert.equal(report.summary.missing_from_database.count,1);
  assert.equal(report.missing_from_database[0].surface,'zarf');
  assert.equal(report.missing_from_database[0].coverage_candidate.status,'no_source_backed_pronunciation');
  assert.equal(report.by_rarity['1'].default_selected.count,1);
  assert.equal(report.by_rarity['9'].published_non_default.count,1);
  assert.equal(report.by_rarity['10'].missing_from_database.count,1);
});


test('English fallback diagnostic separates true unqualified, other-profiled and partial IPA',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-en-provenance-'));
  const publish=join(dir,'publish');
  await mkdir(publish,{recursive:true});
  const shard='shard-000001.jsonl';
  const analysis={e:'tail',ft:'tail',vf:'V',vk:'v',sc:1,st:'2',ps:1,rt:'t a i l',ph:'t a i l'};
  const rows=[{
    surface:'probe',normalized:'probe',
    pronunciations:[
      {source:'cmudict',raw:'P R OW1 B',locales:['en-US'],tags:[],analysis_status:'ok',analysis},
      {source:'wiktionary',raw:'/tail/',locales:[],tags:[],analysis_status:'ok',analysis},
      {source:'wiktionary',raw:'/teil/',locales:[],tags:['Australia'],analysis_status:'ok',analysis},
      {source:'wiktionary',raw:'/-tail/',locales:[],tags:[],analysis_status:'ok',analysis},
    ],
  }];
  await writeFile(join(publish,shard),rows.map((row)=>JSON.stringify(row)).join('\n')+'\n');
  await writeFile(join(publish,'manifest.json'),JSON.stringify({
    schema:'rhymelab-en-publish-v1',policy:'fixture',semantic_fingerprint:'provenance-fixture',files:[{file:shard}],
  })+'\n');
  const out=join(dir,'fallback-report.json');
  execFileSync(process.execPath,[fallbackScript,'--publish',publish,'--out',out],{stdio:'pipe'});
  const report=JSON.parse(await readFile(out,'utf8'));
  assert.equal(report.schema,'rhymelab-en-pronunciation-fallback-diagnostic-v2');
  assert.equal(report.surface_inventory.analyzed_unqualified_fullword,1);
  assert.equal(report.surface_inventory.analyzed_other_profiled,1);
  assert.equal(report.surface_inventory.analyzed_unqualified_partial,1);
  assert.equal(report.variant_inventory.analyzed_unqualified_fullword,1);
  assert.equal(report.variant_inventory.analyzed_other_profiled,1);
  assert.equal(report.variant_inventory.analyzed_unqualified_partial,1);
  assert.equal(report.comparisons.unqualified_fullword_vs_en_us.surfaces,1);
  assert.equal(report.comparisons.other_profiled_vs_en_us.surfaces,1);
  assert.equal(report.comparisons.unqualified_partial_vs_en_us.surfaces,1);
});
