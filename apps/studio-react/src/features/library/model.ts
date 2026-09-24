import type {
  LegacyStudioSong,
  LegacyStudioState,
} from '../../core/contracts';

export type LibrarySort = 'updated' | 'title' | 'created' | 'bars';

export interface LibraryViewState {
  trash: boolean;
  folder: string;
  query: string;
  sort: LibrarySort;
}

export interface LibraryMutationResult {
  state: LegacyStudioState;
  changed: boolean;
  reason?: string;
}

export function cloneWorkspaceState(state: LegacyStudioState): LegacyStudioState {
  try {
    return structuredClone(state);
  } catch {
    return JSON.parse(JSON.stringify(state)) as LegacyStudioState;
  }
}

export function normalizeFolderSegment(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export function normalizeFolderName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .split(/[\\/]+/g)
    .map(normalizeFolderSegment)
    .filter(Boolean)
    .join('/')
    .slice(0, 180);
}

export function folderParent(folder: unknown): string {
  const normalized = normalizeFolderName(folder);
  const index = normalized.lastIndexOf('/');
  return index < 0 ? '' : normalized.slice(0, index);
}

export function folderLeaf(folder: unknown): string {
  const normalized = normalizeFolderName(folder);
  const index = normalized.lastIndexOf('/');
  return index < 0 ? normalized : normalized.slice(index + 1);
}

export function folderDepth(folder: unknown): number {
  return Math.max(
    0,
    normalizeFolderName(folder).split('/').filter(Boolean).length - 1,
  );
}

export function folderContains(parent: unknown, folder: unknown): boolean {
  const root = normalizeFolderName(parent);
  const candidate = normalizeFolderName(folder);
  return Boolean(
    root
    && candidate
    && (candidate === root || candidate.startsWith(`${root}/`)),
  );
}

export function expandFolderPaths(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const path = normalizeFolderName(value);
    if (!path) continue;
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index += 1) {
      const current = parts.slice(0, index).join('/');
      if (!seen.has(current)) {
        seen.add(current);
        out.push(current);
      }
    }
  }
  return out;
}

export function folderChildren(
  state: LegacyStudioState,
  parent: unknown,
  folders = state.folders,
): string[] {
  const root = normalizeFolderName(parent);
  return folders.filter((folder) => folderParent(folder) === root);
}

export function flattenFolderHierarchy(
  state: LegacyStudioState,
  overrides = new Map<string, string[]>(),
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const source = state.folders.slice();

  const walk = (parent: string) => {
    const children = overrides.get(parent) || folderChildren(state, parent, source);
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      ordered.push(child);
      walk(child);
    }
  };

  walk('');
  for (const folder of source) {
    if (!seen.has(folder)) {
      seen.add(folder);
      ordered.push(folder);
      walk(folder);
    }
  }
  return ordered;
}

export function canonicalizeFolderOrder(
  state: LegacyStudioState,
  overrides = new Map<string, string[]>(),
): LegacyStudioState {
  state.folders = flattenFolderHierarchy(state, overrides);
  return state;
}

export function ensureLibraryFolder(
  state: LegacyStudioState,
  name: unknown,
): string {
  const normalized = normalizeFolderName(name) || 'Entwürfe';
  const paths = expandFolderPaths([normalized]);
  for (const path of paths) {
    if (!state.folders.includes(path)) state.folders.push(path);
  }
  canonicalizeFolderOrder(state);
  return normalized;
}

export function libraryTimestamp(item: LegacyStudioSong): number {
  return Math.max(Number(item?.updatedAt) || 0, Number(item?.createdAt) || 0);
}

export function touchSong(item: LegacyStudioSong | undefined, at = Date.now()): void {
  if (!item) return;
  item.updatedAt = Math.max(Number(item.updatedAt) || 0, Number(at) || 0);
}

export function libraryRows(
  state: LegacyStudioState,
  view: LibraryViewState,
): LegacyStudioSong[] {
  const needle = view.query.trim().toLocaleLowerCase('de-DE');
  const rows = state.songs.filter((item) => {
    const deleted = Boolean(item.deleted || item.deletedAt);
    if (deleted !== view.trash) return false;
    if (view.folder !== 'all' && !folderContains(view.folder, item.folder)) return false;
    if (!needle) return true;
    const haystack = [
      item.title,
      item.folder,
      ...(Array.isArray(item.lines) ? item.lines : []),
    ].join('\n').toLocaleLowerCase('de-DE');
    return haystack.includes(needle);
  }).slice();

  rows.sort((a, b) => {
    if (view.sort === 'title') {
      return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'de', {
        sensitivity: 'base',
      });
    }
    if (view.sort === 'created') {
      return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
        || String(a.title ?? '').localeCompare(String(b.title ?? ''), 'de');
    }
    if (view.sort === 'bars') {
      return (b.lines?.length || 0) - (a.lines?.length || 0)
        || String(a.title ?? '').localeCompare(String(b.title ?? ''), 'de');
    }
    return libraryTimestamp(b) - libraryTimestamp(a)
      || String(a.title ?? '').localeCompare(String(b.title ?? ''), 'de');
  });

  return rows;
}

