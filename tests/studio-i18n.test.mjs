import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_UI_LANGUAGES,
  normalizeStudioUiLanguage,
  translateStudioUiText,
} from '../src/studio/i18n.mjs';

test('Studio UI language normalization stays inside supported DE/EN contract',()=>{
  assert.deepEqual(STUDIO_UI_LANGUAGES,['de','en']);
  assert.equal(normalizeStudioUiLanguage('en'),'en');
  assert.equal(normalizeStudioUiLanguage('de'),'de');
  assert.equal(normalizeStudioUiLanguage('fr'),'de');
  assert.equal(normalizeStudioUiLanguage(null),'de');
});

test('Studio UI translator covers static navigation, settings and analysis surfaces',()=>{
  assert.equal(translateStudioUiText('Reimsuche','en'),'Rhyme search');
  assert.equal(translateStudioUiText('Meine Texte','en'),'My texts');
  assert.equal(translateStudioUiText('Einstellungen','en'),'Settings');
  assert.equal(translateStudioUiText('Schriftgröße','en'),'Font size');
  assert.equal(translateStudioUiText('Kanonisches Reimschema','en'),'Canonical rhyme scheme');
  assert.equal(translateStudioUiText('Word Laboratory','en'),'Word Laboratory');
  assert.equal(translateStudioUiText('Reimsuche','de'),'Reimsuche');
});

test('Studio UI translator preserves surrounding whitespace and handles dynamic labels',()=>{
  assert.equal(translateStudioUiText('  12 Treffer  ','en'),'  12 results  ');
  assert.equal(translateStudioUiText('Bar 04 ausgewählt','en'),'Bar 04 selected');
  assert.equal(translateStudioUiText('8 Bars · 120 Wörter','en'),'8 bars · 120 words');
  assert.equal(translateStudioUiText('Anker: Nacht','en'),'Anchor: Nacht');
  assert.equal(translateStudioUiText('Entity: musician','en'),'Entity: musician');
});

test('Studio UI translator leaves unknown/user content untouched',()=>{
  assert.equal(translateStudioUiText('Zwischen den Zeilen','en'),'Zwischen den Zeilen');
  assert.equal(translateStudioUiText('Hochzeitsreise','en'),'Hochzeitsreise');
});
