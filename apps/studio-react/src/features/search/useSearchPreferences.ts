import { useCallback, useMemo, useState } from 'react';

import { loadStudioPreferences, writeStudioPreferences } from '../../legacy/documents';
import { normalizeDensity, type ResultDensity } from './presentation';

export interface SavedResult {
  word: string;
  anchor: string;
}

function readSaved(value: unknown): SavedResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const word = String(row.word ?? '').trim();
      if (!word) return null;
      return {
        word,
        anchor: String(row.anchor ?? '').trim(),
      };
    })
    .filter((item): item is SavedResult => Boolean(item));
}

function writePreferencePatch(patch: Record<string, unknown>) {
  const next = {
    ...loadStudioPreferences(),
    ...patch,
  };
  writeStudioPreferences(next);
  return next;
}

export function useSearchPreferences() {
  const initial = useMemo(() => loadStudioPreferences(), []);
  const [density, setDensityState] = useState<ResultDensity>(
    normalizeDensity(initial.density),
  );
  const [hideUsed, setHideUsedState] = useState(initial.hideUsed !== false);
  const [saved, setSaved] = useState<SavedResult[]>(readSaved(initial.saved));

  const setDensity = useCallback((next: ResultDensity) => {
    const normalized = normalizeDensity(next);
    setDensityState(normalized);
    writePreferencePatch({ density: normalized });
  }, []);

  const setHideUsed = useCallback((next: boolean) => {
    setHideUsedState(next);
    writePreferencePatch({ hideUsed: next });
  }, []);

  const toggleSaved = useCallback((word: string, anchor: string) => {
    setSaved((current) => {
      const index = current.findIndex((item) => item.word === word);
      const next = index >= 0
        ? current.filter((_, itemIndex) => itemIndex !== index)
        : [...current, { word, anchor }];
      writePreferencePatch({ saved: next });
      return next;
    });
  }, []);

  return {
    density,
    hideUsed,
    saved,
    setDensity,
    setHideUsed,
    toggleSaved,
    isSaved: (word: string) => saved.some((item) => item.word === word),
  };
}
