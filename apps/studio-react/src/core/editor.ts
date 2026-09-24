import * as sharedEditor from '../../../../packages/shared-core/src/editor/editor-session.mjs';
import * as sharedHistory from '../../../../packages/shared-core/src/editor/edit-history.mjs';
import * as sharedPerformance from '../../../../packages/shared-core/src/editor/performance-session.mjs';
import * as sharedRevisionDiff from '../../../../packages/shared-core/src/editor/revision-diff.mjs';

import type {
  EditorBarIdentity,
  EditorBracketSegment,
  EditorPosition,
  EditorSnapshot,
  EditorSong,
  PerformanceBarMetrics,
  PerformanceConfig,
  PerformanceCue,
  PerformancePocketMetrics,
  PerformancePreviousPlacements,
  RevisionDiff,
  RevisionDiffBar,
  RevisionDiffRow,
  SelectionProof,
  SelectionProofValidation,
  TypingUndoCoalescer,
} from './contracts';

type EditorApi = {
  ensureEditorSong(song: EditorSong): EditorSong;
  barIdentity(song: EditorSong, index: number): EditorBarIdentity | null;
  editorBracketSegments(value: unknown): EditorBracketSegment[];
  editorTrackableText(value: unknown): string;
  editorLineKind(value: unknown): 'blank' | 'bracket' | 'bar';
  isTrackedEditorLine(value: unknown): boolean;
  trackedEditorLineIndexes(song: EditorSong): number[];
  trackedEditorBarNumber(song: EditorSong, index: number): number | null;
  editorDocumentText(song: EditorSong): string;
  editorLineStartOffset(lines: string[], index: number): number;
  editorPositionFromOffset(lines: string[], offset: number): EditorPosition;
  reconcileEditorDocumentText(song: EditorSong, value: unknown): Record<string, unknown>;
  replaceEditorDocumentRange(
    song: EditorSong,
    start: number,
    end: number,
    replacement: unknown,
  ): Record<string, unknown> & {
    selectionStart: number;
    selectionEnd: number;
    caret: number;
    position: EditorPosition;
  };
  editorSnapshot(song: EditorSong): EditorSnapshot;
  restoreEditorSnapshot(song: EditorSong, snapshot: EditorSnapshot): boolean;
  setEditorBarText(song: EditorSong, index: number, value: unknown): EditorBarIdentity | null;
  splitEditorBar(
    song: EditorSong,
    index: number,
    start: number,
    end?: number,
  ): { left: EditorBarIdentity | null; right: EditorBarIdentity | null } | null;
  insertEditorBar(song: EditorSong, index: number, value?: unknown): EditorBarIdentity | null;
  duplicateEditorBar(song: EditorSong, index: number): EditorBarIdentity | null;
  removeEditorBar(song: EditorSong, index: number): EditorBarIdentity | null;
  moveEditorBar(song: EditorSong, fromIndex: number, toIndex: number): {
    moved: boolean;
    from: number;
    to: number;
    bar: EditorBarIdentity | null;
  } | null;
  mergeEditorBarWithPrevious(song: EditorSong, index: number): Record<string, unknown> | null;
  pasteEditorText(
    song: EditorSong,
    index: number,
    start: number,
    end: number,
    clipboardText: unknown,
  ): {
    firstIndex: number;
    lastIndex: number;
    focusIndex: number;
    selectionStart: number;
    selectionEnd: number;
    insertedBarIds: string[];
  } | null;
  createSelectionProof(
    song: EditorSong,
    input?: { index?: number; start?: number; end?: number },
  ): SelectionProof | null;
  validateSelectionProof(song: EditorSong, proof: SelectionProof | null): SelectionProofValidation;
};

type HistoryApi = {
  typingInputIsCoalescible(inputType: unknown): boolean;
  createTypingUndoCoalescer(options?: { windowMs?: number }): TypingUndoCoalescer;
};

type PerformanceApi = {
  PERFORMANCE_CUE_TYPES: readonly PerformanceCue['type'][];
  ensurePerformanceSong(song: EditorSong): EditorSong;
  performanceConfig(song: EditorSong): PerformanceConfig;
  setPerformanceConfig(song: EditorSong, patch?: Partial<PerformanceConfig>): PerformanceConfig;
  getPerformanceCue(song: EditorSong, barId: string, step: number): PerformanceCue | null;
  setPerformanceCue(
    song: EditorSong,
    barId: string,
    step: number,
    type: PerformanceCue['type'] | 'erase' | string,
    options?: { length?: number },
  ): PerformanceCue | null;
  movePerformanceCue(song: EditorSong, barId: string, fromStep: number, toStep: number): boolean;
  clearPerformanceBar(song: EditorSong, barId: string): number;
  markPerformanceReviewed(song: EditorSong, barId: string): number | null;
  performanceNeedsReview(song: EditorSong, barId: string): boolean;
  autoMapPerformanceBar(song: EditorSong, barId: string, syllableCount: number): number[];
  performanceBarMetrics(song: EditorSong, barId: string): PerformanceBarMetrics;
  performanceStepDurationMs(song: EditorSong, step?: number): number;
  performanceBarDurationMs(song: EditorSong): number;
  performanceFlowFingerprint(song: EditorSong, barId: string): string;
  performancePocketMetrics(song: EditorSong, barId: string): PerformancePocketMetrics;
  performancePreviousBarPlacements(song: EditorSong, barId: string): PerformancePreviousPlacements;
  performanceSyllablesPerSecond(song: EditorSong, syllableCount: number): number;
  performanceCueSymbol(cue: PerformanceCue | PerformanceCue['type'] | null): string;
};

