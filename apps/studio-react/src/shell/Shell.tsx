import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { Button } from '../design-system/primitives';
import { applyThemeToDocument } from '../design-system/theme';
import { collectReactStartupBindingStatus } from '../features/system/model';
import { installMobileViewportController } from '../legacy/shell';
import { useUiStore } from '../state/uiStore';
import { CommandPalette } from './CommandPalette';
import {
  NAVIGATION_ITEMS,
  commandPaletteShortcutLabel,
  navigationLabel,
  shellText,
  type AppSurface,
} from './navigation';
import { ThemeControls } from './ThemeControls';
import { SurfaceContent } from './SurfaceContent';
import styles from './Shell.module.css';

function TopNavButton({
  surface,
  label,
  active,
  onSelect,
}: {
  surface: AppSurface;
  label: string;
  active: boolean;
  onSelect: (surface: AppSurface) => void;
}) {
  return (
    <button
      type="button"
      className={styles.topNavButton}
      data-active={active ? 'true' : 'false'}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(surface)}
    >
      {label}
    </button>
  );
}

function Topbar() {
  const surface = useUiStore((state) => state.surface);
  const language = useUiStore((state) => state.uiLanguage);
  const navigate = useUiStore((state) => state.navigate);
  const toggleLanguage = useUiStore((state) => state.toggleUiLanguage);
  const openCommands = useUiStore((state) => state.setCommandPaletteOpen);

  const platform = typeof navigator === 'undefined'
    ? ''
    : (((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform)
      || navigator.platform
      || navigator.userAgent);
  const commandShortcut = commandPaletteShortcutLabel(platform);

  return (
    <header className={styles.topbar}>
      <button
        type="button"
        className={styles.brand}
        onClick={() => navigate('home')}
        aria-label={language === 'de' ? 'Rhyme Bureau Intro' : 'Rhyme Bureau intro'}
      >
        <span className={styles.brandMark} aria-hidden="true">rb.</span>
        <span className={styles.brandName}>
          <b>rhyme bureau</b>
          <small>Phonetic License to Slay.</small>
        </span>
      </button>

      <nav className={styles.topNavigation} data-rhymelab-control="shell.navigation">
        {NAVIGATION_ITEMS.map((item) => (
          <TopNavButton
            key={item.id}
            surface={item.id}
            label={navigationLabel(item, language)}
            active={surface === item.id}
            onSelect={navigate}
          />
        ))}

        <button
          type="button"
          className={styles.topNavButton}
          data-command="true"
          onClick={() => openCommands(true)}
          aria-label={shellText('Befehle öffnen', language)}
        >
          <span>{language === 'de' ? 'Befehle' : 'Commands'}</span>
          <kbd>{commandShortcut}</kbd>
        </button>

        <TopNavButton
          surface="settings"
          label={shellText('Einstellungen', language)}
          active={surface === 'settings'}
          onSelect={navigate}
        />
      </nav>

      <div className={styles.topbarActions}>
        <Button
          className={styles.languageButton}
          onClick={toggleLanguage}
          aria-label={language === 'de'
            ? 'Switch interface to English'
            : 'Oberfläche auf Deutsch umstellen'}
          data-rhymelab-control="shell.language"
          title={language === 'de'
            ? 'UI: Deutsch · click for English'
            : 'UI: English · Klick für Deutsch'}
        >
          {language.toUpperCase()}
        </Button>
        <ThemeControls />
      </div>

      <CommandPalette showTrigger={false} />
    </header>
  );
}

export function Shell() {
  const themeChoice = useUiStore((state) => state.themeChoice);
  const language = useUiStore((state) => state.uiLanguage);
  const surface = useUiStore((state) => state.surface);
  const focusMode = useUiStore((state) => state.focusMode);
  const reduceMotion = useReducedMotion();
  const startupErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyThemeToDocument(themeChoice);
  }, [themeChoice]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => installMobileViewportController({
    windowObj: window,
    documentElement: document.documentElement,
  }), []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const root = document.querySelector('[data-rhymelab-app-shell]') as HTMLElement | null;
      const status = collectReactStartupBindingStatus(document);
      if (root) root.dataset.rhymelabControls = status.ok ? 'bound' : 'failed';
      if (startupErrorRef.current) {
        startupErrorRef.current.hidden = status.ok;
        startupErrorRef.current.textContent = status.ok
          ? ''
          : 'React Studio initialization incomplete: ' + status.missing.join(', ');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [surface]);

  return (
    <motion.div
      className={styles.appShell}
      data-rhymelab-app-shell="true"
      data-rhymelab-controls="checking"
      data-focus={focusMode ? 'true' : 'false'}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div ref={startupErrorRef} className={styles.startupFailure} role="alert" hidden />
      <Topbar />
      <main
        className={styles.contentViewport}
        data-surface={surface}
        id="main-content"
        tabIndex={-1}
      >
        <SurfaceContent />
      </main>
    </motion.div>
  );
}
