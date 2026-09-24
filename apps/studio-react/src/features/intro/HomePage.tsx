import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';

import { Icon } from '../../shell/icons';
import { useUiStore } from '../../state/uiStore';
import styles from './Home.module.css';

const FEATURE_COPY = {
  de: [
    {
      eyebrow: 'SCHREIBEN',
      title: 'Ein Editor, der nicht im Weg steht.',
      copy: 'Bars, Silben, Abschnitte, Versionen und deine Schreibstimme bleiben direkt am Text. Keine Werkzeugleiste mit Existenzkrise.',
      icon: 'pen' as const,
    },
    {
      eyebrow: 'REIMEN',
      title: 'Nicht nur „Haus / Maus / Klaus“.',
      copy: 'Vollreime, Slant, Reimfamilien, Assonanz, Konsonanz, Phrasen und Entities laufen durch dieselbe Writer-Suche.',
      icon: 'search' as const,
    },
    {
      eyebrow: 'SEHEN',
      title: 'Rhyme Topology statt Farben-Konfetti.',
      copy: 'Analyse zeigt zusammenhängende Reimketten im vollständigen Text. Gruppen, Typen und Vorkommen bleiben lesbar, auch wenn der Song länger wird.',
      icon: 'grid' as const,
    },
    {
      eyebrow: 'BEHALTEN',
      title: 'Deine Texte wohnen lokal.',
      copy: 'Bibliothek, Versionen, Recovery und Workspace-Zustand bleiben lokal-first. Die kreative Katastrophe ist optional, der Backup-Punkt nicht.',
      icon: 'bookmark' as const,
    },
  ],
  en: [
    {
      eyebrow: 'WRITE',
      title: 'An editor that stays out of the way.',
      copy: 'Bars, syllables, sections, revisions and your writing voice stay close to the text. No toolbar having an existential crisis.',
      icon: 'pen' as const,
    },
    {
      eyebrow: 'RHYME',
      title: 'More than “night / light / fight”.',
      copy: 'Perfect, slant, families, assonance, consonance, phrases and entities run through the same Writer search.',
      icon: 'search' as const,
    },
    {
      eyebrow: 'SEE',
      title: 'Rhyme topology, not color confetti.',
      copy: 'Analysis keeps connected rhyme chains inside the complete lyric, with readable groups, types and occurrences.',
      icon: 'grid' as const,
    },
    {
      eyebrow: 'KEEP',
      title: 'Your texts live locally.',
      copy: 'Library, revisions, recovery and workspace state stay local-first. The creative catastrophe is optional; the recovery point is not.',
      icon: 'bookmark' as const,
    },
  ],
} as const;

