import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  createStudioDocumentStore,
  loadStudioState,
  songText,
} from '../../legacy/documents';
import { editorTrackableText, isTrackedEditorLine } from '../../legacy/editor';
import {
  buildStudioDetailModel,
  createStudioDetailClient,
  studioDetailKey,
} from '../../legacy/services';
import {
  capabilitiesForRuntimeEdition,
  chooseAvailableRuntimeEdition,
  createWriterSearchClient,
  loadRuntimeEditionSelection,
  loadStudioCapabilities,
  runtimeEditionSummaryMap,
  saveRuntimeEditionSelection,
} from '../../legacy/search';
import type {
  RuntimeEdition,
  RuntimeEditionPayload,
  SearchState,
  StudioCapabilities,
  StudioDetailModel,
  WriterResultRow,
  WriterSearchResult,
} from '../../legacy/contracts';

const writerClient = createWriterSearchClient();
const detailClient = createStudioDetailClient();
const documentStore = createStudioDocumentStore();

export function runtimeEditionFromHealth(payload: unknown): RuntimeEdition | null {
  const health = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  const serving = health.serving_v1 && typeof health.serving_v1 === 'object'
    ? health.serving_v1 as Record<string, unknown>
    : {};
  const edition = String(serving.internal_db ?? '').toLowerCase();
  return edition === 'lite' || edition === 'standard' || edition === 'full'
    ? edition
    : null;
}

