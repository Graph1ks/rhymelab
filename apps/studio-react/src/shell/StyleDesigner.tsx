import { useMemo, useState, type CSSProperties } from 'react';

import {
  BUILTIN_THEMES,
  applyThemeToDocument,
  completeThemeColors,
  deleteCustomTheme,
  randomOklchTheme,
  randomWildTheme,
  readThemePreferences,
  saveCustomTheme,
  setThemeSlot,
  themeContrastReport,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeMode,
  type ThemePreferences,
} from '../design-system/theme';
import { useUiStore } from '../state/uiStore';
import { Icon } from './icons';
import styles from './Shell.module.css';

const EDITABLE_COLORS: Array<{
  key: keyof Pick<ThemeColors, 'bg' | 'panel' | 'ink' | 'muted' | 'accent' | 'accent2' | 'signal'>;
  de: string;
  en: string;
}> = [
  { key: 'bg', de: 'Hintergrund', en: 'Background' },
  { key: 'panel', de: 'Fläche', en: 'Surface' },
  { key: 'ink', de: 'Text', en: 'Text' },
  { key: 'muted', de: 'Sekundärtext', en: 'Muted text' },
  { key: 'accent', de: 'Akzent', en: 'Accent' },
  { key: 'accent2', de: 'Kontrastakzent', en: 'Accent 2' },
  { key: 'signal', de: 'Signal', en: 'Signal' },
];

function idForStyle() {
  if (globalThis.crypto?.randomUUID) return 'style-' + globalThis.crypto.randomUUID();
  return 'style-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function cloneTheme(theme: ThemeDefinition): ThemeDefinition {
  return {
    ...theme,
    colors: { ...completeThemeColors(theme.colors) },
  };
}

function freshTheme(mode: ThemeMode): ThemeDefinition {
  return randomOklchTheme(mode, {
    id: idForStyle(),
    name: mode === 'dark' ? 'New Dark Style' : 'New Light Style',
  });
}

function freshWildTheme(): ThemeDefinition {
  return randomWildTheme({
    id: idForStyle(),
    name: 'Wild Card',
  });
}

