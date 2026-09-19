import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  analyzeEntityAiArpabet,
  classifyEntityAiSurface,
  englishAnalysisToIpa,
  validateEntityAiArpabet,
  validateEntityAiArtifactManifest,
  validateEntityAiResultRow,
} from '../scripts/entity-ai-pronunciation-core.mjs';
import {
  prepareEnglishEntityRuntimeStatements,
  resolveEnglishEntitySourceRuntime,
} from '../scripts/entity-english-runtime-core.mjs';
import {
  createEntityPronunciationSourceStorage,
  insertEntityPronunciationEvidence,
  prepareEntityPronunciationSourceInsert,
  cmudictEntityPronunciation,
} from '../scripts/entity-pronunciation-source-expansion-core.mjs';
import { analyzeEnglishArpabet } from '../scripts/english-phonology.mjs';

test('Entity AI ARPAbet validator enforces phone separation, stress and word boundaries',()=>{
  assert.equal(validateEntityAiArpabet('T OY0 OW1 T AH0').valid,true);
  assert.equal(validateEntityAiArpabet('D AA1 R K | S AY1 D').valid,true);
  assert.equal(validateEntityAiArpabet('D AA1 R K | AH0 V | DH AH0 | M UW1 N').valid,true);
  assert.equal(validateEntityAiArpabet('MIY1').valid,false);
  assert.equal(validateEntityAiArpabet('M IY').valid,false);
  assert.equal(validateEntityAiArpabet('M IY1 |').valid,false);
});

test('Entity AI ARPAbet analysis preserves compact deterministic English features',()=>{
  const row=analyzeEntityAiArpabet('D AA1 R K | S AY1 D');
  assert.equal(row.syllable_count,2);
  assert.equal(row.primary_stress,2);
  assert.equal(row.rhyme_tail,'aɪ d');
  assert.equal(row.exact_key,'aɪd');
  assert.match(row.ipa,/ /u);

  const ipa=englishAnalysisToIpa(analyzeEnglishArpabet('T OY0 OW1 T AH0'));
  assert.match(ipa,/ˈ/u);
});

test('Entity AI result rows use compact five-column contract',()=>{
  assert.equal(validateEntityAiResultRow(['17','T OY0 OW1 T AH0','98','C','']).valid,true);
  assert.equal(validateEntityAiResultRow(['18','K AE1 R AH0','76','A','K ER1']).valid,true);
  assert.equal(validateEntityAiResultRow(['19','','20','U','']).valid,true);
  assert.equal(validateEntityAiResultRow(['20','M IY1','99','C','M IY1']).valid,false);
  assert.equal(validateEntityAiResultRow(['21','MIY1','99','C','']).valid,false);
});


test('Entity AI surface diagnostics classify orthography without deciding pronunciation',()=>{
  assert.deepEqual(classifyEntityAiSurface('Time'),['single_word','ascii_only']);
  assert.ok(classifyEntityAiSurface("O'Connor").includes('contains_apostrophe'));
  assert.ok(classifyEntityAiSurface('T-Mobile').includes('contains_hyphen'));
  assert.ok(classifyEntityAiSurface('Björk').includes('non_ascii'));
  assert.ok(classifyEntityAiSurface('東京 2024').includes('contains_non_latin_letter'));
  assert.ok(classifyEntityAiSurface('東京 2024').includes('contains_digit'));
  assert.ok(classifyEntityAiSurface('東京 2024').includes('multiword'));
});

test('Entity AI manifest validation enforces SHA, counters and contiguous batch IDs',()=>{
  const base={
    input_archive:'inputs.zip',
    selected_input_tsv_filename:'batch_0001_0000001-0000002.tsv',
    configured_START_ID:1,
    status:'complete',
    input_row_count:2,
    completed_row_count:2,
    first_input_id:1,
    last_input_id:2,
    first_completed_id:1,
    last_completed_id:2,
    next_unprocessed_id:null,
    count_C:1,
    count_A:1,
    count_U:0,
    duplicate_id_count:0,
    missing_id_count:0,
    extra_id_count:0,
    invalid_row_count:0,
    results_sha256:'a'.repeat(64),
  };
  const valid=validateEntityAiArtifactManifest(base,{
    resultsSha:'a'.repeat(64),
    resultIds:[1,2],
    decisionCounts:{C:1,A:1,U:0},
  });
  assert.equal(valid.valid,true);

  const missingSha=validateEntityAiArtifactManifest({...base,results_sha256:''},{
    resultsSha:'a'.repeat(64),
    resultIds:[1,2],
    decisionCounts:{C:1,A:1,U:0},
  });
  assert.equal(missingSha.valid,false);
  assert.ok(missingSha.errors.includes('manifest_results_sha256_missing_or_invalid'));

  const gap=validateEntityAiArtifactManifest(base,{
    resultsSha:'a'.repeat(64),
    resultIds:[1,3],
    decisionCounts:{C:1,A:1,U:0},
  });
  assert.equal(gap.valid,false);
  assert.ok(gap.errors.includes('result_ids_not_contiguous_from_batch_start'));
});

