import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('private lyric analyzer emits aggregates only and never copies source text or identifiers',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-private-lyrics-'));
  try{
    const input=join(dir,'private.private-lyrics.json');
    const output=join(dir,'aggregate.json');
    const secretLine='Secret calibration line alpha omega';
    const secretTitle='Do Not Ship This Title';
    const secretId='private-id-123';
    const secretUrl='https://example.invalid/private-song';
    await writeFile(input,JSON.stringify([
      {
        id:secretId,
        title:secretTitle,
        url:secretUrl,
        lyrics:`[Verse]\n${secretLine}\nAnother compact rhyme time\n\n[Hook]\nRepeat this line\nRepeat this line\n`,
      },
      {
        id:'private-id-456',
        title:'Second Private Track',
        lyrics:'One more private lyric line\nShort line\n',
      },
    ]),'utf8');

    const run=spawnSync(process.execPath,[
      'scripts/analyze-private-lyrics.mjs',
      '--input',input,
      '--out',output,
    ],{
      cwd:process.cwd(),
      encoding:'utf8',
      timeout:10_000,
    });

    assert.equal(run.status,0,run.stderr||run.stdout);
    const report=JSON.parse(await readFile(output,'utf8'));
    assert.equal(report.schema,'rhymelab-private-lyric-analysis-v1');
    assert.equal(report.privacy.raw_text_emitted,false);
    assert.equal(report.privacy.identifiers_emitted,false);
    assert.equal(report.tracks,2);
    assert.equal(report.tracks_with_lyrics,2);
    assert.ok(report.lyric_lines>=5);
    assert.ok(report.unique_normalized_lines<report.lyric_lines);
    assert.ok(Number.isFinite(report.token_length.median));
    assert.ok(Number.isFinite(report.recommended_profile.default_target_tokens));

    const serialized=JSON.stringify(report);
    for(const secret of [secretLine,secretTitle,secretId,secretUrl,'Repeat this line']){
      assert.equal(serialized.includes(secret),false);
      assert.equal(run.stdout.includes(secret),false);
    }
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});

test('Markov build plan has no implicit three-million-sentence corpus',()=>{
  const run=spawnSync(process.execPath,[
    'scripts/build-markov-model.mjs',
    '--plan',
  ],{
    cwd:process.cwd(),
    encoding:'utf8',
    timeout:10_000,
  });
  assert.equal(run.status,2,run.stderr||run.stdout);
  const plan=JSON.parse(run.stdout);
  assert.equal(plan.ready,false);
  assert.deepEqual(plan.sources,[]);
  assert.match(plan.missing_hint,/No implicit corpus/u);
  assert.doesNotMatch(run.stdout,/deu_news_2024_1M|deu_wikipedia_2021_1M|deu-de_web_2021_1M/u);
});