export function StyleDesigner() {
  const language = useUiStore((state) => state.uiLanguage);
  const themeChoice = useUiStore((state) => state.themeChoice);
  const setThemeChoice = useUiStore((state) => state.setThemeChoice);
  const [preferences, setPreferences] = useState<ThemePreferences>(() => readThemePreferences());
  const firstCustom = preferences.customThemes?.[0] ?? null;
  const [draft, setDraft] = useState<ThemeDefinition>(() => (
    firstCustom ? cloneTheme(firstCustom) : freshTheme('dark')
  ));
  const [deleteArmed, setDeleteArmed] = useState(false);

  const colors = useMemo(() => completeThemeColors(draft.colors), [draft.colors]);
  const contrast = useMemo(() => themeContrastReport(colors), [colors]);
  const customThemes = preferences.customThemes ?? [];

  const refresh = (next?: ThemePreferences) => {
    const prefs = next ?? readThemePreferences();
    setPreferences(prefs);
    globalThis.dispatchEvent?.(new CustomEvent('rhymelab:preferences-imported'));
    return prefs;
  };

  const patchColor = (key: keyof ThemeColors, value: string) => {
    setDraft((current) => ({
      ...current,
      colors: {
        ...current.colors,
        [key]: value,
      },
    }));
  };

  const save = () => {
    const next = saveCustomTheme({ ...draft, colors });
    setDraft((current) => ({ ...current, colors }));
    refresh(next);
    if (themeChoice === draft.id) applyThemeToDocument(draft.id);
  };

  const apply = () => {
    const next = saveCustomTheme({ ...draft, colors });
    refresh(next);
    setThemeChoice(draft.id);
  };

  const makeDefault = () => {
    saveCustomTheme({ ...draft, colors });
    const next = setThemeSlot(draft.mode, draft.id);
    refresh(next);
    setThemeChoice(draft.mode);
  };

  const remove = () => {
    if (!customThemes.some((theme) => theme.id === draft.id)) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleteArmed(false);
    const next = deleteCustomTheme(draft.id);
    refresh(next);
    if (themeChoice === draft.id) setThemeChoice('dark');
    const replacement = next.customThemes?.[0];
    setDraft(replacement ? cloneTheme(replacement) : freshTheme('dark'));
  };

  const surprise = () => {
    setDeleteArmed(false);
    const roll = Math.floor(Math.random() * 3);
    if (roll === 2) {
      setDraft(randomWildTheme({ id: draft.id, name: draft.name }));
      return;
    }
    const mode: ThemeMode = roll === 0 ? 'light' : 'dark';
    setDraft(randomOklchTheme(mode, { id: draft.id, name: draft.name }));
  };

  const resetDefault = (mode: ThemeMode) => {
    setDeleteArmed(false);
    const next = setThemeSlot(mode, null);
    refresh(next);
    setThemeChoice(mode);
    applyThemeToDocument(mode);
  };

  const modeDefault = preferences.themeSlots?.[draft.mode] === draft.id;

  return (
    <section className={styles.styleDesigner}>
      <header className={styles.styleDesignerHead}>
        <div>
          <p className={styles.kicker}>STYLE DESIGNER</p>
          <h2>{language === 'de' ? 'Baue dein Rhyme Bureau.' : 'Build your Rhyme Bureau.'}</h2>
          <span>
            {language === 'de'
              ? 'Mehrere Styles speichern, live testen und als Light/Dark-Default festlegen.'
              : 'Save multiple styles, preview live and assign Light/Dark defaults.'}
          </span>
        </div>
        <div className={styles.styleDesignerActions}>
          <button type="button" onClick={() => setDraft(freshTheme('light'))}>+ LIGHT</button>
          <button type="button" onClick={() => setDraft(freshTheme('dark'))}>+ DARK</button>
          <button type="button" onClick={() => setDraft(freshWildTheme())}>+ WILD</button>
          <button type="button" className={styles.randomStyleButton} onClick={surprise}>
            <Icon name="spark" />
            Surprise Me
          </button>
        </div>
      </header>

      <div className={styles.styleDesignerBody}>
        <aside className={styles.styleLibrary}>
          <div className={styles.styleLibraryLabel}>
            <span>{language === 'de' ? 'GESPEICHERT' : 'SAVED'}</span>
            <b>{customThemes.length}</b>
          </div>

          <div className={styles.styleResetGroup}>
            {(['light', 'dark'] as ThemeMode[]).map((mode) => {
              const builtin = BUILTIN_THEMES[mode];
              const overridden = Boolean(preferences.themeSlots?.[mode]);
              return (
                <button
                  key={builtin.id}
                  type="button"
                  className={styles.styleResetButton}
                  data-active={!overridden ? 'true' : 'false'}
                  disabled={!overridden}
                  onClick={() => resetDefault(mode)}
                >
                  <span className={styles.styleMiniSwatches}>
                    <i style={{ background: builtin.colors.bg }} />
                    <i style={{ background: builtin.colors.panel }} />
                    <i style={{ background: builtin.colors.accent }} />
                  </span>
                  <span>
                    <b>{mode === 'light'
                      ? (language === 'de' ? 'Light zurücksetzen' : 'Reset Light')
                      : (language === 'de' ? 'Dark zurücksetzen' : 'Reset Dark')}</b>
                    <small>{overridden
                      ? (language === 'de' ? 'Custom-Default entfernen' : 'Remove custom default')
                      : (language === 'de' ? 'Standard aktiv' : 'Built-in active')}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.styleLibraryDivider} />

          {customThemes.map((theme) => {
            const complete = completeThemeColors(theme.colors);
            const active = draft.id === theme.id;
            const defaultSlot = preferences.themeSlots?.[theme.mode] === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                className={styles.styleLibraryItem}
                data-active={active ? 'true' : 'false'}
                onClick={() => {
                  setDeleteArmed(false);
                  setDraft(cloneTheme(theme));
                }}
              >
                <span className={styles.styleMiniSwatches}>
                  <i style={{ background: complete.bg }} />
                  <i style={{ background: complete.panel }} />
                  <i style={{ background: complete.accent }} />
                </span>
                <span>
                  <b>{theme.name}</b>
                  <small>{theme.mode.toUpperCase()}{defaultSlot ? ' · DEFAULT' : ''}</small>
                </span>
              </button>
            );
          })}
        </aside>

        <div className={styles.styleWorkbench}>
          <div className={styles.styleMetaRow}>
            <label>
              <span>{language === 'de' ? 'STYLE-NAME' : 'STYLE NAME'}</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <span className={styles.styleModeBadge}>
              {draft.mode === 'light' ? 'LIGHT' : 'DARK'}
            </span>
          </div>

          <div
            className={styles.stylePreview}
            style={{
              '--preview-bg': colors.bg,
              '--preview-panel': colors.panel,
              '--preview-ink': colors.ink,
              '--preview-muted': colors.muted,
              '--preview-line': colors.line,
              '--preview-accent': colors.accent,
              '--preview-signal': colors.signal,
              '--preview-nav': colors.nav,
              '--preview-tint': colors.tint,
            } as CSSProperties}
          >
            <div className={styles.stylePreviewTop}>
              <b>rb.</b>
              <span>Studio</span>
              <span>Reimsuche</span>
              <i />
            </div>
            <div className={styles.stylePreviewStage}>
              <small>LIVE PREVIEW</small>
              <h3>Write loud. Read clean.</h3>
              <p>{language === 'de' ? 'Kontrast, Oberfläche und Signalwirkung in echter Hierarchie.' : 'Contrast, surface and signal hierarchy in context.'}</p>
              <div>
                <button type="button">Primary</button>
                <span>Secondary</span>
                <em>● Ready</em>
              </div>
            </div>
          </div>

          <div className={styles.contrastStrip} data-ok={contrast.readable ? 'true' : 'false'}>
            <span><b>{contrast.inkOnBg.toFixed(1)}×</b>Text / BG</span>
            <span><b>{contrast.inkOnPanel.toFixed(1)}×</b>{language === 'de' ? 'Text / Fläche' : 'Text / surface'}</span>
            <span><b>{contrast.onAccent.toFixed(1)}×</b>{language === 'de' ? 'Akzent-Text' : 'Accent text'}</span>
            <strong>
              {contrast.readable
                ? (language === 'de' ? 'AA-Kontrast steht' : 'AA contrast ready')
                : (language === 'de' ? 'Kontrast prüfen' : 'Review contrast')}
            </strong>
          </div>

          <div className={styles.colorWorkbench}>
            {EDITABLE_COLORS.map((entry) => (
              <label key={entry.key} className={styles.colorControl}>
                <input
                  type="color"
                  value={colors[entry.key]}
                  onChange={(event) => patchColor(entry.key, event.target.value)}
                  aria-label={language === 'de' ? entry.de : entry.en}
                />
                <span>
                  <b>{language === 'de' ? entry.de : entry.en}</b>
                  <code>{colors[entry.key]}</code>
                </span>
              </label>
            ))}
          </div>

          <div className={styles.derivedColors}>
            {(['line', 'nav', 'tint', 'onAccent'] as const).map((key) => (
              <span key={key}>
                <i style={{ background: colors[key] }} />
                <b>{key}</b>
                <code>{colors[key]}</code>
              </span>
            ))}
          </div>

          <footer className={styles.styleDesignerFooter}>
            <div>
              <button type="button" className={styles.styleSaveButton} onClick={save}>
                {language === 'de' ? 'Style speichern' : 'Save style'}
              </button>
              <button type="button" onClick={apply}>
                {language === 'de' ? 'Jetzt anwenden' : 'Apply now'}
              </button>
              <button type="button" onClick={makeDefault}>
                {modeDefault
                  ? (draft.mode === 'light' ? 'Light-Default ✓' : 'Dark-Default ✓')
                  : (language === 'de'
                      ? 'Als ' + (draft.mode === 'light' ? 'Light' : 'Dark') + '-Default'
                      : 'Set ' + draft.mode + ' default')}
              </button>
            </div>
            <button
              type="button"
              className={deleteArmed ? styles.styleDeleteArmed : styles.styleDelete}
              onClick={remove}
              disabled={!customThemes.some((theme) => theme.id === draft.id)}
              onBlur={() => setDeleteArmed(false)}
            >
              {deleteArmed
                ? (language === 'de' ? 'Löschen bestätigen' : 'Confirm delete')
                : (language === 'de' ? 'Style löschen' : 'Delete style')}
            </button>
          </footer>
        </div>
      </div>
    </section>
  );
}
