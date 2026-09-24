import { useMemo, useRef, useState } from 'react';

import { Dialog } from '../../design-system/primitives';
import { applyThemeToDocument } from '../../design-system/theme';
import {
  loadStudioPreferences,
  parsePortableStudioBackup,
  portableBackupFilename,
} from '../../legacy/documents';
import type { PortableStudioBackup } from '../../legacy/contracts';
import { useUiStore } from '../../state/uiStore';
import { useSharedSearchState } from '../search/SearchStateProvider';
import { useDocumentWorkspace } from './DocumentWorkspaceProvider';
import styles from './Library.module.css';

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob(
    [JSON.stringify(payload, null, 2) + '\n'],
    { type: 'application/json;charset=utf-8' },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function recoveryLabel(row: {
  kind?: string;
  counts?: { songs?: number; bars?: number };
  sourceSchema?: string;
}, language: 'de' | 'en') {
  if (row.kind === 'document') {
    return [
      row.counts?.songs != null
        ? `${row.counts.songs} ${language === 'de' ? 'Texte' : 'texts'}`
        : null,
      row.counts?.bars != null ? `${row.counts.bars} Bars` : null,
    ].filter(Boolean).join(' · ');
  }
  return row.sourceSchema || (language === 'de' ? 'Migration Backup' : 'Migration backup');
}

export function DataSafetyPanel({ compact = false }: { compact?: boolean }) {
  const language = useUiStore((state) => state.uiLanguage);
  const setLanguage = useUiStore((state) => state.setUiLanguage);
  const setThemeChoice = useUiStore((state) => state.setThemeChoice);
  const workspace = useDocumentWorkspace();
  const search = useSharedSearchState();
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [importCandidate, setImportCandidate] = useState<{
    name: string;
    raw: string;
    parsed: PortableStudioBackup;
  } | null>(null);

  const recent = useMemo(
    () => workspace.recoveryPoints.slice(0, compact ? 4 : 8),
    [compact, workspace.recoveryPoints],
  );

  const createRecovery = async () => {
    setBusy('recovery');
    setMessage('');
    try {
      await workspace.createRecoveryPoint();
      setMessage(language === 'de' ? 'Recovery-Punkt erstellt.' : 'Recovery point created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  };

  const exportBackup = async () => {
    setBusy('export');
    setMessage('');
    try {
      const payload = await workspace.exportPortableBackup(search.state);
      const active = workspace.state.songs.find((song) => song.id === workspace.state.active);
      downloadJson(
        payload,
        portableBackupFilename(active?.title || 'studio'),
      );
      setMessage(language === 'de'
        ? 'Portables Studio Backup exportiert.'
        : 'Portable Studio backup exported.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  };

  const readImportFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage('');
    try {
      if (file.size > 64 * 1024 * 1024) {
        throw new Error(language === 'de'
          ? 'Backup-Datei ist größer als 64 MB.'
          : 'Backup file is larger than 64 MB.');
      }
      const raw = await file.text();
      const parsed = parsePortableStudioBackup(raw);
      setImportCandidate({ name: file.name, raw, parsed });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyImport = async () => {
    if (!importCandidate) return;
    setBusy('import');
    setMessage('');
    try {
      const imported = await workspace.importPortableBackup(importCandidate.raw);
      if (imported.searchState && Object.keys(imported.searchState).length) {
        search.replace(imported.searchState);
      }

      const preferences = loadStudioPreferences();
      if (preferences.uiLanguage) setLanguage(String(preferences.uiLanguage));
      if (preferences.theme) {
        setThemeChoice(String(preferences.theme));
        applyThemeToDocument(
          String(preferences.theme),
          document.documentElement,
          preferences,
        );
      }

      setImportCandidate(null);
      setMessage(language === 'de'
        ? 'Studio Backup importiert und verifiziert.'
        : 'Studio backup imported and verified.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  };

  const restore = async (id: string) => {
    setBusy(id);
    setMessage('');
    try {
      await workspace.restoreRecoveryPoint(id);
      setMessage(language === 'de'
        ? 'Recovery-Punkt wiederhergestellt.'
        : 'Recovery point restored.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  };

  return (
    <section className={styles.safetyPanel} data-compact={compact ? 'true' : 'false'}>
      <div className={styles.safetyHead}>
        <div>
          <small>DATA SAFETY</small>
          <b>{language === 'de' ? 'Backup & Recovery' : 'Backup & recovery'}</b>
        </div>
        <span data-status={workspace.status}>
          {workspace.authority === 'indexeddb' ? 'IndexedDB' : 'Fallback'}
        </span>
      </div>

      <p className={styles.safetyCopy}>
        {language === 'de'
          ? 'DocumentStore bleibt autoritativ. Imports sichern den aktuellen Stand vorher automatisch.'
          : 'DocumentStore remains authoritative. Imports automatically protect the current state first.'}
      </p>

      <div className={styles.safetyActions}>
        <button
          type="button"
          disabled={workspace.authority !== 'indexeddb' || Boolean(busy)}
          onClick={() => void createRecovery()}
        >
          {busy === 'recovery' ? '…' : '＋'} {language === 'de' ? 'Recovery' : 'Recovery'}
        </button>
        <button
          type="button"
          disabled={workspace.authority !== 'indexeddb' || Boolean(busy)}
          onClick={() => void exportBackup()}
        >
          {busy === 'export' ? '…' : '↓'} {language === 'de' ? 'Backup' : 'Backup'}
        </button>
        <button
          type="button"
          disabled={workspace.authority !== 'indexeddb' || Boolean(busy)}
          onClick={() => fileRef.current?.click()}
        >
          ↑ {language === 'de' ? 'Import' : 'Import'}
        </button>
        <input
          ref={fileRef}
          className={styles.fileInput}
          type="file"
          accept=".json,application/json"
          onChange={(event) => void readImportFile(event.target.files?.[0])}
        />
      </div>

      {message ? <p className={styles.safetyMessage} role="status">{message}</p> : null}

      <div className={styles.recoveryList}>
        {recent.length ? recent.map((row) => (
          <article key={row.id} className={styles.recoveryRow}>
            <div>
              <b>
                {new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(Number(row.createdAt) || Date.now())}
              </b>
              <small>
                {recoveryLabel(row, language)}
                {row.reason ? ` · ${row.reason}` : ''}
              </small>
            </div>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void restore(row.id)}
            >
              {busy === row.id
                ? '…'
                : (language === 'de' ? 'Restore' : 'Restore')}
            </button>
          </article>
        )) : (
          <p className={styles.noRecovery}>
            {workspace.authority === 'indexeddb'
              ? (language === 'de' ? 'Noch keine Recovery-Punkte.' : 'No recovery points yet.')
              : (language === 'de' ? 'IndexedDB-Recovery nicht verfügbar.' : 'IndexedDB recovery unavailable.')}
          </p>
        )}
      </div>

      <Dialog.Root
        open={Boolean(importCandidate)}
        onOpenChange={(open) => { if (!open) setImportCandidate(null); }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.dialogPopup}>
              <Dialog.Title>
                {language === 'de' ? 'Studio Backup importieren' : 'Import Studio backup'}
              </Dialog.Title>
              <Dialog.Description>
                {importCandidate ? (
                  <>
                    <b>{importCandidate.name}</b>
                    {' · '}
                    {importCandidate.parsed.snapshot.songs.length} {language === 'de' ? 'Texte' : 'texts'}
                    {' · '}
                    {importCandidate.parsed.snapshot.bars.length} Bars
                    {' · '}
                    {importCandidate.parsed.snapshot.revisions.length} {language === 'de' ? 'Revisionen' : 'revisions'}
                    {' · '}
                    {importCandidate.parsed.snapshot.folders.length} {language === 'de' ? 'Ordner' : 'folders'}
                  </>
                ) : null}
              </Dialog.Description>
              <p className={styles.importWarning}>
                {language === 'de'
                  ? 'Der aktuelle IndexedDB-Stand wird automatisch als Recovery-Punkt gesichert, bevor das Backup übernommen wird.'
                  : 'The current IndexedDB state is automatically saved as a recovery point before import.'}
              </p>
              <div className={styles.dialogActions}>
                <Dialog.Close className={styles.secondaryAction}>
                  {language === 'de' ? 'Abbrechen' : 'Cancel'}
                </Dialog.Close>
                <button
                  type="button"
                  className={styles.primaryAction}
                  disabled={busy === 'import'}
                  onClick={() => void applyImport()}
                >
                  {busy === 'import'
                    ? (language === 'de' ? 'Importiert …' : 'Importing …')
                    : (language === 'de' ? 'Backup importieren' : 'Import backup')}
                </button>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
