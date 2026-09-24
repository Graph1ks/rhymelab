import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';

import { Icon } from '../../shell/icons';
import { useUiStore } from '../../state/uiStore';
import styles from './Home.module.css';

const FEATURE_COPY = {
  de: [
    {
      eyebrow: 'SCHREIBEN · ABTEILUNG TATORT TEXT',
      title: 'Ein Editor ohne Verwaltungsvorgang für jeden verdammten Satz.',
      copy: 'Bars, Silben, Abschnitte, Versionen und Schreibstimme bleiben am Text. Kein Ribbon mit 47 Icons, von denen 39 aussehen wie Steuererklärung und drei vermutlich nur HR informieren.',
      icon: 'pen' as const,
    },
    {
      eyebrow: 'REIMEN · SONDERERMITTLUNG KLANG',
      title: 'Haus / Maus / Klaus wurde nach kurzer Anhörung freigelassen.',
      copy: 'Vollreime, Slant, Reimfamilien, Assonanz, Konsonanz, Phrasen und Namen werden gemeinsam verhört. Wer klanglich zusammenpasst, landet in derselben Akte. Wer nur ähnlich geschrieben wird, darf wieder gehen.',
      icon: 'search' as const,
    },
    {
      eyebrow: 'ANALYSE · BEWEISMITTELSTELLE',
      title: 'Deine Reimketten bekommen endlich eine Akte.',
      copy: 'Rhyme Topology zeigt, welche Klangmuster durch den ganzen Text laufen. Keine Konfetti-Heatmap, die dir mit fünf Farben erklärt, dass du offensichtlich Wörter benutzt hast.',
      icon: 'grid' as const,
    },
    {
      eyebrow: 'BIBLIOTHEK · ZEUGENSCHUTZ FÜR ENTWÜRFE',
      title: 'Deine Texte bleiben bei dir. Schon aus Selbstschutz.',
      copy: 'Bibliothek, Versionen, Recovery und Auto-Save laufen lokal-first. Falls die zweite Strophe ein Verbrechen wird, sichern wir wenigstens den Tatort von davor.',
      icon: 'bookmark' as const,
    },
  ],
  en: [
    {
      eyebrow: 'WRITE · TEXT CRIME UNIT',
      title: 'An editor without paperwork for every damn sentence.',
      copy: 'Bars, syllables, sections, revisions and your writing voice stay next to the text. No toolbar with 47 icons, 39 of which look like tax forms.',
      icon: 'pen' as const,
    },
    {
      eyebrow: 'RHYME · SOUND INVESTIGATIONS',
      title: '“Night / light / fight” has been released pending further evidence.',
      copy: 'Perfect, slant, families, assonance, consonance, phrases and names are questioned together. Sound-alikes share a case file. Spelling coincidences are free to leave.',
      icon: 'search' as const,
    },
    {
      eyebrow: 'ANALYSIS · EVIDENCE ROOM',
      title: 'Your rhyme chains finally get a file number.',
      copy: 'Rhyme Topology shows which sound patterns actually travel through the lyric. No confetti heatmap using five colors to announce that words have occurred.',
      icon: 'grid' as const,
    },
    {
      eyebrow: 'LIBRARY · WITNESS PROTECTION FOR DRAFTS',
      title: 'Your lyrics stay with you. Mostly for everyone’s safety.',
      copy: 'Library, revisions, recovery and autosave stay local-first. If verse two becomes a felony, at least the previous scene is preserved.',
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
        title: 'Das Bureau hört alles. Zum Glück nur deine Reime.',
        copy: 'Rhyme Bureau ist Schreibstudio, Reimermittlung, Klanglabor und Performance-Werkzeug in einer Oberfläche. Wir durchsuchen Aussprache, Betonung und Reimdomänen so gründlich, dass selbst dein unnötig kompliziertes Kunstwort irgendwann einen Sachbearbeiter bekommt. Kein KI-Seance-Zelt. Keine Cloud-Beichte. Nur Beweismittel gegen mittelmäßige Endreime.',
        primary: 'Studio öffnen',
        secondary: 'Reimsuche öffnen',
      }
    : {
        kicker: 'RHYME ENGINE · WRITING STUDIO',
        title: 'The Bureau hears everything. Fortunately, only your rhymes.',
        copy: 'Rhyme Bureau is a writing room, rhyme investigation desk, sound lab and performance tool in one surface. Pronunciation, stress and rhyme domains get searched until even your ridiculous invented word receives a case officer. No AI séance. No cloud confession. Just evidence against mediocre end rhymes.',
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
        <span><b>LOCAL-FIRST</b>{language === 'de' ? 'deine Texte bleiben hier' : 'your lyrics stay here'}</span>
        <span><b>7</b>{language === 'de' ? 'Reim- & Klangtypen' : 'rhyme & sound types'}</span>
      </div>

      <section className={styles.story}>
        <header>
          <p className={styles.kicker}>{language === 'de' ? 'WAS DAS DING EIGENTLICH MACHT' : 'WHAT THIS THING ACTUALLY DOES'}</p>
          <h2>
            {language === 'de'
              ? 'Vom leeren Blatt bis zur Klangakte. Ohne fünf Apps, drei Tabs und einen Praktikanten namens Kevin.'
              : 'From blank page to sound case file. Without five apps, three tabs and an intern named Kevin.'}
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
          <p className={styles.kicker}>{language === 'de' ? 'KEIN V-MANN. NUR PHONETIK.' : 'NO INFORMANT. JUST PHONETICS.'}</p>
          <h2>
            {language === 'de'
              ? 'Wir schreiben nicht für dich. Wir beseitigen nur die organisatorischen Hindernisse zwischen dir und einer Zeile, für die du dich morgen nicht schämst.'
              : 'We do not write for you. We remove the administrative obstacles between you and a line you will not regret tomorrow.'}
          </h2>
        </div>
        <div className={styles.pitchNotes}>
          <p>
            {language === 'de'
              ? 'Die Engine arbeitet mit Aussprache, Stress, Reimdomänen und Klangrelationen. Wenn „Applaus“ ab Hauptakzent nur eine Reimsilbe hat, fälschen wir nicht die Aktenlage, nur damit der Filter beeindruckender aussieht. Dafür gibt es andere Behörden.'
              : 'The engine works with pronunciation, stress, rhyme domains and sound relations. If a word has one rhyme syllable from primary stress, we do not falsify the file just to make the filter look more impressive.'}
          </p>
          <p>
            {language === 'de'
              ? 'Unbekannte Wörter werden lokal zerlegt, bekannte Bestandteile aus der Datenbank zuerst vernommen und der reimtragende rechte Rand gesichert. Kunstwort rein, Koffer auf, Silben auf den Tisch. Latexhandschuhe sind optional.'
              : 'Unknown words are resolved locally, known database components are questioned first and the rhyme-bearing right edge is secured. Invented word in, suitcase open, syllables on the table. Latex gloves optional.'}
          </p>
        </div>
      </section>

      <section className={styles.closing}>
        <div>
          <p>RHYME BUREAU · PHONETIC LICENSE TO SLAY.</p>
          <h2>{language === 'de' ? 'Akte eröffnet. Jetzt schreib was Belastbares.' : 'Case opened. Now write something that holds up.'}</h2>
        </div>
        <button type="button" onClick={() => navigate('studio')}>
          {language === 'de' ? 'Vernehmung starten' : 'Start questioning'} <span>↗</span>
        </button>
      </section>
    </motion.section>
  );
}