export function createLibrarySong(
  source: LegacyStudioState,
  title: string,
  folder: string,
  now = Date.now(),
): LibraryMutationResult {
  const state = cloneWorkspaceState(source);
  const normalizedTitle = String(title || '').trim().slice(0, 100);
  if (!normalizedTitle) return { state: source, changed: false, reason: 'empty_title' };

  const requestedFolder = String(folder ?? '').trim();
  const target = requestedFolder ? ensureLibraryFolder(state, requestedFolder) : '';
  const created: LegacyStudioSong = {
    id: `s${now}`,
    title: normalizedTitle,
    lines: [''],
    folder: target,
    steps: {},
    revisions: [],
    createdAt: now,
    updatedAt: now,
  };
  state.songs.push(created);
  state.active = created.id;
  return { state, changed: true };
}

export function openLibrarySong(
  source: LegacyStudioState,
  id: string,
): LibraryMutationResult {
  const target = source.songs.find((item) => item.id === id && !item.deleted);
  if (!target) return { state: source, changed: false, reason: 'song_not_found' };
  const state = cloneWorkspaceState(source);
  state.active = id;
  return { state, changed: true };
}

export function renameLibrarySong(
  source: LegacyStudioState,
  id: string,
  title: string,
  now = Date.now(),
): LibraryMutationResult {
  const state = cloneWorkspaceState(source);
  const item = state.songs.find((row) => row.id === id);
  const normalizedTitle = String(title || '').trim().slice(0, 100);
  if (!item) return { state: source, changed: false, reason: 'song_not_found' };
  if (!normalizedTitle) return { state: source, changed: false, reason: 'empty_title' };
  if (item.title === normalizedTitle) return { state: source, changed: false, reason: 'unchanged' };
  item.title = normalizedTitle;
  touchSong(item, now);
  return { state, changed: true };
}

export function moveLibrarySong(
  source: LegacyStudioState,
  id: string,
  folder: string,
  now = Date.now(),
): LibraryMutationResult {
  const state = cloneWorkspaceState(source);
  const item = state.songs.find((row) => row.id === id && !row.deleted && !row.deletedAt);
  if (!item) return { state: source, changed: false, reason: 'song_not_found' };
  const requestedFolder = String(folder ?? '').trim();
  const target = requestedFolder ? ensureLibraryFolder(state, requestedFolder) : '';
  if ((item.folder || '') === target) return { state: source, changed: false, reason: 'unchanged' };
  item.folder = target;
  touchSong(item, now);
  return { state, changed: true };
}

export function duplicateLibrarySong(
  source: LegacyStudioState,
  id: string,
  folder: string,
  now = Date.now(),
): LibraryMutationResult & { id?: string } {
  const original = source.songs.find((row) => row.id === id && !row.deleted && !row.deletedAt);
  if (!original) return { state: source, changed: false, reason: 'song_not_found' };

  const state = cloneWorkspaceState(source);
  const requestedFolder = String(folder ?? '').trim();
  const target = requestedFolder ? ensureLibraryFolder(state, requestedFolder) : '';

  let nextId = `s${now}-copy`;
  let suffix = 2;
  while (state.songs.some((row) => row.id === nextId)) {
    nextId = `s${now}-copy-${suffix++}`;
  }

  const copy: LegacyStudioSong = {
    ...structuredClone(original),
    id: nextId,
    title: String(original.title || 'Untitled'),
    folder: target,
    revisions: [],
    barIds: undefined,
    barRevisions: undefined,
    editorNextBarId: 1,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deletedAt: null,
  };
  state.songs.push(copy);
  return { state, changed: true, id: nextId };
}

