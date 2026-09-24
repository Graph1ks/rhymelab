import { loadStudioPreferences, writeStudioPreferences } from '../legacy/documents';
import type { JsonRecord, StudioPreferences } from '../legacy/contracts';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  bg: string;
  panel: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accent2: string;
  signal: string;
  nav: string;
  tint: string;
  onAccent: string;
}

export interface ThemeDefinition extends JsonRecord {
  id: string;
  name: string;
  subtitle?: string;
  mode: ThemeMode;
  colors: Partial<ThemeColors>;
}

export interface ThemePreferences extends StudioPreferences {
  theme?: string;
  themeSlots?: {
    light?: string | null;
    dark?: string | null;
    [key: string]: unknown;
  };
  customThemes?: ThemeDefinition[];
}

export const BUILTIN_THEMES: Readonly<Record<ThemeMode, ThemeDefinition>> = Object.freeze({
  light: Object.freeze({
    id: 'light',
    name: 'Light',
    subtitle: 'Warm Atelier',
    mode: 'light',
    colors: Object.freeze({
      bg: '#EAE7DC',
      panel: '#F4F0E6',
      ink: '#272727',
      muted: '#6B6965',
      line: '#D8C3A5',
      accent: '#E85A4F',
      accent2: '#E98074',
      signal: '#8E8D8A',
      nav: '#E3DCCF',
      tint: '#F1D5CE',
      onAccent: '#171717',
    }),
  }),
  dark: Object.freeze({
    id: 'dark',
    name: 'Dark',
    subtitle: 'Signal Noir',
    mode: 'dark',
    colors: Object.freeze({
      bg: '#272727',
      panel: '#303030',
      ink: '#F5F4EC',
      muted: '#A3A3A3',
      line: '#474747',
      accent: '#FFE400',
      accent2: '#FF652F',
      signal: '#14A76C',
      nav: '#232323',
      tint: '#3A3823',
      onAccent: '#272727',
    }),
  }),
});

function normalizeHex(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(text)) return text;
  if (/^[0-9A-F]{6}$/.test(text)) return `#${text}`;
  return fallback;
}