test('Entity AI importer is idempotent for an identical already-imported artifact',async()=>{
  const root=await mkdtemp(join(tmpdir(),'rhymelab-entity-ai-test-'));
  try{
    const artifact=join(root,'artifact');
    await mkdir(artifact,{recursive:true});
    const results='id\tarp\tq\tf\talt\n1\tT AY1 M\t98\tC\t\n';
    const sha=createHash('sha256').update(Buffer.from(results)).digest('hex');
    const manifest={
      input_archive:'inputs.zip',
      selected_input_tsv_filename:'batch_0001_0000001-0000001.tsv',
      configured_START_ID:1,
      status:'complete',
      input_row_count:1,
      completed_row_count:1,
      first_input_id:1,
      last_input_id:1,
      first_completed_id:1,
      last_completed_id:1,
      next_unprocessed_id:null,
      count_C:1,
      count_A:0,
      count_U:0,
      duplicate_id_count:0,
      missing_id_count:0,
      extra_id_count:0,
      invalid_row_count:0,
      results_sha256:sha,
    };
    const map=[
      'id\tname_id\tentity_id\tqid\tsurface\tnormalized\tpreferred\tname_kind\tcontext\tcategory\tpopularity_tier\tpopularity_percentile\treason',
      '1\t101\t201\tQ201\tTime\ttime\t1\tlabel\tTime\twork.film\tA\t0.99\tunresolved_source_units',
      '',
    ].join('\n');
    const mapPath=join(root,'AI_ID_MAP_LOCAL_ONLY.tsv');
    const dbPath=join(root,'staging.sqlite');
    const reportPath=join(root,'report.json');
    await Promise.all([
      writeFile(join(artifact,'results.tsv'),results,'utf8'),
      writeFile(join(artifact,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8'),
      writeFile(mapPath,map,'utf8'),
    ]);

    const script=new URL('../scripts/import-entity-ai-pronunciation-result.mjs',import.meta.url);
    const args=[
      script.pathname,
      '--artifact',artifact,
      '--map',mapPath,
      '--out',dbPath,
      '--report',reportPath,
    ];
    const first=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.equal(first.status,0,first.stderr||first.stdout);
    const second=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.equal(second.status,0,second.stderr||second.stdout);
    assert.match(second.stdout,/already_imported/u);

    const db=new DatabaseSync(dbPath,{readOnly:true});
    try{
      assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM ai_batch').get().c),1);
      assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM ai_pronunciation').get().c),1);
    }finally{
      db.close();
    }
    const report=JSON.parse(await readFile(reportPath,'utf8'));
    assert.equal(report.status,'ok');
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
function createEnglishFixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE en_form(
      id INTEGER PRIMARY KEY,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      default_eligible INTEGER NOT NULL
    );
    CREATE TABLE en_pronunciation(
      id INTEGER PRIMARY KEY,
      form_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      notation TEXT NOT NULL,
      raw TEXT NOT NULL,
      default_profile_eligible INTEGER NOT NULL
    );
  `);
  return db;
}

test('English Entity runtime resolution preserves accepted-first then expanded source policy',()=>{
  const en=createEnglishFixture();
  const source=new DatabaseSync(':memory:');
  try{
    createEntityPronunciationSourceStorage(source);
    en.prepare('INSERT INTO en_form(id,surface,normalized,default_eligible) VALUES(1,?,?,1)')
      .run('Dark','dark');
    en.prepare('INSERT INTO en_pronunciation(id,form_id,source,notation,raw,default_profile_eligible) VALUES(1,1,?,?,?,1)')
      .run('cmudict','arpabet','D AA1 R K');

    en.prepare('INSERT INTO en_form(id,surface,normalized,default_eligible) VALUES(2,?,?,1)')
      .run('Side','side');
    en.prepare('INSERT INTO en_pronunciation(id,form_id,source,notation,raw,default_profile_eligible) VALUES(2,2,?,?,?,1)')
      .run('cmudict','arpabet','S AY1 D');

    const insert=prepareEntityPronunciationSourceInsert(source);
    insertEntityPronunciationEvidence(insert,cmudictEntityPronunciation({
      surface:'DEPP',
      normalized:'depp',
      pronunciation:'D EH1 P',
    }));

    const statements=prepareEnglishEntityRuntimeStatements(en,source);
    const accepted=resolveEnglishEntitySourceRuntime('Dark Side',statements);
    assert.equal(accepted.status,'bounded_accepted_token_composition');
    assert.equal(accepted.pronunciation.generated,false);
    assert.equal(accepted.pronunciation.locale,'en-US');

    const expanded=resolveEnglishEntitySourceRuntime('Depp',statements);
    assert.equal(expanded.status,'exact_expanded_source');
    assert.equal(expanded.pronunciation.source_kind,'cmudict_raw_entity');

    const missing=resolveEnglishEntitySourceRuntime('Unresolvable Xyzzy',statements);
    assert.equal(missing.pronunciation,null);
    assert.ok(missing.unresolved_units.length>0);
  }finally{
    source.close();
    en.close();
  }
});
