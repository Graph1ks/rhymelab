import { create } from 'zustand';

export type MigrationSurface = 'overview' | 'parity';

type UiState = {
  surface: MigrationSurface;
  setSurface: (surface: MigrationSurface) => void;
};

export const useUiStore = create<UiState>((set) => ({
  surface: 'overview',
  setSurface: (surface) => set({ surface }),
}));
