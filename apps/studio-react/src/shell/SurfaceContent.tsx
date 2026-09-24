import { motion, useReducedMotion } from 'motion/react';

import { SavedWorkspace } from '../features/search/SavedWorkspace';
import { SearchExperience } from '../features/search/SearchExperience';
import { R1_BRIDGE_RUNTIME_EXPORT_COUNT } from '../legacy/runtime-smoke';
import { useUiStore } from '../state/uiStore';
import { shellText } from './navigation';
import { Icon } from './icons';
import { SettingsPanel } from './SettingsPanel';
import styles from './Shell.module.css';

function FoundationCard({
  label,
  title,
  copy,
  icon,
}: {
  label: string;
  title: string;
  copy: string;
  icon: 'pen' | 'search' | 'grid' | 'spark';
}) {
  return (
    <article className={styles.foundationCard}>
      <span className={styles.foundationIcon}><Icon name={icon} /></span>
      <div>
        <p className={styles.kicker}>{label}</p>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
    </article>
  );
}

export function SurfaceContent() {
  const surface = useUiStore((state) => state.surface);
  const language = useUiStore((state) => state.uiLanguage);
  const reduceMotion = useReducedMotion();

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
      <motion.div
        key="studio"
        className={styles.studioFoundation}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      >
        <section className={styles.primaryFoundation}>
          <header className={styles.surfaceHeader}>
            <div>
              <p className={styles.kicker}>RHYMEPAD / WRITING SESSION</p>
              <h1>{language === 'de' ? 'Dein Schreibraum.' : 'Your writing space.'}</h1>
              <p>
                {language === 'de'
                  ? 'Search/Writer ist live in React. Der Editor selbst bleibt bis R5 im Golden Master, damit keine Selection-/IME-/Bar-Semantik vorgezogen wird.'
                  : 'Search/Writer is live in React. The editor itself stays in the golden master until R5 so selection, IME and Bar semantics are not pulled forward.'}
              </p>
            </div>
            <span className={styles.phaseBadge}>R5 EDITOR</span>
          </header>
          <div className={styles.foundationStack}>
            <FoundationCard
              label="R1 DOMAIN BRIDGE"
              title={language === 'de' ? 'Semantik bleibt am Original.' : 'Semantics stay at the original.'}
              copy={language === 'de'
                ? `${R1_BRIDGE_RUNTIME_EXPORT_COUNT} repräsentative Runtime-Exports laufen durch die typisierte Legacy-Bridge.`
                : `${R1_BRIDGE_RUNTIME_EXPORT_COUNT} representative runtime exports resolve through the typed legacy bridge.`}
              icon="spark"
            />
            <FoundationCard
              label="R3 SEARCH / WRITER"
              title={language === 'de' ? 'Der Reimassistent ist bereits live.' : 'The rhyme assistant is already live.'}
              copy={language === 'de'
                ? 'Dieselbe SearchState-/Writer-Pipeline wird rechts und auf der Search-Seite verwendet.'
                : 'The same SearchState/Writer pipeline is used here and on the Search surface.'}
              icon="search"
            />
            <FoundationCard
              label="R5 EDITOR"
              title={language === 'de' ? 'Einsetzen bleibt korrekt blockiert.' : 'Insert stays correctly blocked.'}
              copy={language === 'de'
                ? 'Erst der Editor-Port liefert Selection Proof, stabile Bar-IDs, IME und Undo/Redo für sichere Insert-Aktionen.'
                : 'Only the editor port provides Selection Proof, stable Bar IDs, IME and undo/redo for safe insert actions.'}
              icon="pen"
            />
          </div>
        </section>

        <aside className={styles.assistFoundation} data-r3="true">
          <SearchExperience variant="assistant" />
        </aside>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="library"
      className={styles.surfacePage}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <header className={styles.surfaceHeader}>
        <div>
          <p className={styles.kicker}>LOCAL LIBRARY</p>
          <h1>{language === 'de' ? 'Meine Texte.' : 'My texts.'}</h1>
          <p>
            {language === 'de'
              ? 'DocumentStore, Ordner, Trash und Recovery bleiben bis R4 unverändert im bestehenden Studio.'
              : 'DocumentStore, folders, trash and recovery remain unchanged in the existing Studio until R4.'}
          </p>
        </div>
        <span className={styles.phaseBadge}>R4 LIBRARY</span>
      </header>
      <div className={styles.foundationGrid}>
        <FoundationCard
          label="R2"
          title={language === 'de' ? 'Shell & Navigation bereit' : 'Shell & navigation ready'}
          copy={language === 'de'
            ? 'Responsive Desktop-, Rail- und Mobile-Geometrie ist vorhanden.'
            : 'Responsive desktop, rail and mobile geometry is in place.'}
          icon="grid"
        />
        <FoundationCard
          label="GOLDEN MASTER"
          title={language === 'de' ? 'DocumentStore bleibt autoritativ' : 'DocumentStore stays authoritative'}
          copy={language === 'de'
            ? 'R4 portiert die Library auf denselben bestehenden IndexedDB-Store.'
            : 'R4 ports the Library onto the same existing IndexedDB store.'}
          icon="spark"
        />
      </div>
    </motion.div>
  );
}
