import type {
  DeviceEnvironment,
  StudioCapabilities,
  StudioDeviceAcceptance,
  StudioDiagnostics,
} from '../../legacy/contracts';
import {
  STUDIO_DEVICE_GATES,
  collectStudioEnvironmentDiagnostics,
  createStudioDeviceAcceptance,
  parseStudioDeviceAcceptance,
  studioDeviceAcceptanceSummary,
} from '../../legacy/system';

export const DEVICE_ACCEPTANCE_STORAGE_KEY = 'rhymelab.studio.deviceAcceptance.v1';

export type ResultKeyboardAction =
  | { type: 'none' }
  | { type: 'select'; index: number }
  | { type: 'insert'; index: number }
  | { type: 'toggle-saved'; index: number };

export function resultKeyboardAction(
  key: string,
  selectedIndex: number,
  rowCount: number,
  canInsert: boolean,
): ResultKeyboardAction {
  if (!Number.isInteger(rowCount) || rowCount <= 0) return { type: 'none' };
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const delta = key === 'ArrowDown' ? 1 : -1;
    const current = selectedIndex < 0
      ? (delta > 0 ? -1 : rowCount)
      : selectedIndex;
    return {
      type: 'select',
      index: Math.max(0, Math.min(rowCount - 1, current + delta)),
    };
  }
  if (key === 'Enter' && selectedIndex >= 0 && selectedIndex < rowCount && canInsert) {
    return { type: 'insert', index: selectedIndex };
  }
  if (key === ' ' && selectedIndex >= 0 && selectedIndex < rowCount) {
    return { type: 'toggle-saved', index: selectedIndex };
  }
  return { type: 'none' };
}

export interface StartupBindingCheck {
  id: string;
  selector: string;
  required: boolean;
  present: boolean;
}

export interface StartupBindingStatus {
  ok: boolean;
  checks: StartupBindingCheck[];
  missing: string[];
}

export const REACT_STUDIO_STARTUP_CONTROLS = Object.freeze([
  ['shell.language', '[data-rhymelab-control="shell.language"]', true],
  ['shell.quickstyles', '[data-rhymelab-control="shell.quickstyles"]', true],
  ['shell.navigation', '[data-rhymelab-control="shell.navigation"]', true],
  ['search.languages', '[data-rhymelab-control="search.languages"]', false],
  ['search.scope', '[data-rhymelab-control="search.scope"]', false],
  ['search.layout', '[data-rhymelab-control="search.layout"]', false],
] as const);

export function collectReactStartupBindingStatus(
  documentObj: Pick<Document, 'querySelector'> | null | undefined = globalThis.document,
): StartupBindingStatus {
  const checks = REACT_STUDIO_STARTUP_CONTROLS.map(([id, selector, globallyRequired]) => {
    const present = Boolean(documentObj?.querySelector?.(selector));
    const searchMounted = Boolean(
      documentObj?.querySelector?.('[data-rhymelab-surface="search"]'),
    );
    return {
      id,
      selector,
      required: globallyRequired || searchMounted,
      present,
    };
  });
  const missing = checks.filter((check) => check.required && !check.present).map((check) => check.id);
  return { ok: missing.length === 0, checks, missing };
}

export function currentDeviceEnvironment(
  windowObj: Window | Record<string, unknown> = typeof window === 'undefined' ? {} : window,
): DeviceEnvironment {
  const value = (windowObj ?? {}) as Partial<Window> & {
    webkitAudioContext?: typeof AudioContext;
    navigator?: Navigator & { userAgentData?: { platform?: string } };
  };
  const viewport = value.visualViewport ?? null;
  let coarsePointer = false;
  try {
    coarsePointer = value.matchMedia?.('(pointer: coarse)')?.matches === true;
  } catch {
    coarsePointer = false;
  }
  return {
    userAgent: value.navigator?.userAgent || '',
    language: value.navigator?.language || '',
    platform: value.navigator?.userAgentData?.platform || value.navigator?.platform || '',
    viewportWidth: Number(viewport?.width || value.innerWidth || 0),
    viewportHeight: Number(viewport?.height || value.innerHeight || 0),
    devicePixelRatio: Number(value.devicePixelRatio || 1),
    maxTouchPoints: Number(value.navigator?.maxTouchPoints || 0),
    coarsePointer,
    audioSupported: Boolean(value.AudioContext || value.webkitAudioContext),
    visualViewportSupported: Boolean(viewport),
  };
}

export function loadDeviceAcceptance(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): StudioDeviceAcceptance {
  try {
    const raw = storage?.getItem?.(DEVICE_ACCEPTANCE_STORAGE_KEY);
    if (raw) return parseStudioDeviceAcceptance(raw);
  } catch {
    // Invalid or unavailable local storage must not fabricate passed evidence.
  }
  return createStudioDeviceAcceptance({ environment: currentDeviceEnvironment() });
}

export function persistDeviceAcceptance(
  report: StudioDeviceAcceptance,
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): StudioDeviceAcceptance {
  storage?.setItem?.(DEVICE_ACCEPTANCE_STORAGE_KEY, JSON.stringify(report));
  return report;
}

export function updateDeviceGate(
  report: StudioDeviceAcceptance,
  gateId: string,
  passed: boolean,
  note = '',
  environment: DeviceEnvironment = currentDeviceEnvironment(),
  testedAt = Date.now(),
): StudioDeviceAcceptance {
  const results = Object.fromEntries(
    STUDIO_DEVICE_GATES.map((gate) => [
      gate.id,
      gate.id === gateId
        ? { passed, note, environment, testedAt }
        : report.results?.[gate.id] ?? { passed: false },
    ]),
  );
  return createStudioDeviceAcceptance({
    environment,
    results,
    notes: report.notes,
    testedAt,
  });
}

export function reactStudioDiagnostics(options: {
  windowObj?: Window | Record<string, unknown>;
  documentObj?: Document | Record<string, unknown>;
  documentStoreStatus?: string;
  documentStoreAuthority?: boolean;
  writerStatus?: string;
  writerCapabilities?: StudioCapabilities | null;
  writerRuntimeTiming?: Record<string, unknown> | null;
} = {}): StudioDiagnostics & {
  startupBindings: StartupBindingStatus;
  deviceAcceptance: ReturnType<typeof studioDeviceAcceptanceSummary>;
} {
  const documentObj = (options.documentObj
    ?? (typeof document === 'undefined' ? undefined : document)) as Document | undefined;
  const startupBindings = collectReactStartupBindingStatus(documentObj);
  const diagnostics = collectStudioEnvironmentDiagnostics({
    ...options,
    documentObj,
    controlsBound: startupBindings.ok,
  });
  const deviceAcceptance = studioDeviceAcceptanceSummary(loadDeviceAcceptance());
  return {
    ...diagnostics,
    startupBindings,
    deviceAcceptance,
  };
}

export function serializeJsonDownload(
  payload: unknown,
): string {
  return JSON.stringify(payload, null, 2) + '\n';
}
