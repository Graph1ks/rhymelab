import {
  createPortableStudioBackup,
  createStudioDocumentStore,
  loadStudioPreferences,
  loadStudioState,
  migrateLegacyStudioStateToStore,
  parsePortableStudioBackup,
  shadowLegacyStudioStateToStore,
  studioPreferencesFromState,
  studioStateFromDocumentSnapshot,
  writeStudioPreferences,
  writeStudioState,
} from '../../legacy/documents';
import type {
  JsonRecord,
  LegacyStudioState,
  PortableStudioBackup,
  SearchState,
  StudioDocumentSnapshot,
  StudioDocumentStore,
  StudioPreferences,
} from '../../legacy/contracts';
import { cloneWorkspaceState } from './model';

export type WorkspacePersistenceStatus =
  | 'loading'
  | 'saving'
  | 'ready'
  | 'fallback'
  | 'error';

export interface WorkspaceInitialization {
  state: LegacyStudioState;
  snapshot: StudioDocumentSnapshot | null;
  storeAvailable: boolean;
  authority: 'indexeddb' | 'localstorage';
}

export interface RecoveryRow extends JsonRecord {
  id: string;
  kind?: string;
  createdAt?: number;
  reason?: string;
  counts?: {
    songs?: number;
    bars?: number;
    revisions?: number;
    folders?: number;
  };
  sourceSchema?: string;
  backup?: string;
  snapshot?: StudioDocumentSnapshot;
}

export function createWorkspaceStore(): StudioDocumentStore {
  return createStudioDocumentStore();
}

export async function initializeDocumentWorkspace(
  store: StudioDocumentStore,
): Promise<WorkspaceInitialization> {
  const legacy = loadStudioState();
  const preferences = loadStudioPreferences();
  const base = { ...legacy, ...preferences } as LegacyStudioState;

  if (!(await store.available())) {
    return {
      state: base,
      snapshot: null,
      storeAvailable: false,
      authority: 'localstorage',
    };
  }

  let snapshot: StudioDocumentSnapshot | null = null;
  try {
    snapshot = await store.loadSnapshot();
  } catch {
    snapshot = null;
  }

  if (!snapshot) {
    const migrated = await migrateLegacyStudioStateToStore(legacy, store);
    snapshot = migrated.migration.snapshot;
  }

  const state = studioStateFromDocumentSnapshot(snapshot, base);
  writeStudioPreferences(state);
  return {
    state,
    snapshot,
    storeAvailable: true,
    authority: 'indexeddb',
  };
}

export async function saveWorkspaceState(
  store: StudioDocumentStore,
  state: LegacyStudioState,
  storeAvailable: boolean,
): Promise<boolean> {
  writeStudioPreferences(state);
  if (!storeAvailable) {
    writeStudioState(state);
    return true;
  }
  const result = await shadowLegacyStudioStateToStore(
    cloneWorkspaceState(state),
    store,
  );
  return result.saveResult?.saved !== false;
}

export async function createWorkspaceRecoveryPoint(
  store: StudioDocumentStore,
  reason = 'manual_recovery_point',
): Promise<JsonRecord> {
  const snapshot = await store.loadSnapshot();
  if (!snapshot) throw new Error('Kein Dokument-Snapshot vorhanden.');
  return store.saveDocumentBackup(snapshot, { reason });
}

export async function listWorkspaceRecoveryPoints(
  store: StudioDocumentStore,
): Promise<RecoveryRow[]> {
  return (await store.listBackups()) as RecoveryRow[];
}

