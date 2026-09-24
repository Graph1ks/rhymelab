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
    subtitle: 'Bureau Bordeaux',
    mode: 'dark',
    colors: Object.freeze({
      bg: '#1B0D0F',
      panel: '#2B181B',
      ink: '#E0D3D1',
      muted: '#B9A7A7',
      line: '#655354',
      accent: '#E85A4F',
      accent2: '#EEA468',
      signal: '#62C37E',
      nav: '#221215',
      tint: '#442B2F',
      onAccent: '#171717',
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

export function readThemePreferences(input?: StudioPreferences): ThemePreferences {
  return themePreferences(input);
}

function linearToSrgb(channel: number): number {
  const value = Math.max(0, Math.min(1, channel));
  return value <= 0.0031308
    ? 12.92 * value
    : 1.055 * (value ** (1 / 2.4)) - 0.055;
}

function oklabLinearRgb(
  lightness: number,
  a: number,
  b: number,
): [number, number, number] {
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklchToHex(
  lightness: number,
  chroma: number,
  hue: number,
): string {
  const l = Math.max(0, Math.min(1, lightness));
  const radians = ((Number(hue) || 0) % 360) * Math.PI / 180;
  let c = Math.max(0, Number(chroma) || 0);
  let rgb: [number, number, number] = [0, 0, 0];

  for (let attempt = 0; attempt < 36; attempt += 1) {
    const a = c * Math.cos(radians);
    const b = c * Math.sin(radians);
    rgb = oklabLinearRgb(l, a, b);
    if (rgb.every((value) => value >= 0 && value <= 1)) break;
    c *= 0.92;
  }

  return rgbHex(rgb.map((value) => linearToSrgb(value) * 255));
}

export interface ThemeContrastReport {
  inkOnBg: number;
  inkOnPanel: number;
  onAccent: number;
  readable: boolean;
}

export function themeContrastReport(colors: Partial<ThemeColors>): ThemeContrastReport {
  const complete = completeThemeColors(colors);
  const inkOnBg = contrastRatio(complete.ink, complete.bg);
  const inkOnPanel = contrastRatio(complete.ink, complete.panel);
  const onAccent = contrastRatio(complete.onAccent, complete.accent);
  return {
    inkOnBg,
    inkOnPanel,
    onAccent,
    readable: inkOnBg >= 4.5 && inkOnPanel >= 4.5 && onAccent >= 4.5,
  };
}

export function randomOklchTheme(
  mode: ThemeMode,
  options: {
    hue?: number;
    name?: string;
    id?: string;
  } = {},
): ThemeDefinition {
  const hue = Number.isFinite(options.hue)
    ? Number(options.hue)
    : Math.random() * 360;
  const complement = (hue + 48) % 360;
  const signalHue = (hue + 142) % 360;

  const colors = mode === 'dark'
    ? {
        bg: oklchToHex(0.18, 0.025, hue),
        panel: oklchToHex(0.235, 0.032, hue),
        ink: oklchToHex(0.955, 0.018, hue + 15),
        muted: oklchToHex(0.72, 0.028, hue + 8),
        accent: oklchToHex(0.84, 0.155, hue),
        accent2: oklchToHex(0.76, 0.15, complement),
        signal: oklchToHex(0.74, 0.135, signalHue),
      }
    : {
        bg: oklchToHex(0.955, 0.022, hue),
        panel: oklchToHex(0.988, 0.014, hue + 10),
        ink: oklchToHex(0.19, 0.028, hue + 20),
        muted: oklchToHex(0.48, 0.035, hue + 15),
        accent: oklchToHex(0.55, 0.17, hue),
        accent2: oklchToHex(0.61, 0.16, complement),
        signal: oklchToHex(0.52, 0.14, signalHue),
      };

  return {
    id: options.id ?? `style-${Date.now().toString(36)}`,
    name: options.name ?? (mode === 'dark' ? 'Night Signal' : 'Day Signal'),
    subtitle: 'Generated palette',
    mode,
    colors: completeThemeColors(colors),
  };
}

export function randomWildTheme(
  options: {
    mode?: ThemeMode;
    hue?: number;
    name?: string;
    id?: string;
  } = {},
): ThemeDefinition {
  const mode = options.mode ?? (Math.random() < 0.5 ? 'light' : 'dark');
  const hue = Number.isFinite(options.hue) ? Number(options.hue) : Math.random() * 360;
  const panelHue = (hue + 72 + Math.random() * 48) % 360;
  const accentHue = (hue + 150 + Math.random() * 80) % 360;
  const accent2Hue = (accentHue + 72 + Math.random() * 96) % 360;
  const signalHue = (accentHue + 165 + Math.random() * 70) % 360;

  const colors = mode === 'dark'
    ? {
        bg: oklchToHex(0.18, 0.075, hue),
        panel: oklchToHex(0.245, 0.09, panelHue),
        ink: oklchToHex(0.965, 0.018, panelHue + 180),
        muted: oklchToHex(0.74, 0.045, panelHue + 160),
        accent: oklchToHex(0.82, 0.22, accentHue),
        accent2: oklchToHex(0.76, 0.205, accent2Hue),
        signal: oklchToHex(0.79, 0.19, signalHue),
      }
    : {
        bg: oklchToHex(0.94, 0.07, hue),
        panel: oklchToHex(0.985, 0.055, panelHue),
        ink: oklchToHex(0.17, 0.035, panelHue + 180),
        muted: oklchToHex(0.43, 0.055, panelHue + 165),
        accent: oklchToHex(0.52, 0.22, accentHue),
        accent2: oklchToHex(0.57, 0.205, accent2Hue),
        signal: oklchToHex(0.49, 0.18, signalHue),
      };

  return {
    id: options.id ?? `style-${Date.now().toString(36)}`,
    name: options.name ?? 'Wild Card',
    subtitle: 'Chromatic wild card',
    mode,
    colors: completeThemeColors(colors),
  };
}

export function saveCustomTheme(theme: ThemeDefinition): ThemePreferences {
  const prefs = themePreferences();
  const nextTheme: ThemeDefinition = {
    ...theme,
    id: String(theme.id || `style-${Date.now().toString(36)}`),
    name: String(theme.name || 'Untitled Style').trim() || 'Untitled Style',
    mode: theme.mode === 'light' ? 'light' : 'dark',
    colors: completeThemeColors(theme.colors),
  };
  const customThemes = [...(prefs.customThemes ?? [])];
  const index = customThemes.findIndex((item) => item.id === nextTheme.id);
  if (index >= 0) customThemes[index] = nextTheme;
  else customThemes.push(nextTheme);

  const themeSlots = {
    ...prefs.themeSlots,
    light: prefs.themeSlots?.light === nextTheme.id && nextTheme.mode !== 'light'
      ? null
      : prefs.themeSlots?.light ?? null,
    dark: prefs.themeSlots?.dark === nextTheme.id && nextTheme.mode !== 'dark'
      ? null
      : prefs.themeSlots?.dark ?? null,
  };
  const next: ThemePreferences = { ...prefs, customThemes, themeSlots };
  writeStudioPreferences(next);
  return next;
}

export function deleteCustomTheme(id: string): ThemePreferences {
  const prefs = themePreferences();
  const customThemes = (prefs.customThemes ?? []).filter((theme) => theme.id !== id);
  const themeSlots = {
    ...prefs.themeSlots,
    light: prefs.themeSlots?.light === id ? null : prefs.themeSlots?.light ?? null,
    dark: prefs.themeSlots?.dark === id ? null : prefs.themeSlots?.dark ?? null,
  };
  const next: ThemePreferences = {
    ...prefs,
    theme: prefs.theme === id ? 'light' : prefs.theme,
    customThemes,
    themeSlots,
  };
  writeStudioPreferences(next);
  return next;
}

export function setThemeSlot(mode: ThemeMode, id: string | null): ThemePreferences {
  const prefs = themePreferences();
  const custom = id ? customThemeById(id, prefs) : null;
  const validId = custom && custom.mode === mode ? custom.id : null;
  const next: ThemePreferences = {
    ...prefs,
    themeSlots: {
      ...prefs.themeSlots,
      [mode]: validId,
    },
  };
  writeStudioPreferences(next);
  return next;
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
    ...BUILTIN_THEMES.light,
    slot: 'light',
    colors: completeThemeColors(BUILTIN_THEMES.light.colors),
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
