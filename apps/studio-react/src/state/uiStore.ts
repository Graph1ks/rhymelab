import { create } from 'zustand';

import { loadStudioPreferences } from '../legacy/documents';
import {
  defaultStudioUiLanguage,
  normalizeStudioUiLanguage,
  type StudioUiLanguage,
} from '../legacy/shell';
import {
  persistAppearancePreferences,
  toggleThemeChoice,
} from '../design-system/theme';
import type { AppSurface } from '../shell/navigation';

type UiState = {
  surface: AppSurface;
  uiLanguage: StudioUiLanguage;
  themeChoice: string;
  commandPaletteOpen: boolean;
  quickstylesOpen: boolean;
  settingsDrawerOpen: boolean;
  libraryOpen: boolean;
  savedOpen: boolean;
  focusMode: boolean;
  navigate: (surface: AppSurface) => void;
  setUiLanguage: (language: StudioUiLanguage | string) => void;
  toggleUiLanguage: () => void;
  setThemeChoice: (choice: string) => void;
  toggleTheme: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setQuickstylesOpen: (open: boolean) => void;
  setSettingsDrawerOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  setSavedOpen: (open: boolean) => void;
  setFocusMode: (open: boolean) => void;
  toggleFocusMode: () => void;
};

const preferences = loadStudioPreferences();
const initialLanguage = preferences.uiLanguage == null
  ? defaultStudioUiLanguage()
  : normalizeStudioUiLanguage(preferences.uiLanguage);
const initialThemeChoice = typeof preferences.theme === 'string'
  ? preferences.theme
  : 'light';

export const useUiStore = create<UiState>((set, get) => ({
  surface: 'studio',
  uiLanguage: initialLanguage,
  themeChoice: initialThemeChoice,
  commandPaletteOpen: false,
  quickstylesOpen: false,
  settingsDrawerOpen: false,
  libraryOpen: false,
  savedOpen: false,
  focusMode: false,

  navigate(surface) {
    set({
      surface,
      settingsDrawerOpen: false,
      libraryOpen: false,
      savedOpen: false,
      focusMode: false,
    });
  },

  setUiLanguage(value) {
    const uiLanguage = normalizeStudioUiLanguage(value);
    persistAppearancePreferences({ uiLanguage });
    set({ uiLanguage });
  },

  toggleUiLanguage() {
    get().setUiLanguage(get().uiLanguage === 'de' ? 'en' : 'de');
  },

  setThemeChoice(choice) {
    const themeChoice = String(choice || 'light');
    persistAppearancePreferences({ theme: themeChoice });
    set({
      themeChoice,
      quickstylesOpen: false,
    });
  },

  toggleTheme() {
    const themeChoice = toggleThemeChoice(get().themeChoice);
    persistAppearancePreferences({ theme: themeChoice });
    set({
      themeChoice,
      quickstylesOpen: false,
    });
  },

  setCommandPaletteOpen(commandPaletteOpen) {
    set({ commandPaletteOpen });
  },

  setQuickstylesOpen(quickstylesOpen) {
    set({ quickstylesOpen });
  },

  setSettingsDrawerOpen(settingsDrawerOpen) {
    set({ settingsDrawerOpen });
  },

  setLibraryOpen(libraryOpen) {
    set({ libraryOpen });
  },

  setSavedOpen(savedOpen) {
    set({ savedOpen });
  },

  setFocusMode(focusMode) {
    set({ focusMode });
  },

  toggleFocusMode() {
    set((state) => ({ focusMode: !state.focusMode }));
  },
}));
