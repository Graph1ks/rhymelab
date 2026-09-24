import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { Button, Drawer } from '../design-system/primitives';
import { applyThemeToDocument } from '../design-system/theme';
import { installMobileViewportController } from '../legacy/shell';
import { useUiStore } from '../state/uiStore';
import {
  NAVIGATION_ITEMS,
  navigationLabel,
  shellText,
  type AppSurface,
} from './navigation';
import { CommandPalette } from './CommandPalette';
import { Icon } from './icons';
import { SettingsPanel } from './SettingsPanel';
import { SurfaceContent } from './SurfaceContent';
import { ThemeControls } from './ThemeControls';
import styles from './Shell.module.css';

function NavButton({
  surface,
  label,
  icon,
  shortcut,
  active,
  onSelect,
  compact = false,
}: {
  surface: AppSurface;
  label: string;
  icon: 'pen' | 'search' | 'grid' | 'bookmark' | 'settings';
  shortcut?: string;
  active: boolean;
  onSelect: (surface: AppSurface) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.navButton}
      data-active={active ? 'true' : 'false'}
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      onClick={() => onSelect(surface)}
    >
      <Icon name={icon} />
      <span className={styles.navLabel}>{label}</span>
      {shortcut ? <kbd className={styles.navKey}>{shortcut}</kbd> : null}
    </button>
  );
}

function Sidebar() {
  const surface = useUiStore((state) => state.surface);
  const language = useUiStore((state) => state.uiLanguage);
  const navigate = useUiStore((state) => state.navigate);

  return (
    <aside className={styles.sidebar} aria-label={language === 'de' ? 'Hauptnavigation' : 'Main navigation'}>
      <button
        type="button"
        className={styles.brand}
        onClick={() => navigate('studio')}
        aria-label="RhymeLab Studio"
      >
        <span className={styles.brandMark}>r.</span>
        <span className={styles.brandName}>rhymelab</span>
      </button>

      <nav className={styles.navList}>
        {NAVIGATION_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            surface={item.id}
            label={navigationLabel(item, language)}
            icon={item.icon}
            shortcut={item.shortcut}
            active={surface === item.id}
            onSelect={navigate}
          />
        ))}
      </nav>

      <section className={styles.sidebarContext} aria-label={language === 'de' ? 'Workspace-Status' : 'Workspace status'}>
        <p className={styles.kicker}>R2 REACT SHELL</p>
        <b>{shellText('Shell bereit', language)}</b>
        <small>
          {language === 'de'
            ? 'Fachfunktionen bleiben bis zu ihren Port-Phasen im Golden Master.'
            : 'Domain functions remain in the golden master until their port phases.'}
        </small>
      </section>

      <div className={styles.sidebarBottom}>
        <NavButton
          surface="settings"
          label={shellText('Einstellungen', language)}
          icon="settings"
          active={surface === 'settings'}
          onSelect={navigate}
        />
        <div className={styles.profile}>
          <span className={styles.avatar}>G</span>
          <span>
            <b>{language === 'de' ? 'Dein Workspace' : 'Your workspace'}</b>
            <small>{shellText('Lokal. In deinem Flow.', language)}</small>
          </span>
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
  const surface = useUiStore((state) => state.surface);
  const language = useUiStore((state) => state.uiLanguage);
  const toggleLanguage = useUiStore((state) => state.toggleUiLanguage);

  const activeItem = NAVIGATION_ITEMS.find((item) => item.id === surface);
  const surfaceLabel = surface === 'settings'
    ? shellText('Einstellungen', language)
    : activeItem
      ? navigationLabel(activeItem, language)
      : 'Studio';

  return (
    <header className={styles.topbar}>
      <div className={styles.breadcrumb}>
        <span>WORKSPACE</span>
        <i>/</i>
        <b>{surfaceLabel}</b>
      </div>

      <div className={styles.topbarActions}>
        <span className={styles.localStatus}>
          <i />
          {language === 'de' ? 'LOKAL' : 'LOCAL'}
        </span>
        <span className={styles.previewBadge}>{shellText('React Studio Vorschau', language)}</span>
        <CommandPalette />
        <Button
          className={styles.languageButton}
          onClick={toggleLanguage}
          aria-label={language === 'de'
            ? 'Switch interface to English'
            : 'Oberfläche auf Deutsch umstellen'}
          title={language === 'de'
            ? 'UI: Deutsch · click for English'
            : 'UI: English · Klick für Deutsch'}
        >
          {language.toUpperCase()}
        </Button>
        <ThemeControls />
      </div>
    </header>
  );
}

