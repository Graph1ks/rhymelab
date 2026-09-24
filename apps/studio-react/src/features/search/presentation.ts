import * as legacySearchFilters from '../../../../src/studio/search-filters.mjs';
import * as legacyStudioControls from '../../../../src/studio/studio-controls.mjs';

import type {
  QueryBasis,
  RhymeType,
  SearchScope,
  SearchSort,
  SyllableFilter,
  VariantMode,
  WriterResultRow,
} from '../../legacy/contracts';

type SearchFilterApi = {
  STUDIO_RHYME_TYPES: readonly RhymeType[];
  STUDIO_RHYME_TYPE_LABELS: Readonly<Record<RhymeType, string>>;
  normalizeStudioRhymeType(value: unknown): RhymeType;
  studioRowMatchesType(row: WriterResultRow, type: RhymeType): boolean;
  studioRowRelationScore(row: WriterResultRow, type?: RhymeType): number;
  studioRowSyllableDistance(row: WriterResultRow, querySyllables?: number): number;
  studioRowMatchesSyllables(
    row: WriterResultRow,
    mode?: SyllableFilter,
    querySyllables?: number,
  ): boolean;
  filterStudioWriterRows(
    rows: WriterResultRow[],
    options?: {
      rhymeType?: RhymeType;
      syllableMode?: SyllableFilter;
      querySyllables?: number;
    },
  ): WriterResultRow[];
  sortStudioWriterRows(
    rows: WriterResultRow[],
    options?: {
      sort?: SearchSort;
      rhymeType?: RhymeType;
      querySyllables?: number;
      locale?: string;
    },
  ): WriterResultRow[];
};

export type ResultDensity = 'list' | 'compact' | 'tiles';

type StudioControlsApi = {
  normalizeDensity(value: unknown): ResultDensity;
  nextDensity(value: unknown): ResultDensity;
};

const filterApi = legacySearchFilters as unknown as SearchFilterApi;
const controlsApi = legacyStudioControls as unknown as StudioControlsApi;

export const STUDIO_RHYME_TYPES = filterApi.STUDIO_RHYME_TYPES;
export const STUDIO_RHYME_TYPE_LABELS = filterApi.STUDIO_RHYME_TYPE_LABELS;
export const normalizeStudioRhymeType = filterApi.normalizeStudioRhymeType;
export const studioRowMatchesType = filterApi.studioRowMatchesType;
export const studioRowRelationScore = filterApi.studioRowRelationScore;
export const studioRowSyllableDistance = filterApi.studioRowSyllableDistance;
export const studioRowMatchesSyllables = filterApi.studioRowMatchesSyllables;
export const filterStudioWriterRows = filterApi.filterStudioWriterRows;
export const sortStudioWriterRows = filterApi.sortStudioWriterRows;
export const normalizeDensity = controlsApi.normalizeDensity;
export const nextDensity = controlsApi.nextDensity;

export type SearchPreset =
  | 'best'
  | 'words'
  | 'phrases'
  | 'entities'
  | RhymeType;

export const SEARCH_PRESETS: readonly SearchPreset[] = Object.freeze([
  'best',
  'words',
  'phrases',
  'entities',
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
  'assonance',
  'consonance',
]);

export function presetPatch(preset: SearchPreset): {
  scope: SearchScope;
  rhymeType: RhymeType;
} {
  if (preset === 'words' || preset === 'phrases' || preset === 'entities') {
    return { scope: preset, rhymeType: 'all' };
  }
  if (preset !== 'best' && STUDIO_RHYME_TYPES.includes(preset)) {
    return { scope: 'all', rhymeType: preset };
  }
  return { scope: 'all', rhymeType: 'all' };
}

export function languageRouteValue(
  queryBasis: QueryBasis,
  resultLanguage: QueryBasis,
): string {
  return `${queryBasis}:${resultLanguage}`;
}

export function parseLanguageRoute(value: string): {
  queryBasis: QueryBasis;
  resultLanguage: QueryBasis;
} {
  const [basis, result] = String(value || '').split(':');
  const allowed: QueryBasis[] = ['de', 'en', 'both'];
  return {
    queryBasis: allowed.includes(basis as QueryBasis) ? basis as QueryBasis : 'de',
    resultLanguage: allowed.includes(result as QueryBasis) ? result as QueryBasis : 'both',
  };
}