export function duplicateLibraryFolder(
  source: LegacyStudioState,
  folderName: string,
  targetParent: string,
  now = Date.now(),
  copyLabel = 'Copy',
): LibraryMutationResult & { folder?: string } {
  const folder = normalizeFolderName(folderName);
  if (!folder || !source.folders.some((item) => item === folder)) {
    return { state: source, changed: false, reason: 'folder_not_found' };
  }

  const parent = normalizeFolderName(targetParent);
  if (parent && folderContains(folder, parent)) {
    return { state: source, changed: false, reason: 'folder_cycle' };
  }

  const state = cloneWorkspaceState(source);
  if (parent) ensureLibraryFolder(state, parent);

  const baseLeaf = folderLeaf(folder);
  const suffix = normalizeFolderSegment(copyLabel) || 'Copy';
  const occupied = new Set(state.folders.map((item) => item.toLocaleLowerCase('de-DE')));
  let leaf = baseLeaf;
  let root = parent ? `${parent}/${leaf}` : leaf;
  if (occupied.has(root.toLocaleLowerCase('de-DE'))) {
    leaf = `${baseLeaf} – ${suffix}`;
    root = parent ? `${parent}/${leaf}` : leaf;
    let counter = 2;
    while (occupied.has(root.toLocaleLowerCase('de-DE'))) {
      leaf = `${baseLeaf} – ${suffix} ${counter++}`;
      root = parent ? `${parent}/${leaf}` : leaf;
    }
  }

  const subtree = source.folders
    .filter((item) => folderContains(folder, item))
    .sort((a, b) => folderDepth(a) - folderDepth(b));
  for (const item of subtree) {
    ensureLibraryFolder(state, root + item.slice(folder.length));
  }

  const copiedSongs = source.songs.filter((item) =>
    !item.deleted
    && !item.deletedAt
    && folderContains(folder, item.folder),
  );
  copiedSongs.forEach((item, index) => {
    const target = root + normalizeFolderName(item.folder).slice(folder.length);
    let nextId = `s${now + index}-copy`;
    let idSuffix = 2;
    while (state.songs.some((row) => row.id === nextId)) {
      nextId = `s${now + index}-copy-${idSuffix++}`;
    }
    state.songs.push({
      ...structuredClone(item),
      id: nextId,
      folder: target,
      revisions: [],
      barIds: undefined,
      barRevisions: undefined,
      editorNextBarId: 1,
      createdAt: now + index,
      updatedAt: now + index,
      deleted: false,
      deletedAt: null,
    });
  });

  canonicalizeFolderOrder(state);
  return { state, changed: true, folder: root };
}

export function moveLibraryFolder(
  source: LegacyStudioState,
  folderName: string,
  targetParent: string,
  now = Date.now(),
): LibraryMutationResult & { folder?: string } {
  const folder = normalizeFolderName(folderName);
  if (!folder || folder === 'Entwürfe') {
    return { state: source, changed: false, reason: 'protected_folder' };
  }

  const parent = normalizeFolderName(targetParent);
  if (parent && folderContains(folder, parent)) {
    return { state: source, changed: false, reason: 'folder_cycle' };
  }

  const leaf = folderLeaf(folder);
  const next = parent ? `${parent}/${leaf}` : leaf;
  if (next === folder) return { state: source, changed: false, reason: 'unchanged' };

  const state = cloneWorkspaceState(source);
  if (parent) ensureLibraryFolder(state, parent);
  const subtree = state.folders.filter((item) => folderContains(folder, item));
  const outside = new Set(
    state.folders
      .filter((item) => !folderContains(folder, item))
      .map((item) => item.toLocaleLowerCase('de-DE')),
  );
  const mapped = subtree.map((item) => next + item.slice(folder.length));
  if (mapped.some((item) => outside.has(item.toLocaleLowerCase('de-DE')))) {
    return { state: source, changed: false, reason: 'folder_collision' };
  }

  state.folders = state.folders.map((item) =>
    folderContains(folder, item) ? next + item.slice(folder.length) : item
  );
  state.songs.forEach((item) => {
    if (folderContains(folder, item.folder)) {
      item.folder = next + normalizeFolderName(item.folder).slice(folder.length);
      touchSong(item, now);
    }
  });
  canonicalizeFolderOrder(state);
  return { state, changed: true, folder: next };
}

export function trashLibrarySong(
  source: LegacyStudioState,
  id: string,
  now = Date.now(),
): LibraryMutationResult {
  const state = cloneWorkspaceState(source);
  const item = state.songs.find((row) => row.id === id);
  if (!item || item.deleted) return { state: source, changed: false, reason: 'song_not_found' };

  if (item.id === state.active) {
    const fallback = state.songs
      .filter((row) => !row.deleted && !row.deletedAt && row.id !== item.id)
      .sort((a, b) => libraryTimestamp(b) - libraryTimestamp(a))[0];
    if (!fallback) {
      return { state: source, changed: false, reason: 'only_active_song' };
    }
    state.active = fallback.id;
  }

  item.deleted = true;
  item.deletedAt = now;
  touchSong(item, now);
  return { state, changed: true };
}

export function restoreLibrarySong(
  source: LegacyStudioState,
  id: string,
  now = Date.now(),
): LibraryMutationResult {
  const state = cloneWorkspaceState(source);
  const item = state.songs.find((row) => row.id === id);
  if (!item) return { state: source, changed: false, reason: 'song_not_found' };
  item.deleted = false;
  item.deletedAt = null;
  touchSong(item, now);
  if (String(item.folder || '').trim()) ensureLibraryFolder(state, item.folder);
  return { state, changed: true };
}

