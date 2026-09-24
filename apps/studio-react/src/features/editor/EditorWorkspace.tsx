import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import type {
  LegacyStudioRevision,
  RevisionDiff,
} from '../../legacy/contracts';
import {
  editorLineKind,
  editorTrackableText,
  trackedEditorBarNumber,
  trackedEditorLineIndexes,
} from '../../legacy/editor';
import { estimateSyllables } from '../../legacy/search';
import { useUiStore } from '../../state/uiStore';
import { useDocumentWorkspace } from '../library/DocumentWorkspaceProvider';
import { useEditorSession } from './EditorSessionProvider';
import { asEditorSong } from './model';
import {
  editorFontFamily,
  editorFontStyle,
  editorFontWeight,
  SystemFontPicker,
} from './SystemFontPicker';
import styles from './Editor.module.css';

const SECTION_TAGS = [
  '[Intro]',
  '[Verse]',
  '[Pre-Chorus]',
  '[Chorus]',
  '[Post-Chorus]',
  '[Hook]',
  '[Bridge]',
  '[Outro]',
] as const;
const BAR_HOLD_MS = 220;
const SECTION_HOLD_MS = 1500;

type DockTab = 'history';

interface DragState {
  sourceIndex: number;
  targetIndex: number;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface SectionMenuState {
  x: number;
  y: number;
  start: number;
  end: number;
}

function revisionTime(value: unknown, language: 'de' | 'en') {
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(Number(value) || Date.now());
}

function revisionPreview(revision: LegacyStudioRevision) {
  return String(revision.text ?? revision.snapshot?.lines?.join('\n') ?? '')
    .split('\n')
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');
}

function FontControls() {
  const documents = useDocumentWorkspace();
  const language = useUiStore((state) => state.uiLanguage);
  const size = Math.max(16, Math.min(32, Number(documents.state.fontSize) || 21));
  const font = String(documents.state.editorFont || 'sans');

  const setSize = (next: number) => {
    void documents.mutate((state) => {
      state.fontSize = Math.max(16, Math.min(32, next));
      return state;
    });
  };

  const setFont = (next: string) => {
    void documents.mutate((state) => {
      state.editorFont = next;
      return state;
    });
  };

  return (
    <div className={styles.fontControls}>
      <SystemFontPicker value={font} onChange={setFont} />
      <div className={styles.sizeControl}>
        <button type="button" onClick={() => setSize(size - 1)} aria-label={language === 'de' ? 'Schrift kleiner' : 'Decrease font size'}>−</button>
        <output>{size}px</output>
        <button type="button" onClick={() => setSize(size + 1)} aria-label={language === 'de' ? 'Schrift größer' : 'Increase font size'}>+</button>
      </div>
    </div>
  );
}

export function EditorWorkspace() {
  const editor = useEditorSession();
  const documents = useDocumentWorkspace();
  const language = useUiStore((state) => state.uiLanguage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragFrameRef = useRef(0);
  const sectionPressRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const [lineHeights, setLineHeights] = useState<number[]>([]);
  const [dockTab, setDockTab] = useState<DockTab | null>(null);
  const [comparison, setComparison] = useState<{
    revision: LegacyStudioRevision;
    diff: RevisionDiff;
  } | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const [dragVisual, setDragVisual] = useState<DragState | null>(null);
  const [sectionMenu, setSectionMenu] = useState<SectionMenuState | null>(null);

  const song = editor.activeSong;
  const lines = song?.lines ?? [''];
  const fontSize = Math.max(16, Math.min(32, Number(documents.state.fontSize) || 21));
  const editorFont = String(documents.state.editorFont || 'sans');
  const fontFamily = editorFontFamily(editorFont);
  const fontStyle = editorFontStyle(editorFont);
  const fontWeight = editorFontWeight(editorFont);

  const trackedIndexes = useMemo(
    () => song ? trackedEditorLineIndexes(asEditorSong(song)) : [],
    [song],
  );
  useEffect(() => {
    const request = editor.focusRequest;
    const node = textareaRef.current;
    if (!request || !node) return;
    requestAnimationFrame(() => {
      node.focus({ preventScroll: true });
      node.setSelectionRange(request.start, request.end);
      editor.captureSelection(request.start, request.end);
    });
  }, [editor.focusRequest]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const measure = measureRef.current;
    if (!textarea || !measure) return;

    const update = () => {
      const children = Array.from(measure.children) as HTMLElement[];
      const fallback = Math.max(34, Math.ceil(fontSize * 1.62));
      const next = children.map((node) => Math.max(fallback, Math.ceil(node.getBoundingClientRect().height)));
      setLineHeights(next);
      textarea.style.height = `${Math.max(
        fallback * 12 + 36,
        next.reduce((sum, value) => sum + value, 0) + 36,
      )}px`;
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [editor.documentText, fontFamily, fontSize, fontStyle, fontWeight, lines.length]);

  useEffect(() => () => {
    if (dragRef.current?.timer) clearTimeout(dragRef.current.timer);
    if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
    if (sectionPressRef.current?.timer) clearTimeout(sectionPressRef.current.timer);
  }, []);

  const captureSelection = () => {
    const node = textareaRef.current;
    if (!node || editor.composing) return;
    editor.captureSelection(node.selectionStart, node.selectionEnd);
  };

  const onBeforeInput = (event: FormEvent<HTMLTextAreaElement>) => {
    const native = event.nativeEvent as InputEvent;
    editor.beforeInput(native.inputType, native.isComposing);
  };

  const onInput = (event: FormEvent<HTMLTextAreaElement>) => {
    const node = event.currentTarget;
    const native = event.nativeEvent as InputEvent;
    editor.input(node.value, node.selectionStart, node.selectionEnd, native.isComposing);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) return;
    const key = event.key.toLocaleLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      void editor.undo();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      void editor.redo();
    }
  };

  const rowHeight = (index: number) => lineHeights[index] ?? Math.max(34, Math.ceil(fontSize * 1.62));
  const dropPreviewTop = dragVisual?.active
    ? 18 + Array.from({ length: dragVisual.targetIndex }, (_, index) => rowHeight(index))
      .reduce((sum, value) => sum + value, 0)
    : 0;

  const calculateDropTarget = (clientY: number) => {
    const root = editorScrollRef.current;
    if (!root) return dragRef.current?.sourceIndex ?? 0;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-editor-row]'));
    if (!rows.length) return 0;
    let target = rows.length - 1;
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index]!.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        target = Number(rows[index]!.dataset.editorRow ?? index);
        break;
      }
    }
    return Math.max(0, Math.min(lines.length - 1, target));
  };

  const runDragAutoScroll = () => {
    const drag = dragRef.current;
    const scroller = editorScrollRef.current;
    if (!drag?.active || !scroller) {
      dragFrameRef.current = 0;
      return;
    }
    const rect = scroller.getBoundingClientRect();
    const edge = Math.min(86, Math.max(48, rect.height * 0.14));
    let speed = 0;
    if (drag.y < rect.top + edge) {
      speed = -Math.ceil(((rect.top + edge - drag.y) / edge) * 18);
    } else if (drag.y > rect.bottom - edge) {
      speed = Math.ceil(((drag.y - (rect.bottom - edge)) / edge) * 18);
    }
    if (speed) {
      scroller.scrollTop += speed;
      drag.targetIndex = calculateDropTarget(drag.y);
      setDragVisual({ ...drag });
    }
    dragFrameRef.current = requestAnimationFrame(runDragAutoScroll);
  };

  const clearDrag = () => {
    const drag = dragRef.current;
    if (drag?.timer) clearTimeout(drag.timer);
    dragRef.current = null;
    setDragVisual(null);
    if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = 0;
  };

  const startBarPress = (event: PointerEvent<HTMLButtonElement>, sourceIndex: number) => {
    if (event.button !== 0 || dragRef.current) return;
    const drag: DragState = {
      sourceIndex,
      targetIndex: sourceIndex,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      timer: null,
    };
    drag.timer = setTimeout(() => {
      if (dragRef.current !== drag) return;
      drag.active = true;
      setDragVisual({ ...drag });
      if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = requestAnimationFrame(runDragAutoScroll);
    }, BAR_HOLD_MS);
    dragRef.current = drag;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveBarPress = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 18) {
      clearDrag();
      return;
    }
    if (drag.active) {
      event.preventDefault();
      drag.targetIndex = calculateDropTarget(event.clientY);
      setDragVisual({ ...drag });
    }
  };

  const finishBarPress = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const from = drag.sourceIndex;
    const to = drag.targetIndex;
    const active = drag.active;
    clearDrag();
    if (active && commit && from !== to) {
      event.preventDefault();
      void editor.moveBar(from, to);
    } else if (!active && commit) {
      const lineStart = lines.slice(0, from).reduce((sum, line) => sum + line.length + 1, 0);
      const caret = lineStart + (lines[from]?.length ?? 0);
      textareaRef.current?.focus({ preventScroll: true });
      textareaRef.current?.setSelectionRange(caret, caret);
      editor.captureSelection(caret, caret);
    }
  };

  const onSectionPointerDown = (event: PointerEvent<HTMLTextAreaElement>) => {
    if (event.button !== 0 || sectionPressRef.current) return;
    setSectionMenu(null);
    const node = event.currentTarget;
    const press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        if (sectionPressRef.current !== press) return;
        setSectionMenu({
          x: press.x,
          y: press.y,
          start: node.selectionStart,
          end: node.selectionEnd,
        });
      }, SECTION_HOLD_MS),
    };
    sectionPressRef.current = press;
    editor.noteBoundary();
  };

  const onSectionPointerMove = (event: PointerEvent<HTMLTextAreaElement>) => {
    const press = sectionPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    press.x = event.clientX;
    press.y = event.clientY;
    if (Math.hypot(press.x - press.startX, press.y - press.startY) > 9) {
      clearTimeout(press.timer);
      sectionPressRef.current = null;
    }
  };

  const finishSectionPress = (event: PointerEvent<HTMLTextAreaElement>) => {
    const press = sectionPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    clearTimeout(press.timer);
    sectionPressRef.current = null;
  };

  const compareRevision = (revision: LegacyStudioRevision) => {
    const diff = editor.revisionDiff(revision);
    if (diff) setComparison({ revision, diff });
  };

  const clearText = async () => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setClearArmed(false);
    await editor.clearDocument();
  };

  if (!song) {
    return (
      <section className={styles.emptyState}>
        <p>R5 EDITOR</p>
        <h2>{language === 'de' ? 'Kein aktiver Text.' : 'No active document.'}</h2>
        <span>{language === 'de' ? 'Öffne oder erstelle zuerst einen Text in der Library.' : 'Open or create a document in Library first.'}</span>
      </section>
    );
  }

  const activeIndex = editor.selection?.line ?? 0;
  const revisions = song.revisions ?? [];

  return (
    <section className={styles.workspace} data-r5-editor="true">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <p>R5 · UNIFIED DOCUMENT EDITOR</p>
          <div className={styles.titleLine}>
            <h1>{song.title || (language === 'de' ? 'Unbenannter Text' : 'Untitled')}</h1>
            <span data-state={documents.status}>{documents.status === 'saving'
              ? (language === 'de' ? 'Speichert …' : 'Saving …')
              : documents.authority === 'indexeddb'
                ? 'INDEXEDDB'
                : 'LOCAL FALLBACK'}</span>
            {editor.composing ? <i>IME</i> : null}
          </div>
          <small>
            {trackedIndexes.length} Bars · {lines.length} {language === 'de' ? 'Zeilen' : 'lines'}
            {editor.selection?.tracked && editor.selection.anchor
              ? ` · ${language === 'de' ? 'Anker' : 'anchor'}: “${editor.selection.anchor}”`
              : ''}
          </small>
        </div>

        <div className={styles.headerActions}>
          <button type="button" onClick={() => void editor.undo()} disabled={!editor.canUndo} aria-label={language === 'de' ? 'Rückgängig' : 'Undo'}>↶</button>
          <button type="button" onClick={() => void editor.redo()} disabled={!editor.canRedo} aria-label={language === 'de' ? 'Wiederholen' : 'Redo'}>↷</button>
          <button
            type="button"
            data-active={dockTab === 'history' ? 'true' : 'false'}
            onClick={() => setDockTab((current) => current === 'history' ? null : 'history')}
          >
            {language === 'de' ? 'Verlauf' : 'History'}
          </button>
        </div>
      </header>

      <div className={styles.controlBar}>
        <FontControls />
        <div className={styles.barActions}>
          <button type="button" onClick={() => void editor.createBarAfter(activeIndex)}>+ {language === 'de' ? 'Bar' : 'Bar'}</button>
          <button type="button" onClick={() => void editor.duplicateBar(activeIndex)}>{language === 'de' ? 'Duplizieren' : 'Duplicate'}</button>
          <button type="button" onClick={() => void editor.deleteBar(activeIndex)}>{language === 'de' ? 'Bar löschen' : 'Delete bar'}</button>
          <button
            type="button"
            className={clearArmed ? styles.dangerArmed : undefined}
            onClick={() => void clearText()}
            onBlur={() => setClearArmed(false)}
          >
            {clearArmed
              ? (language === 'de' ? 'Text wirklich leeren' : 'Confirm clear')
              : (language === 'de' ? 'Text leeren' : 'Clear text')}
          </button>
        </div>
      </div>

      <div className={styles.editorFrame}>
        <div ref={editorScrollRef} className={styles.editorScroll}>
          <div
            className={styles.notepad}
            style={{
              '--editor-font-size': `${fontSize}px`,
              '--editor-font-family': fontFamily,
              '--editor-font-style': fontStyle,
              '--editor-font-weight': String(fontWeight),
            } as CSSProperties}
          >
            {dragVisual?.active ? (
              <div
                className={styles.dropPreview}
                style={{
                  top: dropPreviewTop,
                  height: rowHeight(dragVisual.targetIndex),
                }}
                aria-hidden="true"
              >
                <span>DROP</span>
              </div>
            ) : null}
            <div className={styles.gutter} aria-label={language === 'de' ? 'Bar-Markierungen' : 'Bar markers'}>
              <div className={styles.gutterSpacer} />
              {lines.map((line, index) => {
                const kind = editorLineKind(line);
                const number = kind === 'bar' ? trackedEditorBarNumber(asEditorSong(song), index) : null;
                const isTarget = dragVisual?.active && dragVisual.targetIndex === index;
                return (
                  <div
                    key={song.barIds?.[index] ?? `line-${index}`}
                    className={styles.gutterRow}
                    data-editor-row={index}
                    data-target={isTarget ? 'true' : 'false'}
                    data-kind={kind}
                    style={{ height: rowHeight(index) }}
                  >
                    {kind === 'bar' ? (
                      <button
                        type="button"
                        data-active={index === activeIndex ? 'true' : 'false'}
                        aria-label={language === 'de'
                          ? `Bar ${number} auswählen und halten zum Verschieben`
                          : `Select bar ${number}; hold to move`}
                        onPointerDown={(event) => startBarPress(event, index)}
                        onPointerMove={moveBarPress}
                        onPointerUp={(event) => finishBarPress(event, true)}
                        onPointerCancel={(event) => finishBarPress(event, false)}
                      >
                        {String(number ?? '').padStart(2, '0')}
                      </button>
                    ) : (
                      <span>{kind === 'bracket' ? '§' : ''}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.editorColumn}>
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                value={editor.documentText}
                spellCheck={false}
                wrap="soft"
                aria-label={language === 'de' ? 'Songtext Editor' : 'Lyrics editor'}
                onBeforeInput={onBeforeInput}
                onInput={onInput}
                onCompositionStart={editor.compositionStart}
                onCompositionEnd={(event) => {
                  const node = event.currentTarget;
                  editor.compositionEnd(node.value, node.selectionStart, node.selectionEnd);
                }}
                onSelect={captureSelection}
                onClick={captureSelection}
                onKeyUp={captureSelection}
                onKeyDown={onKeyDown}
                onPointerDown={onSectionPointerDown}
                onPointerMove={onSectionPointerMove}
                onPointerUp={finishSectionPress}
                onPointerCancel={finishSectionPress}
              />
              <div ref={measureRef} className={styles.measure} aria-hidden="true">
                {lines.map((line, index) => (
                  <div key={song.barIds?.[index] ?? `measure-${index}`}>
                    {line || '\u200b'}
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.syllableGutter} aria-label={language === 'de' ? 'Silbenschätzung' : 'Syllable estimate'}>
              <div className={styles.gutterSpacer} />
              {lines.map((line, index) => {
                const kind = editorLineKind(line);
                return (
                  <div
                    key={song.barIds?.[index] ?? `syll-${index}`}
                    className={styles.syllableRow}
                    data-kind={kind}
                    style={{ height: rowHeight(index) }}
                  >
                    {kind === 'bar' ? (estimateSyllables(editorTrackableText(line)) || '—') : ''}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {dockTab ? (
          <aside className={styles.dock} data-tab={dockTab}>
            <header>
              <div>
                <p>REVISION HISTORY</p>
                <h2>{language === 'de' ? 'Fassungen vergleichen' : 'Compare revisions'}</h2>
              </div>
              <button type="button" onClick={() => setDockTab(null)} aria-label={language === 'de' ? 'Dock schließen' : 'Close dock'}>×</button>
            </header>
            <div className={styles.historyList}>
              {revisions.length ? revisions.slice().reverse().map((revision, reverseIndex) => (
                <article key={String(revision.at ?? reverseIndex)}>
                  <div>
                    <b>{revisionTime(revision.at, language)}</b>
                    <small>{revision.reason || 'revision'}</small>
                    <p>{revisionPreview(revision) || (language === 'de' ? 'Leere Fassung' : 'Empty revision')}</p>
                  </div>
                  <button type="button" onClick={() => compareRevision(revision)}>
                    {language === 'de' ? 'Vergleichen' : 'Compare'}
                  </button>
                </article>
              )) : (
                <p className={styles.emptyDock}>{language === 'de' ? 'Noch keine Fassungen.' : 'No revisions yet.'}</p>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <span>{language === 'de'
          ? 'Bar-Nr. klicken = Auswahl · kurz halten und ziehen = Bar verschieben · 1.5 s im Text halten = Abschnitt'
          : 'Click bar number = select · hold briefly and drag = move bar · hold 1.5 s in text = section'}</span>
        <span>{editor.followSelection
          ? (language === 'de' ? 'Reimsuche folgt Auswahl' : 'Rhyme search follows selection')
          : (language === 'de' ? 'Fester Reimanker aktiv' : 'Fixed rhyme anchor active')}</span>
      </footer>

      {dragVisual?.active ? (
        <div
          className={styles.dragGhost}
          style={{ left: dragVisual.x + 18, top: dragVisual.y - 26 }}
          aria-hidden="true"
        >
          <span>BAR {String(trackedEditorBarNumber(asEditorSong(song), dragVisual.sourceIndex) ?? '').padStart(2, '0')}</span>
          <b>{song.lines[dragVisual.sourceIndex] || (language === 'de' ? 'Leere Bar' : 'Empty bar')}</b>
        </div>
      ) : null}

      {sectionMenu ? (
        <div
          className={styles.sectionMenu}
          style={{
            left: Math.max(12, Math.min(sectionMenu.x - 160, window.innerWidth - 348)),
            top: Math.max(12, Math.min(sectionMenu.y + 18, window.innerHeight - 260)),
          }}
          role="menu"
          aria-label={language === 'de' ? 'Song-Abschnitt einfügen' : 'Insert song section'}
        >
          <div>
            <b>{language === 'de' ? 'ABSCHNITT' : 'SECTION'}</b>
            <button type="button" onClick={() => setSectionMenu(null)} aria-label={language === 'de' ? 'Schließen' : 'Close'}>×</button>
          </div>
          <span>{language === 'de' ? 'Direkt am Cursor einsetzen' : 'Insert at current caret'}</span>
          <nav>
            {SECTION_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                role="menuitem"
                onClick={() => {
                  void editor.insertSectionTag(tag, sectionMenu.start, sectionMenu.end);
                  setSectionMenu(null);
                }}
              >
                {tag}
              </button>
            ))}
          </nav>
        </div>
      ) : null}

      {comparison ? (
        <div className={styles.dialogBackdrop} role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) setComparison(null);
        }}>
          <section className={styles.revisionDialog} role="dialog" aria-modal="true" aria-label={language === 'de' ? 'Fassung vergleichen' : 'Compare revision'}>
            <header>
              <div>
                <p>REVISION DIFF</p>
                <h2>{language === 'de' ? 'Fassung vergleichen' : 'Compare revision'}</h2>
                <span>
                  {comparison.diff.changedRows.length} {language === 'de' ? 'Unterschiede' : 'differences'} · {revisionTime(comparison.revision.at, language)}
                </span>
              </div>
              <button type="button" onClick={() => setComparison(null)} aria-label={language === 'de' ? 'Schließen' : 'Close'}>×</button>
            </header>
            <div className={styles.diffHead}>
              <span>Status</span>
              <b>{language === 'de' ? 'Aktuell' : 'Current'}</b>
              <b>{language === 'de' ? 'Fassung' : 'Revision'}</b>
            </div>
            <div className={styles.diffRows}>
              {comparison.diff.rows.map((row, index) => (
                <article key={`${row.id}-${index}`} data-type={row.type}>
                  <span>{row.type}</span>
                  <code>{row.current ? `${row.currentLine ?? '—'} · ${row.current.text}` : '—'}</code>
                  <code>{row.previous ? `${row.previousLine ?? '—'} · ${row.previous.text}` : '—'}</code>
                </article>
              ))}
            </div>
            <footer>
              <button type="button" onClick={() => setComparison(null)}>
                {language === 'de' ? 'Aktuell behalten' : 'Keep current'}
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={async () => {
                  await editor.restoreRevision(comparison.revision);
                  setComparison(null);
                }}
              >
                {language === 'de' ? 'Diese Fassung wiederherstellen' : 'Restore this revision'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
