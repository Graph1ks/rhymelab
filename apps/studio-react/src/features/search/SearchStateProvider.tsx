import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { SearchState, SearchStateInput } from '../../core/contracts';
import { defaultStudioUiLanguage } from '../../core/shell';
import { useUiStore } from '../../state/uiStore';
import {
  SEARCH_STATE_STORAGE_KEY,
  createSearchState,
  loadSearchState,
  patchSearchState,
  saveSearchState,
  searchStateFromUrl,
  writeSearchStateToUrl,
} from '../../core/search';

type SearchStateContextValue = {
  state: SearchState;
  patch: (patch: SearchStateInput) => void;
  replace: (next: SearchStateInput) => void;
  resetFilters: () => void;
  setSelectedResultId: (id: string) => void;
};

const SearchStateContext = createContext<SearchStateContextValue | null>(null);

function initialSearchState(): SearchState {
  let hasStoredState = false;
  try {
    hasStoredState = Boolean(globalThis.localStorage?.getItem?.(SEARCH_STATE_STORAGE_KEY));
  } catch {
    hasStoredState = false;
  }

  const localeLanguage = defaultStudioUiLanguage();
  const base = hasStoredState
    ? loadSearchState()
    : createSearchState({
        anchor: localeLanguage === 'de' ? 'Nacht' : 'night',
        queryBasis: localeLanguage,
        resultLanguage: localeLanguage,
      });

  return typeof window !== 'undefined'
    ? searchStateFromUrl(window.location.href, base)
    : base;
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
  const uiLanguage = useUiStore((row) => row.uiLanguage);
  const [state, setState] = useState<SearchState>(initialSearchState);

  const patch = useCallback((input: SearchStateInput) => {
    setState((current) => persistSearchState(patchSearchState(current, input)));
  }, []);

  const replace = useCallback((input: SearchStateInput) => {
    setState(persistSearchState(createSearchState(input)));
  }, []);

  const resetFilters = useCallback(() => {
    setState((current) => persistSearchState(createSearchState({
      anchor: current.anchor,
      selectedResultId: '',
      queryBasis: uiLanguage,
      resultLanguage: uiLanguage,
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
    })));
  }, [uiLanguage]);

  const setSelectedResultId = useCallback((id: string) => {
    patch({ selectedResultId: String(id || '') });
  }, [patch]);

  const value = useMemo<SearchStateContextValue>(() => ({
    state,
    patch,
    replace,
    resetFilters,
    setSelectedResultId,
  }), [patch, replace, resetFilters, setSelectedResultId, state]);

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
