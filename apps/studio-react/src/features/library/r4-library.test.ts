import { describe, expect, it, vi } from 'vitest';

import {
  createPortableStudioBackup,
  migrateLegacyStudioState,
} from '../../legacy/documents';
import type {
  LegacyStudioState,
  SearchState,
  StudioDocumentSnapshot,
  StudioDocumentStore,
} from '../../legacy/contracts';
import {
  applyWorkspacePortableBackup,
  createSerializedSaveQueue,
  createWorkspacePortableBackup,
} from './persistence';
import {
  createLibraryFolder,
  deleteLibraryFolder,
  folderChildren,
  folderContains,
  libraryRows,
  moveLibrarySong,
  permanentlyDeleteLibrarySong,
  renameLibraryFolder,
  reorderLibraryFolder,
  restoreLibrarySong,
  trashLibrarySong,
} from './model';

function state(): LegacyStudioState {
  return {
    songs: [
      {
        id: 's1',
        title: 'Night Draft',
        folder: 'Entwürfe',
        lines: ['Die Stadt ist wach', 'Nacht'],
        createdAt: 100,
        updatedAt: 200,
      },
      {
        id: 's2',
        title: 'Hook One',
        folder: 'Songs/Hooks',
        lines: ['Hook line'],
        createdAt: 120,
        updatedAt: 500,
      },
      {
        id: 's3',
        title: 'Verse Idea',
        folder: 'Songs/Verses',
        lines: ['Berlin im Regen'],
        createdAt: 130,
        updatedAt: 300,
      },
    ],
    active: 's1',
    folders: ['Entwürfe', 'Songs', 'Songs/Hooks', 'Songs/Verses'],
    saved: [],
  };
}

function fakeStore(initial: StudioDocumentSnapshot): StudioDocumentStore & {
  backups: Array<Record<string, unknown>>;
} {
  let snapshot = structuredClone(initial);
  const backups: Array<Record<string, unknown>> = [];
  return {
    backups,
    async available() { return true; },
    async saveSnapshot(next) {
      snapshot = structuredClone(next);
      return { saved: true };
    },
    async loadSnapshot() {
      return structuredClone(snapshot);
    },
    async saveLegacyBackup() {
      return { saved: true };
    },
    async saveDocumentBackup(next, options = {}) {
      backups.push({
        id: `document:${backups.length + 1}`,
        kind: 'document',
        reason: options.reason,
        snapshot: structuredClone(next),
      });
      return { saved: true, id: backups.at(-1)?.id };
    },
    async getBackup(id) {
      return backups.find((row) => row.id === id) ?? null;
    },
    async listBackups() {
      return backups.slice().reverse();
    },
    async restoreDocumentBackup(id) {
      const row = backups.find((item) => item.id === id);
      if (!row?.snapshot) return { restored: false, reason: 'backup_not_found' };
      snapshot = structuredClone(row.snapshot as StudioDocumentSnapshot);
      return { restored: true, snapshot: structuredClone(snapshot) };
    },
    close() {},
  };
}