export function permanentlyDeleteLibrarySong(
  source: LegacyStudioState,
  id: string,
): LibraryMutationResult {
  const state = cloneWorkspaceState(source);
  const item = state.songs.find((row) => row.id === id && (row.deleted || row.deletedAt));
  if (!item) return { state: source, changed: false, reason: 'song_not_found' };
  state.songs = state.songs.filter((row) => row.id !== id);
  if (state.active === id) {
    state.active = state.songs.find((row) => !row.deleted && !row.deletedAt)?.id
      || state.songs[0]?.id
      || null;
  }
  return { state, changed: true };
}

export function createLibraryFolder(
  source: LegacyStudioState,
  value: string,
  parent = '',
): LibraryMutationResult & { folder?: string } {
  const state = cloneWorkspaceState(source);
  const leaf = normalizeFolderSegment(value);
  if (!leaf) return { state: source, changed: false, reason: 'empty_folder' };
  const root = normalizeFolderName(parent);
  const path = root ? `${root}/${leaf}` : leaf;
  if (state.folders.some((item) =>
    item.localeCompare(path, 'de', { sensitivity: 'base' }) === 0
  )) {
    return { state: source, changed: false, reason: 'folder_exists' };
  }
  ensureLibraryFolder(state, path);
  return { state, changed: true, folder: path };
}

export function renameLibraryFolder(
  source: LegacyStudioState,
  folderName: string,
  value: string,
  now = Date.now(),
): LibraryMutationResult & { folder?: string } {
  const folder = normalizeFolderName(folderName);
  if (!folder || folder === 'Entwürfe') {
    return { state: source, changed: false, reason: 'protected_folder' };
  }

  const leaf = normalizeFolderSegment(value);
  if (!leaf) return { state: source, changed: false, reason: 'empty_folder' };
  const parent = folderParent(folder);
  const next = parent ? `${parent}/${leaf}` : leaf;
  if (next === folder) return { state: source, changed: false, reason: 'unchanged' };

  const state = cloneWorkspaceState(source);
  const subtree = state.folders.filter((item) => folderContains(folder, item));
  const outside = new Set(
    state.folders
      .filter((item) => !folderContains(folder, item))
      .map((item) => item.toLocaleLowerCase('de-DE')),
  );
  const mapped = subtree.map((item) => next + item.slice(folder.length));
  if (mapped.some((item) => outside.has(item.toLocaleLowerCase('de-DE')))) {
    return { state: source, changed: false, reason: 'folder_collision' };
  }

  state.folders = state.folders.map((item) =>
    folderContains(folder, item) ? next + item.slice(folder.length) : item
  );
  state.songs.forEach((item) => {
    if (folderContains(folder, item.folder)) {
      item.folder = next + normalizeFolderName(item.folder).slice(folder.length);
      touchSong(item, now);
    }
  });
  canonicalizeFolderOrder(state);
  return { state, changed: true, folder: next };
}

export function reorderLibraryFolder(
  source: LegacyStudioState,
  folderName: string,
  direction: -1 | 1,
): LibraryMutationResult {
  const state = cloneWorkspaceState(source);
  const folder = normalizeFolderName(folderName);
  const parent = folderParent(folder);
  const siblings = folderChildren(state, parent);
  const index = siblings.indexOf(folder);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) {
    return { state: source, changed: false, reason: 'boundary' };
  }
  [siblings[index], siblings[target]] = [siblings[target]!, siblings[index]!];
  canonicalizeFolderOrder(state, new Map([[parent, siblings]]));
  return { state, changed: true };
}

export function deleteLibraryFolder(
  source: LegacyStudioState,
  folderName: string,
  now = Date.now(),
): LibraryMutationResult & {
  fallback?: string;
  folderCount?: number;
  songCount?: number;
} {
  const folder = normalizeFolderName(folderName);
  if (!folder || folder === 'Entwürfe') {
    return { state: source, changed: false, reason: 'protected_folder' };
  }

  const state = cloneWorkspaceState(source);
  const subtree = state.folders.filter((item) => folderContains(folder, item));
  const songs = state.songs.filter((item) => folderContains(folder, item.folder));
  const fallback = folderParent(folder) || 'Entwürfe';
  ensureLibraryFolder(state, fallback);
  state.songs.forEach((item) => {
    if (folderContains(folder, item.folder)) {
      item.folder = fallback;
      touchSong(item, now);
    }
  });
  state.folders = state.folders.filter((item) => !folderContains(folder, item));
  canonicalizeFolderOrder(state);

  return {
    state,
    changed: true,
    fallback,
    folderCount: subtree.length,
    songCount: songs.length,
  };
}
