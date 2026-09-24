import { describe, expect, it } from 'vitest';

import * as legacyDiagnostics from '../../../../../src/studio/diagnostics.mjs';
import * as legacyDevice from '../../../../../src/studio/device-acceptance.mjs';

import {
  collectStudioEnvironmentDiagnostics,
  createStudioDeviceAcceptance,
  mergeStudioDeviceAcceptanceReports,
  studioDeviceAcceptanceSummary,
} from '../../legacy/system';
import {
  collectReactStartupBindingStatus,
  currentDeviceEnvironment,
  loadDeviceAcceptance,
  persistDeviceAcceptance,
  reactStudioDiagnostics,
  resultKeyboardAction,
  updateDeviceGate,
} from './model';

describe('R7 keyboard interaction contract', () => {
  it('moves selection deterministically with Arrow keys', () => {
    expect(resultKeyboardAction('ArrowDown', -1, 4, true)).toEqual({
      type: 'select',
      index: 0,
    });
    expect(resultKeyboardAction('ArrowDown', 2, 4, true)).toEqual({
      type: 'select',
      index: 3,
    });
    expect(resultKeyboardAction('ArrowDown', 3, 4, true)).toEqual({
      type: 'select',
      index: 3,
    });
    expect(resultKeyboardAction('ArrowUp', -1, 4, true)).toEqual({
      type: 'select',
      index: 3,
    });
    expect(resultKeyboardAction('ArrowUp', 0, 4, true)).toEqual({
      type: 'select',
      index: 0,
    });
  });

  it('maps Enter and Space to the registered result actions without stealing unsupported keys', () => {
    expect(resultKeyboardAction('Enter', 1, 3, true)).toEqual({
      type: 'insert',
      index: 1,
    });
    expect(resultKeyboardAction('Enter', 1, 3, false)).toEqual({ type: 'none' });
    expect(resultKeyboardAction(' ', 2, 3, false)).toEqual({
      type: 'toggle-saved',
      index: 2,
    });
    expect(resultKeyboardAction('Escape', 1, 3, true)).toEqual({ type: 'none' });
    expect(resultKeyboardAction('ArrowDown', -1, 0, true)).toEqual({ type: 'none' });
  });
});

describe('R7 startup binding guard', () => {
  function fakeDocument(selectors: string[]) {
    const present = new Set(selectors);
    return {
      querySelector(selector: string) {
        return present.has(selector) ? { selector } : null;
      },
    } as unknown as Document;
  }

  it('requires the shell controls on every surface', () => {
    const status = collectReactStartupBindingStatus(fakeDocument([
      '[data-rhymelab-control="shell.language"]',
      '[data-rhymelab-control="shell.quickstyles"]',
      '[data-rhymelab-control="shell.navigation"]',
    ]));
    expect(status.ok).toBe(true);
    expect(status.missing).toEqual([]);
  });

  it('fails closed when a required shell control is absent', () => {
    const status = collectReactStartupBindingStatus(fakeDocument([
      '[data-rhymelab-control="shell.language"]',
      '[data-rhymelab-control="shell.navigation"]',
    ]));
    expect(status.ok).toBe(false);
    expect(status.missing).toContain('shell.quickstyles');
  });

  it('allows compact Sound Explorer without a layout selector', () => {
    const status = collectReactStartupBindingStatus(fakeDocument([
      '[data-rhymelab-control="shell.language"]',
      '[data-rhymelab-control="shell.quickstyles"]',
      '[data-rhymelab-control="shell.navigation"]',
      '[data-rhymelab-surface="search"]',
      '[data-rhymelab-control="search.filters"]',
    ]));
    expect(status.ok).toBe(true);
    expect(status.missing).toEqual([]);
  });

  it('still requires a layout selector on the full Search page', () => {
    const status = collectReactStartupBindingStatus(fakeDocument([
      '[data-rhymelab-control="shell.language"]',
      '[data-rhymelab-control="shell.quickstyles"]',
      '[data-rhymelab-control="shell.navigation"]',
      '[data-rhymelab-surface="search"]',
      '[data-rhymelab-surface="search"][data-variant="page"]',
      '[data-rhymelab-control="search.filters"]',
    ]));
    expect(status.ok).toBe(false);
    expect(status.missing).toEqual(['search.layout']);
  });

  it('requires language and scope controls only while the filter deck is mounted', () => {
    const status = collectReactStartupBindingStatus(fakeDocument([
      '[data-rhymelab-control="shell.language"]',
      '[data-rhymelab-control="shell.quickstyles"]',
      '[data-rhymelab-control="shell.navigation"]',
      '[data-rhymelab-surface="search"]',
      '[data-rhymelab-control="search.filters"]',
      '[data-rhymelab-control="search.layout"]',
      '[data-rhymelab-filter-deck="true"]',
      '[data-rhymelab-control="search.languages"]',
    ]));
    expect(status.ok).toBe(false);
    expect(status.missing).toEqual(['search.scope']);
  });
});

