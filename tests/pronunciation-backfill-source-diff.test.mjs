import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

function run(args){
  return spawnSync(process.execPath,['--no-warnings','scripts/run-pronunciation-backfill.mjs',...args],{
    cwd:process.cwd(),
    encoding:'utf8',
  });
}

test('source-map plan validates actual DE local inputs without creating a work database',()=>{
  const root=mkdtempSync(join(tmpdir(),'rhymelab-backfill-plan-'));
  try{
    const acceptedPath=join(root,'accepted.sqlite');
    const db=new DatabaseSync(acceptedPath);
    db.exec([
      'CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);',
      'CREATE TABLE hot(normalized TEXT,pronunciation_preferred INTEGER,pronunciation_eligible INTEGER);',
    ].join('\n'));
    db.close();

    const usagePath=join(root,'de-usage.tsv');
    writeFileSync(usagePath,'rank\tform\tnormalized_form\n1\tTest\ttest\n');
    const rawPath=join(root,'de.jsonl.gz');
    writeFileSync(rawPath,gzipSync(Buffer.from(JSON.stringify({lang_code:'de',word:'Test'})+'\n')));
    const work=join(root,'should-not-exist.sqlite');

    const result=run([
      '--phase','plan','--scopes','de',
      '--de-db',acceptedPath,'--de-usage',usagePath,'--de-kaikki',rawPath,
      '--work',work,
    ]);
    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.match(result.stdout,/rhymelab-pronunciation-backfill-source-plan-v1/);
    assert.match(result.stdout,/de_usage_source_minus_accepted/);
    assert.match(result.stdout,/de_wiktionary_headword_source_minus_accepted/);
    assert.match(result.stdout,/de_listed_form_source_minus_accepted/);
    assert.equal(existsSync(work),false);
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
});

test('DE collection diffs actual usage + Kaikki headword/listed-form sources against accepted Writer DB',()=>{
  const root=mkdtempSync(join(tmpdir(),'rhymelab-backfill-de-'));
  try{
    const acceptedPath=join(root,'accepted.sqlite');
    const db=new DatabaseSync(acceptedPath);
    db.exec([
      'CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);',
      'CREATE TABLE hot(',
      ' normalized TEXT,surface TEXT,ipa TEXT,historical INTEGER DEFAULT 0,',
      ' pronunciation_preferred INTEGER,pronunciation_eligible INTEGER,',
      ' usage_rank INTEGER,pronunciation_rank INTEGER,id INTEGER PRIMARY KEY',
      ');',
    ].join('\n'));
    db.prepare('INSERT INTO hot(normalized,surface,ipa,pronunciation_preferred,pronunciation_eligible,id) VALUES(?,?,?,?,?,?)')
      .run('known','Known','ˈkoːn',1,1,1);
    db.close();

    const usagePath=join(root,'de-usage.tsv');
    writeFileSync(usagePath,[
      'rank\tform\tnormalized_form\tusage_score\tcombined_count\tsource_count\tsource_counts_json\tsource_per_million_json',
      '1\tKnown\tknown\t10\t100\t3\t{}\t{}',
      '2\tMissingUsage\tmissingusage\t9\t90\t3\t{}\t{}',
    ].join('\n')+'\n');

    const rawPath=join(root,'de.jsonl.gz');
    writeFileSync(rawPath,gzipSync(Buffer.from([
      JSON.stringify({lang_code:'de',word:'Known',pos:'noun',senses:[{glosses:['known']}],forms:[]}),
      JSON.stringify({lang_code:'de',word:'MissingHead',pos:'noun',senses:[{glosses:['missing']}],forms:[]}),
      JSON.stringify({
        lang_code:'de',word:'Lemma',pos:'verb',senses:[{glosses:['lemma']}],
        forms:[{form:'MissingListed',tags:['past']}],
      }),
    ].join('\n')+'\n')));

    const work=join(root,'work.sqlite');
    const result=run([
      '--phase','collect','--scopes','de',
      '--de-db',acceptedPath,'--de-usage',usagePath,'--de-kaikki',rawPath,
      '--work',work,'--report',join(root,'report.json'),'--review-tsv',join(root,'review.tsv'),
      '--progress-every','1','--commit-every','1',
    ]);
    assert.equal(result.status,0,result.stderr||result.stdout);

    const workDb=new DatabaseSync(work,{readOnly:true});
    const items=workDb.prepare('SELECT language,normalized,surface FROM work_item ORDER BY normalized').all().map((row)=>({...row}));
    const scopes=workDb.prepare('SELECT scope,status FROM scan_state ORDER BY scope').all().map((row)=>({...row}));
    workDb.close();

    assert.deepEqual(items,[
      {language:'de',normalized:'lemma',surface:'Lemma'},
      {language:'de',normalized:'missinghead',surface:'MissingHead'},
      {language:'de',normalized:'missinglisted',surface:'MissingListed'},
      {language:'de',normalized:'missingusage',surface:'MissingUsage'},
    ]);
    assert.ok(scopes.some((row)=>row.scope==='de_usage_source_minus_accepted'&&row.status==='complete'));
    assert.ok(scopes.some((row)=>row.scope==='de_wiktionary_headword_source_minus_accepted'&&row.status==='complete'));
    assert.ok(scopes.some((row)=>row.scope==='de_listed_form_source_minus_accepted'&&row.status==='complete'));
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
});

test('EN collection scans publish-eligible Wiktionary lexical candidates absent from accepted en-US pronunciation inventory',()=>{
  const root=mkdtempSync(join(tmpdir(),'rhymelab-backfill-en-'));
  try{
    const acceptedPath=join(root,'accepted-en.sqlite');
    const db=new DatabaseSync(acceptedPath);
    db.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE en_form(
        id INTEGER PRIMARY KEY,
        surface TEXT,
        normalized TEXT UNIQUE,
        default_eligible INTEGER
      );
      CREATE TABLE en_pronunciation(
        id INTEGER PRIMARY KEY,
        form_id INTEGER,
        analysis_status TEXT,
        locale_us INTEGER,
        default_profile_eligible INTEGER,
        phonemes TEXT
      );
    `);
    db.prepare('INSERT INTO en_form(id,surface,normalized,default_eligible) VALUES(?,?,?,?)')
      .run(1,'knownword','knownword',1);
    db.prepare('INSERT INTO en_pronunciation(id,form_id,analysis_status,locale_us,default_profile_eligible,phonemes) VALUES(?,?,?,?,?,?)')
      .run(1,1,'ok',1,1,'N OW N');
    db.close();

    const rawDir=join(root,'raw');
    mkdirSync(rawDir,{recursive:true});
    const rawName='en.jsonl.gz';
    writeFileSync(join(rawDir,rawName),gzipSync(Buffer.from([
      JSON.stringify({lang_code:'en',word:'knownword',pos:'noun',senses:[{glosses:['known']}],forms:[]}),
      JSON.stringify({lang_code:'en',word:'missingword',pos:'noun',senses:[{glosses:['missing']}],forms:[]}),
      JSON.stringify({lang_code:'en',word:'lemma',pos:'verb',senses:[{glosses:['lemma']}],forms:[
        {form:'listedmissing',tags:['past']},
        {form:'romanized',tags:['romanization']}
      ]}),
      JSON.stringify({lang_code:'de',word:'ignorieren',forms:[]}),
    ].join('\n')+'\n')));

    const registryPath=join(root,'registry.json');
    writeFileSync(registryPath,JSON.stringify({
      id:'fixture-en-registry',
      local_raw_directory:rawDir,
      sources:[{
        source_id:'enwiktionary-kaikki-fixture',
        local_filename:rawName,
        snapshot:{fixture:true},
      }],
    }));

    const work=join(root,'work.sqlite');
    const result=run([
      '--phase','collect','--scopes','en',
      '--en-db',acceptedPath,'--en-registry',registryPath,'--en-raw-dir',rawDir,
      '--work',work,'--report',join(root,'report.json'),'--review-tsv',join(root,'review.tsv'),
      '--progress-every','1','--commit-every','1',
    ]);
    assert.equal(result.status,0,result.stderr||result.stdout);

    const workDb=new DatabaseSync(work,{readOnly:true});
    const items=workDb.prepare('SELECT language,normalized,surface FROM work_item ORDER BY normalized').all().map((row)=>({...row}));
    const state=workDb.prepare("SELECT status,source_refs FROM scan_state WHERE scope='en_wiktionary_lexical_source_minus_accepted'").get();
    workDb.close();

    assert.deepEqual(items,[
      {language:'en',normalized:'lemma',surface:'lemma'},
      {language:'en',normalized:'listedmissing',surface:'listedmissing'},
      {language:'en',normalized:'missingword',surface:'missingword'},
    ]);
    assert.equal(state.status,'complete');
    assert.equal(Number(state.source_refs),3);
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
});
