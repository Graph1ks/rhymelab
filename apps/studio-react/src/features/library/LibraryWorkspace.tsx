import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import { Dialog } from '../../design-system/primitives';
import { useUiStore } from '../../state/uiStore';
import { Icon } from '../../shell/icons';
import { useDocumentWorkspace } from './DocumentWorkspaceProvider';
import {
  createLibraryFolder,
  createLibrarySong,
  deleteLibraryFolder,
  duplicateLibrarySong,
  folderChildren,
  folderContains,
  folderLeaf,
  folderParent,
  libraryRows,
  libraryTimestamp,
  moveLibraryFolder,
  moveLibrarySong,
  openLibrarySong,
  permanentlyDeleteLibrarySong,
  renameLibraryFolder,
  renameLibrarySong,
  restoreLibrarySong,
  trashLibrarySong,
  type LibrarySort,
} from './model';
import { DataSafetyPanel } from './DataSafetyPanel';
import styles from './Library.module.css';

type NameDialogState =
  | { type: 'new-song'; value: string }
  | { type: 'new-folder'; value: string; parent?: string }
  | { type: 'rename-song'; value: string; id: string }
  | { type: 'rename-folder'; value: string; folder: string }
  | null;

type ConfirmState =
  | { type: 'delete-folder'; folder: string }
  | { type: 'permanent-song'; id: string }
  | null;

type ContextMenuState =
  | { kind: 'song'; id: string; x: number; y: number }
  | { kind: 'folder'; folder: string; x: number; y: number }
  | { kind: 'background'; x: number; y: number }
  | null;

type ClipboardState = {
  mode: 'copy' | 'cut';
  songId: string;
} | null;

type MoveState =
  | { kind: 'song'; id: string }
  | { kind: 'folder'; folder: string }
  | null;

