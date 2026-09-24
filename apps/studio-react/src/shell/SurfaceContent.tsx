import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';

import { Dialog } from '../design-system/primitives';

import { EditorSessionProvider } from '../features/editor/EditorSessionProvider';
import { useUiStore } from '../state/uiStore';
import { Icon } from './icons';
import { shellText } from './navigation';
import styles from './Shell.module.css';

const HomePage = lazy(() => import('../features/intro/HomePage').then((module) => ({ default: module.HomePage })));
const LibraryWorkspace = lazy(() => import('../features/library/LibraryWorkspace').then((module) => ({ default: module.LibraryWorkspace })));
const AnalysisWorkspace = lazy(() => import('../features/analysis/AnalysisWorkspace').then((module) => ({ default: module.AnalysisWorkspace })));
const EditorWorkspace = lazy(() => import('../features/editor/EditorWorkspace').then((module) => ({ default: module.EditorWorkspace })));
const PerformanceWorkspace = lazy(() => import('../features/perform/PerformanceWorkspace').then((module) => ({ default: module.PerformanceWorkspace })));
const SavedWorkspace = lazy(() => import('../features/search/SavedWorkspace').then((module) => ({ default: module.SavedWorkspace })));
const SearchExperience = lazy(() => import('../features/search/SearchExperience').then((module) => ({ default: module.SearchExperience })));
const SettingsPanel = lazy(() => import('./SettingsPanel').then((module) => ({ default: module.SettingsPanel })));

function DeferredSurface({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={(
        <div className={styles.surfaceLoading} aria-live="polite" aria-busy="true">
          <span />
          <b>RHYME BUREAU</b>
        </div>
      )}
    >
      {children}
    </Suspense>
  );
}

function copyPresentationToPopout(popup: Window) {
  const sourceRoot = document.documentElement;
  const targetRoot = popup.document.documentElement;
  targetRoot.className = sourceRoot.className;
  targetRoot.style.cssText = sourceRoot.style.cssText;
  targetRoot.lang = sourceRoot.lang;

  for (const attribute of Array.from(sourceRoot.attributes)) {
    if (attribute.name === 'class' || attribute.name === 'style' || attribute.name === 'lang') continue;
    targetRoot.setAttribute(attribute.name, attribute.value);
  }

  popup.document.body.className = document.body.className;
  popup.document.body.style.margin = '0';
  popup.document.body.style.overflow = 'hidden';
  popup.document.body.style.background = 'var(--rl-panel)';
}

function prepareSoundExplorerPopout(popup: Window): HTMLElement {
  const doc = popup.document;
  doc.open();
  doc.write('<!doctype html><html><head></head><body><div id="sound-explorer-popout-root"></div></body></html>');
  doc.close();

  const base = doc.createElement('base');
  base.href = document.baseURI;
  doc.head.appendChild(base);

  const viewport = doc.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1';
  doc.head.appendChild(viewport);

  const title = doc.createElement('title');
  title.textContent = 'Rhyme Bureau · Sound Explorer';
  doc.head.appendChild(title);

  document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    doc.head.appendChild(node.cloneNode(true));
  });

  copyPresentationToPopout(popup);

  const root = doc.getElementById('sound-explorer-popout-root');
  if (!root) throw new Error('Sound Explorer popout root is missing.');
  return root;
}

function SoundExplorerPopout({
  popup,
  onClosed,
  children,
}: {
  popup: Window;
  onClosed: () => void;
  children: ReactNode;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (popup.closed) {
      onClosed();
      return undefined;
    }

    const root = prepareSoundExplorerPopout(popup);
    setContainer(root);

    const syncPresentation = () => copyPresentationToPopout(popup);
    const observer = new MutationObserver(syncPresentation);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-theme-mode'],
    });

    const handleClosed = () => onClosed();
    const closedPoll = window.setInterval(() => {
      if (popup.closed) onClosed();
    }, 350);
    popup.addEventListener('beforeunload', handleClosed);
    popup.addEventListener('pagehide', handleClosed);
    popup.focus();

    return () => {
      observer.disconnect();
      window.clearInterval(closedPoll);
      popup.removeEventListener('beforeunload', handleClosed);
      popup.removeEventListener('pagehide', handleClosed);
    };
  }, [popup]);

  if (!container || popup.closed) return null;

  return createPortal(
    <div className={styles.soundExplorerPopoutShell}>
      <header className={styles.soundExplorerPopoutBar}>
        <div>
          <b>SOUND EXPLORER</b>
          <span>{language === 'de' ? 'POPOUT · LIVE MIT STUDIO VERBUNDEN' : 'POPOUT · LIVE WITH STUDIO'}</span>
        </div>
        <button
          type="button"
          onClick={() => popup.close()}
          title={language === 'de' ? 'Zurück als Studio-Sidebar' : 'Return to Studio sidebar'}
        >
          ↙ {language === 'de' ? 'Andocken' : 'Dock'}
        </button>
      </header>
      <main className={styles.soundExplorerPopoutContent}>
        {children}
      </main>
    </div>,
    container,
  );
}

