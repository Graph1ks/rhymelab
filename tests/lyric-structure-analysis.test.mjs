import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  aggregateLyricStructure,
  normalizeSectionType,
  parseStructuredLyricText,
} from '../scripts/lyric-structure-core.mjs';
import {
  MARKOV_LYRIC_STRUCTURE_POLICY,
  MARKOV_LYRIC_STRUCTURE_PROFILE,
  lyricSectionDefaults,
} from '../src/markov-lyric-structure-profile.mjs';
import {
  planLyricSection,
  planLyricSong,
} from '../src/lyric-decoder-v2.mjs';

const SECRET_LINE='Secret copyrighted calibration line alpha omega';
const SECRET_TITLE='Never Ship This Song Title';
const SECRET_URL='https://example.invalid/private-lyrics';

const DE_CORPUS=`--- ${SECRET_TITLE} ---
${SECRET_URL}
Collected: 9/21/2026

[Intro]
Kurzer Auftakt für diesen Test

[Part 1]
${SECRET_LINE}
Heute schreiben wir die Zeilen anders
Morgen schreiben wir die Zeilen weiter
Wir bleiben wach bis in den Morgen

[Hook]
Immer wieder kommt die Hook zurück
Immer wieder kommt die Hook zurück
Diese Zeile bleibt im Ohr
Diese Zeile bleibt im Ohr

[Part 2]
Noch ein vollständiger deutscher Testsatz
Die zweite Strophe bleibt bewusst kompakt
Vier Zeilen reichen für die Struktur
Dann führt der Weg zurück zur Hook

[Hook]
Immer wieder kommt die Hook zurück
Immer wieder kommt die Hook zurück
Diese Zeile bleibt im Ohr
Diese Zeile bleibt im Ohr

[Outro]
Das war der letzte Teil
`;

const EN_CORPUS=`--- Another Hidden Song ---
https://example.invalid/other
Collected: 9/21/2026

[Intro]
This is a short opening line

[Verse 1]
We keep the rhythm moving through the night
Another line continues through the city lights
The pattern stays together for the test
A final line completes the little verse

[Chorus]
Bring the chorus back again
Bring the chorus back again
Keep the simple pattern strong
Keep the simple pattern strong

[Verse 2]
The second verse is here for structure only
The text itself must never leave the analyzer
We only keep aggregate distributions from it
Then move directly back into the chorus

[Chorus]
Bring the chorus back again
Bring the chorus back again
Keep the simple pattern strong
Keep the simple pattern strong
`;

test('section aliases normalize Part/Verse and Hook/Chorus into shared structural roles',()=>{
  assert.equal(normalizeSectionType('Part 2: Artist'),'verse');
  assert.equal(normalizeSectionType('Verse 3'),'verse');
  assert.equal(normalizeSectionType('Hook'),'hook');
  assert.equal(normalizeSectionType('Chorus: Singer'),'hook');
  assert.equal(normalizeSectionType('Pre-Chorus'),'pre_hook');
  assert.equal(normalizeSectionType('Post-Hook'),'post_hook');
});

test('structured lyric parser keeps section boundaries without exposing source metadata in aggregates',()=>{
  const parsed=parseStructuredLyricText(DE_CORPUS,{language:'de'});
  assert.equal(parsed.songsTotal,1);
  assert.equal(parsed.songsStructured,1);
  assert.deepEqual(
    parsed.songs[0].sections.map((section)=>section.type),
    ['intro','verse','hook','verse','hook','outro'],
  );

  const report=aggregateLyricStructure([
    {language:'de',text:DE_CORPUS},
    {language:'en',text:EN_CORPUS},
  ]);
  assert.equal(report.schema,'rhymelab-lyric-structure-analysis-v2');
  assert.equal(report.privacy.raw_text_emitted,false);
  assert.equal(report.privacy.titles_emitted,false);
  assert.equal(report.privacy.urls_emitted,false);
  assert.equal(report.privacy.ngrams_emitted,false);
  assert.equal(report.languages.de.songs_structured,1);
  assert.equal(report.languages.en.songs_structured,1);
  assert.equal(report.languages.de.section_counts.hook,2);
  assert.equal(report.languages.en.section_counts.verse,2);
  assert.ok(report.languages.de.repetition.repeated_line_rate>0);

  const serialized=JSON.stringify(report);
  for(const secret of [SECRET_LINE,SECRET_TITLE,SECRET_URL,'Immer wieder kommt die Hook zurück']){
    assert.equal(serialized.includes(secret),false);
  }
});

