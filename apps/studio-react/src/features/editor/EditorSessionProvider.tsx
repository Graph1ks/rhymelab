import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  EditorSnapshot,
  LegacyStudioRevision,
  LegacyStudioSong,
} from '../../legacy/contracts';
import {
  barIdentity,
  compareEditorRevisions,
  createTypingUndoCoalescer,
  duplicateEditorBar,
  editorLineStartOffset,
  editorPositionFromOffset,
  insertEditorBar,
  moveEditorBar,
  reconcileEditorDocumentText,
  removeEditorBar,
  restoreEditorSnapshot,
} from '../../legacy/editor';
import { useDocumentWorkspace } from '../library/DocumentWorkspaceProvider';
import { touchSong } from '../library/model';
import {
  activeEditorSong,
  asEditorSong,
  captureEditorRevision,
  captureEditorSelection,
  clearLegacyEditorSong,
  editorText,
  ensureLegacyEditorSong,
  insertWithSelectionProof,
  restoreLegacyEditorRevision,
  snapshotForUndo,
  type EditorSelectionState,
} from './model';

interface HistoryEntry {
  songId: string;
  snapshot: EditorSnapshot;
  line: number;
}

export interface EditorFocusRequest {
  start: number;
  end: number;
  token: number;
}

export interface EditorInsertOutcome {
  ok: boolean;
  reason?: string;
}

interface EditorSessionContextValue {
  activeSong: LegacyStudioSong | null;
  documentText: string;
  selection: EditorSelectionState | null;
  followSelection: boolean;
  composing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  focusRequest: EditorFocusRequest | null;
  setFollowSelection: (value: boolean) => void;
  captureSelection: (start: number, end: number) => void;
  noteBoundary: () => void;
  beforeInput: (inputType: string, composing: boolean) => void;
  input: (value: string, start: number, end: number, composing: boolean) => void;
  compositionStart: () => void;
  compositionEnd: (value: string, start: number, end: number) => void;
  insertCandidate: (value: string) => Promise<EditorInsertOutcome>;
  insertSectionTag: (value: string, start: number, end: number) => Promise<boolean>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  createBarAfter: (index: number) => Promise<boolean>;
  duplicateBar: (index: number) => Promise<boolean>;
  deleteBar: (index: number) => Promise<boolean>;
  moveBar: (fromIndex: number, toIndex: number) => Promise<boolean>;
  jumpToBar: (barId: string) => void;
  clearDocument: () => Promise<boolean>;
  restoreRevision: (revision: LegacyStudioRevision) => Promise<boolean>;
  revisionDiff: (revision: LegacyStudioRevision) => ReturnType<typeof compareEditorRevisions> | null;
}

const EditorSessionContext = createContext<EditorSessionContextValue | null>(null);
const HISTORY_LIMIT = 80;
const REVISION_DELAY_MS = 650;

function cloneSong(song: LegacyStudioSong | null): LegacyStudioSong | null {
  if (!song) return null;
  try {
    return structuredClone(song);
  } catch {
    return JSON.parse(JSON.stringify(song)) as LegacyStudioSong;
  }
}