function SurfaceContentBody() {
  const surface = useUiStore((state) => state.surface);
  const language = useUiStore((state) => state.uiLanguage);
  const reduceMotion = useReducedMotion();
  const libraryOpen = useUiStore((state) => state.libraryOpen);
  const setLibraryOpen = useUiStore((state) => state.setLibraryOpen);
  const focusMode = useUiStore((state) => state.focusMode);
  const setFocusMode = useUiStore((state) => state.setFocusMode);
  const toggleFocusMode = useUiStore((state) => state.toggleFocusMode);
  const [mobileStudioPane, setMobileStudioPane] = useState<'editor' | 'results'>('editor');
  const [studioMode, setStudioMode] = useState<'write' | 'analysis' | 'perform'>('write');
  const [studioSearchEnabled, setStudioSearchEnabled] = useState(true);
  const [assistCollapsed, setAssistCollapsed] = useState(false);
  const [soundExplorerWindow, setSoundExplorerWindow] = useState<Window | null>(null);

  useEffect(() => {
    if (!studioSearchEnabled && mobileStudioPane === 'results') {
      setMobileStudioPane('editor');
    }
  }, [mobileStudioPane, studioSearchEnabled]);

  useEffect(() => {
    if (!soundExplorerWindow) return undefined;

    const closeWithStudio = () => {
      if (!soundExplorerWindow.closed) soundExplorerWindow.close();
    };
    window.addEventListener('beforeunload', closeWithStudio);
    return () => window.removeEventListener('beforeunload', closeWithStudio);
  }, [soundExplorerWindow]);

  useEffect(() => {
    if (!soundExplorerWindow) return;
    if (surface === 'studio' && studioSearchEnabled) return;
    if (!soundExplorerWindow.closed) soundExplorerWindow.close();
    setSoundExplorerWindow(null);
  }, [soundExplorerWindow, studioSearchEnabled, surface]);

  const openSoundExplorerPopout = () => {
    if (soundExplorerWindow && !soundExplorerWindow.closed) {
      soundExplorerWindow.focus();
      return;
    }

    const popup = window.open(
      '',
      'rhyme-bureau-sound-explorer',
      'popup=yes,width=1280,height=900,resizable=yes,scrollbars=no',
    );
    if (!popup) return;

    setAssistCollapsed(false);
    setMobileStudioPane('editor');
    setSoundExplorerWindow(popup);
  };

  useEffect(() => {
    if (surface !== 'studio' || (studioMode !== 'write' && studioMode !== 'perform')) {
      if (focusMode) setFocusMode(false);
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape' && focusMode) {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (
        (event.ctrlKey || event.metaKey)
        && event.shiftKey
        && event.key.toLocaleLowerCase() === 'f'
      ) {
        event.preventDefault();
        toggleFocusMode();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [focusMode, setFocusMode, studioMode, surface, toggleFocusMode]);

  if (surface === 'home') {
    return <DeferredSurface><HomePage /></DeferredSurface>;
  }

  if (surface === 'settings') {
    return (
      <motion.div
        key="settings"
        className={styles.surfacePage}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <header className={styles.surfaceHeader}>
          <div>
            <p className={styles.kicker}>SETTINGS</p>
            <h1>{shellText('Einstellungen', language)}</h1>
          </div>
          <span className={styles.phaseBadge}>BUREAU / PERSONAL EDITION</span>
        </header>
        <DeferredSurface><SettingsPanel /></DeferredSurface>
      </motion.div>
    );
  }

  if (surface === 'search') {
    return (
      <motion.div
        key="search"
        className={styles.searchSurface}
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
      >
        <DeferredSurface><SearchExperience variant="page" /></DeferredSurface>
      </motion.div>
    );
  }

  if (surface === 'saved') {
    return (
      <motion.div
        key="saved"
        className={styles.searchSurface}
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
      >
        <DeferredSurface><SavedWorkspace /></DeferredSurface>
      </motion.div>
    );
  }

  if (surface === 'studio') {
    return (
      <EditorSessionProvider>
        <motion.div
          key="studio"
          className={styles.studioFoundation}
          data-mobile-pane={mobileStudioPane}
          data-studio-mode={studioMode}
          data-focus={focusMode ? 'true' : 'false'}
          data-assist-collapsed={assistCollapsed ? 'true' : 'false'}
          data-search-enabled={studioSearchEnabled ? 'true' : 'false'}
          data-search-popout={soundExplorerWindow && !soundExplorerWindow.closed ? 'true' : 'false'}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          {focusMode ? (
            <button
              type="button"
              className={styles.focusExit}
              onClick={() => setFocusMode(false)}
              aria-label={language === 'de' ? 'Fokusmodus beenden' : 'Exit focus mode'}
              title={language === 'de' ? 'Fokus beenden · Esc' : 'Exit focus · Esc'}
            >
              ×
            </button>
          ) : null}
          <div className={styles.mobileStudioSwap} role="group" aria-label={language === 'de' ? 'Mobile Studio Ansicht' : 'Mobile Studio view'}>
            <button
              type="button"
              data-active={mobileStudioPane === 'editor' ? 'true' : 'false'}
              aria-pressed={mobileStudioPane === 'editor'}
              onClick={() => setMobileStudioPane('editor')}
            >
              {language === 'de' ? 'Editor' : 'Editor'}
            </button>
            {studioSearchEnabled ? (
              <button
                type="button"
                data-active={mobileStudioPane === 'results' ? 'true' : 'false'}
                aria-pressed={mobileStudioPane === 'results'}
                onClick={() => setMobileStudioPane('results')}
              >
                {language === 'de' ? 'Reime' : 'Rhymes'}
              </button>
            ) : null}
          </div>
          <section className={styles.primaryFoundation}>
            <div className={styles.studioModeBar} role="group" aria-label={language === 'de' ? 'Studio Modus' : 'Studio mode'}>
              <button
                type="button"
                data-active={studioMode === 'write' ? 'true' : 'false'}
                aria-pressed={studioMode === 'write'}
                onClick={() => {
                  setFocusMode(false);
                  setStudioMode('write');
                }}
              >
                <Icon name="pen" />
                {language === 'de' ? 'Schreiben' : 'Write'}
              </button>
              <button
                type="button"
                data-active={studioMode === 'analysis' ? 'true' : 'false'}
                aria-pressed={studioMode === 'analysis'}
                onClick={() => {
                  setFocusMode(false);
                  setStudioMode('analysis');
                }}
              >
                <Icon name="grid" />
                {language === 'de' ? 'Analyse' : 'Analysis'}
              </button>
              <button
                type="button"
                data-active={studioMode === 'perform' ? 'true' : 'false'}
                aria-pressed={studioMode === 'perform'}
                onClick={() => {
                  setFocusMode(false);
                  setStudioMode('perform');
                }}
              >
                <Icon name="waveform" />
                Perform
              </button>
              {(studioMode === 'write' || studioMode === 'perform') ? (
                <button
                  type="button"
                  className={styles.focusTrigger}
                  data-active={focusMode ? 'true' : 'false'}
                  aria-pressed={focusMode}
                  title={language === 'de'
                    ? 'Fokusmodus · Ctrl/⌘ + Shift + F · Esc beendet'
                    : 'Focus mode · Ctrl/⌘ + Shift + F · Esc exits'}
                  onClick={toggleFocusMode}
                >
                  {focusMode
                    ? (language === 'de' ? 'Fokus beenden' : 'Exit focus')
                    : (language === 'de' ? 'Fokus' : 'Focus')}
                  <kbd>⇧F</kbd>
                </button>
              ) : null}
              {studioMode === 'write' ? (
                <button
                  type="button"
                  className={styles.searchToggle}
                  data-active={studioSearchEnabled ? 'true' : 'false'}
                  aria-pressed={studioSearchEnabled}
                  onClick={() => setStudioSearchEnabled((value) => !value)}
                  title={language === 'de'
                    ? 'Studio-Reimsuche ein-/ausschalten'
                    : 'Enable or disable Studio rhyme search'}
                >
                  {studioSearchEnabled
                    ? (language === 'de' ? 'Reimsuche an' : 'Rhymes on')
                    : (language === 'de' ? 'Reimsuche aus' : 'Rhymes off')}
                </button>
              ) : null}
              <button
                type="button"
                className={styles.libraryTrigger}
                onClick={() => setLibraryOpen(true)}
              >
                <Icon name="folder" />
                {language === 'de' ? 'Bibliothek' : 'Library'}
              </button>
            </div>
            <div className={styles.studioModeSurface} data-mode={studioMode}>
              {studioMode === 'write' ? (
                <DeferredSurface><EditorWorkspace focusMode={focusMode} /></DeferredSurface>
              ) : null}
              {studioMode === 'analysis' ? (
                <DeferredSurface>
                  <AnalysisWorkspace onOpenEditor={() => setStudioMode('write')} />
                </DeferredSurface>
              ) : null}
              {studioMode === 'perform' ? (
                <DeferredSurface>
                  <PerformanceWorkspace focusMode={focusMode} onOpenEditor={() => { setFocusMode(false); setStudioMode('write'); }} />
                </DeferredSurface>
              ) : null}
            </div>
          </section>

          {studioSearchEnabled && (!soundExplorerWindow || soundExplorerWindow.closed) ? (
            <aside
              className={styles.assistFoundation}
              data-r3="true"
              data-collapsed={assistCollapsed ? 'true' : 'false'}
            >
              <button
                type="button"
                className={styles.assistCollapse}
                onClick={() => setAssistCollapsed((value) => !value)}
                aria-label={assistCollapsed
                  ? (language === 'de' ? 'Sound Explorer ausklappen' : 'Expand Sound Explorer')
                  : (language === 'de' ? 'Sound Explorer minimieren' : 'Collapse Sound Explorer')}
                title={assistCollapsed
                  ? (language === 'de' ? 'Sound Explorer ausklappen' : 'Expand Sound Explorer')
                  : (language === 'de' ? 'Sound Explorer minimieren' : 'Collapse Sound Explorer')}
              >
                <Icon name="chevron" />
              </button>
              {!assistCollapsed ? (
                <button
                  type="button"
                  className={styles.assistPopout}
                  onClick={openSoundExplorerPopout}
                  aria-label={language === 'de'
                    ? 'Sound Explorer in eigenem Fenster öffnen'
                    : 'Open Sound Explorer in its own window'}
                  title={language === 'de'
                    ? 'Popout · für zweiten Monitor'
                    : 'Pop out · for a second monitor'}
                >
                  ↗
                </button>
              ) : null}
              {assistCollapsed ? (
                <span className={styles.assistRailLabel}>SOUND EXPLORER</span>
              ) : !focusMode ? (
                <DeferredSurface><SearchExperience variant="assistant" enabled /></DeferredSurface>
              ) : null}
            </aside>
          ) : null}

          {studioSearchEnabled && soundExplorerWindow && !soundExplorerWindow.closed ? (
            <SoundExplorerPopout
              popup={soundExplorerWindow}
              onClosed={() => setSoundExplorerWindow(null)}
            >
              <DeferredSurface>
                <SearchExperience
                  variant="popout"
                  enabled
                  portalContainer={soundExplorerWindow.document.body}
                />
              </DeferredSurface>
            </SoundExplorerPopout>
          ) : null}

          <Dialog.Root open={libraryOpen} onOpenChange={setLibraryOpen}>
            <Dialog.Portal>
              <Dialog.Backdrop className={styles.libraryDialogBackdrop} />
              <Dialog.Viewport className={styles.libraryDialogViewport}>
                <Dialog.Popup className={styles.libraryDialog}>
                  <div className={styles.libraryDialogHead}>
                    <div>
                      <p>LOCAL LIBRARY</p>
                      <h2>{language === 'de' ? 'Bibliothek' : 'Library'}</h2>
                    </div>
                    <Dialog.Close aria-label={language === 'de' ? 'Schließen' : 'Close'}>×</Dialog.Close>
                  </div>
                  <DeferredSurface><LibraryWorkspace onDone={() => setLibraryOpen(false)} /></DeferredSurface>
                </Dialog.Popup>
              </Dialog.Viewport>
            </Dialog.Portal>
          </Dialog.Root>
        </motion.div>
      </EditorSessionProvider>
    );
  }

  return (
    <motion.div
      key="library"
      className={styles.searchSurface}
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
    >
      <DeferredSurface><LibraryWorkspace /></DeferredSurface>
    </motion.div>
  );
}

export function SurfaceContent() {
  return <SurfaceContentBody />;
}
