import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { LibraryWorkspace } from '../features/library/LibraryWorkspace';
import { EditorSessionProvider } from '../features/editor/EditorSessionProvider';
import { EditorWorkspace } from '../features/editor/EditorWorkspace';
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
  const [mobileStudioPane, setMobileStudioPane] = useState<'editor' | 'results'>('editor');

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
            <EditorWorkspace />
          </section>

          <aside className={styles.assistFoundation} data-r3="true">
            <SearchExperience variant="assistant" />
          </aside>
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