export function HomePage() {
  const language = useUiStore((state) => state.uiLanguage);
  const navigate = useUiStore((state) => state.navigate);
  const reduceMotion = useReducedMotion();
  const features = FEATURE_COPY[language];

  const hero = language === 'de'
    ? {
        kicker: 'RHYME ENGINE · WRITING STUDIO',
        title: 'Schreib den Song. Wir kümmern uns um den Klang dahinter.',
        copy: 'Rhyme Bureau verbindet einen lokalen Songwriting-Workspace mit phonologischer Reimsuche, Analyse und Performance-Werkzeugen. Kein magischer KI-Nebel. Nur sehr viele Laute, Indizes und Entscheidungen, die du nicht von Hand treffen willst.',
        primary: 'Studio öffnen',
        secondary: 'Reimsuche öffnen',
      }
    : {
        kicker: 'RHYME ENGINE · WRITING STUDIO',
        title: 'Write the song. We handle the sound underneath.',
        copy: 'Rhyme Bureau combines a local songwriting workspace with phonological rhyme search, analysis and performance tools. No mystical AI fog. Just a lot of sounds, indexes and decisions you should not have to make by hand.',
        primary: 'Open Studio',
        secondary: 'Open rhyme search',
      };

  return (
    <motion.section
      className={styles.home}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28 }}
    >
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <motion.p
            className={styles.kicker}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            RHYME BUREAU · {hero.kicker}
          </motion.p>
          <motion.p
            className={styles.brandLine}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.02 }}
          >
            Phonetic License to Slay.
          </motion.p>
          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: 0.04 }}
          >
            {hero.title}
          </motion.h1>
          <motion.p
            className={styles.heroLead}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: 0.08 }}
          >
            {hero.copy}
          </motion.p>
          <motion.div
            className={styles.heroActions}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.12 }}
          >
            <button type="button" className={styles.primaryAction} onClick={() => navigate('studio')}>
              <Icon name="pen" />
              {hero.primary}
            </button>
            <button type="button" className={styles.secondaryAction} onClick={() => navigate('search')}>
              <Icon name="search" />
              {hero.secondary}
            </button>
          </motion.div>
        </div>

        <div className={styles.soundStage} aria-hidden="true">
          <motion.div
            className={styles.orbit}
            animate={reduceMotion ? undefined : { rotate: 360 }}
            transition={reduceMotion ? undefined : { duration: 46, repeat: Infinity, ease: 'linear' }}
          >
            <span>PERFECT</span>
            <span>SLANT</span>
            <span>ASSONANZ</span>
            <span>MOSAIC</span>
          </motion.div>
          <motion.div
            className={styles.core}
            animate={reduceMotion ? undefined : { scale: [1, 1.025, 1] }}
            transition={reduceMotion ? undefined : { duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <small>RHYME DOMAIN</small>
            <b>rb.</b>
            <span>phonology → writer</span>
          </motion.div>
          <div className={styles.wave}>
            {Array.from({ length: 21 }, (_, index) => (
              <i key={index} style={{ '--i': index } as CSSProperties} />
            ))}
          </div>
        </div>
      </section>

      <div className={styles.factRail}>
        <span><b>DE + EN</b>{language === 'de' ? 'Sprachrouten' : 'language routes'}</span>
        <span><b>50</b>{language === 'de' ? 'kuratierte Fonts' : 'curated fonts'}</span>
        <span><b>LOCAL-FIRST</b>IndexedDB</span>
        <span><b>7</b>{language === 'de' ? 'Reim- & Klangtypen' : 'rhyme & sound types'}</span>
      </div>

      <section className={styles.story}>
        <header>
          <p className={styles.kicker}>{language === 'de' ? 'WAS DAS DING EIGENTLICH MACHT' : 'WHAT THIS THING ACTUALLY DOES'}</p>
          <h2>
            {language === 'de'
              ? 'Vom leeren Blatt bis zur Reimkette, ohne fünf Apps und drei Browser-Tabs.'
              : 'From blank page to rhyme chain without five apps and three browser tabs.'}
          </h2>
        </header>
        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
            <motion.article
              key={feature.eyebrow}
              className={styles.featureCard}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.32, delay: index * 0.04 }}
            >
              <div className={styles.featureIcon}><Icon name={feature.icon} /></div>
              <div>
                <p>{feature.eyebrow}</p>
                <h3>{feature.title}</h3>
                <span>{feature.copy}</span>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <section className={styles.pitch}>
        <div>
          <p className={styles.kicker}>{language === 'de' ? 'KEIN ZAUBERTRICK' : 'NO MAGIC TRICK'}</p>
          <h2>
            {language === 'de'
              ? 'Rhyme Bureau soll dir keine Zeile abnehmen. Es soll verhindern, dass die Suche nach einer Zeile deinen Abend frisst.'
              : 'Rhyme Bureau is not here to write the line for you. It is here to stop the search for that line from eating your evening.'}
          </h2>
        </div>
        <div className={styles.pitchNotes}>
          <p>
            {language === 'de'
              ? 'Die Engine arbeitet mit Aussprache, Stress, Reimdomänen und Klangrelationen. Wenn „Applaus“ nur eine Reimsilbe ab Hauptakzent hat, nennen wir das nicht aus Marketinggründen plötzlich „mehrsilbig“.'
              : 'The engine works with pronunciation, stress, rhyme domains and sound relations. If a word has one rhyme syllable from primary stress, marketing does not get to rename it “multisyllabic”.'}
          </p>
          <p>
            {language === 'de'
              ? 'Unbekannte Wörter werden lokal in eine Query-Aussprache aufgelöst, bekannte Bestandteile aus der Datenbank werden bevorzugt. Kunstwort rein, phonologische Konsequenzen raus.'
              : 'Unknown words are resolved into a local query pronunciation, preferring known database components when possible. Art word in, phonological consequences out.'}
          </p>
        </div>
      </section>

      <section className={styles.closing}>
        <div>
          <p>RHYME BUREAU · PHONETIC LICENSE TO SLAY.</p>
          <h2>{language === 'de' ? 'Genug Intro. Der Text schreibt sich leider immer noch nicht selbst.' : 'Enough intro. The text still refuses to write itself.'}</h2>
        </div>
        <button type="button" onClick={() => navigate('studio')}>
          {language === 'de' ? 'Ab ins Studio' : 'Enter Studio'} <span>↗</span>
        </button>
      </section>
    </motion.section>
  );
}
