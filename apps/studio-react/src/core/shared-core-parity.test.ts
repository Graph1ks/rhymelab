import { describe, expect, expectTypeOf, it } from 'vitest';

import * as searchBridge from './search';
import * as documentBridge from './documents';
import * as editorBridge from './editor';
import * as serviceBridge from './services';
import * as systemBridge from './system';

import * as sharedSearchState from '../../../../packages/shared-core/src/search/search-state.mjs';
import * as sharedPronunciation from '../../../../packages/shared-core/src/search/query-pronunciation-client.mjs';
import * as webPronunciationCache from '../../../../packages/platform-web/src/query-pronunciation-cache.mjs';
import * as sharedSearchAdapter from '../../../../packages/shared-core/src/search/search-adapter.mjs';
import * as sharedCapabilityAdapter from '../../../../packages/shared-core/src/search/capability-adapter.mjs';
import * as sharedRuntimeEditions from '../../../../packages/shared-core/src/search/runtime-editions.mjs';
import * as sharedDocumentModel from '../../../../packages/shared-core/src/document/document-model.mjs';
import * as webDocumentStore from '../../../../packages/platform-web/src/document-store.mjs';
import * as webDocumentAdapter from '../../../../packages/platform-web/src/document-adapter.mjs';
import * as sharedBackup from '../../../../packages/shared-core/src/document/backup-portability.mjs';
import * as sharedEditor from '../../../../packages/shared-core/src/editor/editor-session.mjs';
import * as sharedHistory from '../../../../packages/shared-core/src/editor/edit-history.mjs';
import * as sharedPerformance from '../../../../packages/shared-core/src/editor/performance-session.mjs';
import * as sharedRevisionDiff from '../../../../packages/shared-core/src/editor/revision-diff.mjs';
import * as sharedAnalysis from '../../../../packages/shared-core/src/services/analysis-adapter.mjs';
import * as sharedDetail from '../../../../packages/shared-core/src/services/detail-adapter.mjs';
import * as webDiagnostics from '../../../../packages/platform-web/src/diagnostics.mjs';
import * as webDevice from '../../../../packages/platform-web/src/device-acceptance.mjs';

import type {
  EditorSong,
  SearchState,
  StudioDocumentSnapshot,
  StudioDiagnostics,
  WriterSearchResult,
} from './contracts';

