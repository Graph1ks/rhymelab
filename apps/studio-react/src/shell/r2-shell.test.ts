import { beforeEach, describe, expect, it } from 'vitest';

import * as legacyI18n from '../../../../src/studio/i18n.mjs';
import * as legacyCommands from '../../../../src/studio/command-palette.mjs';
import * as legacyMobile from '../../../../src/studio/mobile-viewport.mjs';

import {
  MOBILE_BREAKPOINT,
  commandShortcutText,
  mobileViewportMetrics,
  normalizeCommandQuery,
  normalizeStudioUiLanguage,
  rankStudioCommands,
  studioCommandGroups,
  translateStudioUiText,
} from '../legacy/shell';
import {
  BUILTIN_THEMES,
  applyThemeToDocument,
  completeThemeColors,
  randomOklchTheme,
  randomWildTheme,
  resolveThemeChoice,
  themeChoices,
  themeContrastReport,
  toggleThemeChoice,
  type ThemePreferences,
} from '../design-system/theme';
import {
  Button,
  Dialog,
  Drawer,
  Menu,
  Popover,
  Select,
  Tooltip,
} from '../design-system/primitives';
import { createStudioState } from '../legacy/documents';
import { useUiStore } from '../state/uiStore';
import {
  NAVIGATION_ITEMS,
  SHELL_BREAKPOINTS,
  commandPaletteShortcutLabel,
  isTextEditingTarget,
  navigationLabel,
  shellText,
} from './navigation';

describe('R2 shell reuses accepted legacy interaction helpers', () => {
  it('keeps i18n, command ranking and viewport functions identical', () => {
    expect(normalizeStudioUiLanguage).toBe(legacyI18n.normalizeStudioUiLanguage);
    expect(translateStudioUiText).toBe(legacyI18n.translateStudioUiText);
    expect(normalizeCommandQuery).toBe(legacyCommands.normalizeCommandQuery);
    expect(rankStudioCommands).toBe(legacyCommands.rankStudioCommands);
    expect(studioCommandGroups).toBe(legacyCommands.studioCommandGroups);
    expect(commandShortcutText).toBe(legacyCommands.commandShortcutText);
    expect(mobileViewportMetrics).toBe(legacyMobile.mobileViewportMetrics);
  });

  it('keeps the canonical 800px mobile breakpoint', () => {
    expect(MOBILE_BREAKPOINT).toBe(800);
    expect(SHELL_BREAKPOINTS.mobile).toBe(MOBILE_BREAKPOINT);
    expect(SHELL_BREAKPOINTS.sidebarRail).toBe(1150);
    expect(SHELL_BREAKPOINTS.compactMobile).toBe(560);

    expect(mobileViewportMetrics({
      innerWidth: 800,
      innerHeight: 900,
    })).toMatchObject({
      width: 800,
      height: 900,
      isMobile: true,
      keyboardOpen: false,
    });
  });
});

describe('R2 appearance defaults', () => {
  it('starts new Studio workspaces in Light mode', () => {
    expect(createStudioState().theme).toBe('light');
  });
});

