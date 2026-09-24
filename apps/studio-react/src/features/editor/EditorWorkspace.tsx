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
  DEFAULT_EDITOR_FONT,
  editorFontFamily,
  editorFontStyle,
  editorFontWeight,
  ensureEditorFontLoaded,
  normalizeEditorFontValue,
  SystemFontPicker,
} from './SystemFontPicker';
import { editorFallbackLineHeight, fallbackEditorLineTop } from './geometry';
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
const SECTION_HOLD_MS = 500;

interface DragState {
  sourceIndex: number;
  targetIndex: number;
  boundaryIndex: number;
  pointerId: number;
  startX: number;
  startY: number;
  pressedAt: number;
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

interface EditorLineMetric {
  top: number;
  height: number;
  firstLineCenter: number;
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

function autosaveLabel(
  status: 'loading' | 'saving' | 'ready' | 'fallback' | 'error',
  language: 'de' | 'en',
) {
  if (status === 'saving') return language === 'de' ? 'Auto-Save · speichert …' : 'Auto-save · saving …';
  if (status === 'loading') return language === 'de' ? 'Auto-Save · lädt …' : 'Auto-save · loading …';
  if (status === 'error') return language === 'de' ? 'Auto-Save · Fehler' : 'Auto-save · error';
  return language === 'de' ? 'Auto-Save · gespeichert' : 'Auto-save · saved';
}

function FontControls() {
  const documents = useDocumentWorkspace();
  const language = useUiStore((state) => state.uiLanguage);
  const size = Math.max(16, Math.min(32, Number(documents.state.fontSize) || 21));
  const rawFont = String(documents.state.editorFont || DEFAULT_EDITOR_FONT);
  const font = normalizeEditorFontValue(rawFont);

  useEffect(() => {
    ensureEditorFontLoaded(font);
    if (rawFont !== font) {
      void documents.mutate((state) => {
        state.editorFont = font;
        return state;
      });
    }
  }, [documents, font, rawFont]);

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

export function EditorWorkspace({ focusMode = false }: { focusMode?: boolean } = {}) {
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
  const titleCancelRef = useRef(false);

  const [lineMetrics, setLineMetrics] = useState<EditorLineMetric[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [comparison, setComparison] = useState<{
    revision: LegacyStudioRevision;
    diff: RevisionDiff;
  } | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const [dragVisual, setDragVisual] = useState<DragState | null>(null);
  const [sectionMenu, setSectionMenu] = useState<SectionMenuState | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const song = editor.activeSong;
  const lines = song?.lines ?? [''];
  const fontSize = Math.max(16, Math.min(32, Number(documents.state.fontSize) || 21));
  const editorFont = normalizeEditorFontValue(documents.state.editorFont || DEFAULT_EDITOR_FONT);
  const fontFamily = editorFontFamily(editorFont);
  const fontStyle = editorFontStyle(editorFont);
  const fontWeight = editorFontWeight(editorFont);

  useEffect(() => {
    if (!titleEditing) setTitleDraft(song?.title || '');
  }, [song?.id, song?.title, titleEditing]);

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

    let cancelled = false;
    let frame = 0;

    const update = () => {
      if (cancelled) return;

      const children = Array.from(measure.children) as HTMLElement[];
      const measureRect = measure.getBoundingClientRect();
      const measureStyle = getComputedStyle(measure);
      const fallback = Math.max(
        34,
        Number.parseFloat(measureStyle.lineHeight) || fontSize * 1.62,
      );
      const paddingBottom = Number.parseFloat(measureStyle.paddingBottom) || 0;

      const nextMetrics = children.map((node): EditorLineMetric => {
        const nodeRect = node.getBoundingClientRect();
        const height = Math.max(fallback, nodeRect.height);
        const top = nodeRect.top - measureRect.top;

        const textNode = node.firstChild;
        let firstLineCenter = fallback / 2;
        if (textNode?.nodeType === Node.TEXT_NODE && textNode.textContent?.length) {
          const range = document.createRange();
          range.setStart(textNode, 0);
          range.setEnd(textNode, Math.min(1, textNode.textContent.length));
          const firstRect = range.getClientRects()[0];
          if (firstRect) {
            firstLineCenter = (firstRect.top - nodeRect.top) + firstRect.height / 2;
          }
        }

        return {
          top,
          height,
          firstLineCenter: Math.max(0, Math.min(height, firstLineCenter)),
        };
      });

      setLineMetrics(nextMetrics);

      const last = nextMetrics.at(-1);
      const measuredBottom = last ? last.top + last.height + paddingBottom : 0;
      const minimumHeight = fallback * 12
        + (Number.parseFloat(measureStyle.paddingTop) || 0)
        + paddingBottom;
      textarea.style.height = `${Math.max(minimumHeight, measuredBottom)}px`;
    };

    const scheduleUpdate = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(textarea);
    observer.observe(measure);

    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', scheduleUpdate);
    void fonts?.ready?.then(scheduleUpdate);

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      fonts?.removeEventListener?.('loadingdone', scheduleUpdate);
    };
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

  const fallbackLineHeight = editorFallbackLineHeight(fontSize);
  const rowTop = (index: number) => lineMetrics[index]?.top ?? fallbackEditorLineTop(index, fontSize);
  const rowHeight = (index: number) => lineMetrics[index]?.height ?? fallbackLineHeight;
  const rowCenter = (index: number) => lineMetrics[index]?.firstLineCenter ?? fallbackLineHeight / 2;
  const boundaryTop = (index: number) => {
    if (index < lines.length) return rowTop(index);
    const lastIndex = Math.max(0, lines.length - 1);
    return rowTop(lastIndex) + rowHeight(lastIndex);
  };
  const dropPreviewTop = dragVisual?.active
    ? boundaryTop(dragVisual.boundaryIndex)
    : 0;

  const calculateDropPlacement = (clientY: number, sourceIndex: number) => {
    const root = editorScrollRef.current;
    if (!root) return { targetIndex: sourceIndex, boundaryIndex: sourceIndex };
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-editor-row]'));
    if (!rows.length) return { targetIndex: sourceIndex, boundaryIndex: sourceIndex };

    let boundaryIndex = rows.length;
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index]!.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        boundaryIndex = Number(rows[index]!.dataset.editorRow ?? index);
        break;
      }
    }

