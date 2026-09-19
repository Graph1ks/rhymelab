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
  assert.match(html, /data-result-language="de"/);
  assert.match(html, /data-result-language="en"/);
  assert.match(html, /data-result-language="both"/);
  assert.match(html, /id="entityCategory"/);
  assert.match(html, /id="sourcesButton"/);
  assert.match(html, /id="sourcesDialog"/);
  assert.match(html, /id="sourcesList"/);
  assert.match(html, /data-ui-lang="de"/);
  assert.match(html, /data-ui-lang="en"/);
  assert.match(html, /data-view="list"/);
  assert.match(html, /data-view="compact"/);
  assert.match(html, /value="near1"/);
  assert.match(html, /value="near2"/);
  assert.match(html, /value="near3"/);
  assert.match(html, /value="syllables"/);
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
  assert.match(app, /result_language:state\.resultLanguage/);
  assert.match(app, /entity_category:\$\('#entityCategory'\)\?\.value\|\|'all'/);
  assert.match(app, /scope:\$\('#scopeFilter'\)\.value/);
  assert.match(app, /type:backendType/);
  assert.match(app, /backendType=SOUND_RELATION_TYPES\.includes\(requestedType\)\?'all':requestedType/);
  assert.match(app, /const progressive=selectedType!=='all'/);
  assert.match(app, /progressive\?orderedAll\.slice\(0,state\.visibleCount\):orderedAll/);
  assert.match(app, /setupInfiniteScroll\(progressive&&hasMore\)/);
  assert.match(app, /data-more-section/);
  assert.match(app, /state\.sectionVisible/);
  assert.match(app, /counts\?\.searchPool/);
  assert.match(app, /maximumDistance=syllable==='same'\?0:syllable==='near1'\?1:syllable==='near2'\?2:syllable==='near3'\?3:null/);
  assert.match(app, /rowSyllableDistance\(a\)-rowSyllableDistance\(b\)/);
  assert.match(app, /rhymelab\.searchBasis/);
  assert.match(app, /rhymelab\.resultLanguage/);
  assert.match(app, /scopeCapability/);
  assert.match(app, /syncCapabilityControls/);
  assert.match(app, /renderAvailabilityBar/);
  assert.match(app, /scopeState\.partial/);
  assert.match(app, /rhymelab\.language/);
  assert.match(app, /rhymelab\.resultView/);
  assert.match(app, /syncUiLanguageControls/);
  assert.match(app, /syncViewControls/);
  assert.doesNotThrow(() => new Function(app));
  assert.doesNotMatch(app, /(?<!\$)\$\([^)]*\)\.(?:forEach|map|filter|some|every|find)\b/);
  assert.doesNotMatch(app, /for\s*\([^)]*\bof\s+(?<!\$)\$\([^)]*\)\s*\)/);
  assert.match(app, /englishUnavailable/);
  assert.match(app, /bothPartial/);
  assert.match(app, /interleaveByType/);

  assert.match(app, /LEXICAL_TAG_LABELS/);
  assert.match(app, /German Wiktionary via Kaikki\/Wiktextract/);
  assert.match(app, /English Wiktionary via Kaikki\/Wiktextract/);
  assert.match(app, /CMU Pronouncing Dictionary/);
  assert.match(app, /Leipzig Corpora Collection/);
  assert.match(app, /RhymeLab curated modern lexicon/);
  assert.match(app, /QRank/);
  assert.match(app, /Wikidata/);
  assert.doesNotMatch(app, /<span class="meta-label">\$\{t\('source'\)\}/);
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
  assert.match(css, /\.result-language-option/);
  assert.match(css, /\.scope-option/);
  assert.match(css, /\.basis-option\.active,\.result-language-option\.active,\.scope-option\.active/);
  assert.match(css, /background:var\(--accent\);color:#fff/);
  assert.doesNotMatch(css, /inset 0 -2px 0 #b58a2b/);
  assert.match(css, /appearance:none/);
  assert.match(css, /\*::-webkit-scrollbar/);
  assert.match(css, /scrollbar-color/);
  assert.match(css, /\.sources-dialog/);
  assert.match(css, /\.more-button/);
  assert.match(css, /\.search-mode-grid/);
  assert.match(css, /\.availability-chip/);
  assert.match(css, /\.context-hidden/);
  assert.match(css, /\.ui-language-switch/);
  assert.match(css, /\.view-switch/);
  assert.match(css, /\.results-compact \.result-items/);
  assert.match(css, /grid-template-columns:repeat\(auto-fill,minmax\(220px,1fr\)\)/);

  assert.match(mobileCss, /@media\(max-width:720px\)/);
  assert.match(mobileCss, /\.scope-segmented\{grid-template-columns:repeat\(2/);
  assert.match(mobileCss, /\.language-segmented,\.result-language-segmented/);
  assert.match(mobileCss, /min-height:46px/);
  assert.match(mobileCss, /\.result-row \.type-col/);
  assert.match(mobileCss, /\.results-compact \.result-items/);
  assert.match(mobileCss, /\.ui-language-switch/);
});
