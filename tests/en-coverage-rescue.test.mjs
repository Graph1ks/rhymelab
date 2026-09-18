import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const rescueScript=resolve('scripts/analyze-en-coverage-rescue-policy.mjs');
const fallbackScript=resolve('scripts/diagnose-en-pronunciation-fallback.mjs');

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
  const analysis=(e,ft,vf,vk,sc,st,ps)=>({e,ft,vf,vk,sc,st,ps});
  const rows=[
    {
      surface:'alpha',normalized:'alpha',
      pronunciations:[
        {source:'cmudict',raw:'A',locales:['en-US'],analysis_status:'ok',analysis:analysis('TAIL','tail','VF','VK',2,'20',1)},
        {source:'wiktionary',raw:'/a/',locales:[],analysis_status:'ok',analysis:analysis('TAIL','tail','VF','VK',2,'20',1)},
        {source:'wiktionary',raw:'/b/',locales:['en-GB'],analysis_status:'ok',analysis:analysis('OTHER','other','VG','VG',2,'20',1)},
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
  assert.equal(report.comparisons.unprofiled_vs_en_us.surfaces,1);
  assert.equal(report.comparisons.unprofiled_vs_en_us.exact_tail_match_pct,100);
  assert.equal(report.comparisons.en_gb_vs_en_us.surfaces,1);
  assert.equal(report.comparisons.en_gb_vs_en_us.exact_tail_match_pct,0);
});