    boundaryIndex = Math.max(0, Math.min(lines.length, boundaryIndex));
    const targetIndex = Math.max(
      0,
      Math.min(
        lines.length - 1,
        boundaryIndex > sourceIndex ? boundaryIndex - 1 : boundaryIndex,
      ),
    );
    return { targetIndex, boundaryIndex };
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
      const placement = calculateDropPlacement(drag.y, drag.sourceIndex);
      drag.targetIndex = placement.targetIndex;
      drag.boundaryIndex = placement.boundaryIndex;
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
      boundaryIndex: sourceIndex,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pressedAt: performance.now(),
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
    const distance = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
    if (!drag.active && distance > 7 && performance.now() - drag.pressedAt >= 80) {
      if (drag.timer) clearTimeout(drag.timer);
      drag.timer = null;
      drag.active = true;
      setDragVisual({ ...drag });
      if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = requestAnimationFrame(runDragAutoScroll);
    }
    if (drag.active) {
      event.preventDefault();
      const placement = calculateDropPlacement(event.clientY, drag.sourceIndex);
      drag.targetIndex = placement.targetIndex;
      drag.boundaryIndex = placement.boundaryIndex;
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

  const commitTitle = async () => {
    const next = titleDraft.trim();
    const fallback = language === 'de' ? 'Unbenannter Text' : 'Untitled';
    const resolved = next || fallback;
    titleCancelRef.current = false;
    setTitleEditing(false);
    if (resolved === (song.title || fallback)) return;
    await editor.mutateActiveSong((current) => {
      if ((current.title || fallback) === resolved) return false;
      current.title = resolved;
      return true;
    }, { checkpoint: false, revision: false });
  };

  const cancelTitleEdit = () => {
    titleCancelRef.current = true;
    setTitleDraft(song.title || '');
    setTitleEditing(false);
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
    <section className={styles.workspace} data-r5-editor="true" data-focus={focusMode ? 'true' : 'false'}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <p>R5 · UNIFIED DOCUMENT EDITOR</p>
          <div className={styles.titleLine}>
            {titleEditing ? (
              <form
                className={styles.titleEditForm}
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  void commitTitle();
                }}
              >
                <input
                  autoFocus
                  value={titleDraft}
                  maxLength={100}
                  aria-label={language === 'de' ? 'Texttitel bearbeiten' : 'Edit document title'}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => {
                    if (titleCancelRef.current) {
                      titleCancelRef.current = false;
                      return;
                    }
                    void commitTitle();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelTitleEdit();
                    }
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className={styles.titleButton}
                onClick={() => {
                  titleCancelRef.current = false;
                  setTitleDraft(song.title || '');
                  setTitleEditing(true);
                }}
                title={language === 'de' ? 'Titel anklicken zum Umbenennen' : 'Click title to rename'}
              >
                {song.title || (language === 'de' ? 'Unbenannter Text' : 'Untitled')}
              </button>
            )}
            <span
              data-state={documents.status}
              title={documents.status === 'error'
                ? documents.error
                : (language === 'de'
                    ? 'Änderungen werden automatisch lokal gespeichert.'
                    : 'Changes are saved locally automatically.')}
            >
              {autosaveLabel(documents.status, language)}
            </span>
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
            data-active={historyOpen ? 'true' : 'false'}
            onClick={() => setHistoryOpen(true)}
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
                }}
                aria-hidden="true"
              >
                <span>DROP</span>
              </div>
            ) : null}
            <div className={styles.gutter} aria-label={language === 'de' ? 'Bar-Markierungen' : 'Bar markers'}>
              {lines.map((line, index) => {
                const kind = editorLineKind(line);
                const number = kind === 'bar' ? trackedEditorBarNumber(asEditorSong(song), index) : null;
                return (
                  <div
                    key={song.barIds?.[index] ?? `line-${index}`}
                    className={styles.gutterRow}
                    data-editor-row={index}
                    data-kind={kind}
                    style={{ top: rowTop(index), height: rowHeight(index) }}
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
                        <span
                          className={styles.gutterNumber}
                          style={{ '--line-center': `${rowCenter(index)}px` } as CSSProperties}
                        >
                          {String(number ?? '').padStart(2, '0')}
                        </span>
                      </button>
                    ) : (
                      <span>{kind === 'bracket' ? '§' : ''}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.editorColumn}>
              {editorLineKind(lines[activeIndex] ?? '') === 'bar' ? (
                <div
                  className={styles.activeBarHighlight}
                  style={{
                    top: rowTop(activeIndex),
                    height: rowHeight(activeIndex),
                  }}
                  aria-hidden="true"
                />
              ) : null}
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
              {lines.map((line, index) => {
                const kind = editorLineKind(line);
                return (
                  <div
                    key={song.barIds?.[index] ?? `syll-${index}`}
                    className={styles.syllableRow}
                    data-kind={kind}
                    data-active={kind === 'bar' && index === activeIndex ? 'true' : 'false'}
                    style={{ top: rowTop(index), height: rowHeight(index) }}
                  >
                    {kind === 'bar' ? (
                      <span
                        className={styles.syllableValue}
                        style={{ '--line-center': `${rowCenter(index)}px` } as CSSProperties}
                      >
                        {estimateSyllables(editorTrackableText(line)) || '—'}
                      </span>
                    ) : ''}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      <footer className={styles.footer}>
        <span>{language === 'de'
          ? 'Bar-Nr. klicken = Auswahl · kurz halten und ziehen = Bar verschieben · 0,5 s im Text halten = Abschnitt'
          : 'Click bar number = select · hold briefly and drag = move bar · hold 0.5 s in text = section'}</span>
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


      {historyOpen ? (
        <div className={styles.dialogBackdrop} role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) setHistoryOpen(false);
        }}>
          <section className={`${styles.revisionDialog} ${styles.historyDialog}`} role="dialog" aria-modal="true" aria-label={language === 'de' ? 'Versionsverlauf' : 'Revision history'}>
            <header>
              <div>
                <p>REVISION HISTORY</p>
                <h2>{language === 'de' ? 'Fassungen' : 'Revisions'}</h2>
                <span>{revisions.length} {language === 'de' ? 'gespeicherte Fassungen' : 'saved revisions'}</span>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label={language === 'de' ? 'Schließen' : 'Close'}>×</button>
            </header>
            <div className={styles.historyList}>
              {revisions.length ? revisions.slice().reverse().map((revision, reverseIndex) => (
                <article key={String(revision.at ?? reverseIndex)}>
                  <div>
                    <b>{revisionTime(revision.at, language)}</b>
                    <small>{revision.reason || 'revision'}</small>
                    <p>{revisionPreview(revision) || (language === 'de' ? 'Leere Fassung' : 'Empty revision')}</p>
                  </div>
                  <button type="button" onClick={() => {
                    setHistoryOpen(false);
                    compareRevision(revision);
                  }}>
                    {language === 'de' ? 'Vergleichen' : 'Compare'}
                  </button>
                </article>
              )) : (
                <p className={styles.emptyDock}>{language === 'de' ? 'Noch keine Fassungen.' : 'No revisions yet.'}</p>
              )}
            </div>
          </section>
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
