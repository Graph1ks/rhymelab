import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { Dialog } from '../design-system/primitives';

import { HomePage } from '../features/intro/HomePage';
import { LibraryWorkspace } from '../features/library/LibraryWorkspace';
import { AnalysisWorkspace } from '../features/analysis/AnalysisWorkspace';
import { EditorSessionProvider } from '../features/editor/EditorSessionProvider';
import { EditorWorkspace } from '../features/editor/EditorWorkspace';
import { PerformanceWorkspace } from '../features/perform/PerformanceWorkspace';
import { SavedWorkspace } from '../features/search/SavedWorkspace';
import { SearchExperience } from '../features/search/SearchExperience';
import { useUiStore } from '../state/uiStore';
import { shellText } from './navigation';
import { SettingsPanel } from './SettingsPanel';
import styles from './Shell.module.css';

export function SurfaceContent() {
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
    return <HomePage />;
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
          <span className={styles.phaseBadge}>R2 SHELL</span>
        </header>
        <SettingsPanel />
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
        <SearchExperience variant="page" />
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
        <SavedWorkspace />
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
            <button
              type="button"
              data-active={mobileStudioPane === 'results' ? 'true' : 'false'}
              aria-pressed={mobileStudioPane === 'results'}
              onClick={() => setMobileStudioPane('results')}
            >
              {language === 'de' ? 'Reime' : 'Rhymes'}
            </button>
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
                {language === 'de' ? 'Bibliothek' : 'Library'}
              </button>
            </div>
            <div className={styles.studioModeSurface} data-mode={studioMode}>
              {studioMode === 'write' ? <EditorWorkspace focusMode={focusMode} /> : null}
              {studioMode === 'analysis' ? (
                <AnalysisWorkspace onOpenEditor={() => setStudioMode('write')} />
              ) : null}
              {studioMode === 'perform' ? (
                <PerformanceWorkspace focusMode={focusMode} onOpenEditor={() => { setFocusMode(false); setStudioMode('write'); }} />
              ) : null}
            </div>
          </section>

          <aside
            className={styles.assistFoundation}
            data-r3="true"
            data-collapsed={assistCollapsed ? 'true' : 'false'}
            data-enabled={studioSearchEnabled ? 'true' : 'false'}
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
                : (language === 'de' ? 'Nach rechts minimieren' : 'Collapse to the right')}
            >
              {assistCollapsed ? '‹' : '›'}
            </button>
            {assistCollapsed ? (
              <span className={styles.assistRailLabel}>SOUND EXPLORER</span>
            ) : studioSearchEnabled && !focusMode ? (
              <SearchExperience variant="assistant" enabled />
            ) : (
              <div className={styles.searchPaused}>
                <p>SOUND EXPLORER</p>
                <b>{language === 'de' ? 'Reimsuche pausiert.' : 'Rhyme search paused.'}</b>
                <span>{language === 'de'
                  ? 'Keine Writer-Anfragen, bis du sie wieder einschaltest.'
                  : 'No Writer requests until you enable it again.'}</span>
                <button type="button" onClick={() => setStudioSearchEnabled(true)}>
                  {language === 'de' ? 'Reimsuche aktivieren' : 'Enable rhyme search'}
                </button>
              </div>
            )}
          </aside>

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
                  <LibraryWorkspace onDone={() => setLibraryOpen(false)} />
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
      <LibraryWorkspace />
    </motion.div>
  );
}