function expectIdentity(
  bridge: Record<string, unknown>,
  authoritative: Record<string, unknown>,
  names: readonly string[],
) {
  for (const name of names) {
    expect(bridge[name], name).toBe(authoritative[name]);
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe('Shared Core boundary keeps authoritative implementations centralized', () => {
  it('re-exports SearchState, pronunciation, Writer and capability functions by identity', () => {
    expectIdentity(searchBridge, sharedSearchState, [
      'createSearchState',
      'patchSearchState',
      'loadSearchState',
      'saveSearchState',
      'searchStateFromUrl',
      'writeSearchStateToUrl',
      'searchStateToWriterParams',
    ]);
    expectIdentity(searchBridge, sharedPronunciation, [
      'normalizeClientSurface',
      'tokenizeClientPronunciationInput',
      'generateClientIpa',
      'resolveUnknownClientPronunciation',
    ]);
    expectIdentity(searchBridge, webPronunciationCache, [
      'generatedPronunciationCacheKey',
      'buildGeneratedPronunciationCacheRecord',
      'isGeneratedPronunciationCacheRecordUsable',
      'readGeneratedPronunciationCache',
      'writeGeneratedPronunciationCache',
    ]);
    expectIdentity(searchBridge, sharedSearchAdapter, [
      'estimateSyllables',
      'writerScope',
      'writerRelationType',
      'writerRelationGroup',
      'writerRelationLabel',
      'mapWriterResult',
      'buildWriterParams',
      'createWriterSearchClient',
    ]);
    expectIdentity(searchBridge, sharedCapabilityAdapter, [
      'normalizeStudioCapabilities',
      'loadStudioCapabilities',
    ]);
    expect(searchBridge.normalizeRuntimeEdition).toBe(sharedRuntimeEditions.normalizeRuntimeEdition);
    expect(searchBridge.loadRuntimeEditionSelection).toBe(sharedRuntimeEditions.loadRuntimeEditionSelection);
    expect(searchBridge.saveRuntimeEditionSelection).toBe(sharedRuntimeEditions.saveRuntimeEditionSelection);
    expect(searchBridge.runtimeEditionSummaryMap).toBe(sharedRuntimeEditions.runtimeEditionSummaryMap);
    expect(searchBridge.capabilitiesForRuntimeEdition).toBe(sharedRuntimeEditions.capabilitiesForRuntimeEdition);
  });

  it('re-exports document, persistence and backup functions by identity', () => {
    expectIdentity(documentBridge, sharedDocumentModel, [
      'serializeLegacyStudioBackup',
      'migrateLegacyStudioState',
      'validateStudioDocumentSnapshot',
      'barsForSong',
      'songText',
      'replaceBarText',
      'splitBar',
      'removeBar',
      'captureSongRevision',
      'replaceSelection',
    ]);
    expectIdentity(documentBridge, webDocumentStore, [
      'openStudioDocumentDatabase',
      'createStudioDocumentStore',
      'migrateLegacyStudioStateToStore',
      'shadowLegacyStudioStateToStore',
    ]);
    expectIdentity(documentBridge, webDocumentAdapter, [
      'createStudioState',
      'loadStudioState',
      'writeStudioState',
      'loadStudioDocumentSnapshot',
      'studioPreferencesFromState',
      'loadStudioPreferences',
      'writeStudioPreferences',
      'studioStateFromDocumentSnapshot',
    ]);
    expectIdentity(documentBridge, sharedBackup, [
      'createPortableStudioBackup',
      'parsePortableStudioBackup',
      'portableBackupFilename',
    ]);
  });

  it('re-exports editor, undo, performance and revision functions by identity', () => {
    expectIdentity(editorBridge, sharedEditor, [
      'ensureEditorSong',
      'barIdentity',
      'editorBracketSegments',
      'editorTrackableText',
      'editorLineKind',
      'isTrackedEditorLine',
      'trackedEditorLineIndexes',
      'trackedEditorBarNumber',
      'editorDocumentText',
      'editorLineStartOffset',
      'editorPositionFromOffset',
      'reconcileEditorDocumentText',
      'replaceEditorDocumentRange',
      'editorSnapshot',
      'restoreEditorSnapshot',
      'setEditorBarText',
      'splitEditorBar',
      'insertEditorBar',
      'duplicateEditorBar',
      'removeEditorBar',
      'moveEditorBar',
      'mergeEditorBarWithPrevious',
      'pasteEditorText',
      'createSelectionProof',
      'validateSelectionProof',
    ]);
    expectIdentity(editorBridge, sharedHistory, [
      'typingInputIsCoalescible',
      'createTypingUndoCoalescer',
    ]);
    expectIdentity(editorBridge, sharedPerformance, [
      'ensurePerformanceSong',
      'performanceConfig',
      'setPerformanceConfig',
      'getPerformanceCue',
      'setPerformanceCue',
      'movePerformanceCue',
      'clearPerformanceBar',
      'markPerformanceReviewed',
      'performanceNeedsReview',
      'autoMapPerformanceBar',
      'performanceBarMetrics',
      'performanceStepDurationMs',
      'performanceBarDurationMs',
      'performanceFlowFingerprint',
      'performancePocketMetrics',
      'performancePreviousBarPlacements',
      'performanceSyllablesPerSecond',
      'performanceCueSymbol',
    ]);
    expectIdentity(editorBridge, sharedRevisionDiff, [
      'revisionSnapshotBars',
      'compareEditorRevisions',
      'revisionDiffLabel',
    ]);
  });

  it('re-exports analysis, detail, diagnostics and device-acceptance functions by identity', () => {
    expectIdentity(serviceBridge, sharedAnalysis, [
      'studioAnalysisOccurrences',
      'expandStudioRhymeRelations',
      'studioRhymeTypeCounts',
      'extractStudioEndWord',
      'studioAnalysisWords',
      'createStudioAnalysisClient',
    ]);
    expectIdentity(serviceBridge, sharedDetail, [
      'studioDetailKey',
      'createStudioDetailClient',
      'buildStudioDetailModel',
    ]);
    expectIdentity(systemBridge, webDiagnostics, [
      'collectStudioEnvironmentDiagnostics',
      'diagnosticsFilename',
    ]);
    expectIdentity(systemBridge, webDevice, [
      'studioDeviceGateEnvironmentStatus',
      'studioDeviceEnvironmentLabel',
      'createStudioDeviceAcceptance',
      'mergeStudioDeviceAcceptanceReports',
      'studioDeviceAcceptanceSummary',
      'parseStudioDeviceAcceptance',
      'studioDeviceAcceptanceFilename',
    ]);
  });
});

describe('Shared Core preserves representative domain semantics', () => {
  it('preserves normalized SearchState, URL and Writer parameter semantics', () => {
    const state: SearchState = searchBridge.createSearchState({
      anchor: '  Nacht  ',
      queryBasis: 'de',
      resultLanguage: 'both',
      scope: 'entities',
      rhymeType: 'assonance',
      syllableFilter: 'near2',
      entityCategories: ['person', 'musician', 'person'],
    });

    expect(state.anchor).toBe('Nacht');
    expect(state.entityCategories).toEqual(['person', 'musician']);
    expect(searchBridge.searchStateToWriterParams(state).get('entity_categories')).toBe('person,musician');
    expect(searchBridge.searchStateToWriterParams(state).get('syllables')).toBe('near2');

    const url = searchBridge.writeSearchStateToUrl('http://rhymelab.local/', state);
    expect(searchBridge.searchStateFromUrl(url)).toEqual(state);
  });

  it('preserves client pronunciation and revision-gated cache-record semantics', async () => {
    const generated = searchBridge.generateClientIpa('TRAG', 'de');
    expect(generated.ipa).toBe('ˈtRaːk');
    expect(generated.policy).toBe(searchBridge.CLIENT_QUERY_PRONUNCIATION_POLICY);

    const record = searchBridge.buildGeneratedPronunciationCacheRecord(
      generated,
      'db-r1',
      123,
    );
    expect(record?.createdAt).toBe(123);
    expect(searchBridge.isGeneratedPronunciationCacheRecordUsable(record, {
      surface: 'TRAG',
      language: 'de',
      policy: searchBridge.CLIENT_QUERY_PRONUNCIATION_POLICY,
      databaseRevision: 'db-r1',
    })).toBe(true);

    const chained = await searchBridge.resolveUnknownClientPronunciation(
      'heute Baladur',
      'de',
      {
        lookupReference: async (surface) => surface === 'heute'
          ? { surface: 'heute', preferredIpa: 'ˈhɔʏtə' }
          : null,
      },
    );
    expect(chained?.method).toBe('client_token_chain');
    expect(chained?.sourceBackedTokens).toEqual(['heute']);
    expect(chained?.generatedTokens).toEqual(['Baladur']);
  });

  it('preserves document migration, stable bars, revisions and portable backup round-trip', async () => {
    const migration = documentBridge.migrateLegacyStudioState({
      active: 'song',
      folders: ['Drafts'],
      songs: [{
        id: 'song',
        title: 'R1',
        folder: 'Drafts',
        lines: ['alpha', 'beta'],
        revisions: [],
      }],
    });

    const snapshot: StudioDocumentSnapshot = migration.snapshot;
    expect(documentBridge.songText(snapshot, 'song')).toBe('alpha\nbeta');
    const firstId = documentBridge.barsForSong(snapshot, 'song')[0]?.id;
    expect(firstId).toBeTruthy();

    const split = documentBridge.splitBar(snapshot, firstId!, 2);
    expect(split.changed).toBe(true);
    expect(split.left?.id).toBe(firstId);
    expect(split.right?.id).not.toBe(firstId);

    const revision = documentBridge.captureSongRevision(
      split.snapshot,
      'song',
      { reason: 'r1', createdAt: 999 },
    );
    expect(revision.revision?.createdAt).toBe(999);

    const backup = documentBridge.createPortableStudioBackup({
      snapshot: revision.snapshot,
      preferences: { theme: 'dark' },
      searchState: { anchor: 'Nacht' },
      exportedAt: 1000,
    });
    const parsed = documentBridge.parsePortableStudioBackup(JSON.stringify(backup));
    expect(parsed.snapshot).toEqual(revision.snapshot);

    const unavailableStore = documentBridge.createStudioDocumentStore({ indexedDBImpl: null });
    expect(await unavailableStore.available()).toBe(false);
    unavailableStore.close();
  });

  it('preserves editor identity, selection proofs, multiline paste and performance cue ownership', () => {
    const song: EditorSong = {
      id: 'song-r1',
      lines: ['Alpha beta', 'Gamma'],
      barIds: ['bar-a', 'bar-b'],
      barRevisions: [0, 0],
      editorNextBarId: 1,
      steps: {},
      performance: {},
      performanceCues: {},
      performanceAnchors: {},
    };

    editorBridge.ensureEditorSong(song);
    const proof = editorBridge.createSelectionProof(song, { index: 0, start: 0, end: 5 });
    expect(proof?.barId).toBe('bar-a');
    expect(editorBridge.validateSelectionProof(song, proof).valid).toBe(true);

    const pasted = editorBridge.pasteEditorText(song, 1, 5, 5, '\nDelta');
    expect(pasted?.insertedBarIds).toHaveLength(2);
    expect(song.barIds[0]).toBe('bar-a');

    editorBridge.setPerformanceConfig(song, {
      bpm: 100,
      grid: 16,
      feel: 'straight',
      tempoScale: 1,
      pauseLength: 2,
    });
    expect(editorBridge.setPerformanceCue(song, 'bar-a', 0, 'accent')).toEqual({
      type: 'accent',
      length: 1,
    });
    expect(editorBridge.performanceBarMetrics(song, 'bar-a').accents).toBe(1);

    const snapshot = editorBridge.editorSnapshot(song);
    editorBridge.setEditorBarText(song, 0, 'Changed');
    expect(editorBridge.validateSelectionProof(song, proof).reason).toBe('bar_changed');
    expect(editorBridge.restoreEditorSnapshot(song, snapshot)).toBe(true);
    expect(song.lines[0]).toBe('Alpha beta');
  });

  it('preserves typing-burst undo boundaries and full revision diff behavior', () => {
    const coalescer = editorBridge.createTypingUndoCoalescer({ windowMs: 1000 });
    expect(coalescer.shouldCheckpoint({
      songId: 'song',
      barId: 'bar',
      inputType: 'insertText',
      now: 100,
    })).toBe(true);
    expect(coalescer.shouldCheckpoint({
      songId: 'song',
      barId: 'bar',
      inputType: 'insertText',
      now: 200,
    })).toBe(false);
    coalescer.noteBoundary();
    expect(coalescer.shouldCheckpoint({
      songId: 'song',
      barId: 'bar',
      inputType: 'insertText',
      now: 300,
    })).toBe(true);

    const diff = editorBridge.compareEditorRevisions(
      {
        lines: ['B', 'A'],
        barIds: ['b', 'a'],
        barRevisions: [0, 0],
        editorNextBarId: 1,
        steps: {},
        performance: {},
        performanceCues: {},
        performanceAnchors: {},
      },
      {
        snapshot: {
          lines: ['A', 'B'],
          barIds: ['a', 'b'],
          barRevisions: [0, 0],
        },
      },
    );
    expect(diff.summary.moved).toBeGreaterThan(0);
  });

  it('preserves analysis and detail mapping semantics', () => {
    const occurrences = serviceBridge.studioAnalysisOccurrences(['Haus Maus', 'Haus']);
    const relations = serviceBridge.expandStudioRhymeRelations({
      language: 'de',
      pairs: [{
        left: 'haus',
        right: 'maus',
        type: 'perfect',
        label: 'Vollreim',
        score: 1,
        primary: true,
        language: 'de',
      }],
    }, occurrences);
    expect(serviceBridge.studioRhymeTypeCounts(relations)).toEqual({
      perfect: 2,
      identity: 1,
    });

    const row = searchBridge.mapWriterResult({
      resultKind: 'word',
      language: 'de',
      resultId: 'nacht',
      word: 'Nacht',
      syllableCount: 1,
      primaryType: 'perfect',
      score: 0.98,
      ipa: 'naxt',
    });
    const detail = serviceBridge.buildStudioDetailModel(row, null);
    expect(detail.word).toBe('Nacht');
    expect(detail.language).toBe('DE');
    expect(detail.relationType).toBe('perfect');
  });

  it('preserves capability normalization and available runtime-edition fallback order', () => {
    const capabilities = searchBridge.normalizeStudioCapabilities({
      status: 'ok',
      serving_v1: { enabled: true },
      writer_database: 'db',
      english_available: true,
      phrase_available: true,
      entity_available: true,
      generated_optin: { available: true, default_enabled: true },
      query_pronunciation_revision: 'r1',
    }, {
      totals: { core: 10, generated: 2, total: 12, consistent: true },
    });
    expect(capabilities.servingV1).toBe(true);
    expect(capabilities.queryPronunciationRevision).toBe('r1');

    const payload = {
      enabled: true,
      defaultDatabase: 'standard',
      databases: [
        { id: 'lite', available: true },
        { id: 'standard', available: false },
        { id: 'full', available: true },
      ],
    };
    expect(searchBridge.chooseAvailableRuntimeEdition(payload)).toBe('full');
    expect(searchBridge.chooseAvailableRuntimeEdition(payload, 'lite')).toBe('lite');

    const storage = memoryStorage();
    expect(searchBridge.saveRuntimeEditionSelection('full', storage)).toBe('full');
    expect(searchBridge.loadRuntimeEditionSelection(storage)).toBe('full');
  });

  it('preserves diagnostics and the seven-gate device acceptance model', () => {
    const report: StudioDiagnostics = systemBridge.collectStudioEnvironmentDiagnostics({
      windowObj: {
        innerWidth: 390,
        innerHeight: 844,
        devicePixelRatio: 2,
        isSecureContext: true,
        indexedDB: {},
        localStorage: {},
        AudioContext: function AudioContext() {},
        visualViewport: { width: 390, height: 844 },
        navigator: {
          maxTouchPoints: 5,
          language: 'de-DE',
          userAgent: 'R1',
        },
        matchMedia: (query: string) => ({
          matches: query.includes('pointer: coarse'),
        }),
      },
      documentStoreStatus: 'ready',
      documentStoreAuthority: true,
      writerStatus: 'ready',
      writerCapabilities: {
        status: 'ready',
        runtime: 'serving-v1',
        servingV1: true,
        deWriter: true,
        enWriter: true,
        phrases: true,
        entities: true,
        generated: false,
        generatedDefault: false,
        queryPronunciationRevision: 'r1',
        dataset: { core: 1, generated: 0, total: 1, consistent: true },
        languages: { de: { available: true } },
      },
      controlsBound: true,
    });
    expect(report.summary.failing).toEqual([]);

    expect(systemBridge.STUDIO_DEVICE_GATES).toHaveLength(7);
    const environment = {
      platform: 'Mobile R1',
      viewportWidth: 390,
      viewportHeight: 844,
      maxTouchPoints: 5,
      coarsePointer: true,
      audioSupported: true,
      visualViewportSupported: true,
    };
    const acceptance = systemBridge.createStudioDeviceAcceptance({
      environment,
      results: Object.fromEntries(
        systemBridge.STUDIO_DEVICE_GATES.map((gate) => [
          gate.id,
          { passed: true, environment },
        ]),
      ),
      testedAt: 123,
    });
    expect(systemBridge.studioDeviceAcceptanceSummary(acceptance).ready).toBe(true);
  });
});

describe('Shared Core contracts are consumable from strict TypeScript', () => {
  it('exposes typed search and diagnostics surfaces', async () => {
    const state = searchBridge.createSearchState({ anchor: 'Nacht' });
    expectTypeOf(state).toEqualTypeOf<SearchState>();

    const idle = await searchBridge.createWriterSearchClient({
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    }).search({ query: '' });
    expectTypeOf(idle).toEqualTypeOf<WriterSearchResult>();

    const diagnostic = systemBridge.collectStudioEnvironmentDiagnostics({
      windowObj: {},
      documentObj: {},
    });
    expectTypeOf(diagnostic).toEqualTypeOf<StudioDiagnostics>();
  });
});