export type CorpusMode =
  | 'current'
  | 'generated'
  | 'generated_only'
  | 'historical'
  | 'complete'
  | 'historical_generated_only';

export function corpusModeValue({
  historical,
  generated,
  generatedOnly,
}: {
  historical: boolean;
  generated: boolean;
  generatedOnly: boolean;
}): CorpusMode {
  if (historical && generatedOnly) return 'historical_generated_only';
  if (historical && generated) return 'complete';
  if (historical) return 'historical';
  if (generatedOnly) return 'generated_only';
  if (generated) return 'generated';
  return 'current';
}

export function corpusModePatch(mode: CorpusMode) {
  return {
    historical: mode === 'historical'
      || mode === 'complete'
      || mode === 'historical_generated_only',
    generated: mode === 'generated'
      || mode === 'generated_only'
      || mode === 'complete'
      || mode === 'historical_generated_only',
    generatedOnly: mode === 'generated_only'
      || mode === 'historical_generated_only',
  };
}

export function normalizeCandidateSurface(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/g, ' ')
    .trim();
}

function lyricWordSet(trackedText: string): Set<string> {
  return new Set(
    (trackedText.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [])
      .map(normalizeCandidateSurface)
      .filter(Boolean),
  );
}

export function writerRowAlreadyUsed(
  row: WriterResultRow,
  trackedText: string,
): boolean {
  const candidate = normalizeCandidateSurface(row.word);
  if (!candidate) return true;
  const normalizedLyrics = normalizeCandidateSurface(trackedText);
  if (row.kind === 'phrase' || row.kind === 'entity') {
    return normalizedLyrics.includes(candidate);
  }
  return lyricWordSet(trackedText).has(candidate);
}

export function filterUnusedWriterRows(
  rows: WriterResultRow[],
  trackedText: string,
  hideUsed: boolean,
): {
  rows: WriterResultRow[];
  hidden: number;
} {
  if (!hideUsed || !rows.length) return { rows, hidden: 0 };
  const filtered = rows.filter((row) => !writerRowAlreadyUsed(row, trackedText));
  return {
    rows: filtered,
    hidden: rows.length - filtered.length,
  };
}

const ENTITY_CATEGORY_LABELS: Record<string, { de: string; en: string }> = {
  'person.artist': { en: 'Artist', de: 'Künstler/in' },
  'person.rapper': { en: 'Rapper', de: 'Rapper' },
  'person.singer': { en: 'Singer', de: 'Sänger/in' },
  'person.musician': { en: 'Musician', de: 'Musiker/in' },
  'person.dj': { en: 'DJ', de: 'DJ' },
  'person.producer': { en: 'Producer', de: 'Produzent/in' },
  'person.actor': { en: 'Actor', de: 'Schauspieler/in' },
  'person.director': { en: 'Director', de: 'Regisseur/in' },
  'person.comedian': { en: 'Comedian', de: 'Comedian' },
  'person.author': { en: 'Author', de: 'Autor/in' },
  'person.fashion_designer': { en: 'Fashion Designer', de: 'Modedesigner/in' },
  'person.internet_personality': { en: 'Internet Personality', de: 'Internet-Persönlichkeit' },
  'group.band': { en: 'Band', de: 'Band' },
  'group.music_group': { en: 'Music Group', de: 'Musikgruppe' },
  'organization.brand': { en: 'Brand', de: 'Marke' },
  'organization.luxury_brand': { en: 'Luxury Brand', de: 'Luxusmarke' },
  'organization.fashion_house': { en: 'Fashion House', de: 'Modehaus' },
  'organization.company': { en: 'Company', de: 'Unternehmen' },
  'organization.automotive_marque': { en: 'Car Brand', de: 'Automarke' },
  'organization.car_brand': { en: 'Car Brand', de: 'Automarke' },
  'organization.record_label': { en: 'Record Label', de: 'Plattenlabel' },
  'organization.sports_team': { en: 'Sports Team', de: 'Sportteam' },
  'work.film': { en: 'Movie', de: 'Film' },
  'work.tv_series': { en: 'TV Series', de: 'TV-Serie' },
  'work.video_game': { en: 'Video Game', de: 'Videospiel' },
  'work.album': { en: 'Album', de: 'Album' },
  'work.song': { en: 'Song', de: 'Song' },
  'work.franchise': { en: 'Franchise', de: 'Franchise' },
  'fictional.character': { en: 'Character', de: 'Figur' },
  'fictional.group': { en: 'Fictional Group', de: 'Fiktive Gruppe' },
  'place.city': { en: 'City', de: 'Stadt' },
  'place.neighborhood': { en: 'Neighborhood', de: 'Stadtviertel' },
  'place.venue': { en: 'Venue', de: 'Veranstaltungsort' },
  'place.landmark': { en: 'Landmark', de: 'Wahrzeichen' },
  'product.vehicle_model': { en: 'Vehicle Model', de: 'Fahrzeugmodell' },
  'product.fashion_product': { en: 'Fashion Product', de: 'Modeprodukt' },
  'product.consumer_product': { en: 'Consumer Product', de: 'Konsumprodukt' },
};

