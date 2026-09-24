import * as sharedDocumentModel from '../../../../packages/shared-core/src/document/document-model.mjs';
import * as webDocumentStore from '../../../../packages/platform-web/src/document-store.mjs';
import * as webDocumentAdapter from '../../../../packages/platform-web/src/document-adapter.mjs';
import * as sharedBackupPortability from '../../../../packages/shared-core/src/document/backup-portability.mjs';

import type {
  LegacyStudioState,
  StorageLike,
  StudioBarRow,
  StudioDocumentMigration,
  StudioDocumentSnapshot,
  StudioDocumentStore,
  StudioDocumentValidation,
  StudioPreferences,
  PortableStudioBackup,
} from './contracts';

type DocumentModelApi = {
  STUDIO_DOCUMENT_SCHEMA: string;
  STUDIO_DOCUMENT_VERSION: number;
  serializeLegacyStudioBackup(legacyState: unknown): string;
  migrateLegacyStudioState(legacyState?: Partial<LegacyStudioState>): StudioDocumentMigration;
  validateStudioDocumentSnapshot(snapshot: unknown): StudioDocumentValidation;
  barsForSong(snapshot: StudioDocumentSnapshot, songId: string): StudioBarRow[];
  songText(snapshot: StudioDocumentSnapshot, songId: string): string;
  replaceBarText(snapshot: StudioDocumentSnapshot, barId: string, text: unknown): {
    snapshot: StudioDocumentSnapshot;
    changed: boolean;
    bar: StudioBarRow | null;
  };
  splitBar(snapshot: StudioDocumentSnapshot, barId: string, offset: number): {
    snapshot: StudioDocumentSnapshot;
    changed: boolean;
    left: StudioBarRow | null;
    right: StudioBarRow | null;
  };
  removeBar(snapshot: StudioDocumentSnapshot, barId: string): {
    snapshot: StudioDocumentSnapshot;
    changed: boolean;
  };
  captureSongRevision(
    snapshot: StudioDocumentSnapshot,
    songId: string,
    options?: { reason?: string; createdAt?: number },
  ): {
    snapshot: StudioDocumentSnapshot;
    revision: StudioDocumentSnapshot['revisions'][number] | null;
  };
  replaceSelection(
    snapshot: StudioDocumentSnapshot,
    input: { barId: string; start?: number; end?: number; text?: string },
  ): {
    snapshot: StudioDocumentSnapshot;
    changed: boolean;
    bar: StudioBarRow | null;
    selection: { barId: string; start: number; end: number } | null;
  };
};

type DocumentStoreApi = {
  STUDIO_DOCUMENT_DB: string;
  STUDIO_DOCUMENT_DB_VERSION: number;
  openStudioDocumentDatabase(indexedDBImpl?: IDBFactory | null): Promise<IDBDatabase | null>;
  createStudioDocumentStore(options?: { indexedDBImpl?: IDBFactory | null }): StudioDocumentStore;
  migrateLegacyStudioStateToStore(
    legacyState: Partial<LegacyStudioState>,
    store: StudioDocumentStore,
  ): Promise<{
    migration: StudioDocumentMigration;
    backupResult: Record<string, unknown>;
    saveResult: Record<string, unknown>;
    verified: true;
    counts: StudioDocumentMigration['report']['counts'];
  }>;
  shadowLegacyStudioStateToStore(
    legacyState: Partial<LegacyStudioState>,
    store: StudioDocumentStore,
  ): Promise<{
    report: StudioDocumentMigration['report'];
    saveResult: Record<string, unknown>;
  }>;
};

type DocumentAdapterApi = {
  STUDIO_STORAGE_KEY: string;
  STUDIO_PREFERENCES_KEY: string;
  STUDIO_DEMO_LINES: readonly string[];
  createStudioState(): LegacyStudioState;
  loadStudioState(storage?: StorageLike): LegacyStudioState;
  writeStudioState(state: LegacyStudioState, storage?: StorageLike): void;
  loadStudioDocumentSnapshot(storage?: StorageLike): StudioDocumentMigration;
  studioPreferencesFromState(state?: Partial<LegacyStudioState>): StudioPreferences;
  loadStudioPreferences(storage?: StorageLike): StudioPreferences;
  writeStudioPreferences(state: Partial<LegacyStudioState>, storage?: StorageLike): void;
  studioStateFromDocumentSnapshot(
    snapshot: StudioDocumentSnapshot,
    baseState?: LegacyStudioState,
  ): LegacyStudioState;
};

