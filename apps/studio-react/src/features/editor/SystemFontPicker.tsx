import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { Dialog } from '../../design-system/primitives';
import { useUiStore } from '../../state/uiStore';
import styles from './Editor.module.css';

export interface LocalFontFace {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

const FALLBACK_FONTS: LocalFontFace[] = [
  { family: 'Arial', fullName: 'Arial', postscriptName: 'Arial', style: 'Regular' },
  { family: 'Helvetica', fullName: 'Helvetica', postscriptName: 'Helvetica', style: 'Regular' },
  { family: 'Segoe UI', fullName: 'Segoe UI', postscriptName: 'SegoeUI', style: 'Regular' },
  { family: 'San Francisco', fullName: 'San Francisco', postscriptName: 'SanFrancisco', style: 'Regular' },
  { family: 'Georgia', fullName: 'Georgia', postscriptName: 'Georgia', style: 'Regular' },
  { family: 'Times New Roman', fullName: 'Times New Roman', postscriptName: 'TimesNewRomanPSMT', style: 'Regular' },
  { family: 'Verdana', fullName: 'Verdana', postscriptName: 'Verdana', style: 'Regular' },
  { family: 'Tahoma', fullName: 'Tahoma', postscriptName: 'Tahoma', style: 'Regular' },
  { family: 'Trebuchet MS', fullName: 'Trebuchet MS', postscriptName: 'TrebuchetMS', style: 'Regular' },
  { family: 'Courier New', fullName: 'Courier New', postscriptName: 'CourierNewPSMT', style: 'Regular' },
  { family: 'Consolas', fullName: 'Consolas', postscriptName: 'Consolas', style: 'Regular' },
  { family: 'Menlo', fullName: 'Menlo', postscriptName: 'Menlo-Regular', style: 'Regular' },
];

type QueryLocalFonts = () => Promise<Array<{
  family?: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
}>>;

function normalizedFaces(rows: Awaited<ReturnType<QueryLocalFonts>>): LocalFontFace[] {
  const seen = new Set<string>();
  return rows
    .map((row) => ({
      family: String(row.family || row.fullName || '').trim(),
      fullName: String(row.fullName || row.family || '').trim(),
      postscriptName: String(row.postscriptName || '').trim(),
      style: String(row.style || 'Regular').trim(),
    }))
    .filter((row) => {
      if (!row.family || !row.fullName) return false;
      const key = [row.family, row.fullName, row.style].join('\u0000');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.fullName.localeCompare(b.fullName));
}

export function editorFontFamily(value: string): string {
  if (value.startsWith('system:')) {
    const family = value.slice('system:'.length).replaceAll('"', '').trim();
    if (family) return `"${family}", system-ui, sans-serif`;
  }
  return ({
    sans: 'var(--rl-font, Inter, system-ui, sans-serif)',
    serif: 'Georgia, Cambria, serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  } as Record<string, string>)[value] ?? 'var(--rl-font, Inter, system-ui, sans-serif)';
}

export function SystemFontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const [open, setOpen] = useState(false);
  const [faces, setFaces] = useState<LocalFontFace[]>(FALLBACK_FONTS);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unsupported' | 'denied'>('idle');
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || status !== 'idle') return;
    const queryLocalFonts = (window as Window & { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
    if (!queryLocalFonts) {
      setStatus('unsupported');
      return;
    }
    setStatus('loading');
    void queryLocalFonts.call(window)
      .then((rows) => {
        const next = normalizedFaces(rows);
        if (next.length) setFaces(next);
        setStatus('ready');
      })
      .catch(() => setStatus('denied'));
  }, [open, status]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return faces;
    return faces.filter((face) => (
      face.family.toLocaleLowerCase().includes(needle)
      || face.fullName.toLocaleLowerCase().includes(needle)
      || face.style.toLocaleLowerCase().includes(needle)
    ));
  }, [faces, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 58,
    overscan: 8,
  });

  const currentFamily = value.startsWith('system:') ? value.slice(7) : (
    value === 'serif' ? 'Georgia'
      : value === 'mono' ? 'System Mono'
        : 'System Sans'
  );

  return (
    <>
      <button
        type="button"
        className={styles.fontPickerTrigger}
        onClick={() => setOpen(true)}
        title={language === 'de' ? 'Systemschrift auswählen' : 'Choose system font'}
      >
        <span>{language === 'de' ? 'Schrift' : 'Font'}</span>
        <b style={{ fontFamily: editorFontFamily(value) }}>{currentFamily}</b>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.fontDialogBackdrop} />
          <Dialog.Viewport className={styles.fontDialogViewport}>
            <Dialog.Popup className={styles.fontDialog}>
              <header>
                <div>
                  <p>{language === 'de' ? 'LOKALE SYSTEMSCHRIFTEN' : 'LOCAL SYSTEM FONTS'}</p>
                  <h2>{language === 'de' ? 'Schrift auswählen' : 'Choose a font'}</h2>
                  <span>
                    {status === 'ready'
                      ? `${faces.length} ${language === 'de' ? 'lokale Styles verfügbar' : 'local styles available'}`
                      : status === 'loading'
                        ? (language === 'de' ? 'Systemschriften werden einmalig gelesen …' : 'Reading system fonts once …')
                        : status === 'denied'
                          ? (language === 'de' ? 'Zugriff nicht erlaubt · sichere Fallback-Liste aktiv.' : 'Access denied · safe fallback list active.')
                          : status === 'unsupported'
                            ? (language === 'de' ? 'Browser unterstützt Local Font Access nicht · Fallback-Liste aktiv.' : 'Browser lacks Local Font Access · fallback list active.')
                            : (language === 'de' ? 'Lokale Fonts werden erst nach Öffnen angefragt.' : 'Local fonts are requested only after opening.')}
                  </span>
                </div>
                <Dialog.Close aria-label={language === 'de' ? 'Schließen' : 'Close'}>×</Dialog.Close>
              </header>

              <label className={styles.fontSearch}>
                <span>⌕</span>
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={language === 'de' ? 'Familie oder Style suchen …' : 'Search family or style …'}
                />
                <b>{filtered.length}</b>
              </label>

              <div ref={scrollerRef} className={styles.fontList}>
                <div
                  className={styles.fontVirtualSpace}
                  style={{ height: virtualizer.getTotalSize() }}
                >
                  {virtualizer.getVirtualItems().map((item) => {
                    const face = filtered[item.index];
                    if (!face) return null;
                    const selected = value === `system:${face.family}`;
                    return (
                      <button
                        key={face.family + face.fullName + face.style}
                        type="button"
                        className={styles.fontRow}
                        data-selected={selected ? 'true' : 'false'}
                        style={{
                          transform: `translateY(${item.start}px)`,
                          fontFamily: `"${face.family}", system-ui, sans-serif`,
                        }}
                        onClick={() => {
                          onChange(`system:${face.family}`);
                          setOpen(false);
                        }}
                      >
                        <span>
                          <b>{face.fullName}</b>
                          <small>{face.family} · {face.style || 'Regular'}</small>
                        </span>
                        {selected ? <strong>✓</strong> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <footer>
                <span>
                  {language === 'de'
                    ? 'Virtualisiert: nur sichtbare Einträge werden gerendert.'
                    : 'Virtualized: only visible rows are rendered.'}
                </span>
              </footer>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
