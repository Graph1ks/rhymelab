import { motion, useReducedMotion } from 'motion/react';

import { R1_BRIDGE_RUNTIME_EXPORT_COUNT } from '../legacy/runtime-smoke';
import { useUiStore } from '../state/uiStore';
import type { AppSurface } from './navigation';
import { shellText } from './navigation';
import { Icon } from './icons';
import { SettingsPanel } from './SettingsPanel';
import styles from './Shell.module.css';

const CONTENT: Record<Exclude<AppSurface, 'settings'>, {
  kicker: string;
  titleDe: string;
  titleEn: string;
  descriptionDe: string;
  descriptionEn: string;
  phase: string;
}> = {
  studio: {
    kicker: 'RHYMEPAD / WRITING SESSION',
    titleDe: 'Dein Schreibraum.',
    titleEn: 'Your writing space.',
    descriptionDe: 'Die Shell-Geometrie steht. Editor- und Reimassistent-Semantik bleiben bis R3/R5 im Golden Master.',
    descriptionEn: 'The shell geometry is ready. Editor and rhyme-assistant semantics remain in the golden master until R3/R5.',
    phase: 'R5 EDITOR',
  },
  search: {
    kicker: 'SOUND EXPLORER',
    titleDe: 'Reimsuche.',
    titleEn: 'Rhyme search.',
    descriptionDe: 'Navigation und Layout sind portiert. Writer/Search-Funktionalität wird in R3 über die R1-Bridge angeschlossen.',
    descriptionEn: 'Navigation and layout are ported. Writer/Search functionality is connected through the R1 bridge in R3.',
    phase: 'R3 SEARCH / WRITER',
  },
  library: {
    kicker: 'LOCAL LIBRARY',
    titleDe: 'Meine Texte.',
    titleEn: 'My texts.',
    descriptionDe: 'Die Zieloberfläche ist angelegt; DocumentStore, Ordner, Trash und Recovery bleiben bis R4 unverändert im bestehenden Studio.',
    descriptionEn: 'The target surface is laid out; DocumentStore, folders, trash and recovery stay unchanged in the existing Studio until R4.',
    phase: 'R4 LIBRARY',
  },
  saved: {
    kicker: 'SAVED',
    titleDe: 'Merkliste.',
    titleEn: 'Saved.',
    descriptionDe: 'Der Navigationspfad steht. Gespeicherte Treffer werden erst mit der Search-/Writer-Parität angeschlossen.',
    descriptionEn: 'The navigation path is ready. Saved results connect only with Search/Writer parity.',
    phase: 'R3 SEARCH / WRITER',
  },
};

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

  const content = CONTENT[surface];
  const title = language === 'de' ? content.titleDe : content.titleEn;
  const description = language === 'de' ? content.descriptionDe : content.descriptionEn;

  if (surface === 'studio') {
    return (
      <motion.div
        key={surface}
        className={styles.studioFoundation}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      >
        <section className={styles.primaryFoundation}>
          <header className={styles.surfaceHeader}>
            <div>
              <p className={styles.kicker}>{content.kicker}</p>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <span className={styles.phaseBadge}>{content.phase}</span>
          </header>
          <div className={styles.foundationStack}>
            <FoundationCard
              label="R1 DOMAIN BRIDGE"
              title={language === 'de' ? 'Semantik bleibt am Original.' : 'Semantics stay at the original.'}
              copy={language === 'de'
                ? `${R1_BRIDGE_RUNTIME_EXPORT_COUNT} repräsentative Runtime-Exports laufen bereits durch die typisierte Legacy-Bridge.`
                : `${R1_BRIDGE_RUNTIME_EXPORT_COUNT} representative runtime exports already resolve through the typed legacy bridge.`}
              icon="spark"
            />
            <FoundationCard
              label="LAYOUT FOUNDATION"
              title={language === 'de' ? 'Ein Scroll-Owner pro Oberfläche.' : 'One scroll owner per surface.'}
              copy={language === 'de'
                ? 'App-Shell und Viewport bleiben fest; nur die aktive Inhaltsfläche scrollt.'
                : 'The app shell and viewport stay fixed; only the active content surface scrolls.'}
              icon="pen"
            />
          </div>
        </section>

        <aside className={styles.assistFoundation}>
          <div className={styles.assistHeader}>
            <span><Icon name="search" /></span>
            <div>
              <p className={styles.kicker}>SOUND EXPLORER</p>
              <h2>{language === 'de' ? 'Assistenzfläche reserviert.' : 'Assistant surface reserved.'}</h2>
            </div>
          </div>
          <p>
            {language === 'de'
              ? 'R3 schließt hier Search/Writer an. Keine Fake-Treffer und keine neue Suchlogik in R2.'
              : 'R3 connects Search/Writer here. No fake results and no new search logic in R2.'}
          </p>
          <div className={styles.assistSkeleton} aria-hidden="true">
            <i /><i /><i /><i />
          </div>
        </aside>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={surface}
      className={styles.surfacePage}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <header className={styles.surfaceHeader}>
        <div>
          <p className={styles.kicker}>{content.kicker}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className={styles.phaseBadge}>{content.phase}</span>
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
          title={language === 'de' ? 'Funktion bleibt unverändert' : 'Function stays unchanged'}
          copy={language === 'de'
            ? 'Die aktive Produktfunktion bleibt bis zur jeweiligen Port-Phase im bestehenden Studio.'
            : 'The active product function remains in the existing Studio until its port phase.'}
          icon="spark"
        />
      </div>
    </motion.div>
  );
}
