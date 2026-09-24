import * as legacySearchState from '../../../../src/ui/search-state.mjs';
import * as legacyPronunciation from '../../../../src/ui/query-pronunciation-client.mjs';
import * as legacyPronunciationCache from '../../../../src/ui/query-pronunciation-cache.mjs';
import * as legacySearchAdapter from '../../../../src/studio/search-adapter.mjs';
import * as legacyCapabilityAdapter from '../../../../src/studio/capability-adapter.mjs';
import * as legacyRuntimeEditions from '../../../../src/studio/internal-db-lab.mjs';

import type {
  PronunciationLanguage,
  QueryPronunciationCacheRecord,
  QueryPronunciationDetail,
  QueryPronunciationResolveOptions,
  RuntimeEdition,
  RuntimeEditionPayload,
  RuntimeEditionSummary,
  SearchState,
  SearchStateInput,
  StorageLike,
  StudioCapabilities,
  WriterParamLimits,
  WriterResultRow,
  WriterSearchClient,
  WriterSearchOptions,
} from './contracts';

type SearchStateApi = {
  SEARCH_STATE_SCHEMA: string;
  SEARCH_STATE_STORAGE_KEY: string;
  createSearchState(input?: SearchStateInput): SearchState;
  patchSearchState(current: SearchStateInput, patch?: SearchStateInput): SearchState;
  loadSearchState(storage?: StorageLike): SearchState;
  saveSearchState(value: SearchStateInput, storage?: StorageLike): SearchState;
  searchStateFromUrl(urlLike: string | URL, current?: SearchStateInput): SearchState;
  writeSearchStateToUrl(urlLike: string | URL, value: SearchStateInput): URL;
  searchStateToWriterParams(value: SearchStateInput, limits?: WriterParamLimits): URLSearchParams;
};

type PronunciationApi = {
  CLIENT_QUERY_PRONUNCIATION_POLICY: string;
  CLIENT_QUERY_MAX_TOKENS: number;
  normalizeClientSurface(value: unknown, language: PronunciationLanguage): string;
  tokenizeClientPronunciationInput(value: unknown): string[];
  generateClientIpa(surface: unknown, language: PronunciationLanguage): QueryPronunciationDetail;
  resolveUnknownClientPronunciation(
    surface: unknown,
    language: PronunciationLanguage,
    options?: QueryPronunciationResolveOptions,
  ): Promise<QueryPronunciationDetail | null>;
};

type PronunciationCacheApi = {
  QUERY_PRONUNCIATION_CACHE_SCHEMA: string;
  QUERY_PRONUNCIATION_CACHE_DB: string;
  QUERY_PRONUNCIATION_CACHE_STORE: string;
  QUERY_PRONUNCIATION_CACHE_VERSION: number;
  QUERY_PRONUNCIATION_CACHE_MAX_ENTRIES: number;
  generatedPronunciationCacheKey(surface: unknown, language: PronunciationLanguage): string;
  buildGeneratedPronunciationCacheRecord(
    detail: QueryPronunciationDetail,
    databaseRevision: string,
    now?: number,
  ): QueryPronunciationCacheRecord | null;
  isGeneratedPronunciationCacheRecordUsable(
    record: QueryPronunciationCacheRecord | null,
    options?: {
      surface?: unknown;
      language?: PronunciationLanguage;
      policy?: string;
      databaseRevision?: string;
    },
  ): boolean;
  readGeneratedPronunciationCache(options?: {
    surface?: unknown;
    language?: PronunciationLanguage;
    policy?: string;
    databaseRevision?: string;
  }): Promise<QueryPronunciationDetail | null>;
  writeGeneratedPronunciationCache(
    detail: QueryPronunciationDetail,
    databaseRevision: string,
  ): Promise<boolean>;
};

type SearchAdapterApi = {
  estimateSyllables(surface: unknown): number;
  writerScope(scope: unknown): string;
  writerRelationType(row: unknown): string;
  writerRelationGroup(type: unknown): string;
  writerRelationLabel(type: unknown): string;
  mapWriterResult(row: unknown, index?: number): WriterResultRow;
  buildWriterParams(options?: WriterSearchOptions): URLSearchParams;
  createWriterSearchClient(options?: { fetchImpl?: typeof fetch }): WriterSearchClient;
};

type CapabilityApi = {
  CAPABILITY_ENDPOINTS: readonly string[];
  normalizeStudioCapabilities(health?: unknown, datasetStats?: unknown): StudioCapabilities;
  loadStudioCapabilities(options?: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    runtimeDb?: string;
  }): Promise<StudioCapabilities>;
};

type RuntimeEditionApi = {
  INTERNAL_DB_LAB_STORAGE_KEY: string;
  INTERNAL_DB_LAB_IDS: readonly RuntimeEdition[];
  normalizeInternalDbLabId(value: unknown): RuntimeEdition;
  loadInternalDbLabSelection(storage?: StorageLike): RuntimeEdition;
  saveInternalDbLabSelection(id: RuntimeEdition | string, storage?: StorageLike): RuntimeEdition;
  internalDbSummaryMap(payload: RuntimeEditionPayload | null): Record<string, RuntimeEditionSummary>;
  studioCapabilitiesFromInternalDb(
    summary: RuntimeEditionSummary | null | undefined,
    fallback?: StudioCapabilities | Record<string, unknown>,
  ): StudioCapabilities;
};

