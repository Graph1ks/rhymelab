import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { SearchState, SearchStateInput } from '../../legacy/contracts';
import {
  createSearchState,
  loadSearchState,
  patchSearchState,
  saveSearchState,
  searchStateFromUrl,
  writeSearchStateToUrl,
} from '../../legacy/search';

type SearchStateContextValue = {
  state: SearchState;
  patch: (patch: SearchStateInput) => SearchState;
  resetFilters: () => SearchState;
  setSelectedResultId: (id: string) => SearchState;
};

const SearchStateContext = createContext<SearchStateContextValue | null>(null);

function initialSearchState(): SearchState {
  const stored = loadSearchState();
  const fromUrl = typeof window !== 'undefined'
    ? searchStateFromUrl(window.location.href, stored)
    : stored;

  // Studio V2 uses Nacht as its first-run writing anchor while still honoring
  // an already-persisted SearchState anchor.
  return fromUrl.anchor
    ? fromUrl
    : patchSearchState(fromUrl, { anchor: 'Nacht' });
}

function persistSearchState(next: SearchState): SearchState {
  const normalized = saveSearchState(next);
  if (typeof window !== 'undefined') {
    const url = writeSearchStateToUrl(window.location.href, normalized);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
  return normalized;
}

export function SearchStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SearchState>(initialSearchState);

  const patch = useCallback((input: SearchStateInput) => {
    let next = state;
    setState((current) => {
      next = persistSearchState(patchSearchState(current, input));
      return next;
    });
    return next;
  }, [state]);

  const resetFilters = useCallback(() => {
    let next = state;
    setState((current) => {
      next = persistSearchState(createSearchState({
        anchor: current.anchor,
        selectedResultId: '',
        queryBasis: 'de',
        resultLanguage: 'both',
        scope: 'all',
        rhymeType: 'all',
        syllableFilter: 'all',
        sort: 'recommended',
        variantMode: 'preferred',
        historical: false,
        generated: false,
        generatedOnly: false,
        entityCategory: 'all',
        entityCategories: [],
      }));
      return next;
    });
    return next;
  }, [state]);

  const setSelectedResultId = useCallback((id: string) => (
    patch({ selectedResultId: String(id || '') })
  ), [patch]);

  const value = useMemo<SearchStateContextValue>(() => ({
    state,
    patch,
    resetFilters,
    setSelectedResultId,
  }), [patch, resetFilters, setSelectedResultId, state]);

  return (
    <SearchStateContext.Provider value={value}>
      {children}
    </SearchStateContext.Provider>
  );
}

export function useSharedSearchState(): SearchStateContextValue {
  const value = useContext(SearchStateContext);
  if (!value) {
    throw new Error('useSharedSearchState must be used inside SearchStateProvider');
  }
  return value;
}