function hexRgb(value: string): [number, number, number] {
  const hex = normalizeHex(value, '#000000').slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function rgbHex(values: number[]): string {
  return `#${values.map((value) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'),
  ).join('').toUpperCase()}`;
}

function mixHex(a: string, b: string, ratio = 0.5): string {
  const amount = Math.max(0, Math.min(1, Number(ratio) || 0));
  const left = hexRgb(a);
  const right = hexRgb(b);
  return rgbHex(left.map((value, index) =>
    value * (1 - amount) + (right[index] ?? 0) * amount,
  ));
}

function relativeLuminance(hex: string): number {
  const channels = hexRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (channels[0] ?? 0) * 0.2126
    + (channels[1] ?? 0) * 0.7152
    + (channels[2] ?? 0) * 0.0722;
}

function contrastRatio(a: string, b: string): number {
  const left = relativeLuminance(a);
  const right = relativeLuminance(b);
  const light = Math.max(left, right);
  const dark = Math.min(left, right);
  return (light + 0.05) / (dark + 0.05);
}

function readableAccentText(accent: string): string {
  return contrastRatio(accent, '#171717') >= contrastRatio(accent, '#FFFFFF')
    ? '#171717'
    : '#FFFFFF';
}

export function completeThemeColors(colors?: Partial<ThemeColors> | null): ThemeColors {
  const next = {
    bg: normalizeHex(colors?.bg, '#272727'),
    panel: normalizeHex(colors?.panel, '#303030'),
    ink: normalizeHex(colors?.ink, '#F5F4EC'),
    muted: normalizeHex(colors?.muted, '#A3A3A3'),
    accent: normalizeHex(colors?.accent, '#FFE400'),
    accent2: normalizeHex(colors?.accent2, '#FF652F'),
    signal: normalizeHex(colors?.signal, '#14A76C'),
  };
  return {
    ...next,
    line: normalizeHex(colors?.line, mixHex(next.muted, next.bg, 0.52)),
    nav: normalizeHex(colors?.nav, mixHex(next.panel, next.bg, 0.54)),
    tint: normalizeHex(colors?.tint, mixHex(next.accent, next.bg, 0.82)),
    onAccent: normalizeHex(colors?.onAccent, readableAccentText(next.accent)),
  };
}

function themePreferences(input?: StudioPreferences): ThemePreferences {
  const source = (input ?? loadStudioPreferences()) as ThemePreferences;
  return {
    ...source,
    themeSlots: source.themeSlots && typeof source.themeSlots === 'object'
      ? source.themeSlots
      : { light: null, dark: null },
    customThemes: Array.isArray(source.customThemes)
      ? source.customThemes.filter((theme): theme is ThemeDefinition =>
          Boolean(theme && typeof theme === 'object' && typeof theme.id === 'string'),
        )
      : [],
  };
}

export function customThemeById(
  id: string | null | undefined,
  preferences?: StudioPreferences,
): ThemeDefinition | null {
  const prefs = themePreferences(preferences);
  return prefs.customThemes?.find((theme) => theme.id === id) ?? null;
}

export function resolveThemeChoice(
  choice: string | null | undefined,
  preferences?: StudioPreferences,
): ThemeDefinition & { slot?: ThemeMode; colors: ThemeColors } {
  const prefs = themePreferences(preferences);
  if (choice === 'light' || choice === 'dark') {
    const replacement = customThemeById(prefs.themeSlots?.[choice] as string | null, prefs);
    if (replacement) {
      return {
        ...replacement,
        slot: choice,
        colors: completeThemeColors(replacement.colors),
      };
    }
    const builtin = BUILTIN_THEMES[choice];
    return {
      ...builtin,
      slot: choice,
      colors: completeThemeColors(builtin.colors),
    };
  }

  const custom = customThemeById(choice, prefs);
  if (custom) {
    return {
      ...custom,
      colors: completeThemeColors(custom.colors),
    };
  }

  return {
    ...BUILTIN_THEMES.dark,
    slot: 'dark',
    colors: completeThemeColors(BUILTIN_THEMES.dark.colors),
  };
}

export function themeChoices(preferences?: StudioPreferences): Array<ThemeDefinition & {
  choice: string;
  slot?: ThemeMode;
  colors: ThemeColors;
}> {
  const prefs = themePreferences(preferences);
  const slots: ThemeMode[] = ['light', 'dark'];
  const output: Array<ThemeDefinition & {
    choice: string;
    slot?: ThemeMode;
    colors: ThemeColors;
  }> = slots.map((slot) => ({
    ...resolveThemeChoice(slot, prefs),
    choice: slot,
  }));
  for (const theme of prefs.customThemes ?? []) {
    if (prefs.themeSlots?.light === theme.id || prefs.themeSlots?.dark === theme.id) continue;
    output.push({
      ...resolveThemeChoice(theme.id, prefs),
      choice: theme.id,
    });
  }
  return output;
}

export function toggleThemeChoice(
  currentChoice: string,
  preferences?: StudioPreferences,
): ThemeMode {
  const resolved = resolveThemeChoice(currentChoice, preferences);
  return resolved.mode === 'dark' ? 'light' : 'dark';
}

export function persistAppearancePreferences(
  patch: Pick<ThemePreferences, 'theme' | 'uiLanguage'>,
): StudioPreferences {
  const current = loadStudioPreferences();
  const next = { ...current, ...patch };
  writeStudioPreferences(next);
  return next;
}

export function applyThemeToDocument(
  choice: string,
  documentElement = globalThis.document?.documentElement,
  preferences?: StudioPreferences,
) {
  const resolved = resolveThemeChoice(choice, preferences);
  if (!documentElement) return resolved;

  const colors = resolved.colors;
  documentElement.dataset.theme = resolved.mode;
  documentElement.dataset.themeChoice = choice;
  const variables: Record<string, string> = {
    '--rl-bg': colors.bg,
    '--rl-panel': colors.panel,
    '--rl-ink': colors.ink,
    '--rl-muted': colors.muted,
    '--rl-line': colors.line,
    '--rl-accent': colors.accent,
    '--rl-accent-2': colors.accent2,
    '--rl-signal': colors.signal,
    '--rl-nav': colors.nav,
    '--rl-tint': colors.tint,
    '--rl-on-accent': colors.onAccent,
  };
  for (const [key, value] of Object.entries(variables)) {
    documentElement.style?.setProperty?.(key, value);
  }
  return resolved;
}
