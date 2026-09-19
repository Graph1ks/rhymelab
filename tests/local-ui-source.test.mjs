import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('local UI exposes one unified word and Phrase/Mosaic Writer surface', async () => {
  const [html, app, css, mobileCss] = await Promise.all([
    readFile('src/ui/index.html', 'utf8'),
    readFile('src/ui/app.js', 'utf8'),
    readFile('src/ui/styles.css', 'utf8'),
    readFile('src/ui/mobile.css', 'utf8'),
  ]);

  assert.match(html, /<html lang="en">/);
  assert.match(html, /Instrument\+Sans/);
  assert.match(html, /IBM\+Plex\+Mono/);
  assert.match(html, /Material\+Symbols\+Outlined/);
  assert.match(html, /id="scopeFilter"[^>]*type="hidden"[^>]*value="all"/);
  assert.match(html, /data-scope="all"[^>]*class="scope-option active"/);
  assert.match(html, /data-scope="words"[^>]*class="scope-option"/);
  assert.match(html, /data-scope="phrases"[^>]*class="scope-option"/);
  assert.match(html, /data-scope="entities"[^>]*class="scope-option"/);
  assert.match(html, /id="availabilityBar"/);
  assert.match(html, /data-basis="de"/);
  assert.match(html, /data-basis="en"/);
  assert.match(html, /data-basis="both"/);
  assert.doesNotMatch(html, /href="\/phrases"/);

  assert.match(html, /id="historicalMode"/);
  assert.match(html, /id="scrollSentinel"/);
  assert.doesNotMatch(html, /id="nextPage"|id="prevPage"|id="pageStatus"/);
  for (const type of [
    'multisyllabic_perfect',
    'perfect',
    'multisyllabic_slant',
    'family',
    'slant',
    'assonance',
    'consonance',
  ]) {
    assert.match(html, new RegExp(`value="${type}"`));
  }

  assert.match(app, /PRIMARY_RHYME_TYPES/);
  assert.match(app, /SOUND_RELATION_TYPES/);
  assert.match(app, /relationTypes/);
  assert.match(app, /rowTypes/);
  assert.match(app, /matchesType/);
  assert.match(app, /displayScore/);
  assert.match(app, /resultKind/);
  assert.match(app, /renderPhrasePanel/);
  assert.match(app, /\/api\/writer\?/);
  assert.match(app, /\/api\/phrases\/detail/);
  assert.match(app, /language:state\.basis/);
  assert.match(app, /scope:\$\('#scopeFilter'\)\.value/);
  assert.match(app, /type:requestedType/);
  assert.match(app, /rhymelab\.searchBasis/);
  assert.match(app, /scopeCapability/);
  assert.match(app, /syncCapabilityControls/);
  assert.match(app, /renderAvailabilityBar/);
  assert.match(app, /scopeState\.partial/);
  assert.match(app, /englishUnavailable/);
  assert.match(app, /bothPartial/);
  assert.match(app, /interleaveByType/);

  assert.match(app, /LEXICAL_TAG_LABELS/);
  assert.match(app, /Deutsches Wiktionary via Kaikki\/Wiktextract/);
  assert.match(app, /English Wiktionary via Kaikki\/Wiktextract/);
  assert.match(app, /RhymeLab – kuratiertes modernes Lexikon/);
  assert.match(app, /UNIFIED RHYME WRITER/);
  assert.match(app, /VEREINHEITLICHTER REIM-WRITER/);
  assert.match(app, /Mehrsilbiger Vollreim/);
  assert.match(app, /Assonanz/);
  assert.match(app, /Konsonanz/);
  assert.match(app, /Klangbeziehungen/);
  assert.match(app, /relationStrong/);
  assert.match(app, /rhymeAnalysisHtml/);

  assert.match(css, /--multi-perfect:/);
  assert.match(css, /--assonance:/);
  assert.match(css, /--consonance:/);
  assert.match(css, /\.badge\.assonance/);
  assert.match(css, /\.badge\.consonance/);
  assert.match(css, /\.result-row:focus-visible/);
  assert.match(css, /\.channel-block/);
  assert.match(css, /\.phrase-row/);
  assert.match(css, /\.basis-option/);
  assert.match(css, /\.scope-option/);
  assert.match(css, /\.search-mode-grid/);
  assert.match(css, /\.availability-chip/);
  assert.match(css, /\.context-hidden/);

  assert.match(mobileCss, /@media\(max-width:720px\)/);
  assert.match(mobileCss, /\.scope-segmented\{grid-template-columns:repeat\(2/);
  assert.match(mobileCss, /min-height:46px/);
  assert.match(mobileCss, /\.result-row \.type-col/);
});
