import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { Dialog } from '../design-system/primitives';

import { HomePage } from '../features/home/HomePage';
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
  const [mobileStudioPane, setMobileStudioPane] = useState<'editor' | 'results'>('editor');
  const [studioMode, setStudioMode] = useState<'write' | 'analysis' | 'perform'>('write');

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
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
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
                onClick={() => setStudioMode('write')}
              >
                {language === 'de' ? 'Schreiben' : 'Write'}
              </button>
              <button
                type="button"
                data-active={studioMode === 'analysis' ? 'true' : 'false'}
                aria-pressed={studioMode === 'analysis'}
                onClick={() => setStudioMode('analysis')}
              >
                {language === 'de' ? 'Analyse' : 'Analysis'}
              </button>
              <button
                type="button"
                data-active={studioMode === 'perform' ? 'true' : 'false'}
                aria-pressed={studioMode === 'perform'}
                onClick={() => setStudioMode('perform')}
              >
                Perform
              </button>
              <button
                type="button"
                className={styles.libraryTrigger}
                onClick={() => setLibraryOpen(true)}
              >
                {language === 'de' ? 'Bibliothek' : 'Library'}
              </button>
            </div>
            <div className={styles.studioModeSurface} data-mode={studioMode}>
              {studioMode === 'write' ? <EditorWorkspace /> : null}
              {studioMode === 'analysis' ? (
                <AnalysisWorkspace onOpenEditor={() => setStudioMode('write')} />
              ) : null}
              {studioMode === 'perform' ? (
                <PerformanceWorkspace onOpenEditor={() => setStudioMode('write')} />
              ) : null}
            </div>
          </section>

          <aside className={styles.assistFoundation} data-r3="true">
            <SearchExperience variant="assistant" />
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
