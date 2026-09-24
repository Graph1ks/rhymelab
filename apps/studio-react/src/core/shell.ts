import * as sharedI18n from '../../../../packages/shared-core/src/i18n/i18n.mjs';
import * as sharedCommands from '../../../../packages/shared-core/src/commands/command-palette.mjs';
import * as webMobileViewport from '../../../../packages/platform-web/src/mobile-viewport.mjs';

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
  clientLocaleUiLanguage(locales?: unknown): StudioUiLanguage;
  defaultStudioUiLanguage(navigatorLike?: unknown): StudioUiLanguage;
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

const i18nApi = sharedI18n as unknown as I18nApi;
const commandApi = sharedCommands as unknown as CommandApi;
const mobileApi = webMobileViewport as unknown as MobileViewportApi;

export const STUDIO_UI_LANGUAGES = i18nApi.STUDIO_UI_LANGUAGES;
export const clientLocaleUiLanguage = i18nApi.clientLocaleUiLanguage;
export const defaultStudioUiLanguage = i18nApi.defaultStudioUiLanguage;
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