describe('R2 semantic theme layer preserves existing theme slots', () => {
  const customLight = {
    id: 'custom-light',
    name: 'Paper',
    subtitle: 'Saved custom light',
    mode: 'light' as const,
    colors: {
      bg: '#FAFAF6',
      panel: '#FFFFFF',
      ink: '#202020',
      muted: '#707070',
      accent: '#A23B72',
      accent2: '#F18F01',
      signal: '#2E8B57',
    },
  };

  const preferences: ThemePreferences = {
    theme: 'light',
    themeSlots: {
      light: customLight.id,
      dark: null,
    },
    customThemes: [customLight],
  };

  it('keeps the exact built-in Light/Dark baseline palettes', () => {
    expect(BUILTIN_THEMES.light.colors.bg).toBe('#EAE7DC');
    expect(BUILTIN_THEMES.light.colors.accent).toBe('#E85A4F');
    expect(BUILTIN_THEMES.dark.colors.bg).toBe('#1B0D0F');
    expect(BUILTIN_THEMES.dark.colors.panel).toBe('#2B181B');
    expect(BUILTIN_THEMES.dark.colors.ink).toBe('#E0D3D1');
    expect(BUILTIN_THEMES.dark.colors.accent).toBe('#E85A4F');
    expect(BUILTIN_THEMES.dark.colors.signal).toBe('#62C37E');
  });

  it('falls back to built-in Light for an unset or invalid theme choice', () => {
    expect(resolveThemeChoice(undefined, { themeSlots: {}, customThemes: [] }).id).toBe('light');
    expect(resolveThemeChoice('missing-theme', { themeSlots: {}, customThemes: [] }).id).toBe('light');
  });

  it('resolves configured custom slots before built-ins', () => {
    const resolved = resolveThemeChoice('light', preferences);
    expect(resolved.id).toBe('custom-light');
    expect(resolved.slot).toBe('light');
    expect(resolved.mode).toBe('light');
    expect(resolved.colors.bg).toBe('#FAFAF6');

    expect(resolveThemeChoice('dark', preferences).id).toBe('dark');
    expect(toggleThemeChoice('dark', preferences)).toBe('light');
    expect(toggleThemeChoice('light', preferences)).toBe('dark');
  });

  it('derives the complete semantic color contract for saved custom themes', () => {
    const colors = completeThemeColors(customLight.colors);
    expect(colors.line).toMatch(/^#[0-9A-F]{6}$/);
    expect(colors.nav).toMatch(/^#[0-9A-F]{6}$/);
    expect(colors.tint).toMatch(/^#[0-9A-F]{6}$/);
    expect(colors.onAccent).toMatch(/^#[0-9A-F]{6}$/);

    const choices = themeChoices(preferences);
    expect(choices.map((choice) => choice.choice)).toEqual(['light', 'dark']);
    expect(choices[0]?.id).toBe('custom-light');
  });

  it('keeps OKLCH random styles readable across the full hue wheel', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (let hue = 0; hue < 360; hue += 15) {
        const theme = randomOklchTheme(mode, {
          hue,
          id: `generated-${mode}-${hue}`,
          name: `Generated ${mode} ${hue}`,
        });
        const colors = completeThemeColors(theme.colors);
        Object.values(colors).forEach((value) => expect(value).toMatch(/^#[0-9A-F]{6}$/));
        const report = themeContrastReport(colors);
        expect(report.inkOnBg, `${mode} H${hue} ink/bg`).toBeGreaterThanOrEqual(4.5);
        expect(report.inkOnPanel, `${mode} H${hue} ink/panel`).toBeGreaterThanOrEqual(4.5);
        expect(report.onAccent, `${mode} H${hue} accent text`).toBeGreaterThanOrEqual(4.5);
        expect(report.readable, `${mode} H${hue}`).toBe(true);
      }
    }
  });

  it('keeps Wild styles vivid while retaining readable semantic contrast', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (let hue = 0; hue < 360; hue += 30) {
        const theme = randomWildTheme({ mode, hue, id: `wild-${mode}-${hue}` });
        const colors = completeThemeColors(theme.colors);
        const report = themeContrastReport(colors);
        expect(report.inkOnBg, `${mode} H${hue} ink/bg`).toBeGreaterThanOrEqual(4.5);
        expect(report.inkOnPanel, `${mode} H${hue} ink/panel`).toBeGreaterThanOrEqual(4.5);
        expect(report.onAccent, `${mode} H${hue} accent text`).toBeGreaterThanOrEqual(4.5);
        expect(theme.subtitle).not.toMatch(/OKLCH/i);
      }
    }
  });

  it('applies only semantic CSS variables to the shell document root', () => {
    const variables = new Map<string, string>();
    const fakeRoot = {
      dataset: {} as Record<string, string>,
      style: {
        setProperty(key: string, value: string) {
          variables.set(key, value);
        },
      },
    } as unknown as HTMLElement;

    const resolved = applyThemeToDocument('light', fakeRoot, preferences);
    expect(resolved.mode).toBe('light');
    expect(fakeRoot.dataset.theme).toBe('light');
    expect(fakeRoot.dataset.themeChoice).toBe('light');
    expect(variables.get('--rl-bg')).toBe('#FAFAF6');
    expect(variables.get('--rl-accent')).toBe('#A23B72');
    expect(variables.has('--editor')).toBe(false);
  });
});

describe('R2 shell actions are real Zustand state transitions', () => {
  beforeEach(() => {
    useUiStore.setState({
      surface: 'studio',
      uiLanguage: 'de',
      themeChoice: 'dark',
      commandPaletteOpen: false,
      quickstylesOpen: false,
      settingsDrawerOpen: false,
      libraryOpen: false,
      savedOpen: false,
      focusMode: false,
    });
  });

  it('navigates between shell surfaces without creating domain state', () => {
    useUiStore.getState().navigate('search');
    expect(useUiStore.getState().surface).toBe('search');

    useUiStore.getState().navigate('library');
    expect(useUiStore.getState().surface).toBe('library');

    useUiStore.getState().navigate('saved');
    expect(useUiStore.getState().surface).toBe('saved');

    useUiStore.getState().navigate('settings');
    expect(useUiStore.getState().surface).toBe('settings');
  });

  it('keeps Library and Saved as workflow overlays and closes them on primary navigation', () => {
    useUiStore.getState().setLibraryOpen(true);
    useUiStore.getState().setSavedOpen(true);
    expect(useUiStore.getState()).toMatchObject({
      libraryOpen: true,
      savedOpen: true,
    });

    useUiStore.getState().navigate('search');
    expect(useUiStore.getState()).toMatchObject({
      surface: 'search',
      libraryOpen: false,
      savedOpen: false,
    });
  });

  it('keeps focus mode session-only and clears it on navigation', () => {
    useUiStore.getState().setFocusMode(true);
    expect(useUiStore.getState().focusMode).toBe(true);
    useUiStore.getState().toggleFocusMode();
    expect(useUiStore.getState().focusMode).toBe(false);
    useUiStore.getState().setFocusMode(true);
    useUiStore.getState().navigate('search');
    expect(useUiStore.getState().focusMode).toBe(false);
  });

  it('toggles persistent appearance state through the same registered actions used by controls', () => {
    useUiStore.getState().toggleUiLanguage();
    expect(useUiStore.getState().uiLanguage).toBe('en');
    useUiStore.getState().toggleUiLanguage();
    expect(useUiStore.getState().uiLanguage).toBe('de');

    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().themeChoice).toBe('light');
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().themeChoice).toBe('dark');
  });

  it('keeps command and quickstyle overlays explicit while legacy drawer state remains inert', () => {
    useUiStore.getState().setCommandPaletteOpen(true);
    useUiStore.getState().setQuickstylesOpen(true);
    useUiStore.getState().setSettingsDrawerOpen(true);

    expect(useUiStore.getState()).toMatchObject({
      commandPaletteOpen: true,
      quickstylesOpen: true,
      settingsDrawerOpen: true,
    });

    useUiStore.getState().setCommandPaletteOpen(false);
    useUiStore.getState().setQuickstylesOpen(false);
    useUiStore.getState().setSettingsDrawerOpen(false);

    expect(useUiStore.getState()).toMatchObject({
      commandPaletteOpen: false,
      quickstylesOpen: false,
      settingsDrawerOpen: false,
    });
  });
});

