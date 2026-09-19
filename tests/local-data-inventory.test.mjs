import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

test('local data inventory reports heterogeneous structures without reading values into the report',()=>{
  const root=mkdtempSync(join(tmpdir(),'rhymelab-data-inventory-'));
  try{
    mkdirSync(join(root,'nested'),{recursive:true});

    const sqlitePath=join(root,'sample.sqlite');
    const db=new DatabaseSync(sqlitePath);
    db.exec([
      'CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);',
      'CREATE TABLE words(id INTEGER PRIMARY KEY,surface TEXT NOT NULL,ipa TEXT);',
      'CREATE INDEX idx_words_surface ON words(surface);',
    ].join('\n'));
    db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('schema','fixture-v1');
    db.prepare('INSERT INTO words(surface,ipa) VALUES(?,?)').run('SecretSurface','s iː k r ə t');
    db.close();

    writeFileSync(join(root,'nested','rows.jsonl.gz'),gzipSync(Buffer.from([
      JSON.stringify({word:'alpha',forms:[{form:'alphas'}]}),
      JSON.stringify({word:'beta',forms:[]}),
    ].join('\n')+'\n')));

    writeFileSync(join(root,'table.tsv'),'name\tcount\nalpha\t2\n');
    writeFileSync(join(root,'manifest.json'),JSON.stringify({
      schema:'fixture-manifest-v1',
      files:[{file:'rows.jsonl.gz',items:2}],
    }));

    const output=join(root,'inventory.json');
    const result=spawnSync(process.execPath,[
      '--no-warnings','scripts/report-local-data-inventory.mjs',
      '--root',root,
      '--out',output,
      '--row-counts',
      '--progress-every','1',
    ],{
      cwd:process.cwd(),
      encoding:'utf8',
    });

    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.match(result.stdout,/LOCAL DATA INVENTORY READY/);

    const report=JSON.parse(readFileSync(output,'utf8'));
    assert.equal(report.schema,'rhymelab-local-data-inventory-v1');
    assert.equal(report.summary.files,4);
    assert.equal(report.summary.sqlite_files,1);
    assert.equal(report.summary.inspection_errors,0);

    const sqlite=report.files.find((file)=>file.extension==='.sqlite');
    assert.ok(sqlite);
    assert.equal(sqlite.inspection.kind,'sqlite');
    assert.equal(sqlite.inspection.meta.values.schema,'fixture-v1');
    const words=sqlite.inspection.tables.find((table)=>table.name==='words');
    assert.equal(words.exact_rows,1);
    assert.deepEqual(words.columns.map((column)=>column.name),['id','surface','ipa']);
    assert.ok(words.indexes.some((index)=>index.name==='idx_words_surface'));

    const gzip=report.files.find((file)=>file.extension==='.jsonl.gz');
    assert.equal(gzip.inspection.kind,'jsonl');
    assert.equal(gzip.inspection.compressed,true);
    assert.deepEqual(gzip.inspection.record_shapes[0].keys,['word','forms']);

    const tsv=report.files.find((file)=>file.extension==='.tsv');
    assert.equal(tsv.inspection.kind,'tsv');
    assert.deepEqual(tsv.inspection.header,['name','count']);

    const json=report.files.find((file)=>file.extension==='.json');
    assert.equal(json.inspection.kind,'json');
    assert.equal(json.inspection.parsed,true);
    assert.ok(json.inspection.shape.keys.includes('schema'));

    const serialized=JSON.stringify(report);
    assert.doesNotMatch(serialized,/SecretSurface/);
    assert.doesNotMatch(serialized,/s iː k r ə t/);
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
});
