import { describe, expect, it } from 'vitest';

import type { LegacyStudioSong, LegacyStudioState } from '../../legacy/contracts';
import {
  editorDocumentText,
  ensureEditorSong,
  reconcileEditorDocumentText,
} from '../../legacy/editor';
import {
  CURATED_GOOGLE_FONTS,
  DEFAULT_EDITOR_FONT,
  editorFontFamily,
  editorFontLabel,
  editorFontStyle,
  editorFontWeight,
  normalizeEditorFontValue,
} from './SystemFontPicker';
import {
  activeEditorSong,
  asEditorSong,
  captureEditorRevision,
  captureEditorSelection,
  clearLegacyEditorSong,
  ensureLegacyEditorSong,
  insertWithSelectionProof,
  restoreLegacyEditorRevision,
  snapshotForUndo,
} from './model';

function song(): LegacyStudioSong {
  return {
    id: 's1',
    title: 'Draft',
    folder: 'Entwürfe',
    lines: ['[Verse]', 'Die Stadt bleibt wach', '', 'Nacht'],
    revisions: [],
    steps: {},
    performanceCues: {},
    performanceAnchors: {},
    createdAt: 10,
    updatedAt: 20,
  };
}

describe('R5 editor Google-font contract', () => {
  it('ships ten curated style groups with five fonts each and Oranienbaum as default', () => {
    expect(CURATED_GOOGLE_FONTS).toHaveLength(50);
    const groups = new Map<string, number>();
    CURATED_GOOGLE_FONTS.forEach((font) => groups.set(font.category, (groups.get(font.category) ?? 0) + 1));
    expect([...groups.values()]).toEqual(Array.from({ length: 10 }, () => 5));
    expect(DEFAULT_EDITOR_FONT).toBe('google:Oranienbaum');
  });

  it('normalizes legacy/system choices to the permission-free Google default', () => {
    expect(normalizeEditorFontValue('system:Georgia')).toBe(DEFAULT_EDITOR_FONT);
    expect(normalizeEditorFontValue('sans')).toBe(DEFAULT_EDITOR_FONT);
    expect(normalizeEditorFontValue('mono')).toBe('google:JetBrains Mono');
    expect(editorFontFamily(DEFAULT_EDITOR_FONT)).toContain('"Oranienbaum"');
    expect(editorFontStyle(DEFAULT_EDITOR_FONT)).toBe('normal');
    expect(editorFontWeight(DEFAULT_EDITOR_FONT)).toBe(400);
    expect(editorFontLabel(DEFAULT_EDITOR_FONT)).toBe('Oranienbaum');
  });
});

