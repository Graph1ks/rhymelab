import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

function makePhraseDb(path){
  const db=new DatabaseSync(path);
  try{
    db.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE phrase(
        phrase_id TEXT PRIMARY KEY,
        canonical TEXT NOT NULL,
        normalized TEXT NOT NULL,
        token_key TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        phrase_types_json TEXT NOT NULL,
        historical_state TEXT NOT NULL,
        modern_eligible INTEGER NOT NULL,
        identity_fingerprint TEXT NOT NULL
      );
    `);
    const meta=db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
    meta.run('schema','rhymelab-phrase-catalog-v1');
    meta.run('policy','de-phrase-catalog-v1');
    meta.run('catalog_fingerprint','fixture-phrase-catalog-v1');
    const insert=db.prepare(`
      INSERT INTO phrase(
        phrase_id,canonical,normalized,token_key,token_count,
        phrase_types_json,historical_state,modern_eligible,identity_fingerprint
      ) VALUES(?,?,?,?,?,?,?,?,?)
    `);
    const lines=[
      ['p1','Nachts in der Stadt'],
      ['p2','Mitten in der Stadt'],
      ['p3','Reise durch die Nacht'],
      ['p4','Wege durch die Nacht'],
      ['p5','Musik bleibt heute leise'],
      ['p6','Worte fallen heute leise'],
      ['p7','Wir suchen eine Reise'],
      ['p8','Du suchst eine Weise'],
    ];
    for(const [id,canonical] of lines){
      const normalized=canonical.toLocaleLowerCase('de-DE');
      const words=normalized.split(/\s+/u);
      insert.run(id,canonical,normalized,words.join('\u001f'),words.length,'["phrase"]','current_or_unmarked',1,`fp-${id}`);
    }
    insert.run('old','Historische alte Wendung','historische alte wendung','historische\u001falte\u001fwendung',3,'["phrase"]','historical_only',0,'fp-old');
  }finally{db.close();}
}

test('default Markov source wrapper builds transitions from the RhymeLab phrase catalog',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-markov-phrase-source-'));
  try{
    const phraseDb=join(dir,'phrases.sqlite');
    const source=join(dir,'phrase-lines.txt');
    const work=join(dir,'work.sqlite');
    const out=join(dir,'model.sqlite');
    const report=join(dir,'report.json');
    makePhraseDb(phraseDb);

    const plan=spawnSync(process.execPath,[
      'scripts/build-markov-from-rhymelab.mjs',
      '--phrase-db',phraseDb,
      '--source-out',source,
      '--plan',
    ],{cwd:process.cwd(),encoding:'utf8',timeout:10_000});
    assert.equal(plan.status,0,plan.stderr||plan.stdout);
    const planPayload=JSON.parse(plan.stdout);
    assert.equal(planPayload.ready,true);
    assert.equal(planPayload.phrases_eligible,8);
    assert.equal(planPayload.private_lyrics_used,false);
    assert.equal(planPayload.build_command,'npm run markov:model:build');

    const run=spawnSync(process.execPath,[
      'scripts/build-markov-from-rhymelab.mjs',
      '--phrase-db',phraseDb,
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
    assert.doesNotMatch(exported,/Historische alte Wendung/u);

    const payload=JSON.parse(await readFile(report,'utf8'));
    assert.equal(payload.status,'ok');
    assert.equal(payload.policy,'rhymelab-markov-lyric-v1');
    assert.equal(payload.accepted_sentences,8);

    const db=new DatabaseSync(out,{readOnly:true});
    try{
      const meta=Object.fromEntries(db.prepare('SELECT key,value FROM meta').all().map((row)=>[String(row.key),String(row.value)]));
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
