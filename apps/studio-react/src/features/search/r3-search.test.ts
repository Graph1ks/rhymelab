import { describe, expect, it } from 'vitest';

import * as legacyFilters from '../../../../../src/studio/search-filters.mjs';
import * as legacyControls from '../../../../../src/studio/studio-controls.mjs';

import type { RuntimeEditionPayload, WriterResultRow } from '../../legacy/contracts';
import { chooseAvailableRuntimeEdition, createSearchState } from '../../legacy/search';
import { writerSearchOptions } from './data';
import {
  corpusModePatch,
  corpusModeValue,
  entityCategoryLabel,
  filterStudioWriterRows,
  filterUnusedWriterRows,
  languageRouteValue,
  normalizeDensity,
  parseLanguageRoute,
  presetPatch,
  resultKindLabel,
  sortStudioWriterRows,
} from './presentation';

function row(
  word: string,
  kind: WriterResultRow['kind'] = 'word',
  raw: Record<string, unknown> = {},
): WriterResultRow {
  return {
    word,
    kind,
    relation: 'primary',
    relationType: 'perfect',
    relationLabel: 'Vollreim',
    syll: 1,
    syllableDistance: 0,
    lang: 'de',
    id: `${kind}:${word}`,
    score: 0.9,
    usageRank: null,
    usageCount: null,
    generatedPronunciation: false,
    raw,
  };
}

describe('R3 keeps accepted Search presentation helpers', () => {
  it('reuses legacy filter, sort and density implementations by identity', () => {
    expect(filterStudioWriterRows).toBe(legacyFilters.filterStudioWriterRows);
    expect(sortStudioWriterRows).toBe(legacyFilters.sortStudioWriterRows);
    expect(normalizeDensity).toBe(legacyControls.normalizeDensity);
  });

  it('keeps compact as the first-run density fallback', () => {
    expect(normalizeDensity(undefined)).toBe('compact');
    expect(normalizeDensity('bogus')).toBe('compact');
    expect(normalizeDensity('list')).toBe('list');
    expect(normalizeDensity('tiles')).toBe('tiles');
  });
});

describe('R3 preserves legacy Search control composition', () => {
  it('maps RhymePad presets without inventing new search semantics', () => {
    expect(presetPatch('best')).toEqual({ scope: 'all', rhymeType: 'all' });
    expect(presetPatch('words')).toEqual({ scope: 'words', rhymeType: 'all' });
    expect(presetPatch('phrases')).toEqual({ scope: 'phrases', rhymeType: 'all' });
    expect(presetPatch('entities')).toEqual({ scope: 'entities', rhymeType: 'all' });
    expect(presetPatch('multisyllabic_perfect')).toEqual({
      scope: 'all',
      rhymeType: 'multisyllabic_perfect',
    });
    expect(presetPatch('assonance')).toEqual({
      scope: 'all',
      rhymeType: 'assonance',
    });
  });

  it('round-trips every current query/result language route', () => {
    for (const basis of ['de', 'en', 'both'] as const) {
      for (const resultLanguage of ['de', 'en', 'both'] as const) {
        const value = languageRouteValue(basis, resultLanguage);
        expect(parseLanguageRoute(value)).toEqual({ queryBasis: basis, resultLanguage });
      }
    }
  });

  it('round-trips the six existing corpus modes', () => {
    const modes = [
      'current',
      'generated',
      'generated_only',
      'historical',
      'complete',
      'historical_generated_only',
    ] as const;

    for (const mode of modes) {
      expect(corpusModeValue(corpusModePatch(mode))).toBe(mode);
    }
  });
});

describe('R3 preserves Writer request semantics through R1', () => {
  it('maps SearchState to the existing Writer option contract exactly', () => {
    const state = createSearchState({
      anchor: 'Nacht',
      queryBasis: 'de',
      resultLanguage: 'both',
      scope: 'entities',
      rhymeType: 'family',
      syllableFilter: 'near2',
      sort: 'alpha',
      variantMode: 'all',
      historical: true,
      generated: true,
      generatedOnly: false,
      entityCategories: ['person.rapper', 'work.song'],
    });

    expect(writerSearchOptions(
      state,
      {
        status: 'ready',
        runtime: 'serving-v1/standard',
        servingV1: true,
        deWriter: true,
        enWriter: true,
        phrases: true,
        entities: true,
        generated: true,
        generatedDefault: false,
        queryPronunciationRevision: 'revision-1',
        dataset: { core: 1, generated: 1, total: 2, consistent: true },
      },
      'standard',
    )).toEqual({
      query: 'Nacht',
      queryBasis: 'de',
      resultLanguage: 'both',
      scope: 'entities',
      rhymeType: 'family',
      syllableFilter: 'near2',
      includeVariants: true,
      includeHistorical: true,
      generated: true,
      generatedOnly: false,
      entityCategory: 'person.rapper',
      entityCategories: ['person.rapper', 'work.song'],
      queryPronunciationRevision: 'revision-1',
      runtimeDb: 'standard',
    });
  });

  it('keeps STANDARD -> FULL -> LITE fallback when the requested edition is unavailable', () => {
    const payload: RuntimeEditionPayload = {
      enabled: true,
      defaultDatabase: 'standard',
      databases: [
        { id: 'lite', available: true },
        { id: 'standard', available: false },
        { id: 'full', available: true },
      ],
    };

    expect(chooseAvailableRuntimeEdition(payload, 'standard')).toBe('full');
    expect(chooseAvailableRuntimeEdition(payload, 'lite')).toBe('lite');
  });
});

describe('R3 hide-used and Entity presentation match existing product semantics', () => {
  it('hides words by token and phrases/entities by normalized surface containment', () => {
    const rows = [
      row('Nacht'),
      row('Stadt'),
      row('durch diese Nacht', 'phrase'),
      row('Berlin', 'entity', { primaryCategory: 'place.city' }),
      row('Hamburg', 'entity', { primaryCategory: 'place.city' }),
    ];

    const trackedText = 'Ich schreib uns einen Weg durch diese Nacht\nBerlin bleibt wach';
    const result = filterUnusedWriterRows(rows, trackedText, true);

    expect(result.hidden).toBe(3);
    expect(result.rows.map((item) => item.word)).toEqual(['Stadt', 'Hamburg']);
    expect(filterUnusedWriterRows(rows, trackedText, false).rows).toBe(rows);
  });

  it('never presents generic Entity / Entität as the individual item type', () => {
    expect(entityCategoryLabel('person.rapper', 'de')).toBe('Rapper');
    expect(entityCategoryLabel('work.film', 'en')).toBe('Movie');
    expect(entityCategoryLabel('fictional.character', 'de')).toBe('Figur');

    expect(resultKindLabel(
      row('Berlin', 'entity', { primaryCategory: 'place.city' }),
      'de',
    )).toBe('Stadt');

    expect(resultKindLabel(row('Mystery', 'entity'), 'de')).toBe('Eigenname');
    expect(resultKindLabel(row('Mystery', 'entity'), 'en')).toBe('Named item');
  });
});