function formatDate(value: number, language: 'de' | 'en') {
  if (!value) return 'Legacy';
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function folderPath(value: string) {
  return value === 'all' ? '' : value;
}

function NameDialog({
  state,
  onClose,
  onSave,
}: {
  state: NameDialogState;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const language = useUiStore((row) => row.uiLanguage);
  if (!state) return null;

  const title = state.type === 'new-song'
    ? (language === 'de' ? 'Neuer Text' : 'New text')
    : state.type === 'new-folder'
      ? (language === 'de' ? 'Neuer Ordner' : 'New folder')
      : state.type === 'rename-song'
        ? (language === 'de' ? 'Text umbenennen' : 'Rename text')
        : (language === 'de' ? 'Ordner umbenennen' : 'Rename folder');

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.dialogBackdrop} />
        <Dialog.Viewport className={styles.dialogViewport}>
          <Dialog.Popup className={styles.dialogPopup}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>
              {language === 'de'
                ? 'Der Name wird lokal in deiner Bibliothek gespeichert.'
                : 'The name is stored locally in your Library.'}
            </Dialog.Description>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const value = String(form.get('name') ?? '').trim();
                if (value) onSave(value);
              }}
            >
              <input
                autoFocus
                name="name"
                defaultValue={state.value}
                maxLength={100}
                className={styles.dialogInput}
              />
              <div className={styles.dialogActions}>
                <Dialog.Close className={styles.secondaryAction}>
                  {language === 'de' ? 'Abbrechen' : 'Cancel'}
                </Dialog.Close>
                <button type="submit" className={styles.primaryAction}>
                  {language === 'de' ? 'Speichern' : 'Save'}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function LibraryWorkspace({ onDone }: { onDone?: () => void } = {}) {
  const language = useUiStore((row) => row.uiLanguage);
  const navigate = useUiStore((row) => row.navigate);
  const workspace = useDocumentWorkspace();

  const [trash, setTrash] = useState(false);
  const [folder, setFolder] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('updated');
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [moveState, setMoveState] = useState<MoveState>(null);
  const [notice, setNotice] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [clipboard, setClipboard] = useState<ClipboardState>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const currentFolder = folderPath(folder);
  const rows = useMemo(
    () => libraryRows(workspace.state, {
      trash,
      folder: folder === 'all' ? 'all' : folder,
      query,
      sort,
    }),
    [folder, query, sort, trash, workspace.state],
  );

  const visibleRows = useMemo(() => {
    if (query.trim()) return rows;
    return rows.filter((item) => String(item.folder || '') === currentFolder);
  }, [currentFolder, query, rows]);

  const visibleChildFolders = useMemo(
    () => trash || query.trim()
      ? []
      : folderChildren(workspace.state, currentFolder)
        .slice()
        .sort((a, b) => folderLeaf(a).localeCompare(folderLeaf(b), language === 'de' ? 'de' : 'en', { sensitivity: 'base' })),
    [currentFolder, language, query, trash, workspace.state],
  );

  const breadcrumbSegments = currentFolder ? currentFolder.split('/') : [];
  const activeSong = workspace.state.songs.find((item) => item.id === workspace.state.active);
  const contextSong = contextMenu?.kind === 'song'
    ? workspace.state.songs.find((item) => item.id === contextMenu.id)
    : null;
  const trashCount = workspace.state.songs.filter((item) => item.deleted || item.deletedAt).length;

  const navigateFolder = (next: string) => {
    setFolder(next || 'all');
    setSelectedSongId(null);
    setSelectedFolder(null);
    setContextMenu(null);
  };

  const navigateUp = () => {
    if (!currentFolder) return;
    navigateFolder(folderParent(currentFolder));
  };

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) return;
      setContextMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('wheel', () => setContextMenu(null), { passive: true, once: true });
    window.addEventListener('resize', () => setContextMenu(null), { once: true });
    return () => window.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  const openSongMenu = (event: MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedSongId(id);
    setSelectedFolder(null);
    setContextMenu({ kind: 'song', id, x: event.clientX, y: event.clientY });
  };

  const openFolderMenu = (event: MouseEvent, folderName: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedFolder(folderName);
    setSelectedSongId(null);
    setContextMenu({ kind: 'folder', folder: folderName, x: event.clientX, y: event.clientY });
  };

  const commitResult = async (result: ReturnType<typeof trashLibrarySong>) => {
    if (!result.changed) {
      if (result.reason === 'only_active_song') {
        setNotice(language === 'de'
          ? 'Lege zuerst einen zweiten Text an, bevor du den einzigen aktiven Text löschst.'
          : 'Create a second text before moving your only active text to Trash.');
      }
      return false;
    }
    setNotice('');
    return workspace.replaceState(result.state);
  };

  const openSong = async (id: string) => {
    const result = openLibrarySong(workspace.state, id);
    if (!result.changed) return;
    await workspace.replaceState(result.state, { immediate: true });
    onDone?.();
    navigate('studio');
  };

  const saveName = async (value: string) => {
    if (!nameDialog) return;

    if (nameDialog.type === 'new-song') {
      const result = createLibrarySong(workspace.state, value, trash ? '' : currentFolder);
      if (result.changed) {
        await workspace.replaceState(result.state, { immediate: true });
        setNameDialog(null);
        onDone?.();
        navigate('studio');
      }
      return;
    }

    if (nameDialog.type === 'new-folder') {
      const result = createLibraryFolder(workspace.state, value, nameDialog.parent ?? currentFolder);
      if (result.changed) {
        await workspace.replaceState(result.state);
        setNameDialog(null);
      } else if (result.reason === 'folder_exists') {
        setNotice(language === 'de' ? 'Ordner existiert bereits.' : 'Folder already exists.');
      }
      return;
    }

    if (nameDialog.type === 'rename-song') {
      const result = renameLibrarySong(workspace.state, nameDialog.id, value);
      if (result.changed) await workspace.replaceState(result.state);
      setNameDialog(null);
      return;
    }

    const result = renameLibraryFolder(workspace.state, nameDialog.folder, value);
    if (result.changed) {
      await workspace.replaceState(result.state);
      const next = result.folder || '';
      if (folder !== 'all' && folderContains(nameDialog.folder, folder)) {
        navigateFolder(next + currentFolder.slice(nameDialog.folder.length));
      }
    } else if (result.reason === 'folder_collision') {
      setNotice(language === 'de'
        ? 'Zielname kollidiert mit einem bestehenden Ordner.'
        : 'The target name conflicts with an existing folder.');
    }
    setNameDialog(null);
  };

  const pasteClipboard = async (targetFolder = currentFolder) => {
    if (!clipboard || trash) return;
    const source = workspace.state.songs.find((item) => item.id === clipboard.songId);
    if (!source || source.deleted || source.deletedAt) {
      setClipboard(null);
      return;
    }

    if (clipboard.mode === 'cut') {
      const result = moveLibrarySong(workspace.state, source.id, targetFolder);
      if (result.changed) await workspace.replaceState(result.state);
      setClipboard(null);
      setSelectedSongId(source.id);
      return;
    }

    let result = duplicateLibrarySong(workspace.state, source.id, targetFolder);
    if (!result.changed || !result.id) return;
    const sameFolder = String(source.folder || '') === targetFolder;
    if (sameFolder) {
      const title = language === 'de'
        ? `${source.title || 'Unbenannt'} – Kopie`
        : `${source.title || 'Untitled'} – Copy`;
      const renamed = renameLibrarySong(result.state, result.id, title);
      if (renamed.changed) result = { ...result, state: renamed.state };
    }
    await workspace.replaceState(result.state);
    setSelectedSongId(result.id);
  };

  const moveItem = async (targetFolder: string) => {
    if (!moveState) return;
    if (moveState.kind === 'song') {
      const result = moveLibrarySong(workspace.state, moveState.id, targetFolder);
      if (result.changed) await workspace.replaceState(result.state);
    } else {
      const result = moveLibraryFolder(workspace.state, moveState.folder, targetFolder);
      if (result.changed) {
        await workspace.replaceState(result.state);
        if (folderContains(moveState.folder, currentFolder)) {
          navigateFolder((result.folder || '') + currentFolder.slice(moveState.folder.length));
        }
      } else if (result.reason === 'folder_collision') {
        setNotice(language === 'de' ? 'Am Ziel existiert bereits ein gleichnamiger Ordner.' : 'A folder with that name already exists at the destination.');
      } else if (result.reason === 'folder_cycle') {
        setNotice(language === 'de' ? 'Ein Ordner kann nicht in seinen eigenen Unterordner verschoben werden.' : 'A folder cannot be moved into its own subtree.');
      }
    }
    setMoveState(null);
  };

  const confirmAction = async () => {
    if (!confirm) return;

    if (confirm.type === 'delete-folder') {
      const result = deleteLibraryFolder(workspace.state, confirm.folder);
      if (result.changed) {
        await workspace.replaceState(result.state);
        if (folder !== 'all' && folderContains(confirm.folder, currentFolder)) {
          navigateFolder(result.fallback || '');
        }
      }
      setConfirm(null);
      return;
    }

    try {
      const recoveryAvailable = workspace.authority === 'indexeddb';
      if (recoveryAvailable) await workspace.createRecoveryPoint('before_permanent_song_delete');
      const result = permanentlyDeleteLibrarySong(workspace.state, confirm.id);
      if (result.changed) {
        await workspace.replaceState(result.state, { immediate: true });
        setNotice(language === 'de'
          ? 'Text endgültig gelöscht. Vorher wurde soweit verfügbar ein Recovery-Punkt erstellt.'
          : 'Text permanently deleted. A recovery point was created first when available.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setConfirm(null);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (nameDialog || confirm || moveState || safetyOpen) return;

      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'c' && selectedSongId && !trash) {
        event.preventDefault();
        setClipboard({ mode: 'copy', songId: selectedSongId });
        return;
      }
      if (modifier && event.key.toLowerCase() === 'x' && selectedSongId && !trash) {
        event.preventDefault();
        setClipboard({ mode: 'cut', songId: selectedSongId });
        return;
      }
      if (modifier && event.key.toLowerCase() === 'v' && clipboard && !trash) {
        event.preventDefault();
        void pasteClipboard();
        return;
      }
      if (event.key === 'F2' && selectedSongId && !trash) {
        const song = workspace.state.songs.find((item) => item.id === selectedSongId);
        if (song) {
          event.preventDefault();
          setNameDialog({ type: 'rename-song', id: song.id, value: song.title || '' });
        }
        return;
      }
      if (event.key === 'Enter' && selectedSongId && !trash) {
        event.preventDefault();
        void openSong(selectedSongId);
        return;
      }
      if (event.key === 'Enter' && selectedFolder) {
        event.preventDefault();
        navigateFolder(selectedFolder);
        return;
      }
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        navigateUp();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    clipboard,
    confirm,
    currentFolder,
    moveState,
    nameDialog,
    safetyOpen,
    selectedFolder,
    selectedSongId,
    trash,
    workspace.state,
  ]);

  if (workspace.status === 'loading') {
    return (
      <section className={styles.loadingState}>
        <span />
        <b>{language === 'de' ? 'Lokale Library wird geladen …' : 'Loading local Library …'}</b>
        <p>{language === 'de' ? 'Dokumente werden vorbereitet.' : 'Preparing documents.'}</p>
      </section>
    );
  }

  const moveTargets = ['', ...workspace.state.folders].filter((target) => {
    if (moveState?.kind !== 'folder') return true;
    return !folderContains(moveState.folder, target) && target !== moveState.folder;
  });

  return (
    <section className={styles.library}>
      <header className={styles.libraryHeader}>
        <div>
          <p className={styles.eyebrow}>LOCAL LIBRARY</p>
          <h1>{trash
            ? (language === 'de' ? 'Papierkorb.' : 'Trash.')
            : (language === 'de' ? 'Meine Texte.' : 'My texts.')}</h1>
          <span>
            {language === 'de'
              ? 'Wie ein Verzeichnis. Nur ohne Desktop.ini und andere passive Aggression.'
              : 'A directory, minus desktop.ini and other passive aggression.'}
          </span>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.persistenceBadge} data-status={workspace.status}>
            <i />
            <span>
              <small>AUTO-SAVE</small>
              <b>{workspace.status === 'saving'
                ? (language === 'de' ? 'Speichert …' : 'Saving …')
                : workspace.status === 'error'
                  ? (language === 'de' ? 'Fehler' : 'Error')
                  : (language === 'de' ? 'Gespeichert' : 'Saved')}</b>
            </span>
          </div>
          <button type="button" className={styles.secondaryAction} onClick={() => setSafetyOpen(true)}>
            {language === 'de' ? 'Backup & Recovery' : 'Backup & Recovery'}
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => {
              setTrash((value) => !value);
              navigateFolder('');
              setQuery('');
            }}
          >
            {trash
              ? (language === 'de' ? '← Meine Texte' : '← My texts')
              : `${language === 'de' ? 'Papierkorb' : 'Trash'} (${trashCount})`}
          </button>
          {!trash ? (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => setNameDialog({ type: 'new-song', value: language === 'de' ? 'Unbenannter Song' : 'Untitled song' })}
            >
              + {language === 'de' ? 'Neuer Text' : 'New text'}
            </button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className={styles.notice} role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>×</button>
        </div>
      ) : null}

      {workspace.error ? <div className={styles.errorBanner}>{workspace.error}</div> : null}

      <div className={styles.explorerToolbar}>
        <div className={styles.explorerNav}>
          <button
            type="button"
            disabled={!currentFolder}
            onClick={navigateUp}
            title={language === 'de' ? 'Eine Ebene hoch · Alt+↑' : 'Up one level · Alt+↑'}
          >↑</button>
          <nav className={styles.breadcrumbs} aria-label={language === 'de' ? 'Bibliothek Pfad' : 'Library path'}>
            <button type="button" onClick={() => navigateFolder('')}>
              <Icon name="folder" />
              <span>{trash ? (language === 'de' ? 'Papierkorb' : 'Trash') : (language === 'de' ? 'Meine Texte' : 'My texts')}</span>
            </button>
            {breadcrumbSegments.map((segment, index) => {
              const nextPath = breadcrumbSegments.slice(0, index + 1).join('/');
              return (
                <span key={nextPath}>
                  <i>›</i>
                  <button type="button" onClick={() => navigateFolder(nextPath)}>{segment}</button>
                </span>
              );
            })}
          </nav>
        </div>

        {!trash ? (
          <div className={styles.explorerCommands}>
            <button type="button" onClick={() => setNameDialog({ type: 'new-folder', value: language === 'de' ? 'Neuer Ordner' : 'New folder', parent: currentFolder })}>
              + {language === 'de' ? 'Ordner' : 'Folder'}
            </button>
            <button type="button" disabled={!clipboard} onClick={() => void pasteClipboard()}>
              {clipboard?.mode === 'cut' ? '↪' : '⧉'} {language === 'de' ? 'Einfügen' : 'Paste'}
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={language === 'de'
              ? 'In diesem Verzeichnis und Unterordnern suchen …'
              : 'Search this directory and subfolders …'}
          />
        </label>

        <label className={styles.nativeSort}>
          <span>{language === 'de' ? 'SORTIEREN' : 'SORT'}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
            <option value="updated">{language === 'de' ? 'Zuletzt bearbeitet' : 'Recently edited'}</option>
            <option value="title">{language === 'de' ? 'Titel A–Z' : 'Title A–Z'}</option>
            <option value="created">{language === 'de' ? 'Neu erstellt' : 'Newest'}</option>
            <option value="bars">{language === 'de' ? 'Meiste Bars' : 'Most bars'}</option>
          </select>
        </label>
      </div>

      <section className={styles.contentPane}>
        <div className={styles.explorerBar}>
          <div className={styles.explorerStatus}>
            <b>{visibleRows.length + visibleChildFolders.length}</b>
            <span>{language === 'de' ? 'Elemente' : 'items'}</span>
            {query ? <em>{language === 'de' ? 'Suchergebnisse' : 'Search results'}</em> : null}
            {activeSong && !trash ? <em>{language === 'de' ? 'Aktiv' : 'Active'}: {activeSong.title}</em> : null}
            {clipboard ? (
              <em>
                {clipboard.mode === 'cut'
                  ? (language === 'de' ? '1 Element ausgeschnitten' : '1 item cut')
                  : (language === 'de' ? '1 Element kopiert' : '1 item copied')}
              </em>
            ) : null}
          </div>
        </div>

        <div className={styles.explorerHead} aria-hidden="true">
          <span>{language === 'de' ? 'Name' : 'Name'}</span>
          <span>{language === 'de' ? 'Ordner / Vorschau' : 'Folder / preview'}</span>
          <span>Bars</span>
          <span>{language === 'de' ? 'Geändert' : 'Modified'}</span>
        </div>

        <div
          className={styles.explorerList}
          tabIndex={0}
          onContextMenu={(event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            setSelectedSongId(null);
            setSelectedFolder(null);
            setContextMenu({ kind: 'background', x: event.clientX, y: event.clientY });
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedSongId(null);
              setSelectedFolder(null);
            }
          }}
        >
          {visibleChildFolders.map((folderName) => {
            const count = workspace.state.songs.filter((item) =>
              !item.deleted && !item.deletedAt && folderContains(folderName, item.folder)
            ).length;
            const selected = selectedFolder === folderName;
            return (
              <div
                key={folderName}
                className={styles.explorerFolderRow}
                data-selected={selected ? 'true' : 'false'}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedFolder(folderName);
                  setSelectedSongId(null);
                }}
                onDoubleClick={() => navigateFolder(folderName)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigateFolder(folderName);
                }}
                onContextMenu={(event) => openFolderMenu(event, folderName)}
                onDragOver={(event) => {
                  if (!trash) event.preventDefault();
                }}
                onDrop={(event) => {
                  if (trash) return;
                  event.preventDefault();
                  const id = event.dataTransfer.getData('application/x-rhymelab-song')
                    || event.dataTransfer.getData('text/plain');
                  if (!id) return;
                  const result = moveLibrarySong(workspace.state, id, folderName);
                  if (result.changed) void workspace.replaceState(result.state);
                }}
              >
                <span className={styles.explorerName}>
                  <i className={styles.itemIcon}><Icon name="folder" /></i>
                  <b>{folderLeaf(folderName)}</b>
                </span>
                <span className={styles.explorerPreview}>
                  {count} {count === 1 ? (language === 'de' ? 'Text' : 'text') : (language === 'de' ? 'Texte' : 'texts')}
                </span>
                <span>—</span>
                <span>{language === 'de' ? 'Ordner' : 'Folder'}</span>
              </div>
            );
          })}

          {visibleRows.map((item) => {
            const preview = item.lines?.find((line) => String(line).trim())
              || (language === 'de' ? 'Die erste Zeile wartet noch.' : 'The first line is still waiting.');
            const changed = libraryTimestamp(item);
            const active = item.id === workspace.state.active && !trash;
            const selected = selectedSongId === item.id;
            return (
              <div
                key={item.id}
                className={styles.explorerSongRow}
                data-active={active ? 'true' : 'false'}
                data-selected={selected ? 'true' : 'false'}
                data-cut={clipboard?.mode === 'cut' && clipboard.songId === item.id ? 'true' : 'false'}
                draggable={!trash}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedSongId(item.id);
                  setSelectedFolder(null);
                }}
                onDoubleClick={() => { if (!trash) void openSong(item.id); }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !trash) void openSong(item.id);
                }}
                onContextMenu={(event) => openSongMenu(event, item.id)}
                onDragStart={(event) => {
                  if (trash) return;
                  setSelectedSongId(item.id);
                  event.dataTransfer.setData('application/x-rhymelab-song', item.id);
                  event.dataTransfer.setData('text/plain', item.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
              >
                <span className={styles.explorerName}>
                  <i className={styles.itemIcon} data-kind="text">T</i>
                  <span>
                    <b>{item.title || (language === 'de' ? 'Unbenannt' : 'Untitled')}</b>
                    {active ? <small>{language === 'de' ? 'AKTIV' : 'ACTIVE'}</small> : null}
                  </span>
                </span>
                <span className={styles.explorerPreview}>
                  <b>{item.folder || (language === 'de' ? 'Meine Texte' : 'My texts')}</b>
                  <small>{preview}</small>
                </span>
                <span className={styles.explorerBars}>{item.lines?.length || 0}</span>
                <span className={styles.explorerDate}>{formatDate(changed, language)}</span>
              </div>
            );
          })}

          {!visibleRows.length && !visibleChildFolders.length ? (
            <div className={styles.emptyState}>
              <Icon name="folder" />
              <b>{query
                ? (language === 'de' ? 'Keine Treffer in diesem Pfad.' : 'No matches in this path.')
                : (language === 'de' ? 'Dieser Ordner ist leer.' : 'This folder is empty.')}</b>
              <p>{language === 'de'
                ? 'Neuen Text oder Ordner anlegen, hineinziehen oder mit Strg/⌘+V einfügen.'
                : 'Create, drag in, or paste an item with Ctrl/⌘+V.'}</p>
            </div>
          ) : null}
        </div>
      </section>

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          role="menu"
          style={{
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 250)),
            top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 380)),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === 'song' && contextSong ? (
            <>
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => { setContextMenu(null); void openSong(contextSong.id); }}>
                  <span>↗</span><span>{language === 'de' ? 'Öffnen' : 'Open'}</span><kbd>Enter</kbd>
                </button>
              ) : null}
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setNameDialog({ type: 'rename-song', id: contextSong.id, value: contextSong.title || '' });
                  setContextMenu(null);
                }}>
                  <span>✎</span><span>{language === 'de' ? 'Umbenennen' : 'Rename'}</span><kbd>F2</kbd>
                </button>
              ) : null}
              {!trash ? <hr /> : null}
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setClipboard({ mode: 'cut', songId: contextSong.id });
                  setContextMenu(null);
                }}>
                  <span>✂</span><span>{language === 'de' ? 'Ausschneiden' : 'Cut'}</span><kbd>Ctrl+X</kbd>
                </button>
              ) : null}
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setClipboard({ mode: 'copy', songId: contextSong.id });
                  setContextMenu(null);
                }}>
                  <span>⧉</span><span>{language === 'de' ? 'Kopieren' : 'Copy'}</span><kbd>Ctrl+C</kbd>
                </button>
              ) : null}
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setMoveState({ kind: 'song', id: contextSong.id });
                  setContextMenu(null);
                }}>
                  <span>↪</span><span>{language === 'de' ? 'Verschieben nach …' : 'Move to …'}</span>
                </button>
              ) : null}
              <hr />
              {trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  const result = restoreLibrarySong(workspace.state, contextSong.id);
                  if (result.changed) void workspace.replaceState(result.state);
                  setContextMenu(null);
                }}>
                  <span>↥</span><span>{language === 'de' ? 'Wiederherstellen' : 'Restore'}</span>
                </button>
              ) : (
                <button type="button" role="menuitem" className={styles.contextDanger} onClick={() => {
                  void commitResult(trashLibrarySong(workspace.state, contextSong.id));
                  setContextMenu(null);
                }}>
                  <span>⌫</span><span>{language === 'de' ? 'In Papierkorb' : 'Move to Trash'}</span>
                </button>
              )}
              {trash ? (
                <button type="button" role="menuitem" className={styles.contextDanger} onClick={() => {
                  setConfirm({ type: 'permanent-song', id: contextSong.id });
                  setContextMenu(null);
                }}>
                  <span>×</span><span>{language === 'de' ? 'Endgültig löschen' : 'Delete permanently'}</span>
                </button>
              ) : null}
            </>
          ) : null}

          {contextMenu.kind === 'folder' ? (
            <>
              <button type="button" role="menuitem" onClick={() => navigateFolder(contextMenu.folder)}>
                <span>↗</span><span>{language === 'de' ? 'Öffnen' : 'Open'}</span><kbd>Enter</kbd>
              </button>
              {!trash && contextMenu.folder !== 'Entwürfe' ? (
                <button type="button" role="menuitem" onClick={() => {
                  setNameDialog({ type: 'rename-folder', folder: contextMenu.folder, value: folderLeaf(contextMenu.folder) });
                  setContextMenu(null);
                }}>
                  <span>✎</span><span>{language === 'de' ? 'Umbenennen' : 'Rename'}</span>
                </button>
              ) : null}
              {!trash && contextMenu.folder !== 'Entwürfe' ? (
                <button type="button" role="menuitem" onClick={() => {
                  setMoveState({ kind: 'folder', folder: contextMenu.folder });
                  setContextMenu(null);
                }}>
                  <span>↪</span><span>{language === 'de' ? 'Verschieben nach …' : 'Move to …'}</span>
                </button>
              ) : null}
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setNameDialog({ type: 'new-folder', parent: contextMenu.folder, value: language === 'de' ? 'Neuer Ordner' : 'New folder' });
                  setContextMenu(null);
                }}>
                  <span>＋</span><span>{language === 'de' ? 'Unterordner erstellen' : 'New subfolder'}</span>
                </button>
              ) : null}
              {!trash && clipboard ? (
                <button type="button" role="menuitem" onClick={() => {
                  void pasteClipboard(contextMenu.folder);
                  setContextMenu(null);
                }}>
                  <span>⎘</span><span>{language === 'de' ? 'Hier einfügen' : 'Paste here'}</span><kbd>Ctrl+V</kbd>
                </button>
              ) : null}
              {!trash && contextMenu.folder !== 'Entwürfe' ? <hr /> : null}
              {!trash && contextMenu.folder !== 'Entwürfe' ? (
                <button type="button" role="menuitem" className={styles.contextDanger} onClick={() => {
                  setConfirm({ type: 'delete-folder', folder: contextMenu.folder });
                  setContextMenu(null);
                }}>
                  <span>⌫</span><span>{language === 'de' ? 'Ordner löschen' : 'Delete folder'}</span>
                </button>
              ) : null}
            </>
          ) : null}

          {contextMenu.kind === 'background' ? (
            <>
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setNameDialog({ type: 'new-song', value: language === 'de' ? 'Unbenannter Song' : 'Untitled song' });
                  setContextMenu(null);
                }}>
                  <span>＋</span><span>{language === 'de' ? 'Neuer Text' : 'New text'}</span>
                </button>
              ) : null}
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setNameDialog({ type: 'new-folder', parent: currentFolder, value: language === 'de' ? 'Neuer Ordner' : 'New folder' });
                  setContextMenu(null);
                }}>
                  <span>▣</span><span>{language === 'de' ? 'Neuer Ordner' : 'New folder'}</span>
                </button>
              ) : null}
              {!trash && clipboard ? <hr /> : null}
              {!trash && clipboard ? (
                <button type="button" role="menuitem" onClick={() => {
                  void pasteClipboard();
                  setContextMenu(null);
                }}>
                  <span>⎘</span><span>{language === 'de' ? 'Einfügen' : 'Paste'}</span><kbd>Ctrl+V</kbd>
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <NameDialog
        state={nameDialog}
        onClose={() => setNameDialog(null)}
        onSave={(value) => void saveName(value)}
      />

      <Dialog.Root open={Boolean(moveState)} onOpenChange={(open) => { if (!open) setMoveState(null); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.dialogPopup}>
              <Dialog.Title>{language === 'de' ? 'Verschieben nach' : 'Move to'}</Dialog.Title>
              <Dialog.Description>
                {language === 'de' ? 'Zielordner auswählen.' : 'Choose the destination folder.'}
              </Dialog.Description>
              <div className={styles.moveList}>
                {moveTargets.map((target) => (
                  <button key={target || 'root'} type="button" onClick={() => void moveItem(target)}>
                    <span>{target ? folderLeaf(target) : (language === 'de' ? 'Meine Texte' : 'My texts')}</span>
                    <small>{target ? (folderParent(target) || (language === 'de' ? 'Meine Texte' : 'My texts')) : 'ROOT'}</small>
                  </button>
                ))}
              </div>
              <div className={styles.dialogActions}>
                <Dialog.Close className={styles.secondaryAction}>{language === 'de' ? 'Abbrechen' : 'Cancel'}</Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.dialogPopup}>
              <Dialog.Title>
                {confirm?.type === 'permanent-song'
                  ? (language === 'de' ? 'Endgültig löschen' : 'Delete permanently')
                  : (language === 'de' ? 'Ordner löschen' : 'Delete folder')}
              </Dialog.Title>
              <Dialog.Description>
                {confirm?.type === 'permanent-song'
                  ? (language === 'de' ? 'Vor dem endgültigen Löschen wird wenn möglich ein Recovery-Punkt erstellt.' : 'A recovery point is created first when available.')
                  : (language === 'de' ? 'Texte werden sicher in den übergeordneten Ordner verschoben.' : 'Texts are safely moved to the parent folder.')}
              </Dialog.Description>
              <div className={styles.dialogActions}>
                <Dialog.Close className={styles.secondaryAction}>{language === 'de' ? 'Abbrechen' : 'Cancel'}</Dialog.Close>
                <button type="button" className={styles.dangerAction} onClick={() => void confirmAction()}>
                  {language === 'de' ? 'Bestätigen' : 'Confirm'}
                </button>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={safetyOpen} onOpenChange={setSafetyOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.safetyDialog}>
              <div className={styles.safetyDialogHead}>
                <div>
                  <p>DATA SAFETY</p>
                  <h2>Backup & Recovery</h2>
                </div>
                <Dialog.Close aria-label={language === 'de' ? 'Schließen' : 'Close'}>×</Dialog.Close>
              </div>
              <DataSafetyPanel />
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
