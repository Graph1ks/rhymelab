import * as legacyI18n from '../../../../src/studio/i18n.mjs';
import * as legacyCommands from '../../../../src/studio/command-palette.mjs';
import * as legacyMobileViewport from '../../../../src/studio/mobile-viewport.mjs';

export type StudioUiLanguage = 'de' | 'en';

export interface StudioCommand {
  id: string;
  group: string;
  label: string;
  keywords?: string[];
  shortcut?: string;
  run?: () => void | Promise<void>;
  disabled?: boolean;
}

export interface MobileViewportMetrics {
  width: number;
  height: number;
  offsetTop: number;
  layoutHeight: number;
  isMobile: boolean;
  keyboardOpen: boolean;
}

type I18nApi = {
  STUDIO_UI_LANGUAGES: readonly StudioUiLanguage[];
  normalizeStudioUiLanguage(value: unknown): StudioUiLanguage;
  translateStudioUiText(source: unknown, language: StudioUiLanguage): string;
};

type CommandApi = {
  normalizeCommandQuery(value: unknown): string;
  rankStudioCommands(commands: StudioCommand[], query?: string): StudioCommand[];
  studioCommandGroups(commands: StudioCommand[]): Array<{
    name: string;
    commands: StudioCommand[];
  }>;
  commandShortcutText(shortcut?: string): string;
};

type MobileViewportApi = {
  MOBILE_BREAKPOINT: number;
  MOBILE_KEYBOARD_THRESHOLD: number;
  mobileViewportMetrics(windowObj?: Window | Record<string, unknown>): MobileViewportMetrics;
  mobileScrollDeltaForRect(
    rect: Pick<DOMRect, 'top' | 'bottom'> | null,
    metrics: MobileViewportMetrics,
    options?: { topInset?: number; bottomInset?: number },
  ): number;
  applyMobileViewportState(
    documentElement: HTMLElement | null | undefined,
    metrics: MobileViewportMetrics,
  ): void;
  installMobileViewportController(options?: {
    windowObj?: Window | Record<string, unknown>;
    documentElement?: HTMLElement | null;
    onChange?: (metrics: MobileViewportMetrics) => void;
  }): () => void;
};

const i18nApi = legacyI18n as unknown as I18nApi;
const commandApi = legacyCommands as unknown as CommandApi;
const mobileApi = legacyMobileViewport as unknown as MobileViewportApi;

export const STUDIO_UI_LANGUAGES = i18nApi.STUDIO_UI_LANGUAGES;
export const normalizeStudioUiLanguage = i18nApi.normalizeStudioUiLanguage;
export const translateStudioUiText = i18nApi.translateStudioUiText;

export const normalizeCommandQuery = commandApi.normalizeCommandQuery;
export const rankStudioCommands = commandApi.rankStudioCommands;
export const studioCommandGroups = commandApi.studioCommandGroups;
export const commandShortcutText = commandApi.commandShortcutText;

export const MOBILE_BREAKPOINT = mobileApi.MOBILE_BREAKPOINT;
export const MOBILE_KEYBOARD_THRESHOLD = mobileApi.MOBILE_KEYBOARD_THRESHOLD;
export const mobileViewportMetrics = mobileApi.mobileViewportMetrics;
export const mobileScrollDeltaForRect = mobileApi.mobileScrollDeltaForRect;
export const applyMobileViewportState = mobileApi.applyMobileViewportState;
export const installMobileViewportController = mobileApi.installMobileViewportController;
