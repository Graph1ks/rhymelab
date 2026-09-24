import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { Dialog } from '../design-system/primitives';

import { EditorSessionProvider } from '../features/editor/EditorSessionProvider';
import { useUiStore } from '../state/uiStore';
import { Icon } from './icons';
import { shellText, type AppSurface } from './navigation';
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

const SURFACE_TRANSITION_COPY: Record<AppSurface, {
  order: string;
  titleDe: string;
  titleEn: string;
  descriptorDe: string;
  descriptorEn: string;
}> = {
  home: {
    order: '00 / 05',
    titleDe: 'Start',
    titleEn: 'Home',
    descriptorDe: 'Rhyme Bureau · Arbeitsfläche',
    descriptorEn: 'Rhyme Bureau · Desk',
  },
  studio: {
    order: '01 / 05',
    titleDe: 'Studio',
    titleEn: 'Studio',
    descriptorDe: 'Schreiben · Analyse · Perform',
    descriptorEn: 'Write · Analysis · Perform',
  },
  search: {
    order: '02 / 05',
    titleDe: 'Reimsuche',
    titleEn: 'Rhyme Search',
    descriptorDe: 'Laute, Reime und Verwandtschaften',
    descriptorEn: 'Sounds, rhymes and relationships',
  },
  library: {
    order: '03 / 05',
    titleDe: 'Bibliothek',
    titleEn: 'Library',
    descriptorDe: 'Lokales Textarchiv',
    descriptorEn: 'Local writing archive',
  },
  saved: {
    order: '04 / 05',
    titleDe: 'Merkliste',
    titleEn: 'Saved',
    descriptorDe: 'Gesicherte Fundstücke',
    descriptorEn: 'Saved discoveries',
  },
  settings: {
    order: '05 / 05',
    titleDe: 'Einstellungen',
    titleEn: 'Settings',
    descriptorDe: 'Bureau kalibrieren',
    descriptorEn: 'Calibrate the Bureau',
  },
};

function SurfaceTransition({
  surface,
  children,
}: {
  surface: AppSurface;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const language = useUiStore((state) => state.uiLanguage);
  const transitionCopy = SURFACE_TRANSITION_COPY[surface];

  return (
    <div className={styles.surfaceTransition} data-transition={surface}>
      {!reduceMotion ? (
        <div
          key={`transition-${surface}`}
          className={styles.pageTransition}
          data-transition={surface}
          aria-hidden="true"
        >
          <div className={styles.transitionVeil} />
          <div className={styles.transitionRouteLine} />
          <div className={styles.transitionDestination}>
            <span className={styles.transitionEyebrow}>
              <span>{language === 'de' ? 'WECHSEL ZU' : 'OPENING'}</span>
              <b>{transitionCopy.order}</b>
            </span>
            <strong>
              {language === 'de' ? transitionCopy.titleDe : transitionCopy.titleEn}
            </strong>
            <span className={styles.transitionDescriptor}>
              {language === 'de'
                ? transitionCopy.descriptorDe
                : transitionCopy.descriptorEn}
            </span>
          </div>
        </div>
      ) : null}
      <div
        className={styles.surfaceTransitionBody}
        data-transition={surface}
      >
        {children}
      </div>
    </div>
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

  useEffect(() => {
    if (!studioSearchEnabled && mobileStudioPane === 'results') {
      setMobileStudioPane('editor');
    }
  }, [mobileStudioPane, studioSearchEnabled]);

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

          {studioSearchEnabled ? (
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
              {assistCollapsed ? (
                <span className={styles.assistRailLabel}>SOUND EXPLORER</span>
              ) : !focusMode ? (
                <DeferredSurface><SearchExperience variant="assistant" enabled /></DeferredSurface>
              ) : null}
            </aside>
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
  const surface = useUiStore((state) => state.surface);
  return (
    <SurfaceTransition surface={surface}>
      <SurfaceContentBody />
    </SurfaceTransition>
  );
}