describe('R5 editor orchestration model', () => {
  it('normalizes a legacy song into stable Bar identities without replacing its document shape', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    expect(current.barIds).toHaveLength(current.lines.length);
    expect(new Set(current.barIds).size).toBe(current.lines.length);
    expect(current.barRevisions).toEqual([0, 0, 0, 0]);
    expect(editorDocumentText(asEditorSong(current))).toBe('[Verse]\nDie Stadt bleibt wach\n\nNacht');
  });

  it('captures tracked word selections but excludes bracket metadata and multiline selections', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const text = editorDocumentText(asEditorSong(current));
    const wordOffset = text.indexOf('Stadt') + 2;
    const tracked = captureEditorSelection(current, wordOffset, wordOffset);

    expect(tracked.tracked).toBe(true);
    expect(tracked.anchor).toBe('Stadt');
    expect(tracked.proof?.barId).toBe(current.barIds?.[1]);

    const bracket = captureEditorSelection(current, 2, 2);
    expect(bracket.tracked).toBe(false);
    expect(bracket.proof).toBeNull();

    const multiline = captureEditorSelection(current, text.indexOf('Stadt'), text.indexOf('Nacht') + 2);
    expect(multiline.multiline).toBe(true);
    expect(multiline.tracked).toBe(false);
  });

  it('inserts through a Selection Proof and rejects the same proof after the Bar changes', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const text = editorDocumentText(asEditorSong(current));
    const start = text.indexOf('Stadt');
    const selection = captureEditorSelection(current, start, start + 'Stadt'.length);
    const oldBarId = selection.proof?.barId;

    const inserted = insertWithSelectionProof(current, selection.proof, 'City');
    expect(inserted.ok).toBe(true);
    expect(current.lines[1]).toBe('Die City bleibt wach');
    expect(current.barIds?.[1]).toBe(oldBarId);
    expect(current.barRevisions?.[1]).toBe(1);

    const stale = insertWithSelectionProof(current, selection.proof, 'Town');
    expect(stale.ok).toBe(false);
    expect(stale.reason).toBe('bar_changed');
  });

  it('preserves unchanged Bar IDs across unified-document edits while issuing IDs for new lines', () => {
    const current = song();
    ensureEditorSong(asEditorSong(current));
    const before = [...(current.barIds ?? [])];

    reconcileEditorDocumentText(
      asEditorSong(current),
      '[Verse]\nDie Stadt bleibt hell\n\nNacht\nOutro',
    );

    expect(current.barIds?.[0]).toBe(before[0]);
    expect(current.barIds?.[1]).toBe(before[1]);
    expect(current.barIds?.[2]).toBe(before[2]);
    expect(current.barIds?.[3]).toBe(before[3]);
    expect(current.barIds?.[4]).toBeTruthy();
    expect(current.barIds?.[4]).not.toBe(before[3]);
  });


  it('treats native Enter as a unified-document split while retaining the original left Bar ID', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const originalId = current.barIds?.[1];
    const text = editorDocumentText(asEditorSong(current));
    const splitAt = text.indexOf(' bleibt');
    const next = text.slice(0, splitAt) + '\n' + text.slice(splitAt);
    reconcileEditorDocumentText(asEditorSong(current), next);

    expect(current.lines[1]).toBe('Die Stadt');
    expect(current.lines[2]).toBe(' bleibt wach');
    expect(current.barIds?.[1]).toBe(originalId);
    expect(current.barIds?.[2]).toBeTruthy();
    expect(current.barIds?.[2]).not.toBe(originalId);
  });

  it('treats native boundary deletion as a line merge without recycling removed Bar identity', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    reconcileEditorDocumentText(
      asEditorSong(current),
      '[Verse]\nDie Stadt\n bleibt wach\n\nNacht',
    );
    const leftId = current.barIds?.[1];
    const removedId = current.barIds?.[2];

    reconcileEditorDocumentText(
      asEditorSong(current),
      '[Verse]\nDie Stadt bleibt wach\n\nNacht',
    );

    expect(current.lines[1]).toBe('Die Stadt bleibt wach');
    expect(current.barIds?.[1]).toBe(leftId);
    expect(current.barIds).not.toContain(removedId);
  });

  it('treats native multiline paste as one unified-document mutation with stable surrounding IDs', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const before = [...(current.barIds ?? [])];
    const text = editorDocumentText(asEditorSong(current));
    const start = text.indexOf('Stadt');
    const end = start + 'Stadt'.length;
    const pasted = text.slice(0, start) + 'City\nNeon' + text.slice(end);

    reconcileEditorDocumentText(asEditorSong(current), pasted);

    expect(current.lines).toEqual([
      '[Verse]',
      'Die City',
      'Neon bleibt wach',
      '',
      'Nacht',
    ]);
    expect(current.barIds?.[0]).toBe(before[0]);
    expect(current.barIds?.at(-1)).toBe(before.at(-1));
    expect(new Set(current.barIds).size).toBe(current.lines.length);
  });

  it('deduplicates revisions, retains stable snapshots and restores a previous revision', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const first = captureEditorRevision(current, 'startup', 100);
    expect(first.changed).toBe(true);

    const duplicate = captureEditorRevision(current, 'autosave', 110);
    expect(duplicate.changed).toBe(false);
    expect(current.revisions).toHaveLength(1);

    const previous = current.revisions?.[0];
    reconcileEditorDocumentText(asEditorSong(current), '[Verse]\nGeändert');
    const second = captureEditorRevision(current, 'autosave', 200);
    expect(second.changed).toBe(true);
    expect(current.revisions).toHaveLength(2);

    expect(previous).toBeTruthy();
    expect(restoreLegacyEditorRevision(current, previous!)).toBe(true);
    expect(current.lines).toEqual(['[Verse]', 'Die Stadt bleibt wach', '', 'Nacht']);
  });

  it('clears the editor as a new stable Bar identity and drops Bar-scoped runtime state', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const before = snapshotForUndo(current);
    clearLegacyEditorSong(current, 1234);

    expect(current.lines).toEqual(['']);
    expect(current.barIds).toHaveLength(1);
    expect(current.barIds?.[0]).toContain('bar:s1:clear:');
    expect(current.barIds?.[0]).not.toBe(before.barIds[0]);
    expect(current.steps).toEqual({});
    expect(current.performanceCues).toEqual({});
    expect(current.performanceAnchors).toEqual({});
  });

  it('finds only the active non-deleted document', () => {
    const current = song();
    const state: LegacyStudioState = {
      songs: [current],
      active: current.id,
      folders: ['Entwürfe'],
    };
    expect(activeEditorSong(state)?.id).toBe('s1');
    current.deleted = true;
    expect(activeEditorSong(state)).toBeNull();
  });
});