function MobileNavigation() {
  const surface = useUiStore((state) => state.surface);
  const language = useUiStore((state) => state.uiLanguage);
  const navigate = useUiStore((state) => state.navigate);
  const openSettings = useUiStore((state) => state.setSettingsDrawerOpen);
  const moreRef = useRef<HTMLButtonElement>(null);
  const wasDrawerOpenRef = useRef(false);
  const drawerOpen = useUiStore((state) => state.settingsDrawerOpen);

  useEffect(() => {
    if (wasDrawerOpenRef.current && !drawerOpen) {
      requestAnimationFrame(() => {
        if (document.documentElement.clientWidth <= 800) moreRef.current?.focus({ preventScroll: true });
      });
    }
    wasDrawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  return (
    <>
      <nav className={styles.mobileNav} aria-label={language === 'de' ? 'Mobile Navigation' : 'Mobile navigation'}>
        {NAVIGATION_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.mobileNavButton}
            data-active={surface === item.id ? 'true' : 'false'}
            aria-current={surface === item.id ? 'page' : undefined}
            onClick={() => navigate(item.id)}
          >
            <Icon name={item.icon} />
            <span>{navigationLabel(item, language, true)}</span>
          </button>
        ))}
        <button
          ref={moreRef}
          type="button"
          className={styles.mobileNavButton}
          data-active={drawerOpen || surface === 'settings' ? 'true' : 'false'}
          onClick={() => openSettings(true)}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
        >
          <Icon name="settings" />
          <span>{shellText('Mehr', language)}</span>
        </button>
      </nav>

      <Drawer.Root
        open={drawerOpen}
        onOpenChange={openSettings}
        swipeDirection="down"
      >
        <Drawer.Portal>
          <Drawer.Backdrop className={styles.drawerBackdrop} />
          <Drawer.Viewport className={styles.drawerViewport}>
            <Drawer.Popup className={styles.drawerPopup}>
              <div className={styles.drawerHandle} aria-hidden="true" />
              <Drawer.Content className={styles.drawerContent}>
                <div className={styles.drawerHeader}>
                  <div>
                    <p className={styles.kicker}>RHYME LAB</p>
                    <Drawer.Title>{shellText('Einstellungen', language)}</Drawer.Title>
                    <Drawer.Description>
                      {language === 'de'
                        ? 'Schnellzugriff auf Darstellung und Shell-Befehle.'
                        : 'Quick access to appearance and shell commands.'}
                    </Drawer.Description>
                  </div>
                  <Drawer.Close className={styles.closeButton} aria-label={shellText('Zurück', language)}>
                    <Icon name="close" />
                  </Drawer.Close>
                </div>
                <SettingsPanel compact />
                <Button
                  className={styles.drawerFullSettings}
                  onClick={() => {
                    navigate('settings');
                    openSettings(false);
                  }}
                >
                  <Icon name="settings" />
                  {language === 'de' ? 'Alle Einstellungen öffnen' : 'Open all settings'}
                </Button>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

export function Shell() {
  const themeChoice = useUiStore((state) => state.themeChoice);
  const language = useUiStore((state) => state.uiLanguage);
  const surface = useUiStore((state) => state.surface);
  const reduceMotion = useReducedMotion();

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

  return (
    <motion.div
      className={styles.appShell}
      data-rhymelab-controls="bound"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <Sidebar />
      <div className={styles.main}>
        <Topbar />
        <main
          className={styles.contentViewport}
          data-surface={surface}
          id="main-content"
          tabIndex={-1}
        >
          <SurfaceContent />
        </main>
      </div>
      <MobileNavigation />
    </motion.div>
  );
}
