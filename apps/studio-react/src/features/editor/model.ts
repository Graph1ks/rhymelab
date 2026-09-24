import type {
  EditorSong,
  EditorSnapshot,
  LegacyStudioRevision,
  LegacyStudioSong,
  LegacyStudioState,
  SelectionProof,
} from '../../legacy/contracts';
import {
  barIdentity,
  createSelectionProof,
  editorBracketSegments,
  editorDocumentText,
  editorLineStartOffset,
  editorPositionFromOffset,
  editorSnapshot,
  ensureEditorSong,
  isTrackedEditorLine,
  replaceEditorDocumentRange,
  restoreEditorSnapshot,
  validateSelectionProof,
} from '../../legacy/editor';

export interface EditorSelectionState {
  line: number;
  barId: string;
  barRevision: number;
  start: number;
  end: number;
  documentStart: number;
  documentEnd: number;
  multiline: boolean;
  tracked: boolean;
  anchor: string;
  proof: SelectionProof | null;
}

export interface EditorRevisionResult {
  changed: boolean;
  revision: LegacyStudioRevision | null;
}

export interface EditorInsertResult {
  ok: boolean;
  reason?: string;
  selectionStart?: number;
  selectionEnd?: number;
  caret?: number;
  line?: number;
}

const WORD_CHARACTER = /[\p{L}\p{N}'’-]/u;

export function asEditorSong(song: LegacyStudioSong): EditorSong {
  return song as unknown as EditorSong;
}

export function activeEditorSong(state: LegacyStudioState): LegacyStudioSong | null {
  return state.songs.find((song) =>
    song.id === state.active && !song.deleted && !song.deletedAt
  ) ?? null;
}

export function ensureLegacyEditorSong(song: LegacyStudioSong): LegacyStudioSong {
  ensureEditorSong(asEditorSong(song));
  if (!Array.isArray(song.revisions)) song.revisions = [];
  return song;
}

export function editorText(song: LegacyStudioSong): string {
  ensureLegacyEditorSong(song);
  return editorDocumentText(asEditorSong(song));
}

export function captureEditorSelection(
  song: LegacyStudioSong,
  rawStart: number,
  rawEnd: number,
): EditorSelectionState {
  ensureLegacyEditorSong(song);
  const editorSong = asEditorSong(song);
  const document = editorDocumentText(editorSong);
  const documentStart = Math.max(0, Math.min(document.length, Number(rawStart) || 0));
  const documentEnd = Math.max(
    documentStart,
    Math.min(document.length, Number(rawEnd) || documentStart),
  );
  const startPosition = editorPositionFromOffset(editorSong.lines, documentStart);
  const endPosition = editorPositionFromOffset(editorSong.lines, documentEnd);
  const lineIndex = startPosition.index;
  const line = editorSong.lines[lineIndex] ?? '';
  const sameLine = lineIndex === endPosition.index;
  let start = startPosition.offset;
  let end = sameLine ? endPosition.offset : start;

  if (sameLine && documentStart === documentEnd) {
    while (start > 0 && WORD_CHARACTER.test(line[start - 1] ?? '')) start -= 1;
    while (end < line.length && WORD_CHARACTER.test(line[end] ?? '')) end += 1;
  }

  const bar = barIdentity(editorSong, lineIndex);
  const bracketSegments = editorBracketSegments(line);
  const overlapsBracket = sameLine && bracketSegments.some(
    (segment) => start < segment.end && end > segment.start,
  );
  const tracked = sameLine && isTrackedEditorLine(line) && !overlapsBracket;
  const lineStart = editorLineStartOffset(editorSong.lines, lineIndex);
  const queryDocumentStart = sameLine ? lineStart + start : documentStart;
  const queryDocumentEnd = sameLine ? lineStart + end : documentEnd;
  const anchor = tracked ? line.slice(start, end).trim() : '';
  const proof = tracked
    ? createSelectionProof(editorSong, { index: lineIndex, start, end })
    : null;

  return {
    line: lineIndex,
    barId: bar?.id ?? '',
    barRevision: bar?.revision ?? 0,
    start,
    end,
    documentStart: queryDocumentStart,
    documentEnd: queryDocumentEnd,
    multiline: !sameLine,
    tracked,
    anchor,
    proof,
  };
}

export function insertWithSelectionProof(
  song: LegacyStudioSong,
  proof: SelectionProof | null,
  replacement: string,
): EditorInsertResult {
  ensureLegacyEditorSong(song);
  const editorSong = asEditorSong(song);
  if (!proof) return { ok: false, reason: 'selection_missing' };
  const validation = validateSelectionProof(editorSong, proof);
  if (!validation.valid) return { ok: false, reason: validation.reason ?? 'selection_invalid' };

  const start = editorLineStartOffset(editorSong.lines, validation.index) + proof.start;
  const end = editorLineStartOffset(editorSong.lines, validation.index) + proof.end;
  const result = replaceEditorDocumentRange(editorSong, start, end, replacement);
  return {
    ok: true,
    selectionStart: result.selectionStart,
    selectionEnd: result.selectionEnd,
    caret: result.caret,
    line: result.position.index,
  };
}

function revisionSignature(revision: LegacyStudioRevision | undefined): string {
  if (!revision) return '';
  const row = revision as Record<string, unknown>;
  if (typeof row.snapshotSignature === 'string') return row.snapshotSignature;
  if (revision.snapshot) return JSON.stringify(revision.snapshot);
  return typeof revision.text === 'string' ? revision.text : '';
}

export function captureEditorRevision(
  song: LegacyStudioSong,
  reason = 'autosave',
  now = Date.now(),
): EditorRevisionResult {
  ensureLegacyEditorSong(song);
  const editorSong = asEditorSong(song);
  const snapshot = editorSnapshot(editorSong);
  const signature = JSON.stringify(snapshot);
  const revisions = song.revisions ?? [];
  const previous = revisions.at(-1);
  if (revisionSignature(previous) === signature) {
    return { changed: false, revision: previous ?? null };
  }

  const revision: LegacyStudioRevision = {
    at: now,
    reason,
    text: snapshot.lines.join('\n'),
    snapshot,
    snapshotSignature: signature,
  };
  song.revisions = [...revisions, revision].slice(-30);
  song.updatedAt = Math.max(Number(song.updatedAt) || 0, Number(now) || 0);
  return { changed: true, revision };
}

export function restoreLegacyEditorRevision(
  song: LegacyStudioSong,
  revision: LegacyStudioRevision,
): boolean {
  ensureLegacyEditorSong(song);
  if (revision.snapshot) {
    return restoreEditorSnapshot(asEditorSong(song), revision.snapshot);
  }
  const text = String(revision.text ?? '');
  const result = replaceEditorDocumentRange(
    asEditorSong(song),
    0,
    editorDocumentText(asEditorSong(song)).length,
    text,
  );
  return Boolean(result);
}

export function clearLegacyEditorSong(
  song: LegacyStudioSong,
  now = Date.now(),
): void {
  ensureLegacyEditorSong(song);
  const editorSong = asEditorSong(song);
  editorSong.lines = [''];
  editorSong.barIds = [`bar:${song.id}:clear:${now.toString(36)}`];
  editorSong.barRevisions = [0];
  editorSong.editorNextBarId = Math.max(1, Number(editorSong.editorNextBarId) || 1);
  editorSong.steps = {};
  editorSong.performanceCues = {};
  editorSong.performanceAnchors = {};
  song.updatedAt = Math.max(Number(song.updatedAt) || 0, now);
}

export function snapshotForUndo(song: LegacyStudioSong): EditorSnapshot {
  ensureLegacyEditorSong(song);
  return editorSnapshot(asEditorSong(song));
}
