import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

test('Markov model builder materializes a compact runnable SQLite from sentence files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-markov-builder-'));
  try{
    const sentences=join(dir,'fixture_sentences.txt');
    const work=join(dir,'work.sqlite');
    const out=join(dir,'model.sqlite');
    const report=join(dir,'report.json');
    await writeFile(sentences,[
      '1\tNachts in der Stadt suche ich eine Reise.',
      '2\tAm Ende dieser Reise wartet eine neue Weise.',
      '3\tHeute klingt die Musik noch leise.',
      '4\tWir suchen neue Wörter für die nächste Reise.',
      '5\tDie Straße wird wach und die Musik bleibt leise.',
      '6\tNachts in der Stadt klingt jede Straße anders.',
    ].join('\n')+'\n','utf8');

    const run=spawnSync(process.execPath,[
      'scripts/build-markov-model.mjs',
      '--sentences',`fixture=${sentences}`,
      '--work',work,
      '--out',out,
      '--report',report,
      '--min-token-count','1',
      '--max-states','1000',
      '--top-k','8',
      '--batch-sentences','100',
    ],{
      cwd:process.cwd(),
      encoding:'utf8',
      timeout:30_000,
    });

    assert.equal(run.status,0,run.stderr||run.stdout);
    const payload=JSON.parse(await readFile(report,'utf8'));
    assert.equal(payload.status,'ok');
    assert.equal(payload.policy,'rhymelab-constrained-lyric-decoder-v2');
    assert.equal(payload.accepted_sentences,6);
    assert.match(payload.semantic_fingerprint,/^[a-f0-9]{64}$/u);

    const db=new DatabaseSync(out,{readOnly:true});
    try{
      const meta=Object.fromEntries(
        db.prepare('SELECT key,value FROM meta').all().map((row)=>[String(row.key),String(row.value)]),
      );
      assert.equal(meta.schema,'rhymelab-markov-model-v2');
      assert.equal(meta.policy,'rhymelab-constrained-lyric-decoder-v2');
      assert.equal(meta.build_status,'complete');
      assert.equal(Number(meta.order),4);
      assert.ok(Number(db.prepare('SELECT COUNT(*) AS n FROM source_sequence_hash').get()?.n||0)>0);
      assert.ok(Number(db.prepare('SELECT COUNT(*) AS n FROM source_window_hash').get()?.n||0)>0);
      assert.ok(Number(db.prepare('SELECT COUNT(*) AS n FROM shape_pattern').get()?.n||0)>0);
      assert.ok(Number(db.prepare('SELECT COUNT(*) AS n FROM transition WHERE context_len=4').get()?.n||0)>0);
      const directions=db.prepare('SELECT direction,COUNT(*) AS n FROM transition GROUP BY direction ORDER BY direction').all();
      assert.deepEqual(directions.map((row)=>[row.direction,Number(row.n)]),[
        ['forward',directions[0]?.n],
        ['reverse',directions[1]?.n],
      ]);
      assert.ok(Number(directions[0]?.n)>0);
      assert.ok(Number(directions[1]?.n)>0);
      assert.throws(()=>db.prepare('SELECT * FROM build_checkpoint').all(),/no such table/u);
      assert.throws(()=>db.prepare('SELECT * FROM state_count').all(),/no such table/u);
    }finally{
      db.close();
    }

    const statusRun=spawnSync(process.execPath,[
      'scripts/build-markov-model.mjs',
      '--sentences',`fixture=${sentences}`,
      '--work',work,
      '--out',out,
      '--report',report,
      '--status',
    ],{
      cwd:process.cwd(),
      encoding:'utf8',
      timeout:10_000,
    });
    assert.equal(statusRun.status,0,statusRun.stderr||statusRun.stdout);
    const statusPayload=JSON.parse(statusRun.stdout);
    assert.equal(statusPayload.output.stats.policy,'rhymelab-constrained-lyric-decoder-v2');
    assert.ok(statusPayload.output.stats.transitions>0);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});


test('V2 builder weights source roles and excludes phrase fragments from line-shape learning',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-markov-source-roles-'));
  try{
    const lyric=join(dir,'lyrics.txt');
    const phrase=join(dir,'phrases.txt');
    const work=join(dir,'work.sqlite');
    const out=join(dir,'model.sqlite');
    const report=join(dir,'report.json');
    const line='Heute klingt die Musik leise.\n';
    await writeFile(lyric,line,'utf8');
    await writeFile(phrase,line,'utf8');

    const run=spawnSync(process.execPath,[
      'scripts/build-markov-model.mjs',
      '--source',`lyric:fixture_lyrics:3=${lyric}`,
      '--source',`phrase:fixture_phrases:1=${phrase}`,
      '--work',work,
      '--out',out,
      '--report',report,
      '--min-token-count','1',
      '--min-sequence-tokens','2',
      '--max-states','1000',
      '--top-k','8',
      '--batch-sentences','100',
    ],{
      cwd:process.cwd(),
      encoding:'utf8',
      timeout:30_000,
    });

    assert.equal(run.status,0,run.stderr||run.stdout);
    const payload=JSON.parse(await readFile(report,'utf8'));
    assert.deepEqual(
      payload.sources.map((row)=>[row.code,row.kind,row.weight]),
      [
        ['fixture_lyrics','lyric',3],
        ['fixture_phrases','phrase',1],
      ],
    );

    const db=new DatabaseSync(out,{readOnly:true});
    try{
      const shape=db.prepare(
        'SELECT token_count,shape_key,count FROM shape_pattern ORDER BY count DESC LIMIT 1',
      ).get();
      assert.ok(shape);
      assert.equal(Number(shape.count),3);

      const sourceWindowCount=Number(
        db.prepare('SELECT SUM(count) AS n FROM source_window_hash').get()?.n||0,
      );
      assert.ok(sourceWindowCount>=2);

      const transition=db.prepare(
        "SELECT count FROM transition WHERE direction='forward' AND context_len=1 AND next_token='klingt' ORDER BY count DESC LIMIT 1",
      ).get();
      assert.equal(Number(transition?.count||0),4);
    }finally{
      db.close();
    }
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
