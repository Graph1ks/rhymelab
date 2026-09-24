import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  loadStudioPreferences,
  loadStudioState,
  writeStudioPreferences,
} from '../../legacy/documents';
import type {
  LegacyStudioState,
  PortableStudioBackup,
  SearchState,
} from '../../legacy/contracts';
import {
  applyWorkspacePortableBackup,
  createSerializedSaveQueue,
  createWorkspacePortableBackup,
  createWorkspaceRecoveryPoint,
  createWorkspaceStore,
  initializeDocumentWorkspace,
  listWorkspaceRecoveryPoints,
  restoreWorkspaceRecoveryPoint,
  saveWorkspaceState,
  type RecoveryRow,
  type WorkspacePersistenceStatus,
} from './persistence';
import { cloneWorkspaceState } from './model';

type Mutator = (state: LegacyStudioState) => LegacyStudioState | void;

interface DocumentWorkspaceContextValue {
  state: LegacyStudioState;
  status: WorkspacePersistenceStatus;
  authority: 'indexeddb' | 'localstorage';
  error: string;
  recoveryPoints: RecoveryRow[];
  peekState: () => LegacyStudioState;
  mutate: (mutator: Mutator, options?: { immediate?: boolean }) => Promise<boolean>;
  replaceState: (state: LegacyStudioState, options?: { immediate?: boolean }) => Promise<boolean>;
  flush: (reason?: string) => Promise<boolean>;
  refreshRecoveryPoints: () => Promise<RecoveryRow[]>;
  createRecoveryPoint: (reason?: string) => Promise<void>;
  restoreRecoveryPoint: (id: string) => Promise<void>;
  exportPortableBackup: (searchState: SearchState) => Promise<PortableStudioBackup>;
  importPortableBackup: (input: string | unknown) => Promise<PortableStudioBackup>;
}

const DocumentWorkspaceContext = createContext<DocumentWorkspaceContextValue | null>(null);

function initialState(): LegacyStudioState {
  // initializeDocumentWorkspace performs the authoritative IndexedDB load. This
  // synchronous value only prevents an empty React tree while that completes.
  const preferences = loadStudioPreferences();
  return {
    songs: [],
    active: null,
    folders: [],
    ...preferences,
  } as LegacyStudioState;
}