describe('R7 diagnostics and device acceptance reuse existing accepted models', () => {
  it('keeps diagnostics and device functions on the R1 identity bridge', () => {
    expect(collectStudioEnvironmentDiagnostics).toBe(
      legacyDiagnostics.collectStudioEnvironmentDiagnostics,
    );
    expect(createStudioDeviceAcceptance).toBe(
      legacyDevice.createStudioDeviceAcceptance,
    );
    expect(mergeStudioDeviceAcceptanceReports).toBe(
      legacyDevice.mergeStudioDeviceAcceptanceReports,
    );
  });

  it('normalizes current browser environment without requiring browser globals', () => {
    expect(currentDeviceEnvironment({
      innerWidth: 390,
      innerHeight: 800,
      devicePixelRatio: 2,
      visualViewport: { width: 390, height: 520 },
      navigator: {
        userAgent: 'R7 Test',
        language: 'de-DE',
        platform: 'TestOS',
        maxTouchPoints: 5,
      },
      matchMedia: () => ({ matches: true }),
      AudioContext: function AudioContext() {},
    } as unknown as Window)).toMatchObject({
      userAgent: 'R7 Test',
      viewportWidth: 390,
      viewportHeight: 520,
      devicePixelRatio: 2,
      maxTouchPoints: 5,
      coarsePointer: true,
      audioSupported: true,
      visualViewportSupported: true,
    });
  });

  it('never fabricates passed device evidence from empty local storage', () => {
    const report = loadDeviceAcceptance({ getItem: () => null });
    const summary = studioDeviceAcceptanceSummary(report);
    expect(summary.ready).toBe(false);
    expect(summary.passed).toBe(0);
    expect(summary.total).toBe(7);
  });

  it('persists only explicit eligible manual passes and preserves notes', () => {
    const environment = {
      userAgent: 'Mobile Test',
      platform: 'TestOS',
      viewportWidth: 390,
      viewportHeight: 700,
      devicePixelRatio: 2,
      maxTouchPoints: 5,
      coarsePointer: true,
      audioSupported: true,
      visualViewportSupported: true,
    };
    const base = createStudioDeviceAcceptance({ environment });
    const updated = updateDeviceGate(
      base,
      'mobile.touch',
      true,
      'physical tap pass',
      environment,
      123,
    );
    expect(updated.results['mobile.touch']).toMatchObject({
      passed: true,
      note: 'physical tap pass',
      testedAt: 123,
    });

    let stored = '';
    persistDeviceAcceptance(updated, {
      setItem(_key, value) {
        stored = value;
      },
    });
    expect(studioDeviceAcceptanceSummary(JSON.parse(stored))).toMatchObject({
      passed: 1,
      ready: false,
    });
  });

  it('merges complementary physical reports without overwriting passed evidence', () => {
    const desktop = createStudioDeviceAcceptance({
      environment: {
        viewportWidth: 1440,
        viewportHeight: 900,
        maxTouchPoints: 0,
        audioSupported: true,
        visualViewportSupported: true,
      },
      results: {
        'editor.ime': { passed: true, note: 'desktop IME', testedAt: 10 },
        'perform.metronome': { passed: true, note: 'desktop audio', testedAt: 11 },
      },
      testedAt: 11,
    });
    const mobile = createStudioDeviceAcceptance({
      environment: {
        viewportWidth: 390,
        viewportHeight: 700,
        maxTouchPoints: 5,
        coarsePointer: true,
        audioSupported: true,
        visualViewportSupported: true,
      },
      results: {
        'mobile.navigation': { passed: true, testedAt: 20 },
        'mobile.swap': { passed: true, testedAt: 21 },
        'mobile.keyboard': { passed: true, testedAt: 22 },
        'mobile.touch': { passed: true, testedAt: 23 },
        'mobile.no-hover': { passed: true, testedAt: 24 },
      },
      testedAt: 24,
    });
    const merged = mergeStudioDeviceAcceptanceReports([desktop, mobile]);
    expect(studioDeviceAcceptanceSummary(merged)).toMatchObject({
      passed: 7,
      total: 7,
      ready: true,
    });
  });

  it('combines accepted environment diagnostics with the React startup guard', () => {
    const selectors = new Set([
      '[data-rhymelab-control="shell.language"]',
      '[data-rhymelab-control="shell.quickstyles"]',
      '[data-rhymelab-control="shell.navigation"]',
    ]);
    const report = reactStudioDiagnostics({
      windowObj: {
        innerWidth: 1280,
        innerHeight: 800,
        indexedDB: {},
        localStorage: {},
        AudioContext: function AudioContext() {},
        navigator: {
          userAgent: 'R7',
          language: 'en-US',
          maxTouchPoints: 0,
        },
        matchMedia: () => ({ matches: false }),
      } as unknown as Window,
      documentObj: {
        querySelector(selector: string) {
          return selectors.has(selector) ? {} : null;
        },
      } as unknown as Document,
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
        generated: true,
        generatedDefault: true,
        queryPronunciationRevision: 'r7',
        dataset: { core: 1, generated: 1, total: 2, consistent: true },
        languages: {
          de: { available: true },
          en: { available: true },
        },
      },
    });
    expect(report.startupBindings.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'controls')?.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'document-store')?.ok).toBe(true);
  });
});