export async function restoreWorkspaceRecoveryPoint(
  store: StudioDocumentStore,
  id: string,
  currentPreferences: StudioPreferences = loadStudioPreferences(),
): Promise<{
  state: LegacyStudioState;
  snapshot: StudioDocumentSnapshot;
}> {
  const row = await store.getBackup(id) as RecoveryRow | null;
  if (!row) throw new Error('Recovery-Punkt nicht gefunden.');

  let snapshot: StudioDocumentSnapshot | null = null;
  if (row.kind === 'document') {
    const result = await store.restoreDocumentBackup(id);
    if (result.restored !== true || !result.snapshot) {
      throw new Error(String(result.reason || 'Recovery fehlgeschlagen.'));
    }
    snapshot = result.snapshot as StudioDocumentSnapshot;
  } else if (row.kind === 'legacy' || (!row.kind && row.backup)) {
    const current = await store.loadSnapshot();
    if (current) {
      await store.saveDocumentBackup(current, { reason: 'before_legacy_recovery' });
    }
    const parsed = JSON.parse(String(row.backup || '{}')) as Record<string, unknown>;
    const payload = parsed && typeof parsed === 'object' ? parsed.payload : null;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Legacy-Backup ist ungültig.');
    }
    const migrated = await migrateLegacyStudioStateToStore(
      payload as Partial<LegacyStudioState>,
      store,
    );
    snapshot = migrated.migration.snapshot;
  } else {
    throw new Error('Unbekanntes Backup-Format.');
  }

  const state = studioStateFromDocumentSnapshot(
    snapshot,
    { ...loadStudioState(), ...currentPreferences } as LegacyStudioState,
  );
  writeStudioPreferences(state);
  return { state, snapshot };
}

export async function createWorkspacePortableBackup(
  store: StudioDocumentStore,
  state: LegacyStudioState,
  searchState: SearchState,
): Promise<PortableStudioBackup> {
  const snapshot = await store.loadSnapshot();
  if (!snapshot) throw new Error('Kein Dokument-Snapshot vorhanden.');
  return createPortableStudioBackup({
    snapshot,
    preferences: studioPreferencesFromState(state),
    searchState: searchState as unknown as Record<string, unknown>,
  });
}

export async function applyWorkspacePortableBackup(
  store: StudioDocumentStore,
  input: string | unknown,
): Promise<{
  backup: PortableStudioBackup;
  state: LegacyStudioState;
  snapshot: StudioDocumentSnapshot;
}> {
  const parsed = parsePortableStudioBackup(input);
  const current = await store.loadSnapshot();
  if (current) {
    await store.saveDocumentBackup(current, { reason: 'before_portable_import' });
  }

  await store.saveSnapshot(parsed.snapshot);
  const loaded = await store.loadSnapshot();
  if (!loaded) throw new Error('Import konnte nicht verifiziert werden.');

  const state = studioStateFromDocumentSnapshot(
    loaded,
    {
      ...loadStudioState(),
      ...loadStudioPreferences(),
      ...parsed.preferences,
    } as LegacyStudioState,
  );
  writeStudioPreferences(state);

  return {
    backup: parsed,
    state,
    snapshot: loaded,
  };
}

export interface SerializedSaveQueue {
  schedule(state: LegacyStudioState, delay?: number): number;
  flush(state?: LegacyStudioState): Promise<boolean>;
  close(): void;
  generation(): number;
}

export function createSerializedSaveQueue({
  save,
  delay = 180,
}: {
  save: (state: LegacyStudioState, generation: number) => Promise<boolean>;
  delay?: number;
}): SerializedSaveQueue {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let latest: LegacyStudioState | null = null;
  let chain: Promise<boolean> = Promise.resolve(true);
  let closed = false;

  const run = (state: LegacyStudioState, currentGeneration: number) => {
    const snapshot = cloneWorkspaceState(state);
    chain = chain.catch(() => false).then(() => save(snapshot, currentGeneration));
    return chain;
  };

  return {
    schedule(state, nextDelay = delay) {
      if (closed) return generation;
      latest = cloneWorkspaceState(state);
      generation += 1;
      const current = generation;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (latest) void run(latest, current);
      }, nextDelay);
      return current;
    },

    async flush(state) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (state) latest = cloneWorkspaceState(state);
      if (!latest) return chain;
      generation += 1;
      return run(latest, generation);
    },

    close() {
      if (timer) clearTimeout(timer);
      timer = null;
      closed = true;
    },

    generation() {
      return generation;
    },
  };
}
