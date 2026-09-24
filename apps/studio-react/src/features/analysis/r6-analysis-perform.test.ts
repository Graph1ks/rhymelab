import { describe, expect, it } from 'vitest';

import type { LegacyStudioSong, SearchState, StudioCapabilities } from '../../legacy/contracts';
import {
  autoMapPerformanceBar,
  clearPerformanceBar,
  ensurePerformanceSong,
  getPerformanceCue,
  moveEditorBar,
  movePerformanceCue,
  performanceBarDurationMs,
  performanceConfig,
  performanceNeedsReview,
  performanceStepDurationMs,
  setEditorBarText,
  setPerformanceConfig,
  setPerformanceCue,
} from '../../legacy/editor';
import { ensureLegacyEditorSong, asEditorSong } from '../editor/model';
import { analysisQueryIdentity } from './data';
import {
  allRhymeBars,
  analysisDocumentSignature,
  analysisSections,
  relationCounts,
  rhymeChainGroups,
  sectionRelations,
  trackedAnalysisDocument,
  type CanonicalAnalysisPayload,
} from './model';

function song(): LegacyStudioSong {
  return {
    id: 's1',
    title: 'R6',
    lines: [
      '[Verse 1]',
      'Nacht [adlib] erwacht',
      'Licht wird Pflicht',
      '',
      '[Hook]',
      'Wir fliegen sacht',
    ],
    revisions: [],
    steps: {},
    performanceCues: {},
    performanceAnchors: {},
  };
}

function searchState(): SearchState {
  return {
    schema: 'rhymelab-search-state-v1',
    anchor: 'Nacht',
    queryBasis: 'de',
    resultLanguage: 'both',
    scope: 'all',
    rhymeType: 'all',
    syllableFilter: 'all',
    sort: 'recommended',
    variantMode: 'preferred',
    historical: false,
    generated: false,
    generatedOnly: false,
    entityCategory: 'all',
    entityCategories: [],
    selectedResultId: '',
  };
}

const capabilities = {
  status: 'ready',
  runtime: 'serving-v1',
  servingV1: true,
  deWriter: true,
  enWriter: true,
  phrases: true,
  entities: true,
  generated: true,
  generatedDefault: false,
  queryPronunciationRevision: 'rev-a',
  dataset: { core: 1, generated: 0, total: 1, consistent: true },
} satisfies StudioCapabilities;

describe('R6 analysis projections', () => {
  it('tracks lyric Bars only and removes inline bracket metadata from canonical analysis text', () => {
    const current = song();
    const document = trackedAnalysisDocument(current);
    expect(document.indexes).toEqual([1, 2, 5]);
    expect(document.lines).toEqual([
      'Nacht erwacht',
      'Licht wird Pflicht',
      'Wir fliegen sacht',
    ]);
    expect(document.endWords).toEqual(['erwacht', 'Pflicht', 'sacht']);
    expect(new Set(document.barIds).size).toBe(3);
  });

  it('derives explicit Sections from bracket rows and blank-line boundaries', () => {
    const sections = analysisSections(song());
    expect(sections).toHaveLength(2);
    expect(sections[0]?.label).toBe('Verse 1');
    expect(sections[0]?.documentLineIndexes).toEqual([1, 2]);
    expect(sections[0]?.analysisLineIndexes).toEqual([0, 1]);
    expect(sections[0]?.barNumbers).toEqual([1, 2]);
    expect(sections[1]?.label).toBe('Hook');
    expect(sections[1]?.documentLineIndexes).toEqual([5]);
  });

  it('builds rhyme-chain groups from the canonical scheme without inventing unknown labels', () => {
    const document = trackedAnalysisDocument(song());
    const groups = rhymeChainGroups(['A', 'B', 'A'], document);
    expect(groups.map((group) => group.label)).toEqual(['A', 'B']);
    expect(groups[0]?.items.map((item) => item.word)).toEqual(['erwacht', 'sacht']);
    expect(rhymeChainGroups(['?', '—', ''], document)).toEqual([]);
  });

  it('projects all-word occurrence relations by Bar and Section', () => {
    const document = trackedAnalysisDocument(song());
    const data: CanonicalAnalysisPayload = {
      occurrences: [
        { index: 0, lineIndex: 0, wordIndex: 0, surface: 'Nacht', normalized: 'nacht' },
        { index: 1, lineIndex: 0, wordIndex: 1, surface: 'erwacht', normalized: 'erwacht' },
        { index: 2, lineIndex: 1, wordIndex: 0, surface: 'Licht', normalized: 'licht' },
      ],
      occurrenceRelations: [
        {
          index: 0,
          left: { index: 0, lineIndex: 0, wordIndex: 0, surface: 'Nacht', normalized: 'nacht' },
          right: { index: 1, lineIndex: 0, wordIndex: 1, surface: 'erwacht', normalized: 'erwacht' },
          type: 'perfect',
          label: 'Vollreim',
          score: 0.9,
          primary: true,
          language: 'de',
          sameBar: true,
        },
        {
          index: 1,
          left: { index: 1, lineIndex: 0, wordIndex: 1, surface: 'erwacht', normalized: 'erwacht' },
          right: { index: 2, lineIndex: 1, wordIndex: 0, surface: 'Licht', normalized: 'licht' },
          type: 'assonance',
          label: 'Assonanz',
          score: 0.5,
          primary: false,
          language: 'de',
          sameBar: false,
        },
      ],
    };

    const bars = allRhymeBars(document, data);
    expect(bars[0]?.relations).toHaveLength(2);
    expect(bars[0]?.counts).toEqual({ perfect: 1, assonance: 1 });
    expect(bars[2]?.relations).toHaveLength(0);

    const verse = analysisSections(song())[0]!;
    const internal = sectionRelations(verse, data.occurrenceRelations!);
    expect(internal).toHaveLength(2);
    expect(relationCounts(internal)).toEqual({ perfect: 1, assonance: 1 });
  });

  it('keys canonical queries by stable Bar revisions, language, pronunciation revision and runtime DB', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const before = analysisQueryIdentity(current, searchState(), capabilities, 'standard', 'end');
    const signatureBefore = analysisDocumentSignature(current);
    setEditorBarText(asEditorSong(current), 1, 'Nacht neu erwacht');
    const after = analysisQueryIdentity(current, searchState(), capabilities, 'standard', 'end');
    const signatureAfter = analysisDocumentSignature(current);
    expect(signatureAfter).not.toBe(signatureBefore);
    expect(after).not.toEqual(before);

    const english = searchState();
    english.queryBasis = 'en';
    expect(analysisQueryIdentity(current, english, capabilities, 'full', 'all'))
      .not.toEqual(after);
  });
});