type BackupApi = {
  STUDIO_PORTABLE_BACKUP_SCHEMA: string;
  STUDIO_PORTABLE_BACKUP_VERSION: number;
  createPortableStudioBackup(options?: {
    snapshot?: StudioDocumentSnapshot;
    preferences?: StudioPreferences;
    searchState?: Record<string, unknown>;
    exportedAt?: number;
  }): PortableStudioBackup;
  parsePortableStudioBackup(input: string | unknown): PortableStudioBackup;
  portableBackupFilename(title?: string, date?: Date): string;
};

const modelApi = sharedDocumentModel as unknown as DocumentModelApi;
const storeApi = webDocumentStore as unknown as DocumentStoreApi;
const adapterApi = webDocumentAdapter as unknown as DocumentAdapterApi;
const backupApi = sharedBackupPortability as unknown as BackupApi;

export const STUDIO_DOCUMENT_SCHEMA = modelApi.STUDIO_DOCUMENT_SCHEMA;
export const STUDIO_DOCUMENT_VERSION = modelApi.STUDIO_DOCUMENT_VERSION;
export const serializeLegacyStudioBackup = modelApi.serializeLegacyStudioBackup;
export const migrateLegacyStudioState = modelApi.migrateLegacyStudioState;
export const validateStudioDocumentSnapshot = modelApi.validateStudioDocumentSnapshot;
export const barsForSong = modelApi.barsForSong;
export const songText = modelApi.songText;
export const replaceBarText = modelApi.replaceBarText;
export const splitBar = modelApi.splitBar;
export const removeBar = modelApi.removeBar;
export const captureSongRevision = modelApi.captureSongRevision;
export const replaceSelection = modelApi.replaceSelection;

export const STUDIO_DOCUMENT_DB = storeApi.STUDIO_DOCUMENT_DB;
export const STUDIO_DOCUMENT_DB_VERSION = storeApi.STUDIO_DOCUMENT_DB_VERSION;
export const openStudioDocumentDatabase = storeApi.openStudioDocumentDatabase;
export const createStudioDocumentStore = storeApi.createStudioDocumentStore;
export const migrateLegacyStudioStateToStore = storeApi.migrateLegacyStudioStateToStore;
export const shadowLegacyStudioStateToStore = storeApi.shadowLegacyStudioStateToStore;

export const STUDIO_STORAGE_KEY = adapterApi.STUDIO_STORAGE_KEY;
export const STUDIO_PREFERENCES_KEY = adapterApi.STUDIO_PREFERENCES_KEY;
export const STUDIO_DEMO_LINES = adapterApi.STUDIO_DEMO_LINES;
export const createStudioState = adapterApi.createStudioState;
export const loadStudioState = adapterApi.loadStudioState;
export const writeStudioState = adapterApi.writeStudioState;
export const loadStudioDocumentSnapshot = adapterApi.loadStudioDocumentSnapshot;
export const studioPreferencesFromState = adapterApi.studioPreferencesFromState;
export const loadStudioPreferences = adapterApi.loadStudioPreferences;
export const writeStudioPreferences = adapterApi.writeStudioPreferences;
export const studioStateFromDocumentSnapshot = adapterApi.studioStateFromDocumentSnapshot;

export const STUDIO_PORTABLE_BACKUP_SCHEMA = backupApi.STUDIO_PORTABLE_BACKUP_SCHEMA;
export const STUDIO_PORTABLE_BACKUP_VERSION = backupApi.STUDIO_PORTABLE_BACKUP_VERSION;
export const createPortableStudioBackup = backupApi.createPortableStudioBackup;
export const parsePortableStudioBackup = backupApi.parsePortableStudioBackup;
export const portableBackupFilename = backupApi.portableBackupFilename;