test('structure-analysis CLI emits aggregate-only output for mixed DE and EN local files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-lyric-structure-'));
  try{
    const de=join(dir,'de.txt');
    const en=join(dir,'en.txt');
    const out=join(dir,'analysis.json');
    await writeFile(de,DE_CORPUS,'utf8');
    await writeFile(en,EN_CORPUS,'utf8');

    const run=spawnSync(process.execPath,[
      'scripts/analyze-lyric-structure.mjs',
      '--source',`de=${de}`,
      '--source',`en=${en}`,
      '--out',out,
    ],{
      cwd:process.cwd(),
      encoding:'utf8',
      timeout:10_000,
    });

    assert.equal(run.status,0,run.stderr||run.stdout);
    const report=JSON.parse(await readFile(out,'utf8'));
    assert.equal(report.languages.de.songs_structured,1);
    assert.equal(report.languages.en.songs_structured,1);
    for(const secret of [SECRET_LINE,SECRET_TITLE,SECRET_URL]){
      assert.equal(run.stdout.includes(secret),false);
      assert.equal(JSON.stringify(report).includes(secret),false);
    }
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});

test('product structure priors are bilingual aggregate-only calibration',()=>{
  assert.equal(MARKOV_LYRIC_STRUCTURE_PROFILE.policy,MARKOV_LYRIC_STRUCTURE_POLICY);
  assert.equal(MARKOV_LYRIC_STRUCTURE_PROFILE.calibration.rawText,false);
  assert.equal(MARKOV_LYRIC_STRUCTURE_PROFILE.calibration.ngrams,false);
  assert.equal(lyricSectionDefaults('de','verse').lines,16);
  assert.equal(lyricSectionDefaults('de','verse').targetTokens,9);
  assert.equal(lyricSectionDefaults('de','hook').lines,8);
  assert.equal(lyricSectionDefaults('de','hook').targetTokens,6);
  assert.equal(lyricSectionDefaults('en','verse').lines,20);
  assert.equal(lyricSectionDefaults('en','hook').targetTokens,8);
});

test('section planner uses language/section priors only when explicit values are absent',()=>{
  const deVerse=planLyricSection({language:'de',section:'verse',seed:7});
  const enHook=planLyricSection({language:'en',section:'hook',seed:7});
  assert.equal(deVerse.structurePolicy,MARKOV_LYRIC_STRUCTURE_POLICY);
  assert.equal(deVerse.lines.length,16);
  assert.equal(enHook.lines.length,8);
  assert.ok(deVerse.lines.every((line)=>line.targetTokens>=8&&line.targetTokens<=10));
  assert.ok(enHook.lines.every((line)=>line.targetTokens===8));

  const explicit=planLyricSection({
    language:'de',
    section:'verse',
    lines:4,
    targetTokens:12,
    scheme:'AABB',
    seed:7,
  });
  assert.equal(explicit.lines.length,4);
  assert.ok(explicit.lines.every((line)=>line.targetTokens>=11&&line.targetTokens<=13));
  assert.equal(explicit.scheme,'AABB');
});

test('song planner is deterministic and defaults to learned DE/EN section counts',()=>{
  const deA=planLyricSong({language:'de',seed:42});
  const deB=planLyricSong({language:'de',seed:42});
  const en=planLyricSong({language:'en',seed:42});
  assert.deepEqual(deA,deB);
  assert.equal(deA.sectionCount,5);
  assert.equal(en.sectionCount,7);
  assert.equal(deA.structurePolicy,MARKOV_LYRIC_STRUCTURE_POLICY);
  assert.ok(deA.sections.every((section)=>section.lines.length>0));
  assert.ok(en.sections.every((section)=>section.lines.length>0));
});
