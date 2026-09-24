import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';

import { Dialog, Select } from '../../design-system/primitives';
import { useUiStore } from '../../state/uiStore';
import { Icon } from '../../shell/icons';
import { useDocumentWorkspace } from './DocumentWorkspaceProvider';
import {
  createLibraryFolder,
  createLibrarySong,
  deleteLibraryFolder,
  folderChildren,
  folderContains,
  folderDepth,
  folderLeaf,
  folderParent,
  libraryRows,
  libraryTimestamp,
  moveLibrarySong,
  openLibrarySong,
  permanentlyDeleteLibrarySong,
  renameLibraryFolder,
  renameLibrarySong,
  reorderLibraryFolder,
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
  | null;

function formatDate(value: number, language: 'de' | 'en') {
  if (!value) return language === 'de' ? 'Legacy' : 'Legacy';
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
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
                ? 'Der Name wird nur lokal in deinem Studio gespeichert.'
                : 'The name is stored only in your local Studio.'}
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
  const [moveSongId, setMoveSongId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const rows = useMemo(
    () => libraryRows(workspace.state, { trash, folder, query, sort }),
    [folder, query, sort, trash, workspace.state],
  );

  const sourceRows = useMemo(
    () => workspace.state.songs.filter((item) =>
      Boolean(item.deleted || item.deletedAt) === trash
    ),
    [trash, workspace.state.songs],
  );

  const activeSong = workspace.state.songs.find((item) => item.id === workspace.state.active);
  const folders = workspace.state.folders;
  const folderParentPath = folder === 'all' ? '' : folder;
  const visibleChildFolders = trash ? [] : folderChildren(workspace.state, folderParentPath);
  const breadcrumbSegments = folder === 'all' ? [] : folder.split('/');
  const visibleRows = query.trim() || folder === 'all'
    ? rows
    : rows.filter((item) => item.folder === folder);
  const contextSong = contextMenu?.kind === 'song'
    ? workspace.state.songs.find((item) => item.id === contextMenu.id)
    : null;

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('wheel', close);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  const openSongMenu = (event: MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedSongId(id);
    setContextMenu({ kind: 'song', id, x: event.clientX, y: event.clientY });
  };

  const openFolderMenu = (event: MouseEvent, folderName: string) => {
    event.preventDefault();
    event.stopPropagation();
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
      const target = !trash && folder !== 'all' ? folder : 'Entwürfe';
      const result = createLibrarySong(workspace.state, value, target);
      if (result.changed) {
        await workspace.replaceState(result.state, { immediate: true });
        setNameDialog(null);
        onDone?.();
        navigate('studio');
      }
      return;
    }

    if (nameDialog.type === 'new-folder') {
      const result = createLibraryFolder(
        workspace.state,
        value,
        nameDialog.parent || '',
      );
      if (result.changed) {
        await workspace.replaceState(result.state);
        setFolder(result.folder || 'all');
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
      if (folder !== 'all' && folderContains(nameDialog.folder, folder)) {
        setFolder((result.folder || '') + folder.slice(nameDialog.folder.length));
      }
    } else if (result.reason === 'folder_collision') {
      setNotice(language === 'de'
        ? 'Zielname kollidiert mit einem bestehenden Ordner.'
        : 'The target name conflicts with an existing folder.');
    }
    setNameDialog(null);
  };

  const confirmAction = async () => {
    if (!confirm) return;

    if (confirm.type === 'delete-folder') {
      const result = deleteLibraryFolder(workspace.state, confirm.folder);
      if (result.changed) {
        await workspace.replaceState(result.state);
        if (folder !== 'all' && folderContains(confirm.folder, folder)) {
          setFolder(result.fallback || 'Entwürfe');
        }
      }
      setConfirm(null);
      return;
    }

    try {
      const recoveryAvailable = workspace.authority === 'indexeddb';
      if (recoveryAvailable) {
        await workspace.createRecoveryPoint('before_permanent_song_delete');
      }
      const result = permanentlyDeleteLibrarySong(workspace.state, confirm.id);
      if (result.changed) {
        await workspace.replaceState(result.state, { immediate: true });
        setNotice(
          recoveryAvailable
            ? (language === 'de'
                ? 'Text endgültig gelöscht · Recovery-Punkt vorher gesichert.'
                : 'Text permanently deleted · recovery point saved first.')
            : (language === 'de'
                ? 'Text endgültig gelöscht · IndexedDB-Recovery war nicht verfügbar.'
                : 'Text permanently deleted · IndexedDB recovery was unavailable.'),
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setConfirm(null);
    }
  };

  const moveSong = async (targetFolder: string) => {
    if (!moveSongId) return;
    const result = moveLibrarySong(workspace.state, moveSongId, targetFolder);
    if (result.changed) await workspace.replaceState(result.state);
    setMoveSongId(null);
  };

  const trashCount = workspace.state.songs.filter((item) => item.deleted || item.deletedAt).length;

  if (workspace.status === 'loading') {
    return (
      <section className={styles.loadingState}>
        <span />
        <b>{language === 'de' ? 'Lokale Library wird geladen …' : 'Loading local Library …'}</b>
        <p>IndexedDB DocumentStore</p>
      </section>
    );
  }

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
              ? 'Suchen, sortieren, ordnen und ohne Kontextverlust weiterschreiben.'
              : 'Search, sort and organize without losing context.'}
          </span>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.persistenceBadge} data-status={workspace.status}>
            <i />
            <span>
              <small>{workspace.authority === 'indexeddb' ? 'INDEXEDDB' : 'FALLBACK'}</small>
              <b>
                {workspace.status === 'saving'
                  ? (language === 'de' ? 'Speichert …' : 'Saving …')
                  : workspace.authority === 'indexeddb'
                    ? (language === 'de' ? 'Autoritativ' : 'Authoritative')
                    : 'LocalStorage'}
              </b>
            </span>
          </div>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => {
              setTrash((value) => !value);
              setFolder('all');
            }}
          >
            {trash
              ? (language === 'de' ? '← Alle Texte' : '← All texts')
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

      {workspace.error ? (
        <div className={styles.errorBanner}>
          {workspace.error}
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={language === 'de'
              ? 'Titel, Text oder Ordner durchsuchen …'
              : 'Search title, text or folder …'}
          />
        </label>

        <Select.Root
          items={[
            { value: 'updated', label: language === 'de' ? 'Zuletzt bearbeitet' : 'Recently edited' },
            { value: 'title', label: language === 'de' ? 'Titel A–Z' : 'Title A–Z' },
            { value: 'created', label: language === 'de' ? 'Neu erstellt' : 'Newest' },
            { value: 'bars', label: language === 'de' ? 'Meiste Bars' : 'Most bars' },
          ]}
          value={sort}
          onValueChange={(value) => {
            if (value === 'updated' || value === 'title' || value === 'created' || value === 'bars') {
              setSort(value);
            }
          }}
        >
          <Select.Trigger className={styles.sortTrigger}>
            <span>
              <small>{language === 'de' ? 'SORTIEREN' : 'SORT'}</small>
              <Select.Value />
            </span>
            <Select.Icon><Icon name="chevron" /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className={styles.selectPositioner} sideOffset={5} alignItemWithTrigger={false}>
              <Select.Popup className={styles.selectPopup}>
                {[
                  ['updated', language === 'de' ? 'Zuletzt bearbeitet' : 'Recently edited'],
                  ['title', language === 'de' ? 'Titel A–Z' : 'Title A–Z'],
                  ['created', language === 'de' ? 'Neu erstellt' : 'Newest'],
                  ['bars', language === 'de' ? 'Meiste Bars' : 'Most bars'],
                ].map(([value, label]) => (
                  <Select.Item key={value} value={value} className={styles.selectItem}>
                    <Select.ItemIndicator><Icon name="check" /></Select.ItemIndicator>
                    <Select.ItemText>{label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>

      <div className={styles.libraryBody}>
        <aside className={styles.folderPane}>
          <div className={styles.folderHead}>
            <span>{language === 'de' ? 'ORDNERSTRUKTUR' : 'FOLDERS'}</span>
            {!trash ? (
              <button
                type="button"
                onClick={() => setNameDialog({ type: 'new-folder', value: language === 'de' ? 'Neuer Ordner' : 'New folder' })}
                aria-label={language === 'de' ? 'Neuer Hauptordner' : 'New root folder'}
              >
                <Icon name="plus" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className={styles.folderAll}
            data-active={folder === 'all' ? 'true' : 'false'}
            onClick={() => setFolder('all')}
          >
            <span>{language === 'de' ? 'Alle Texte' : 'All texts'}</span>
            <small>{sourceRows.length}</small>
          </button>

          <div className={styles.folderTree}>
            {folders.map((folderName) => {
              const count = sourceRows.filter((item) => folderContains(folderName, item.folder)).length;
              const siblings = folderChildren(workspace.state, folderParent(folderName));
              const index = siblings.indexOf(folderName);
              const depth = folderDepth(folderName);
              const protectedFolder = folderName === 'Entwürfe';

              return (
                <div
                  key={folderName}
                  className={styles.folderRow}
                  style={{ '--depth': depth } as CSSProperties}
                  onContextMenu={(event) => openFolderMenu(event, folderName)}
                  onDragOver={(event) => {
                    if (!trash) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (trash) return;
                    event.preventDefault();
                    const id = event.dataTransfer.getData('application/x-rhymelab-song')
                      || event.dataTransfer.getData('text/plain');
                    if (id) {
                      const result = moveLibrarySong(workspace.state, id, folderName);
                      if (result.changed) void workspace.replaceState(result.state);
                    }
                  }}
                >
                  <button
                    type="button"
                    className={styles.folderMain}
                    data-active={folder === folderName ? 'true' : 'false'}
                    onClick={() => setFolder(folderName)}
                    title={folderName}
                  >
                    <span>
                      <i>{depth ? '↳' : <Icon name="folder" />}</i>
                      <b>{folderLeaf(folderName)}</b>
                      {folderParent(folderName) ? <em>{folderParent(folderName)}</em> : null}
                    </span>
                    <small>{count}</small>
                  </button>

                  {!trash ? (
                    <div className={styles.folderActions}>
                      <button
                        type="button"
                        onClick={() => setNameDialog({
                          type: 'new-folder',
                          parent: folderName,
                          value: language === 'de' ? 'Neuer Ordner' : 'New folder',
                        })}
                        title={language === 'de' ? 'Unterordner' : 'Subfolder'}
                      ><Icon name="plus" /></button>
                      {!protectedFolder ? (
                        <button
                          type="button"
                          onClick={() => setNameDialog({
                            type: 'rename-folder',
                            folder: folderName,
                            value: folderLeaf(folderName),
                          })}
                          title={language === 'de' ? 'Umbenennen' : 'Rename'}
                        ><Icon name="edit" /></button>
                      ) : null}
                      <button
                        type="button"
                        disabled={index <= 0}
                        onClick={() => {
                          const result = reorderLibraryFolder(workspace.state, folderName, -1);
                          if (result.changed) void workspace.replaceState(result.state);
                        }}
                        title={language === 'de' ? 'Nach oben' : 'Move up'}
                      ><Icon name="arrowUp" /></button>
                      <button
                        type="button"
                        disabled={index >= siblings.length - 1}
                        onClick={() => {
                          const result = reorderLibraryFolder(workspace.state, folderName, 1);
                          if (result.changed) void workspace.replaceState(result.state);
                        }}
                        title={language === 'de' ? 'Nach unten' : 'Move down'}
                      ><Icon name="arrowDown" /></button>
                      {!protectedFolder ? (
                        <button
                          type="button"
                          className={styles.dangerText}
                          onClick={() => setConfirm({ type: 'delete-folder', folder: folderName })}
                          title={language === 'de' ? 'Ordnerstruktur löschen' : 'Delete folder tree'}
                        ><Icon name="trash" /></button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <DataSafetyPanel compact />
        </aside>

        <section className={styles.contentPane}>
          <div className={styles.explorerBar}>
            <nav className={styles.breadcrumbs} aria-label={language === 'de' ? 'Bibliothek Pfad' : 'Library path'}>
              <button type="button" onClick={() => setFolder('all')}>
                <Icon name="folder" />
                <span>{trash ? (language === 'de' ? 'Papierkorb' : 'Trash') : (language === 'de' ? 'Meine Texte' : 'My texts')}</span>
              </button>
              {breadcrumbSegments.map((segment, index) => {
                const path = breadcrumbSegments.slice(0, index + 1).join('/');
                return (
                  <span key={path}>
                    <i>›</i>
                    <button type="button" onClick={() => setFolder(path)}>{segment}</button>
                  </span>
                );
              })}
            </nav>
            <div className={styles.explorerStatus}>
              <b>{visibleRows.length + visibleChildFolders.length}</b>
              <span>{language === 'de' ? 'Elemente' : 'items'}</span>
              {activeSong && !trash ? <em>{language === 'de' ? 'Aktiv' : 'Active'}: {activeSong.title}</em> : null}
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
            onContextMenu={(event) => {
              if (event.target === event.currentTarget) {
                event.preventDefault();
                setContextMenu(null);
              }
            }}
          >
            {visibleChildFolders.map((folderName) => {
              const count = sourceRows.filter((item) => folderContains(folderName, item.folder)).length;
              return (
                <button
                  key={folderName}
                  type="button"
                  className={styles.explorerFolderRow}
                  onClick={() => setFolder(folderName)}
                  onDoubleClick={() => setFolder(folderName)}
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
                </button>
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
                  draggable={!trash}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedSongId(item.id)}
                  onDoubleClick={() => {
                    if (!trash) void openSong(item.id);
                  }}
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
                    <b>{item.folder || 'Entwürfe'}</b>
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
                <b>{language === 'de' ? 'Dieser Ordner ist leer.' : 'This folder is empty.'}</b>
                <p>
                  {query
                    ? (language === 'de' ? 'Suchbegriff ändern.' : 'Change the search term.')
                    : (language === 'de' ? 'Zieh Texte hierher oder leg einen neuen an.' : 'Drag texts here or create a new one.')}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {contextMenu ? (
        <div
          className={styles.contextMenu}
          role="menu"
          style={{
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 230)),
            top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 300)),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === 'song' && contextSong ? (
            <>
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setContextMenu(null);
                  void openSong(contextSong.id);
                }}>
                  <Icon name="pen" /><span>{language === 'de' ? 'Öffnen' : 'Open'}</span><kbd>Enter</kbd>
                </button>
              ) : null}
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setContextMenu(null);
                  setNameDialog({ type: 'rename-song', id: contextSong.id, value: contextSong.title || '' });
                }}>
                  <Icon name="edit" /><span>{language === 'de' ? 'Umbenennen' : 'Rename'}</span>
                </button>
              ) : null}
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setContextMenu(null);
                  setMoveSongId(contextSong.id);
                }}>
                  <Icon name="folder" /><span>{language === 'de' ? 'Verschieben nach …' : 'Move to …'}</span>
                </button>
              ) : null}
              <hr />
              {trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setContextMenu(null);
                  const result = restoreLibrarySong(workspace.state, contextSong.id);
                  if (result.changed) void workspace.replaceState(result.state);
                }}>
                  <Icon name="arrowUp" /><span>{language === 'de' ? 'Wiederherstellen' : 'Restore'}</span>
                </button>
              ) : (
                <button type="button" role="menuitem" className={styles.contextDanger} onClick={() => {
                  setContextMenu(null);
                  void commitResult(trashLibrarySong(workspace.state, contextSong.id));
                }}>
                  <Icon name="trash" /><span>{language === 'de' ? 'In Papierkorb' : 'Move to Trash'}</span>
                </button>
              )}
              {trash ? (
                <button type="button" role="menuitem" className={styles.contextDanger} onClick={() => {
                  setContextMenu(null);
                  setConfirm({ type: 'permanent-song', id: contextSong.id });
                }}>
                  <Icon name="trash" /><span>{language === 'de' ? 'Endgültig löschen' : 'Delete permanently'}</span>
                </button>
              ) : null}
            </>
          ) : null}

          {contextMenu.kind === 'folder' ? (
            <>
              <button type="button" role="menuitem" onClick={() => {
                setFolder(contextMenu.folder);
                setContextMenu(null);
              }}>
                <Icon name="folder" /><span>{language === 'de' ? 'Öffnen' : 'Open'}</span>
              </button>
              {!trash ? (
                <button type="button" role="menuitem" onClick={() => {
                  setNameDialog({
                    type: 'new-folder',
                    parent: contextMenu.folder,
                    value: language === 'de' ? 'Neuer Ordner' : 'New folder',
                  });
                  setContextMenu(null);
                }}>
                  <Icon name="plus" /><span>{language === 'de' ? 'Unterordner erstellen' : 'New subfolder'}</span>
                </button>
              ) : null}
              {!trash && contextMenu.folder !== 'Entwürfe' ? (
                <button type="button" role="menuitem" onClick={() => {
                  setNameDialog({
                    type: 'rename-folder',
                    folder: contextMenu.folder,
                    value: folderLeaf(contextMenu.folder),
                  });
                  setContextMenu(null);
                }}>
                  <Icon name="edit" /><span>{language === 'de' ? 'Umbenennen' : 'Rename'}</span>
                </button>
              ) : null}
              {!trash && contextMenu.folder !== 'Entwürfe' ? <hr /> : null}
              {!trash && contextMenu.folder !== 'Entwürfe' ? (
                <button type="button" role="menuitem" className={styles.contextDanger} onClick={() => {
                  setConfirm({ type: 'delete-folder', folder: contextMenu.folder });
                  setContextMenu(null);
                }}>
                  <Icon name="trash" /><span>{language === 'de' ? 'Ordnerstruktur löschen' : 'Delete folder tree'}</span>
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

      <Dialog.Root
        open={Boolean(moveSongId)}
        onOpenChange={(open) => { if (!open) setMoveSongId(null); }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.dialogPopup}>
              <Dialog.Title>{language === 'de' ? 'Text verschieben' : 'Move text'}</Dialog.Title>
              <Dialog.Description>
                {language === 'de'
                  ? 'Zielordner auswählen.'
                  : 'Choose the destination folder.'}
              </Dialog.Description>
              <div className={styles.moveList}>
                {folders.map((folderName) => (
                  <button key={folderName} type="button" onClick={() => void moveSong(folderName)}>
                    <span>{'· '.repeat(folderDepth(folderName))}{folderLeaf(folderName)}</span>
                    <small>{folderParent(folderName)}</small>
                  </button>
                ))}
              </div>
              <div className={styles.dialogActions}>
                <Dialog.Close className={styles.secondaryAction}>
                  {language === 'de' ? 'Abbrechen' : 'Cancel'}
                </Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(confirm)}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.dialogPopup}>
              <Dialog.Title>
                {confirm?.type === 'permanent-song'
                  ? (language === 'de' ? 'Endgültig löschen' : 'Delete permanently')
                  : (language === 'de' ? 'Ordnerstruktur löschen' : 'Delete folder tree')}
              </Dialog.Title>
              <Dialog.Description>
                {confirm?.type === 'permanent-song'
                  ? (language === 'de'
                      ? 'Vor dem endgültigen Löschen erstellt Studio automatisch einen Recovery-Punkt.'
                      : 'Studio automatically creates a recovery point before permanent deletion.')
                  : (language === 'de'
                      ? 'Texte werden sicher in den übergeordneten Ordner oder nach Entwürfe verschoben.'
                      : 'Texts are safely moved to the parent folder or Drafts.')}
              </Dialog.Description>
              <div className={styles.dialogActions}>
                <Dialog.Close className={styles.secondaryAction}>
                  {language === 'de' ? 'Abbrechen' : 'Cancel'}
                </Dialog.Close>
                <button type="button" className={styles.dangerAction} onClick={() => void confirmAction()}>
                  {confirm?.type === 'permanent-song'
                    ? (language === 'de' ? 'Endgültig löschen' : 'Delete permanently')
                    : (language === 'de' ? 'Ordnerstruktur löschen' : 'Delete folder tree')}
                </button>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
