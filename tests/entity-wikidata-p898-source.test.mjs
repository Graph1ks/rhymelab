import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  WIKIDATA_P898_REVIEW_STATE,
  buildWikidataP898Query,
  normalizeP898Ipa,
  p898LocaleFromLanguageQid,
  selectP898TargetName,
} from '../scripts/entity-wikidata-p898-core.mjs';
import { entityPronunciationRuntimeEligible } from '../scripts/entity-pronunciation-core.mjs';

const taxonomy = JSON.parse(
  await readFile('sources/entity/wikidata-entity-taxonomy-v1.json', 'utf8'),
);

test('Wikidata P898 selective query preserves pronunciation qualifiers', () => {
  const query = buildWikidataP898Query(taxonomy);
  assert.match(query, /p:P898/);
  assert.match(query, /ps:P898/);
  assert.match(query, /pq:P407/);
  assert.match(query, /pq:P5237/);
  assert.match(query, /pq:P5168/);
  assert.match(query, /p:P106/);
  assert.match(query, /p:P31/);
});

test('P898 IPA normalization removes only outer transcription delimiters', () => {
  assert.equal(normalizeP898Ipa('/əˈpætʃiː/'), 'əˈpætʃiː');
  assert.equal(normalizeP898Ipa('[ˈbɛʁliːn]'), 'ˈbɛʁliːn');
  assert.equal(normalizeP898Ipa('ˈkɛndɹɪk'), 'ˈkɛndɹɪk');
});

test('P898 target mapping prefers exact applies-to-name evidence', () => {
  const names = [
    {
      name_id: 10,
      surface: 'Example',
      normalized: 'example',
      language: 'de',
      preferred: 1,
    },
    {
      name_id: 11,
      surface: 'Beispiel',
      normalized: 'beispiel',
      language: 'de',
      preferred: 0,
    },
    {
      name_id: 12,
      surface: 'Example',
      normalized: 'example',
      language: 'en',
      preferred: 1,
    },
  ];

  const explicit = selectP898TargetName(names, {
    appliesName: 'Beispiel',
    appliesNameLanguage: 'de',
    languageQid: 'Q1860',
  });
  assert.equal(explicit.strategy, 'applies_name_exact');
  assert.equal(explicit.name.name_id, 11);

  const languageFallback = selectP898TargetName(names, {
    languageQid: 'Q1860',
  });
  assert.equal(languageFallback.strategy, 'language_preferred_label');
  assert.equal(languageFallback.name.name_id, 12);
});

test('P898 language evidence stays generic until a runtime locale policy accepts it', () => {
  assert.equal(p898LocaleFromLanguageQid('Q188'), 'de');
  assert.equal(p898LocaleFromLanguageQid('Q1860'), 'en');
  assert.equal(p898LocaleFromLanguageQid('Q150'), null);

  assert.equal(entityPronunciationRuntimeEligible({
    locale: 'de',
    review_state: WIKIDATA_P898_REVIEW_STATE,
  }), false);
  assert.equal(entityPronunciationRuntimeEligible({
    locale: 'de-DE',
    review_state: WIKIDATA_P898_REVIEW_STATE,
  }), false);
});

test('one-command owner workflow imports P898 evidence without changing DE runtime fingerprint', async () => {
  const [owner, diagnostic, materializer, manifest, packageJson] = await Promise.all([
    readFile('scripts/run-entity-pronunciation-owner.mjs', 'utf8'),
    readFile('scripts/diagnose-entity-pronunciation-coverage.mjs', 'utf8'),
    readFile('scripts/materialize-wikidata-p898-pronunciations.mjs', 'utf8'),
    readFile('sources/entity/wikidata-p898-pronunciation-v1.json', 'utf8').then(JSON.parse),
    readFile('package.json', 'utf8').then(JSON.parse),
  ]);

  assert.equal(manifest.property, 'P898');
  assert.equal(manifest.runtime_use, false);
  assert.equal(manifest.license_id, 'CC0-1.0');
  assert.match(owner, /fetch-qlever-entity-pronunciations\.mjs/);
  assert.match(owner, /materialize-wikidata-p898-pronunciations\.mjs/);
  assert.match(owner, /baselineRuntimeFingerprint/);
  assert.match(owner, /changed the accepted DE runtime fingerprint/);
  assert.match(diagnostic, /source_attested_unprofiled_not_runtime_eligible/);
  assert.match(diagnostic, /wikidata_p898_source_evidence/);
  assert.match(diagnostic, /projected_preferred_name_ready_pct_if_accepted/);
  assert.match(materializer, /runtime_eligible_rows: 0/);
  assert.match(materializer, /source_attested_unprofiled/);
  assert.match(materializer, /Refusing to replace/);
  assert.equal(
    packageJson.scripts['entity:pronunciation:wikidata:p898:fetch'],
    'node --no-warnings scripts/fetch-qlever-entity-pronunciations.mjs',
  );
  assert.equal(
    packageJson.scripts['entity:pronunciation:wikidata:p898'],
    'node --no-warnings scripts/materialize-wikidata-p898-pronunciations.mjs',
  );
});