export function DocumentWorkspaceProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef(createWorkspaceStore());
  const initializedRef = useRef(false);
  const storeAvailableRef = useRef(false);
  const stateRef = useRef<LegacyStudioState>(initialState());
  const queueRef = useRef<ReturnType<typeof createSerializedSaveQueue> | null>(null);

  const [state, setState] = useState<LegacyStudioState>(stateRef.current);
  const [status, setStatus] = useState<WorkspacePersistenceStatus>('loading');
  const [authority, setAuthority] = useState<'indexeddb' | 'localstorage'>('localstorage');
  const [error, setError] = useState('');
  const [recoveryPoints, setRecoveryPoints] = useState<RecoveryRow[]>([]);

  const publishState = useCallback((next: LegacyStudioState) => {
    stateRef.current = next;
    setState(next);
    try {
      writeStudioPreferences(next);
    } catch {
      // The persistence path below reports authoritative storage failures.
    }
    globalThis.dispatchEvent?.(new CustomEvent('rhymelab:document-changed'));
  }, []);

  const saveNow = useCallback(async (
    next: LegacyStudioState,
    generation: number,
  ) => {
    setStatus('saving');
    setError('');
    try {
      const saved = await saveWorkspaceState(
        storeRef.current,
        next,
        storeAvailableRef.current,
      );
      if (generation === queueRef.current?.generation()) {
        setStatus(storeAvailableRef.current ? 'ready' : 'fallback');
      }
      return saved;
    } catch (saveError) {
      if (generation === queueRef.current?.generation()) {
        setStatus('error');
        setError(saveError instanceof Error ? saveError.message : String(saveError));
      }
      return false;
    }
  }, []);

  useEffect(() => {
    queueRef.current = createSerializedSaveQueue({ save: saveNow, delay: 180 });
    return () => {
      queueRef.current?.close();
      storeRef.current.close();
    };
  }, [saveNow]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const initialized = await initializeDocumentWorkspace(storeRef.current);
        if (cancelled) return;
        initializedRef.current = true;
        storeAvailableRef.current = initialized.storeAvailable;
        publishState(initialized.state);
        setAuthority(initialized.authority);
        setStatus(initialized.storeAvailable ? 'ready' : 'fallback');
        setError('');
        if (initialized.storeAvailable) {
          const rows = await listWorkspaceRecoveryPoints(storeRef.current);
          if (!cancelled) setRecoveryPoints(rows);
        }
      } catch (initError) {
        if (cancelled) return;
        initializedRef.current = true;
        storeAvailableRef.current = false;
        const fallback = {
          ...loadStudioState(),
          ...loadStudioPreferences(),
        } as LegacyStudioState;
        publishState(fallback);
        setStatus('error');
        setAuthority('localstorage');
        setError(initError instanceof Error ? initError.message : String(initError));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publishState]);

  const flush = useCallback(async (_reason = 'explicit_flush') => {
    if (!initializedRef.current) return false;
    return queueRef.current?.flush(stateRef.current) ?? false;
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) void flush('visibility_hidden');
    };
    const onPageHide = () => {
      void flush('pagehide');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flush]);

  const peekState = useCallback(() => stateRef.current, []);

  const replaceState = useCallback(async (
    next: LegacyStudioState,
    options: { immediate?: boolean } = {},
  ) => {
    const normalized = cloneWorkspaceState(next);
    publishState(normalized);
    if (!initializedRef.current) return false;
    if (options.immediate) return queueRef.current?.flush(normalized) ?? false;
    queueRef.current?.schedule(normalized);
    return true;
  }, [publishState]);

  const mutate = useCallback(async (
    mutator: Mutator,
    options: { immediate?: boolean } = {},
  ) => {
    const next = cloneWorkspaceState(stateRef.current);
    const result = mutator(next);
    return replaceState(result ?? next, options);
  }, [replaceState]);

  const refreshRecoveryPoints = useCallback(async () => {
    if (!storeAvailableRef.current) {
      setRecoveryPoints([]);
      return [];
    }
    const rows = await listWorkspaceRecoveryPoints(storeRef.current);
    setRecoveryPoints(rows);
    return rows;
  }, []);

  const createRecoveryPoint = useCallback(async (
    reason = 'manual_recovery_point',
  ) => {
    if (!storeAvailableRef.current) {
      throw new Error('DocumentStore ist nicht verfügbar.');
    }
    await flush(reason);
    await createWorkspaceRecoveryPoint(storeRef.current, reason);
    await refreshRecoveryPoints();
  }, [flush, refreshRecoveryPoints]);

  const restoreRecoveryPoint = useCallback(async (id: string) => {
    if (!storeAvailableRef.current) {
      throw new Error('DocumentStore ist nicht verfügbar.');
    }
    await flush('before_recovery_restore');
    const restored = await restoreWorkspaceRecoveryPoint(
      storeRef.current,
      id,
      loadStudioPreferences(),
    );
    publishState(restored.state);
    setAuthority('indexeddb');
    setStatus('ready');
    setError('');
    await refreshRecoveryPoints();
    globalThis.dispatchEvent?.(new CustomEvent('rhymelab:preferences-imported'));
  }, [flush, publishState, refreshRecoveryPoints]);

  const exportPortableBackup = useCallback(async (searchState: SearchState) => {
    if (!storeAvailableRef.current) {
      throw new Error('DocumentStore ist nicht verfügbar.');
    }
    await flush('before_portable_export');
    return createWorkspacePortableBackup(
      storeRef.current,
      stateRef.current,
      searchState,
    );
  }, [flush]);

  const importPortableBackup = useCallback(async (input: string | unknown) => {
    if (!storeAvailableRef.current) {
      throw new Error('DocumentStore ist nicht verfügbar.');
    }
    await flush('before_portable_import');
    const imported = await applyWorkspacePortableBackup(storeRef.current, input);
    publishState(imported.state);
    setAuthority('indexeddb');
    setStatus('ready');
    setError('');
    await refreshRecoveryPoints();
    globalThis.dispatchEvent?.(new CustomEvent('rhymelab:preferences-imported'));
    return imported.backup;
  }, [flush, publishState, refreshRecoveryPoints]);

  const value = useMemo<DocumentWorkspaceContextValue>(() => ({
    state,
    status,
    authority,
    error,
    recoveryPoints,
    peekState,
    mutate,
    replaceState,
    flush,
    refreshRecoveryPoints,
    createRecoveryPoint,
    restoreRecoveryPoint,
    exportPortableBackup,
    importPortableBackup,
  }), [
    authority,
    createRecoveryPoint,
    error,
    exportPortableBackup,
    flush,
    importPortableBackup,
    mutate,
    peekState,
    recoveryPoints,
    refreshRecoveryPoints,
    replaceState,
    restoreRecoveryPoint,
    state,
    status,
  ]);

  return (
    <DocumentWorkspaceContext.Provider value={value}>
      {children}
    </DocumentWorkspaceContext.Provider>
  );
}

export function useDocumentWorkspace(): DocumentWorkspaceContextValue {
  const value = useContext(DocumentWorkspaceContext);
  if (!value) {
    throw new Error('useDocumentWorkspace must be used inside DocumentWorkspaceProvider');
  }
  return value;
}
