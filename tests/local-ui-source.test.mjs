import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('local UI exposes primary rhyme classes plus independent sound relations with bilingual metadata',async()=>{
  const[html,app,css]=await Promise.all([readFile('src/ui/index.html','utf8'),readFile('src/ui/app.js','utf8'),readFile('src/ui/styles.css','utf8')]);
  assert.match(html,/<html lang="en">/);assert.match(html,/Instrument\+Sans/);assert.match(html,/IBM\+Plex\+Mono/);assert.match(html,/Material\+Symbols\+Outlined/);
  assert.match(html,/id="historicalMode"/);assert.match(html,/id="scrollSentinel"/);assert.doesNotMatch(html,/id="nextPage"|id="prevPage"|id="pageStatus"/);
  for(const type of['multisyllabic_perfect','perfect','multisyllabic_slant','family','slant','assonance','consonance'])assert.match(html,new RegExp(`value="${type}"`));
  assert.match(app,/PRIMARY_RHYME_TYPES/);assert.match(app,/SOUND_RELATION_TYPES/);assert.match(app,/relationTypes/);assert.match(app,/rowTypes/);assert.match(app,/matchesType/);assert.match(app,/displayScore/);
  assert.match(app,/rhymelab\.language/);assert.match(app,/localStorage\.setItem/);assert.match(app,/IntersectionObserver/);assert.match(app,/\/api\/word\//);
  assert.match(app,/coverage:requestedType==='all'\?'balanced':'ranked'/);assert.match(app,/type:requestedType/);assert.match(app,/interleaveByType/);
  assert.match(app,/LEXICAL_TAG_LABELS/);assert.match(app,/Deutsches Wiktionary via Kaikki\/Wiktextract/);assert.match(app,/English Wiktionary via Kaikki\/Wiktextract/);assert.match(app,/RhymeLab – kuratiertes modernes Lexikon/);
  assert.match(app,/Mehrsilbiger Vollreim/);assert.match(app,/Assonanz/);assert.match(app,/Konsonanz/);assert.match(app,/Klangbeziehungen/);assert.match(app,/relationStrong/);assert.match(app,/rhymeAnalysisHtml/);
  assert.match(css,/--multi-perfect:/);assert.match(css,/--assonance:/);assert.match(css,/--consonance:/);assert.match(css,/\.badge\.assonance/);assert.match(css,/\.badge\.consonance/);assert.match(css,/\.result-row:focus-visible/);
});