export function EditorSessionProvider({ children }: { children: ReactNode }) {
  const documents = useDocumentWorkspace();
  const typingUndo = useRef(createTypingUndoCoalescer({ windowMs: 1100 }));
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const selectionProof = useRef<EditorSelectionState['proof']>(null);
  const activeLine = useRef(0);
  const revisionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusToken = useRef(0);

  const [selection, setSelection] = useState<EditorSelectionState | null>(null);
  const [followSelection, setFollowSelection] = useState(true);
  const [composing, setComposing] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [focusRequest, setFocusRequest] = useState<EditorFocusRequest | null>(null);

  const sourceSong = useMemo(
    () => activeEditorSong(documents.state),
    [documents.state],
  );
  const activeSong = useMemo(() => {
    const copy = cloneSong(sourceSong);
    if (copy) ensureLegacyEditorSong(copy);
    return copy;
  }, [sourceSong]);
  const documentText = activeSong ? editorText(activeSong) : '';

  const historyChanged = useCallback(() => {
    setHistoryVersion((value) => value + 1);
  }, []);

  const requestFocus = useCallback((start: number, end = start) => {
    focusToken.current += 1;
    setFocusRequest({ start, end, token: focusToken.current });
  }, []);

  const currentSongCopy = useCallback(() => {
    const current = activeEditorSong(documents.peekState());
    const copy = cloneSong(current);
    if (copy) ensureLegacyEditorSong(copy);
    return copy;
  }, [documents]);

  const checkpoint = useCallback((coalesced = false) => {
    const current = currentSongCopy();
    if (!current) return;
    if (!coalesced) typingUndo.current.noteBoundary();
    undoStack.current.push({
      songId: current.id,
      snapshot: snapshotForUndo(current),
      line: activeLine.current,
    });
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    redoStack.current.length = 0;
    historyChanged();
  }, [currentSongCopy, historyChanged]);

  const commitRevision = useCallback(async (reason = 'autosave') => {
    if (revisionTimer.current) {
      clearTimeout(revisionTimer.current);
      revisionTimer.current = null;
    }
    let changed = false;
    await documents.mutate((state) => {
      const song = activeEditorSong(state);
      if (!song) return state;
      changed = captureEditorRevision(song, reason).changed;
      return state;
    });
    return changed;
  }, [documents]);

  const scheduleRevision = useCallback(() => {
    if (revisionTimer.current) clearTimeout(revisionTimer.current);
    revisionTimer.current = setTimeout(() => {
      revisionTimer.current = null;
      void commitRevision('autosave');
    }, REVISION_DELAY_MS);
  }, [commitRevision]);

  const captureSelectionFromDocument = useCallback((start: number, end: number) => {
    const current = currentSongCopy();
    if (!current) {
      setSelection(null);
      selectionProof.current = null;
      return;
    }
    const next = captureEditorSelection(current, start, end);
    activeLine.current = next.line;
    selectionProof.current = next.proof;
    setSelection(next);
  }, [currentSongCopy]);

  useEffect(() => {
    const song = sourceSong;
    if (!song) return;
    const ready = Array.isArray(song.barIds)
      && song.barIds.length === song.lines.length
      && Array.isArray(song.barRevisions)
      && song.barRevisions.length === song.lines.length
      && Number.isInteger(Number(song.editorNextBarId));
    if (ready) return;
    void documents.mutate((state) => {
      const current = activeEditorSong(state);
      if (current) ensureLegacyEditorSong(current);
      return state;
    }, { immediate: true });
  }, [
    documents,
    sourceSong?.id,
    sourceSong?.lines.length,
    sourceSong?.barIds?.length,
    sourceSong?.barRevisions?.length,
    sourceSong?.editorNextBarId,
  ]);

  useEffect(() => {
    undoStack.current.length = 0;
    redoStack.current.length = 0;
    typingUndo.current.reset();
    activeLine.current = 0;
    selectionProof.current = null;
    setSelection(null);
    setComposing(false);
    historyChanged();
  }, [documents.state.active, historyChanged]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return;
      void commitRevision('autosave').then(() => documents.flush('editor_visibility_hidden'));
    };
    const onPageHide = () => {
      void commitRevision('autosave').then(() => documents.flush('editor_pagehide'));
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      if (revisionTimer.current) clearTimeout(revisionTimer.current);
    };
  }, [commitRevision, documents]);

  const noteBoundary = useCallback(() => {
    typingUndo.current.noteBoundary();
  }, []);

  const beforeInput = useCallback((inputType: string, isComposing: boolean) => {
    if (isComposing) return;
    const current = currentSongCopy();
    if (!current) return;
    const position = editorPositionFromOffset(
      asEditorSong(current).lines,
      selection?.documentStart ?? 0,
    );
    const bar = barIdentity(asEditorSong(current), position.index);
    const shouldCheckpoint = typingUndo.current.shouldCheckpoint({
      songId: current.id,
      barId: bar?.id ?? 'document',
      inputType,
      now: Date.now(),
      composing: false,
    });
    if (shouldCheckpoint) checkpoint(true);
  }, [checkpoint, currentSongCopy, selection?.documentStart]);

  const input = useCallback((
    value: string,
    start: number,
    end: number,
    isComposing: boolean,
  ) => {
    void documents.mutate((state) => {
      const current = activeEditorSong(state);
      if (!current) return state;
      ensureLegacyEditorSong(current);
      reconcileEditorDocumentText(asEditorSong(current), value);
      touchSong(current);
      return state;
    });
    if (!isComposing) {
      scheduleRevision();
      captureSelectionFromDocument(start, end);
    }
  }, [captureSelectionFromDocument, documents, scheduleRevision]);

  const compositionStart = useCallback(() => {
    if (composing) return;
    checkpoint();
    setComposing(true);
  }, [checkpoint, composing]);

  const compositionEnd = useCallback((value: string, start: number, end: number) => {
    void documents.mutate((state) => {
      const current = activeEditorSong(state);
      if (!current) return state;
      ensureLegacyEditorSong(current);
      reconcileEditorDocumentText(asEditorSong(current), value);
      touchSong(current);
      return state;
    });
    setComposing(false);
    typingUndo.current.noteBoundary();
    scheduleRevision();
    captureSelectionFromDocument(start, end);
  }, [captureSelectionFromDocument, documents, scheduleRevision]);

  const insertCandidate = useCallback(async (value: string): Promise<EditorInsertOutcome> => {
    const replacement = String(value ?? '');
    if (!replacement) return { ok: false, reason: 'empty_candidate' };
    const proof = selectionProof.current;
    if (!proof) return { ok: false, reason: 'selection_missing' };

    checkpoint();
    let outcome: EditorInsertOutcome = { ok: false, reason: 'selection_missing' };
    let focus: { start: number; end: number } | null = null;
    await documents.mutate((state) => {
      const current = activeEditorSong(state);
      if (!current) {
        outcome = { ok: false, reason: 'song_missing' };
        return state;
      }
      const result = insertWithSelectionProof(current, proof, replacement);
      outcome = { ok: result.ok, reason: result.reason };
      if (result.ok) {
        touchSong(current);
        activeLine.current = result.line ?? activeLine.current;
        focus = {
          start: result.selectionStart ?? result.caret ?? 0,
          end: result.selectionEnd ?? result.caret ?? 0,
        };
      }
      return state;
    });

    if (outcome.ok && focus) {
      scheduleRevision();
      requestFocus(focus.start, focus.end);
      requestAnimationFrame(() => captureSelectionFromDocument(focus!.start, focus!.end));
    }
    return outcome;
  }, [
    captureSelectionFromDocument,
    checkpoint,
    documents,
    requestFocus,
    scheduleRevision,
  ]);

  const insertSectionTag = useCallback(async (
    value: string,
    start: number,
    end: number,
  ) => {
    const tag = String(value ?? '').trim();
    if (!tag) return false;
    checkpoint();
    let changed = false;
    let focus = start;
    await documents.mutate((state) => {
      const current = activeEditorSong(state);
      if (!current) return state;
      ensureLegacyEditorSong(current);
      const result = replaceEditorDocumentRange(
        asEditorSong(current),
        start,
        end,
        tag,
      );
      activeLine.current = result.position.index;
      focus = result.caret;
      touchSong(current);
      changed = true;
      return state;
    });
    if (changed) {
      selectionProof.current = null;
      setSelection(null);
      scheduleRevision();
      requestFocus(focus, focus);
      requestAnimationFrame(() => captureSelectionFromDocument(focus, focus));
    }
    return changed;
  }, [
    captureSelectionFromDocument,
    checkpoint,
    documents,
    requestFocus,
    scheduleRevision,
  ]);

  const undo = useCallback(async () => {
    typingUndo.current.noteBoundary();
    const previous = undoStack.current.pop();
    if (!previous) {
      historyChanged();
      return false;
    }
    const current = currentSongCopy();
    if (!current || current.id !== previous.songId) {
      undoStack.current.length = 0;
      redoStack.current.length = 0;
      historyChanged();
      return false;
    }
    redoStack.current.push({
      songId: current.id,
      snapshot: snapshotForUndo(current),
      line: activeLine.current,
    });
    await documents.mutate((state) => {
      const song = activeEditorSong(state);
      if (!song || song.id !== previous.songId) return state;
      restoreEditorSnapshot(asEditorSong(ensureLegacyEditorSong(song)), previous.snapshot);
      touchSong(song);
      return state;
    });
    activeLine.current = Math.max(0, Math.min(previous.line, previous.snapshot.lines.length - 1));
    const start = editorLineStartOffset(previous.snapshot.lines, activeLine.current);
    requestFocus(start, start);
    selectionProof.current = null;
    setSelection(null);
    scheduleRevision();
    historyChanged();
    return true;
  }, [
    currentSongCopy,
    documents,
    historyChanged,
    requestFocus,
    scheduleRevision,
  ]);

  const redo = useCallback(async () => {
    typingUndo.current.noteBoundary();
    const next = redoStack.current.pop();
    if (!next) {
      historyChanged();
      return false;
    }
    const current = currentSongCopy();
    if (!current || current.id !== next.songId) {
      undoStack.current.length = 0;
      redoStack.current.length = 0;
      historyChanged();
      return false;
    }
    undoStack.current.push({
      songId: current.id,
      snapshot: snapshotForUndo(current),
      line: activeLine.current,
    });
    await documents.mutate((state) => {
      const song = activeEditorSong(state);
      if (!song || song.id !== next.songId) return state;
      restoreEditorSnapshot(asEditorSong(ensureLegacyEditorSong(song)), next.snapshot);
      touchSong(song);
      return state;
    });
    activeLine.current = Math.max(0, Math.min(next.line, next.snapshot.lines.length - 1));
    const start = editorLineStartOffset(next.snapshot.lines, activeLine.current);
    requestFocus(start, start);
    selectionProof.current = null;
    setSelection(null);
    scheduleRevision();
    historyChanged();
    return true;
  }, [
    currentSongCopy,
    documents,
    historyChanged,
    requestFocus,
    scheduleRevision,
  ]);

  const createBarAfter = useCallback(async (index: number) => {
    checkpoint();
    let focus = 0;
    let changed = false;
    await documents.mutate((state) => {
      const current = activeEditorSong(state);
      if (!current) return state;
      ensureLegacyEditorSong(current);
      const inserted = insertEditorBar(
        asEditorSong(current),
        Math.max(0, Math.min(current.lines.length, index + 1)),
        '',
      );
      if (!inserted) return state;
      activeLine.current = inserted.index;
      focus = editorLineStartOffset(asEditorSong(current).lines, inserted.index);
      touchSong(current);
      changed = true;
      return state;
    });
    if (changed) {
      scheduleRevision();
      requestFocus(focus, focus);
    }
    return changed;
  }, [checkpoint, documents, requestFocus, scheduleRevision]);

  const duplicateBar = useCallback(async (index: number) => {
    checkpoint();
    let focus = 0;
    let changed = false;
    await documents.mutate((state) => {
      const current = activeEditorSong(state);
      if (!current) return state;
      ensureLegacyEditorSong(current);
      const inserted = duplicateEditorBar(asEditorSong(current), index);
      if (!inserted) return state;
      activeLine.current = inserted.index;
      focus = editorLineStartOffset(asEditorSong(current).lines, inserted.index)
        + inserted.text.length;
      touchSong(current);
      changed = true;
      return state;
    });
    if (changed) {
      scheduleRevision();
      requestFocus(focus, focus);
    }
    return changed;
  }, [checkpoint, documents, requestFocus, scheduleRevision]);

  const deleteBar = useCallback(async (index: number) => {
    checkpoint();
    let focus = 0;
    let changed = false;
    await documents.mutate((state) => {
      const current = activeEditorSong(state);
      if (!current) return state;
      ensureLegacyEditorSong(current);
      const editorSong = asEditorSong(current);
      if (editorSong.lines.length === 1) {
        reconcileEditorDocumentText(editorSong, '');
        activeLine.current = 0;
        focus = 0;
        changed = true;
      } else {
        const removed = removeEditorBar(editorSong, index);
        if (!removed) return state;
        activeLine.current = Math.max(0, Math.min(index, editorSong.lines.length - 1));
        focus = editorLineStartOffset(editorSong.lines, activeLine.current);
        changed = true;
      }
      touchSong(current);
      return state;
    });
    if (changed) {
      selectionProof.current = null;
      setSelection(null);
      scheduleRevision();
      requestFocus(focus, focus);
    }
    return changed;
  }, [checkpoint, documents, requestFocus, scheduleRevision]);

  const moveBar = useCallback(async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return false;
    checkpoint();
    let changed = false;
    let focus = 0;
    await documents.mutate((state) => {
      const current = activeEditorSong(state);
      if (!current) return state;
      ensureLegacyEditorSong(current);
      const selectedBarId = selection?.barId ?? asEditorSong(current).barIds[activeLine.current] ?? '';
      const moved = moveEditorBar(asEditorSong(current), fromIndex, toIndex);
      if (!moved?.moved) return state;
      const selectedIndex = asEditorSong(current).barIds.indexOf(selectedBarId);
      activeLine.current = selectedIndex >= 0 ? selectedIndex : moved.to;
      focus = editorLineStartOffset(asEditorSong(current).lines, activeLine.current);
      touchSong(current);
      changed = true;
      return state;
    });
    if (changed) {
      selectionProof.current = null;
      setSelection(null);
      scheduleRevision();
      requestFocus(focus, focus);
    }
    return changed;
  }, [checkpoint, documents, requestFocus, scheduleRevision, selection?.barId]);

  const jumpToBar = useCallback((barId: string) => {
    const current = currentSongCopy();
    if (!current) return;
    const index = asEditorSong(current).barIds.indexOf(String(barId));
    if (index < 0) return;
    activeLine.current = index;
    const start = editorLineStartOffset(asEditorSong(current).lines, index);
    const end = start + (asEditorSong(current).lines[index]?.length ?? 0);
    requestFocus(end, end);
    requestAnimationFrame(() => captureSelectionFromDocument(end, end));
  }, [captureSelectionFromDocument, currentSongCopy, requestFocus]);

  const clearDocument = useCallback(async () => {
    const current = currentSongCopy();
    if (!current) return false;
    await commitRevision('before_clear_document');
    if (documents.authority === 'indexeddb') {
      try {
        await documents.createRecoveryPoint('before_clear_document');
      } catch {
        // Existing fallback behavior keeps clear available when recovery is unavailable.
      }
    }
    checkpoint();
    await documents.mutate((state) => {
      const song = activeEditorSong(state);
      if (!song) return state;
      clearLegacyEditorSong(song);
      return state;
    }, { immediate: true });
    selectionProof.current = null;
    setSelection(null);
    requestFocus(0, 0);
    scheduleRevision();
    return true;
  }, [
    checkpoint,
    commitRevision,
    currentSongCopy,
    documents,
    requestFocus,
    scheduleRevision,
  ]);

  const restoreRevision = useCallback(async (revision: LegacyStudioRevision) => {
    const current = currentSongCopy();
    if (!current) return false;
    checkpoint();
    let restored = false;
    await documents.mutate((state) => {
      const song = activeEditorSong(state);
      if (!song) return state;
      captureEditorRevision(song, 'before_restore');
      restored = restoreLegacyEditorRevision(song, revision);
      if (restored) touchSong(song);
      return state;
    }, { immediate: true });
    if (restored) {
      activeLine.current = 0;
      selectionProof.current = null;
      setSelection(null);
      requestFocus(0, 0);
      scheduleRevision();
    }
    return restored;
  }, [checkpoint, currentSongCopy, documents, requestFocus, scheduleRevision]);

  const revisionDiff = useCallback((revision: LegacyStudioRevision) => {
    const current = currentSongCopy();
    if (!current) return null;
    return compareEditorRevisions(snapshotForUndo(current), revision);
  }, [currentSongCopy]);

  const value = useMemo<EditorSessionContextValue>(() => ({
    activeSong,
    documentText,
    selection,
    followSelection,
    composing,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    focusRequest,
    setFollowSelection,
    captureSelection: captureSelectionFromDocument,
    noteBoundary,
    beforeInput,
    input,
    compositionStart,
    compositionEnd,
    insertCandidate,
    insertSectionTag,
    undo,
    redo,
    createBarAfter,
    duplicateBar,
    deleteBar,
    moveBar,
    jumpToBar,
    clearDocument,
    restoreRevision,
    revisionDiff,
  }), [
    activeSong,
    beforeInput,
    captureSelectionFromDocument,
    clearDocument,
    composing,
    compositionEnd,
    compositionStart,
    createBarAfter,
    deleteBar,
    documentText,
    duplicateBar,
    focusRequest,
    followSelection,
    historyVersion,
    input,
    insertCandidate,
    insertSectionTag,
    jumpToBar,
    moveBar,
    noteBoundary,
    redo,
    restoreRevision,
    revisionDiff,
    selection,
    undo,
  ]);

  return (
    <EditorSessionContext.Provider value={value}>
      {children}
    </EditorSessionContext.Provider>
  );
}

export function useEditorSession(): EditorSessionContextValue {
  const value = useContext(EditorSessionContext);
  if (!value) throw new Error('useEditorSession must be used inside EditorSessionProvider');
  return value;
}

export function useOptionalEditorSession(): EditorSessionContextValue | null {
  return useContext(EditorSessionContext);
}