async function fetchRuntimeIdentity(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<RuntimeEdition | null> {
  if (typeof fetchImpl !== 'function') return null;
  const response = await fetchImpl('/api/health', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return null;
  return runtimeEditionFromHealth(await response.json());
}

async function fetchRuntimeEditions(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<RuntimeEditionPayload | null> {
  if (typeof fetchImpl !== 'function') return null;
  const response = await fetchImpl('/api/internal/distribution-dbs', {
    headers: { accept: 'application/json' },
  });
  if (response.status === 404) return null;
  const payload = await response.json() as RuntimeEditionPayload;
  if (!response.ok) {
    throw new Error(String(
      (payload as Record<string, unknown>)?.error
      ?? `Runtime database endpoint returned HTTP ${response.status}`,
    ));
  }
  return payload?.enabled === true ? payload : null;
}

export function useRuntimeEnvironment() {
  const identityQuery = useQuery({
    queryKey: ['runtime-identity'],
    queryFn: () => fetchRuntimeIdentity(),
    staleTime: 15_000,
    retry: false,
  });

  const editionsQuery = useQuery({
    queryKey: ['runtime-editions'],
    queryFn: () => fetchRuntimeEditions(),
    staleTime: 30_000,
    retry: false,
  });

  const [preferred, setPreferred] = useState<RuntimeEdition>(
    () => loadRuntimeEditionSelection(),
  );

  const selected = useMemo(
    () => chooseAvailableRuntimeEdition(editionsQuery.data ?? null, preferred),
    [editionsQuery.data, preferred],
  );

  useEffect(() => {
    if (!selected || selected === preferred) return;
    setPreferred(saveRuntimeEditionSelection(selected));
  }, [preferred, selected]);

  const summaryMap = useMemo(
    () => runtimeEditionSummaryMap(editionsQuery.data ?? null),
    [editionsQuery.data],
  );

  const setRuntimeEdition = (edition: RuntimeEdition) => {
    if (editionsQuery.data && summaryMap[edition]?.available !== true) return false;
    const next = saveRuntimeEditionSelection(edition);
    setPreferred(next);
    detailClient.clear();
    detailClient.cancel();
    writerClient.cancel();
    return true;
  };

  const activeEdition = selected ?? identityQuery.data ?? null;
  const runtimeDb = editionsQuery.data && selected ? selected : '';

  const capabilitiesQuery = useQuery({
    queryKey: ['studio-capabilities', runtimeDb || 'default'],
    queryFn: () => loadStudioCapabilities({ runtimeDb }),
    staleTime: 15_000,
    retry: 1,
  });

  const capabilities = useMemo<StudioCapabilities | null>(() => {
    if (!capabilitiesQuery.data) return null;
    if (!editionsQuery.data || !selected) return capabilitiesQuery.data;
    return capabilitiesForRuntimeEdition(
      summaryMap[selected],
      capabilitiesQuery.data,
    );
  }, [capabilitiesQuery.data, editionsQuery.data, selected, summaryMap]);

  return {
    payload: editionsQuery.data ?? null,
    payloadStatus: editionsQuery.status,
    payloadError: editionsQuery.error,
    preferred,
    selected,
    activeEdition,
    runtimeDb,
    summaryMap,
    setRuntimeEdition,
    capabilities,
    capabilitiesStatus: capabilitiesQuery.status,
    capabilitiesError: capabilitiesQuery.error,
    refetchCapabilities: capabilitiesQuery.refetch,
  };
}

export function writerSearchOptions(
  state: SearchState,
  capabilities: StudioCapabilities | null,
  runtimeDb = '',
) {
  return {
    query: state.anchor,
    queryBasis: state.queryBasis,
    resultLanguage: state.resultLanguage,
    scope: state.scope,
    rhymeType: state.rhymeType,
    syllableFilter: state.syllableFilter,
    includeVariants: state.variantMode === 'all',
    includeHistorical: state.historical,
    generated: state.generated,
    generatedOnly: state.generatedOnly,
    entityCategory: state.entityCategory,
    entityCategories: [...state.entityCategories],
    queryPronunciationRevision: capabilities?.queryPronunciationRevision || '',
    runtimeDb,
  };
}

export function useWriterSearch(
  state: SearchState,
  capabilities: StudioCapabilities | null,
  runtimeDb = '',
) {
  const options = writerSearchOptions(state, capabilities, runtimeDb);
  return useQuery<WriterSearchResult>({
    queryKey: [
      'writer-search',
      state.anchor,
      state.queryBasis,
      state.resultLanguage,
      state.scope,
      state.rhymeType,
      state.syllableFilter,
      state.variantMode,
      state.historical,
      state.generated,
      state.generatedOnly,
      state.entityCategories.join(','),
      capabilities?.queryPronunciationRevision || '',
      runtimeDb || 'default',
    ],
    queryFn: () => writerClient.search(options),
    enabled: Boolean(state.anchor.trim()),
    staleTime: 0,
    retry: false,
  });
}

export function trackedSearchText(lines: string[]): string {
  return lines
    .filter((line) => isTrackedEditorLine(line))
    .map((line) => editorTrackableText(line))
    .filter(Boolean)
    .join('\n');
}

function fallbackTrackedText(): string {
  const legacy = loadStudioState();
  const song = legacy.songs.find((item) => item.id === legacy.active)
    ?? legacy.songs[0];
  return song ? trackedSearchText(song.lines) : '';
}

async function loadActiveTrackedText(): Promise<string> {
  try {
    const available = await documentStore.available();
    if (available) {
      const snapshot = await documentStore.loadSnapshot();
      if (snapshot?.activeSongId) {
        return trackedSearchText(
          songText(snapshot, snapshot.activeSongId).split('\n'),
        );
      }
    }
  } catch {
    // Search filtering must never replace DocumentStore authority or fail the
    // Writer surface solely because read-only document context is unavailable.
  }
  return fallbackTrackedText();
}

export function useActiveTrackedText() {
  return useQuery({
    queryKey: ['active-tracked-document-text'],
    queryFn: loadActiveTrackedText,
    staleTime: 1_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useResultDetail(
  row: WriterResultRow | null,
  runtimeDb = '',
) {
  const fallback = useMemo<StudioDetailModel | null>(
    () => row ? buildStudioDetailModel(row, null) : null,
    [row],
  );

  const query = useQuery({
    queryKey: [
      'writer-detail',
      row ? studioDetailKey(row) : 'none',
      runtimeDb || 'default',
    ],
    queryFn: async () => {
      if (!row) return null;
      const payload = await detailClient.load(row, { runtimeDb });
      return buildStudioDetailModel(row, payload);
    },
    enabled: Boolean(row),
    staleTime: 60_000,
    retry: false,
  });

  return {
    ...query,
    model: query.data ?? fallback,
  };
}

export function writerEntityCategories(
  result: WriterSearchResult | undefined,
): string[] {
  const capabilities = result?.capabilities as Record<string, unknown> | null | undefined;
  const entities = capabilities?.entities as Record<string, unknown> | undefined;
  const categories = entities?.categories;
  return Array.isArray(categories)
    ? categories.map(String).filter(Boolean)
    : [];
}
