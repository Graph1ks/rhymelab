import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {
  SERVING_V1_PRODUCT_REVISION,
  SERVING_V1_PRODUCT_SCHEMA,
} from '../scripts/serving-v1-product-core.mjs';
import {
  SERVING_V1_PRONUNCIATION_IDENTITY_REVISION,
} from '../scripts/serving-v1-pronunciation-identity.mjs';

function makeServingDb(path){
  const db=new DatabaseSync(path);
  try{
    db.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE runtime_phrase(
        runtime_phrase_id INTEGER PRIMARY KEY,
        source_phrase_id TEXT NOT NULL,
        source_surface TEXT NOT NULL,
        modern_eligible INTEGER NOT NULL,
        canonical_available INTEGER NOT NULL,
        generated_available INTEGER NOT NULL
      );
      CREATE TABLE runtime_phrase_profile(
        runtime_phrase_id INTEGER PRIMARY KEY,
        token_count INTEGER NOT NULL
      );
    `);
    const meta=db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
    for(const [key,value] of Object.entries({
      schema:'rhymelab-serving-v1',
      runtime_status:'complete',
      product_adapter_schema:SERVING_V1_PRODUCT_SCHEMA,
      product_adapter_status:'complete',
      product_adapter_revision:SERVING_V1_PRODUCT_REVISION,
      identity_revision:SERVING_V1_PRONUNCIATION_IDENTITY_REVISION,
      product_adapter_identity_revision:SERVING_V1_PRONUNCIATION_IDENTITY_REVISION,
      runtime_semantic_fingerprint:'a'.repeat(64),
      product_adapter_semantic_fingerprint:'b'.repeat(64),
    }))meta.run(key,String(value));

    const phrase=db.prepare(`
      INSERT INTO runtime_phrase(
        runtime_phrase_id,source_phrase_id,source_surface,modern_eligible,
        canonical_available,generated_available
      ) VALUES(?,?,?,?,?,?)
    `);
    const profile=db.prepare(
      'INSERT INTO runtime_phrase_profile(runtime_phrase_id,token_count) VALUES(?,?)'
    );
    const lines=[
      ['p1','Nachts in der Stadt',1,1,0],
      ['p2','Mitten in der Stadt',1,1,0],
      ['p3','Reise durch die Nacht',1,1,0],
      ['p4','Wege durch die Nacht',1,1,0],
      ['p5','Musik bleibt heute leise',1,1,0],
      ['p6','Worte fallen heute leise',1,1,0],
      ['p7','Wir suchen eine Reise',1,1,0],
      ['p8','Du suchst eine Weise',1,0,1],
      ['old','Historische alte Wendung',0,1,0],
    ];
    let id=1;
    for(const [sourceId,surface,modern,canonical,generated] of lines){
      const tokenCount=surface.split(/\s+/u).length;
      phrase.run(id,sourceId,surface,modern,canonical,generated);
      profile.run(id,tokenCount);
      id+=1;
    }
  }finally{db.close();}
}

test('default Markov source wrapper builds transitions from canonical Serving-v1 Phrase/Mosaic rows',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-markov-serving-source-'));
  try{
    const servingDb=join(dir,'serving.sqlite');
    const source=join(dir,'phrase-lines.txt');
    const work=join(dir,'work.sqlite');
    const out=join(dir,'model.sqlite');
    const report=join(dir,'report.json');
    makeServingDb(servingDb);

    const plan=spawnSync(process.execPath,[
      'scripts/build-markov-from-rhymelab.mjs',
      '--serving-db',servingDb,
      '--source-out',source,
      '--plan',
    ],{cwd:process.cwd(),encoding:'utf8',timeout:10_000});
    assert.equal(plan.status,0,plan.stderr||plan.stdout);
    const planPayload=JSON.parse(plan.stdout);
    assert.equal(planPayload.ready,true);
    assert.equal(planPayload.source,'rhymelab_serving_v1_runtime_phrase');
    assert.equal(planPayload.source_database_role,'canonical_default');
    assert.equal(planPayload.phrases_eligible,8);
    assert.equal(planPayload.private_lyrics_used,false);
    assert.equal(planPayload.archived_split_phrase_database_used,false);
    assert.equal(planPayload.build_command,'npm run markov:model:build');

    const run=spawnSync(process.execPath,[
      'scripts/build-markov-from-rhymelab.mjs',
      '--serving-db',servingDb,
      '--source-out',source,
      '--work',work,
      '--out',out,
      '--report',report,
      '--max-states','1000',
      '--top-k','8',
      '--batch-sentences','100',
    ],{cwd:process.cwd(),encoding:'utf8',timeout:30_000});

    assert.equal(run.status,0,run.stderr||run.stdout);
    const exported=await readFile(source,'utf8');
    assert.match(exported,/p1\tNachts in der Stadt/u);
    assert.match(exported,/p8\tDu suchst eine Weise/u);
    assert.doesNotMatch(exported,/Historische alte Wendung/u);

    const payload=JSON.parse(await readFile(report,'utf8'));
    assert.equal(payload.status,'ok');
    assert.equal(payload.policy,'rhymelab-markov-lyric-v1');
    assert.equal(payload.accepted_sentences,8);

    const db=new DatabaseSync(out,{readOnly:true});
    try{
      const meta=Object.fromEntries(
        db.prepare('SELECT key,value FROM meta').all().map((row)=>[String(row.key),String(row.value)]),
      );
      assert.equal(meta.policy,'rhymelab-markov-lyric-v1');
      assert.equal(meta.build_status,'complete');
      assert.equal(Number(meta.accepted_sentences),8);
      assert.ok(Number(db.prepare('SELECT COUNT(*) AS n FROM transition').get()?.n||0)>0);
      assert.ok(Number(db.prepare("SELECT COUNT(*) AS n FROM transition WHERE direction='reverse'").get()?.n||0)>0);
    }finally{db.close();}
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