export function entityCategoryLabel(
  category: string,
  language: 'de' | 'en',
): string {
  const known = ENTITY_CATEGORY_LABELS[category];
  if (known) return known[language];
  const tail = String(category || '').split('.').at(-1) || '';
  const humanized = tail.replaceAll('_', ' ').trim();
  if (!humanized) return language === 'de' ? 'Eigenname' : 'Named item';
  return humanized.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function humanize(value: unknown): string {
  return String(value ?? '')
    .replaceAll('.', ' / ')
    .replaceAll('_', ' ')
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
    .trim();
}

export interface ResultBadge {
  label: string;
  kind: 'warn' | 'generated' | 'pos' | 'lexical' | 'phrase' | 'entity' | 'source' | 'usage' | 'meta';
}

export function resultBadges(
  row: WriterResultRow,
  language: 'de' | 'en',
): ResultBadge[] {
  const raw = row.raw || {};
  const badges: ResultBadge[] = [];
  const list = (value: unknown): unknown[] => (
    Array.isArray(value) ? value : value == null || value === '' ? [] : [value]
  );
  const push = (value: unknown, kind: ResultBadge['kind'] = 'meta') => {
    const label = String(value ?? '').trim();
    if (!label || badges.some((item) => item.label === label)) return;
    badges.push({ label, kind });
  };

  if (raw.historical) push(language === 'de' ? 'Historisch' : 'Historical', 'warn');
  if (raw.generatedPronunciation || row.generatedPronunciation) push('Generated', 'generated');
  if (raw.partOfSpeech && raw.partOfSpeech !== 'phrase') push(humanize(raw.partOfSpeech), 'pos');
  for (const value of list(raw.lexicalTags)) push(humanize(value), 'lexical');
  for (const value of list(raw.phraseTypes)) push(humanize(value), 'phrase');

  if (raw.primaryCategory) {
    push(entityCategoryLabel(String(raw.primaryCategory), language), 'entity');
  }
  for (const entry of list(raw.entityCategories)) {
    const category = typeof entry === 'string'
      ? entry
      : String((entry as Record<string, unknown>)?.category ?? '');
    if (category) push(entityCategoryLabel(category, language), 'entity');
  }

  if (raw.lexiconLayer && raw.lexiconLayer !== 'phrase') push(humanize(raw.lexiconLayer), 'source');
  if (raw.pronunciationSource) push(humanize(raw.pronunciationSource), 'source');
  if (row.usageRank != null && Number.isFinite(Number(row.usageRank))) {
    push(`Usage #${Number(row.usageRank)}`, 'usage');
  }
  return badges.slice(0, 5);
}

export function resultKindLabel(
  row: WriterResultRow,
  language: 'de' | 'en',
): string {
  if (row.kind === 'word') return language === 'de' ? 'Wort' : 'Word';
  if (row.kind === 'phrase') return language === 'de' ? 'Phrase' : 'Phrase';

  const raw = row.raw || {};
  const categories = [
    raw.primaryCategory,
    ...(Array.isArray(raw.entityCategories)
      ? raw.entityCategories.map((entry) => (
          typeof entry === 'string'
            ? entry
            : (entry as Record<string, unknown>)?.category
        ))
      : []),
  ].map(String).filter(Boolean);

  return categories[0]
    ? entityCategoryLabel(categories[0], language)
    : language === 'de'
      ? 'Eigenname'
      : 'Named item';
}
