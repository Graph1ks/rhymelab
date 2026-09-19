import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

test('DE collection diffs pre-publish core against accepted Writer DB',()=>{
  const root=mkdtempSync(join(tmpdir(),'rhymelab-backfill-de-'));
  try{
    const acceptedPath=join(root,'accepted.sqlite');
    const db=new DatabaseSync(acceptedPath);
    db.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE hot(
        normalized TEXT,
        surface TEXT,
        ipa TEXT,
        historical INTEGER DEFAULT 0,
        pronunciation_preferred INTEGER,
        pronunciation_eligible INTEGER,
        usage_rank INTEGER,
        pronunciation_rank INTEGER,
        id INTEGER PRIMARY KEY
      );
    `);
    db.prepare('INSERT INTO hot(normalized,surface,ipa,pronunciation_preferred,pronunciation_eligible,id) VALUES(?,?,?,?,?,?)')
      .run('known','Known','ˈkoːn',1,1,1);
    db.close();

    const coreDir=join(root,'core');
    mkdirSync(coreDir,{recursive:true});
    const rows=[
      {
        processing_order:1,word:'Known',normalized_form:'known',usage_rank:null,
        dictionary_status:'complete',source_entry_count:1,
        pronunciations:[{ipa:'ˈkoːn'}],
      },
      {
        processing_order:2,word:'Missingwort',normalized_form:'missingwort',usage_rank:null,
        dictionary_status:'partial',source_entry_count:1,
        pronunciations:[],
      },
    ];
    const shard=rows.map((row)=>JSON.stringify(row)).join('\n')+'\n';
    writeFileSync(join(coreDir,'shard-000001.jsonl'),shard);
    writeFileSync(join(coreDir,'manifest.json'),JSON.stringify({
      schema:'rhymelab-de-core-v2',
      total_forms:2,
      files:[{
        file:'shard-000001.jsonl',items:2,
        first_processing_order:1,last_processing_order:2,sha256:'fixture',
      }],
    }));

    const rawPath=join(root,'de.jsonl.gz');
    writeFileSync(rawPath,gzipSync(Buffer.from(
      JSON.stringify({lang_code:'de',word:'Known',forms:[]})+'\n'
    )));

    const work=join(root,'work.sqlite');
    const result=run([
      '--phase','collect','--scopes','de',
      '--de-db',acceptedPath,'--de-core',coreDir,'--de-kaikki',rawPath,
      '--work',work,'--report',join(root,'report.json'),'--review-tsv',join(root,'review.tsv'),
      '--progress-every','1','--commit-every','1',
    ]);
    assert.equal(result.status,0,result.stderr||result.stdout);

    const workDb=new DatabaseSync(work,{readOnly:true});
    const items=workDb.prepare('SELECT language,normalized,surface FROM work_item ORDER BY normalized').all().map((row)=>({...row}));
    const scopes=workDb.prepare('SELECT scope,status FROM scan_state ORDER BY scope').all();
    workDb.close();

    assert.deepEqual(items,[{language:'de',normalized:'missingwort',surface:'Missingwort'}]);
    assert.ok(scopes.some((row)=>row.scope==='de_source_minus_accepted'&&row.status==='complete'));
    assert.ok(scopes.some((row)=>row.scope==='de_listed_form_source_minus_accepted'&&row.status==='complete'));
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
});

test('EN collection scans original Kaikki candidates absent from accepted en-US pronunciation inventory',()=>{
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
      JSON.stringify({lang_code:'en',word:'knownword',forms:[]}),
      JSON.stringify({lang_code:'en',word:'missingword',forms:[]}),
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
    const state=workDb.prepare("SELECT status,source_refs FROM scan_state WHERE scope='en_source_minus_accepted'").get();
    workDb.close();

    assert.deepEqual(items,[{language:'en',normalized:'missingword',surface:'missingword'}]);
    assert.equal(state.status,'complete');
    assert.equal(Number(state.source_refs),1);
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
});