describe('R2 navigation and command foundations preserve product vocabulary', () => {
  it('keeps Studio and Search as primary destinations while Library and Saved live in their owning workflows', () => {
    expect(NAVIGATION_ITEMS.map((item) => item.id)).toEqual([
      'studio',
      'search',
    ]);
    expect(navigationLabel(NAVIGATION_ITEMS[1]!, 'de')).toBe('Reimsuche');
    expect(navigationLabel(NAVIGATION_ITEMS[1]!, 'en')).toBe('Rhyme search');
    expect(shellText('Einstellungen öffnen', 'en')).toBe('Open settings');
  });

  it('keeps global command shortcuts out of text-editing targets and labels the platform modifier', () => {
    expect(isTextEditingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTextEditingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEditingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(commandPaletteShortcutLabel('MacIntel')).toBe('⌘ ⇧ K');
    expect(commandPaletteShortcutLabel('Win32')).toBe('Ctrl ⇧ K');
  });

  it('uses the accepted ranked command matcher for shell commands', () => {
    const commands = [
      { id: 'studio', group: 'Navigation', label: 'Studio öffnen', keywords: ['write'] },
      { id: 'search', group: 'Navigation', label: 'Reimsuche öffnen', keywords: ['rhyme'] },
    ];
    expect(rankStudioCommands(commands, 'rhyme').map((command) => command.id)).toEqual(['search']);
    expect(normalizeCommandQuery('  REIM—Suche ')).toBe('reim suche');
  });

  it('exposes every Base UI primitive family required by the R2 design-system boundary', () => {
    expect(Button).toBeTruthy();
    expect(Dialog).toBeTruthy();
    expect(Drawer).toBeTruthy();
    expect(Menu).toBeTruthy();
    expect(Popover).toBeTruthy();
    expect(Select).toBeTruthy();
    expect(Tooltip).toBeTruthy();
  });
});