describe('R4 Library behavior', () => {
  it('creates nested folders while retaining the parent hierarchy', () => {
    const created = createLibraryFolder(state(), 'Chorus', 'Songs/Hooks');
    expect(created.changed).toBe(true);
    expect(created.folder).toBe('Songs/Hooks/Chorus');
    expect(created.state.folders).toContain('Songs');
    expect(created.state.folders).toContain('Songs/Hooks');
    expect(created.state.folders).toContain('Songs/Hooks/Chorus');
  });

  it('renames a folder subtree and moves contained documents with it', () => {
    const renamed = renameLibraryFolder(state(), 'Songs', 'Tracks', 900);
    expect(renamed.changed).toBe(true);
    expect(renamed.state.folders).toEqual([
      'Entwürfe',
      'Tracks',
      'Tracks/Hooks',
      'Tracks/Verses',
    ]);
    expect(renamed.state.songs.find((song) => song.id === 's2')?.folder).toBe('Tracks/Hooks');
    expect(renamed.state.songs.find((song) => song.id === 's3')?.folder).toBe('Tracks/Verses');
    expect(renamed.state.songs.find((song) => song.id === 's2')?.updatedAt).toBe(900);
  });

  it('reorders sibling folders without flattening their children', () => {
    const source = state();
    const reordered = reorderLibraryFolder(source, 'Songs/Verses', -1);
    expect(reordered.changed).toBe(true);
    expect(folderChildren(reordered.state, 'Songs')).toEqual([
      'Songs/Verses',
      'Songs/Hooks',
    ]);
    expect(reordered.state.folders.indexOf('Songs/Verses')).toBeLessThan(
      reordered.state.folders.indexOf('Songs/Hooks'),
    );
  });

  it('deletes a folder tree by moving texts safely to its parent', () => {
    const result = deleteLibraryFolder(state(), 'Songs/Hooks', 1000);
    expect(result.changed).toBe(true);
    expect(result.fallback).toBe('Songs');
    expect(result.folderCount).toBe(1);
    expect(result.songCount).toBe(1);
    expect(result.state.folders).not.toContain('Songs/Hooks');
    expect(result.state.songs.find((song) => song.id === 's2')?.folder).toBe('Songs');
  });

  it('moves documents between folders and creates missing path segments', () => {
    const moved = moveLibrarySong(state(), 's3', 'Archive/2026', 1100);
    expect(moved.changed).toBe(true);
    expect(moved.state.songs.find((song) => song.id === 's3')?.folder).toBe('Archive/2026');
    expect(moved.state.folders).toContain('Archive');
    expect(moved.state.folders).toContain('Archive/2026');
  });

  it('protects the only active document but otherwise selects the newest fallback', () => {
    const source = state();
    const trashed = trashLibrarySong(source, 's1', 1200);
    expect(trashed.changed).toBe(true);
    expect(trashed.state.active).toBe('s2');
    expect(trashed.state.songs.find((song) => song.id === 's1')?.deletedAt).toBe(1200);

    const only: LegacyStudioState = {
      songs: [{ id: 'solo', title: 'Solo', folder: 'Entwürfe', lines: ['x'] }],
      active: 'solo',
      folders: ['Entwürfe'],
    };
    expect(trashLibrarySong(only, 'solo').reason).toBe('only_active_song');
  });

  it('restores trashed documents and permanent deletion only accepts Trash rows', () => {
    const trashed = trashLibrarySong(state(), 's3', 1300);
    const restored = restoreLibrarySong(trashed.state, 's3', 1400);
    expect(restored.state.songs.find((song) => song.id === 's3')?.deleted).toBe(false);
    expect(restored.state.songs.find((song) => song.id === 's3')?.deletedAt).toBeNull();

    expect(permanentlyDeleteLibrarySong(state(), 's3').changed).toBe(false);
    const permanent = permanentlyDeleteLibrarySong(trashed.state, 's3');
    expect(permanent.changed).toBe(true);
    expect(permanent.state.songs.some((song) => song.id === 's3')).toBe(false);
  });

  it('searches title, lyric text and folders while preserving current sort modes', () => {
    expect(libraryRows(state(), {
      trash: false,
      folder: 'all',
      query: 'berlin',
      sort: 'updated',
    }).map((row) => row.id)).toEqual(['s3']);

    expect(libraryRows(state(), {
      trash: false,
      folder: 'Songs',
      query: '',
      sort: 'updated',
    }).map((row) => row.id)).toEqual(['s2', 's3']);

    expect(folderContains('Songs', 'Songs/Hooks')).toBe(true);
    expect(folderContains('Songs/Hooks', 'Songs')).toBe(false);
  });
});

describe('R4 serialized autosave queue', () => {
  it('debounces scheduled states and writes only the newest generation', async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const queue = createSerializedSaveQueue({
      delay: 180,
      save: async (next) => {
        writes.push(String(next.active));
        return true;
      },
    });

    const first = state();
    first.active = 's1';
    const second = state();
    second.active = 's2';

    queue.schedule(first);
    queue.schedule(second);
    await vi.advanceTimersByTimeAsync(180);
    await queue.flush();

    expect(writes).toEqual(['s2', 's2']);
    queue.close();
    vi.useRealTimers();
  });

  it('serializes overlapping flushes instead of racing IndexedDB writes', async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | null = null;
    const queue = createSerializedSaveQueue({
      save: async (next) => {
        const active = String(next.active);
        order.push(`start:${active}`);
        if (active === 's1') {
          await new Promise<void>((resolve) => { releaseFirst = resolve; });
        }
        order.push(`end:${active}`);
        return true;
      },
    });

    const first = state();
    first.active = 's1';
    const second = state();
    second.active = 's2';

    const firstFlush = queue.flush(first);
    const secondFlush = queue.flush(second);
    await Promise.resolve();
    expect(order).toEqual(['start:s1']);
    releaseFirst?.();
    await Promise.all([firstFlush, secondFlush]);

    expect(order).toEqual([
      'start:s1',
      'end:s1',
      'start:s2',
      'end:s2',
    ]);
    queue.close();
  });
});

describe('R4 portable backup orchestration', () => {
  it('exports the existing portable schema with current SearchState', async () => {
    const source = state();
    const snapshot = migrateLegacyStudioState(source).snapshot;
    const store = fakeStore(snapshot);
    const searchState: SearchState = {
      schema: 'rhymelab-search-state-v1',
      anchor: 'Nacht',
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
      selectedResultId: '',
    };

    const exported = await createWorkspacePortableBackup(store, source, searchState);
    expect(exported.snapshot.songs).toHaveLength(3);
    expect(exported.searchState.anchor).toBe('Nacht');
    expect(exported.documentSchema).toBe(snapshot.schema);
  });

  it('creates a pre-import recovery snapshot before replacing IndexedDB state', async () => {
    const before = migrateLegacyStudioState(state()).snapshot;
    const replacementState = state();
    replacementState.songs[0]!.title = 'Imported title';
    const replacement = migrateLegacyStudioState(replacementState).snapshot;
    const store = fakeStore(before);
    const payload = createPortableStudioBackup({ snapshot: replacement });

    const imported = await applyWorkspacePortableBackup(store, payload);

    expect(store.backups).toHaveLength(1);
    expect(store.backups[0]?.reason).toBe('before_portable_import');
    expect(imported.snapshot.songs[0]?.title).toBe('Imported title');
  });
});