describe('R6 performance contracts through the existing R1 bridge', () => {
  it('normalizes the canonical default performance config', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const editorSong = asEditorSong(current);
    ensurePerformanceSong(editorSong);
    expect(performanceConfig(editorSong)).toEqual({
      bpm: 92,
      grid: 16,
      feel: 'straight',
      tempoScale: 1,
      pauseLength: 1,
    });
  });

  it('writes and erases cue types by stable Bar ID, including pause length', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const editorSong = asEditorSong(current);
    ensurePerformanceSong(editorSong);
    const barId = editorSong.barIds[1]!;

    setPerformanceConfig(editorSong, { pauseLength: 3 });
    expect(setPerformanceCue(editorSong, barId, 4, 'pause')?.length).toBe(3);
    expect(getPerformanceCue(editorSong, barId, 4)).toEqual({ type: 'pause', length: 3 });
    expect(performanceNeedsReview(editorSong, barId)).toBe(false);

    setPerformanceCue(editorSong, barId, 4, 'erase');
    expect(getPerformanceCue(editorSong, barId, 4)).toBeNull();
  });

  it('moves cues with the same accessible source-target semantics as drag/drop', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const editorSong = asEditorSong(current);
    ensurePerformanceSong(editorSong);
    const barId = editorSong.barIds[1]!;
    setPerformanceCue(editorSong, barId, 2, 'hit');

    expect(movePerformanceCue(editorSong, barId, 2, 7)).toBe(true);
    expect(getPerformanceCue(editorSong, barId, 2)).toBeNull();
    expect(getPerformanceCue(editorSong, barId, 7)?.type).toBe('hit');
  });

  it('auto-maps estimated syllable slots deterministically and clears them again', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const editorSong = asEditorSong(current);
    ensurePerformanceSong(editorSong);
    const barId = editorSong.barIds[1]!;

    expect(autoMapPerformanceBar(editorSong, barId, 4)).toEqual([0, 4, 8, 12]);
    expect(getPerformanceCue(editorSong, barId, 0)?.type).toBe('accent');
    expect(clearPerformanceBar(editorSong, barId)).toBe(4);
    expect(getPerformanceCue(editorSong, barId, 0)).toBeNull();
  });

  it('keeps cues on stable Bar IDs across reorder and flags them after text revision', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const editorSong = asEditorSong(current);
    ensurePerformanceSong(editorSong);
    const barId = editorSong.barIds[1]!;

    setPerformanceCue(editorSong, barId, 0, 'accent');
    expect(moveEditorBar(editorSong, 1, 5)?.moved).toBe(true);
    expect(getPerformanceCue(editorSong, barId, 0)?.type).toBe('accent');

    const movedIndex = editorSong.barIds.indexOf(barId);
    setEditorBarText(editorSong, movedIndex, 'Geänderter Bar Text');
    expect(performanceNeedsReview(editorSong, barId)).toBe(true);
  });

  it('derives straight, triplet, half-time and double-time timing from one config', () => {
    const current = song();
    ensureLegacyEditorSong(current);
    const editorSong = asEditorSong(current);
    ensurePerformanceSong(editorSong);

    setPerformanceConfig(editorSong, { bpm: 120, grid: 16, feel: 'straight', tempoScale: 1 });
    const straight = performanceStepDurationMs(editorSong, 0);
    const normalBar = performanceBarDurationMs(editorSong);
    expect(straight).toBeCloseTo(125, 5);
    expect(normalBar).toBeCloseTo(2000, 5);

    setPerformanceConfig(editorSong, { feel: 'triplet' });
    expect(performanceStepDurationMs(editorSong, 0))
      .toBeCloseTo(straight * 4 / 3, 5);
    expect(performanceStepDurationMs(editorSong, 1))
      .toBeCloseTo(straight * 2 / 3, 5);

    setPerformanceConfig(editorSong, { feel: 'straight', tempoScale: 2 });
    expect(performanceBarDurationMs(editorSong)).toBeCloseTo(normalBar / 2, 5);
    setPerformanceConfig(editorSong, { tempoScale: 0.5 });
    expect(performanceBarDurationMs(editorSong)).toBeCloseTo(normalBar * 2, 5);
  });
});