const stateApi = legacySearchState as unknown as SearchStateApi;
const pronunciationApi = legacyPronunciation as unknown as PronunciationApi;
const cacheApi = legacyPronunciationCache as unknown as PronunciationCacheApi;
const adapterApi = legacySearchAdapter as unknown as SearchAdapterApi;
const capabilityApi = legacyCapabilityAdapter as unknown as CapabilityApi;
const runtimeApi = legacyRuntimeEditions as unknown as RuntimeEditionApi;

export const SEARCH_STATE_SCHEMA = stateApi.SEARCH_STATE_SCHEMA;
export const SEARCH_STATE_STORAGE_KEY = stateApi.SEARCH_STATE_STORAGE_KEY;
export const createSearchState = stateApi.createSearchState;
export const patchSearchState = stateApi.patchSearchState;
export const loadSearchState = stateApi.loadSearchState;
export const saveSearchState = stateApi.saveSearchState;
export const searchStateFromUrl = stateApi.searchStateFromUrl;
export const writeSearchStateToUrl = stateApi.writeSearchStateToUrl;
export const searchStateToWriterParams = stateApi.searchStateToWriterParams;

export const CLIENT_QUERY_PRONUNCIATION_POLICY = pronunciationApi.CLIENT_QUERY_PRONUNCIATION_POLICY;
export const CLIENT_QUERY_MAX_TOKENS = pronunciationApi.CLIENT_QUERY_MAX_TOKENS;
export const normalizeClientSurface = pronunciationApi.normalizeClientSurface;
export const tokenizeClientPronunciationInput = pronunciationApi.tokenizeClientPronunciationInput;
export const generateClientIpa = pronunciationApi.generateClientIpa;
export const resolveUnknownClientPronunciation = pronunciationApi.resolveUnknownClientPronunciation;

export const QUERY_PRONUNCIATION_CACHE_SCHEMA = cacheApi.QUERY_PRONUNCIATION_CACHE_SCHEMA;
export const QUERY_PRONUNCIATION_CACHE_DB = cacheApi.QUERY_PRONUNCIATION_CACHE_DB;
export const QUERY_PRONUNCIATION_CACHE_STORE = cacheApi.QUERY_PRONUNCIATION_CACHE_STORE;
export const QUERY_PRONUNCIATION_CACHE_VERSION = cacheApi.QUERY_PRONUNCIATION_CACHE_VERSION;
export const QUERY_PRONUNCIATION_CACHE_MAX_ENTRIES = cacheApi.QUERY_PRONUNCIATION_CACHE_MAX_ENTRIES;
export const generatedPronunciationCacheKey = cacheApi.generatedPronunciationCacheKey;
export const buildGeneratedPronunciationCacheRecord = cacheApi.buildGeneratedPronunciationCacheRecord;
export const isGeneratedPronunciationCacheRecordUsable = cacheApi.isGeneratedPronunciationCacheRecordUsable;
export const readGeneratedPronunciationCache = cacheApi.readGeneratedPronunciationCache;
export const writeGeneratedPronunciationCache = cacheApi.writeGeneratedPronunciationCache;

export const estimateSyllables = adapterApi.estimateSyllables;
export const writerScope = adapterApi.writerScope;
export const writerRelationType = adapterApi.writerRelationType;
export const writerRelationGroup = adapterApi.writerRelationGroup;
export const writerRelationLabel = adapterApi.writerRelationLabel;
export const mapWriterResult = adapterApi.mapWriterResult;
export const buildWriterParams = adapterApi.buildWriterParams;
export const createWriterSearchClient = adapterApi.createWriterSearchClient;

export const CAPABILITY_ENDPOINTS = capabilityApi.CAPABILITY_ENDPOINTS;
export const normalizeStudioCapabilities = capabilityApi.normalizeStudioCapabilities;
export const loadStudioCapabilities = capabilityApi.loadStudioCapabilities;

export const RUNTIME_EDITION_STORAGE_KEY = runtimeApi.INTERNAL_DB_LAB_STORAGE_KEY;
export const RUNTIME_EDITIONS = runtimeApi.INTERNAL_DB_LAB_IDS;
export const normalizeRuntimeEdition = runtimeApi.normalizeInternalDbLabId;
export const loadRuntimeEditionSelection = runtimeApi.loadInternalDbLabSelection;
export const saveRuntimeEditionSelection = runtimeApi.saveInternalDbLabSelection;
export const runtimeEditionSummaryMap = runtimeApi.internalDbSummaryMap;
export const capabilitiesForRuntimeEdition = runtimeApi.studioCapabilitiesFromInternalDb;

export function chooseAvailableRuntimeEdition(
  payload: RuntimeEditionPayload | null,
  preferred?: RuntimeEdition | string | null,
): RuntimeEdition | null {
  const map = runtimeEditionSummaryMap(payload);
  const normalizedPreferred = preferred ? normalizeRuntimeEdition(preferred) : null;
  const candidates = [
    normalizedPreferred,
    payload?.defaultDatabase ? normalizeRuntimeEdition(payload.defaultDatabase) : null,
    'standard',
    'full',
    'lite',
  ].filter((value, index, values): value is RuntimeEdition =>
    value !== null && values.indexOf(value) === index,
  );

  return candidates.find((edition) => map[edition]?.available === true) ?? null;
}
