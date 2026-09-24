import * as legacyDiagnostics from '../../../../src/studio/diagnostics.mjs';
import * as legacyDeviceAcceptance from '../../../../src/studio/device-acceptance.mjs';

import type {
  DeviceEnvironment,
  StudioCapabilities,
  StudioDeviceAcceptance,
  StudioDeviceGate,
  StudioDiagnostics,
} from './contracts';

type DiagnosticsApi = {
  STUDIO_DIAGNOSTICS_SCHEMA: string;
  collectStudioEnvironmentDiagnostics(options?: {
    windowObj?: Window | Record<string, unknown>;
    documentObj?: Document | Record<string, unknown>;
    documentStoreStatus?: string;
    documentStoreAuthority?: boolean;
    writerStatus?: string;
    writerCapabilities?: StudioCapabilities | null;
    writerRuntimeTiming?: Record<string, unknown> | null;
    controlsBound?: boolean;
  }): StudioDiagnostics;
  diagnosticsFilename(date?: Date): string;
};

type DeviceApi = {
  STUDIO_DEVICE_ACCEPTANCE_SCHEMA: string;
  STUDIO_DEVICE_ACCEPTANCE_VERSION: number;
  STUDIO_DEVICE_GATES: readonly StudioDeviceGate[];
  studioDeviceGateEnvironmentStatus(gateId: string, environment?: DeviceEnvironment): {
    eligible: boolean;
    reason: string;
    failures: string[];
    environment: Required<DeviceEnvironment>;
  };
  studioDeviceEnvironmentLabel(environment?: DeviceEnvironment): string;
  createStudioDeviceAcceptance(options?: {
    environment?: DeviceEnvironment;
    results?: Record<string, boolean | {
      passed?: boolean;
      note?: string;
      testedAt?: number;
      environment?: DeviceEnvironment;
    }>;
    notes?: string;
    testedAt?: number;
  }): StudioDeviceAcceptance;
  mergeStudioDeviceAcceptanceReports(
    inputs: StudioDeviceAcceptance | StudioDeviceAcceptance[],
  ): StudioDeviceAcceptance;
  studioDeviceAcceptanceSummary(report: StudioDeviceAcceptance): {
    total: number;
    passed: number;
    passedIds: string[];
    pending: string[];
    ready: boolean;
  };
  parseStudioDeviceAcceptance(input: string | unknown): StudioDeviceAcceptance;
  studioDeviceAcceptanceFilename(date?: Date): string;
};

const diagnosticsApi = legacyDiagnostics as unknown as DiagnosticsApi;
const deviceApi = legacyDeviceAcceptance as unknown as DeviceApi;

export const STUDIO_DIAGNOSTICS_SCHEMA = diagnosticsApi.STUDIO_DIAGNOSTICS_SCHEMA;
export const collectStudioEnvironmentDiagnostics = diagnosticsApi.collectStudioEnvironmentDiagnostics;
export const diagnosticsFilename = diagnosticsApi.diagnosticsFilename;

export const STUDIO_DEVICE_ACCEPTANCE_SCHEMA = deviceApi.STUDIO_DEVICE_ACCEPTANCE_SCHEMA;
export const STUDIO_DEVICE_ACCEPTANCE_VERSION = deviceApi.STUDIO_DEVICE_ACCEPTANCE_VERSION;
export const STUDIO_DEVICE_GATES = deviceApi.STUDIO_DEVICE_GATES;
export const studioDeviceGateEnvironmentStatus = deviceApi.studioDeviceGateEnvironmentStatus;
export const studioDeviceEnvironmentLabel = deviceApi.studioDeviceEnvironmentLabel;
export const createStudioDeviceAcceptance = deviceApi.createStudioDeviceAcceptance;
export const mergeStudioDeviceAcceptanceReports = deviceApi.mergeStudioDeviceAcceptanceReports;
export const studioDeviceAcceptanceSummary = deviceApi.studioDeviceAcceptanceSummary;
export const parseStudioDeviceAcceptance = deviceApi.parseStudioDeviceAcceptance;
export const studioDeviceAcceptanceFilename = deviceApi.studioDeviceAcceptanceFilename;