type RevisionDiffApi = {
  revisionSnapshotBars(entry: unknown): RevisionDiffBar[];
  compareEditorRevisions(currentSnapshot: EditorSnapshot, revisionEntry: unknown): RevisionDiff;
  revisionDiffLabel(row: RevisionDiffRow): string;
};

const editorApi = sharedEditor as unknown as EditorApi;
const historyApi = sharedHistory as unknown as HistoryApi;
const performanceApi = sharedPerformance as unknown as PerformanceApi;
const revisionApi = sharedRevisionDiff as unknown as RevisionDiffApi;

export const ensureEditorSong = editorApi.ensureEditorSong;
export const barIdentity = editorApi.barIdentity;
export const editorBracketSegments = editorApi.editorBracketSegments;
export const editorTrackableText = editorApi.editorTrackableText;
export const editorLineKind = editorApi.editorLineKind;
export const isTrackedEditorLine = editorApi.isTrackedEditorLine;
export const trackedEditorLineIndexes = editorApi.trackedEditorLineIndexes;
export const trackedEditorBarNumber = editorApi.trackedEditorBarNumber;
export const editorDocumentText = editorApi.editorDocumentText;
export const editorLineStartOffset = editorApi.editorLineStartOffset;
export const editorPositionFromOffset = editorApi.editorPositionFromOffset;
export const reconcileEditorDocumentText = editorApi.reconcileEditorDocumentText;
export const replaceEditorDocumentRange = editorApi.replaceEditorDocumentRange;
export const editorSnapshot = editorApi.editorSnapshot;
export const restoreEditorSnapshot = editorApi.restoreEditorSnapshot;
export const setEditorBarText = editorApi.setEditorBarText;
export const splitEditorBar = editorApi.splitEditorBar;
export const insertEditorBar = editorApi.insertEditorBar;
export const duplicateEditorBar = editorApi.duplicateEditorBar;
export const removeEditorBar = editorApi.removeEditorBar;
export const moveEditorBar = editorApi.moveEditorBar;
export const mergeEditorBarWithPrevious = editorApi.mergeEditorBarWithPrevious;
export const pasteEditorText = editorApi.pasteEditorText;
export const createSelectionProof = editorApi.createSelectionProof;
export const validateSelectionProof = editorApi.validateSelectionProof;

export const typingInputIsCoalescible = historyApi.typingInputIsCoalescible;
export const createTypingUndoCoalescer = historyApi.createTypingUndoCoalescer;

export const PERFORMANCE_CUE_TYPES = performanceApi.PERFORMANCE_CUE_TYPES;
export const ensurePerformanceSong = performanceApi.ensurePerformanceSong;
export const performanceConfig = performanceApi.performanceConfig;
export const setPerformanceConfig = performanceApi.setPerformanceConfig;
export const getPerformanceCue = performanceApi.getPerformanceCue;
export const setPerformanceCue = performanceApi.setPerformanceCue;
export const movePerformanceCue = performanceApi.movePerformanceCue;
export const clearPerformanceBar = performanceApi.clearPerformanceBar;
export const markPerformanceReviewed = performanceApi.markPerformanceReviewed;
export const performanceNeedsReview = performanceApi.performanceNeedsReview;
export const autoMapPerformanceBar = performanceApi.autoMapPerformanceBar;
export const performanceBarMetrics = performanceApi.performanceBarMetrics;
export const performanceStepDurationMs = performanceApi.performanceStepDurationMs;
export const performanceBarDurationMs = performanceApi.performanceBarDurationMs;
export const performanceFlowFingerprint = performanceApi.performanceFlowFingerprint;
export const performancePocketMetrics = performanceApi.performancePocketMetrics;
export const performancePreviousBarPlacements = performanceApi.performancePreviousBarPlacements;
export const performanceSyllablesPerSecond = performanceApi.performanceSyllablesPerSecond;
export const performanceCueSymbol = performanceApi.performanceCueSymbol;

export const revisionSnapshotBars = revisionApi.revisionSnapshotBars;
export const compareEditorRevisions = revisionApi.compareEditorRevisions;
export const revisionDiffLabel = revisionApi.revisionDiffLabel;
