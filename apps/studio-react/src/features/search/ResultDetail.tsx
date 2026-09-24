import type { WriterResultRow } from '../../core/contracts';
import { useUiStore } from '../../state/uiStore';
import { Icon } from '../../shell/icons';
import { useResultDetail } from './data';
import styles from './Search.module.css';

function fact(label: string, value: unknown) {
  if (
    value == null
    || value === ''
    || (Array.isArray(value) && value.length === 0)
  ) return null;
  const text = Array.isArray(value) ? value.join(' · ') : String(value);
  return (
    <div className={styles.detailFact}>
      <dt>{label}</dt>
      <dd>{text}</dd>
    </div>
  );
}

export function ResultDetail({
  row,
  runtimeDb,
  onClose,
  onToggleSaved,
  saved,
}: {
  row: WriterResultRow | null;
  runtimeDb: string;
  onClose: () => void;
  onToggleSaved: (row: WriterResultRow) => void;
  saved: boolean;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const detail = useResultDetail(row, runtimeDb);
  const model = detail.model;

  if (!row || !model) {
    return (
      <aside className={styles.detailPanel} data-empty="true">
        <span className={styles.detailEmptyIcon}><Icon name="panel" /></span>
        <b>{language === 'de' ? 'Treffer auswählen' : 'Select a result'}</b>
        <p>
          {language === 'de'
            ? 'Details, IPA, Varianten und Provenienz erscheinen hier.'
            : 'Details, IPA, variants and provenance appear here.'}
        </p>
      </aside>
    );
  }

  const score = model.score > 0 ? Math.round(model.score * 100) : null;

  return (
    <aside className={styles.detailPanel}>
      <div className={styles.detailHead}>
        <div>
          <p className={styles.detailEyebrow}>
            {language === 'de' ? 'TREFFERDETAIL' : 'RESULT DETAIL'}
          </p>
          <h2>{model.word}</h2>
        </div>
        <button
          type="button"
          className={styles.detailClose}
          onClick={onClose}
          aria-label={language === 'de' ? 'Trefferdetail schließen' : 'Close result detail'}
        >
          <Icon name="close" />
        </button>
      </div>

      <div className={styles.detailLabels}>
        <span>{model.relationLabel}</span>
        <span>{model.syllables ?? '—'} {language === 'de' ? 'Silb.' : 'syl.'}</span>
        <span>{model.language}</span>
        {score != null ? <span>{score}%</span> : null}
        {model.generated ? <span>Generated</span> : null}
        {model.historical ? <span>{language === 'de' ? 'Historisch' : 'Historical'}</span> : null}
      </div>

      {detail.isLoading ? (
        <p className={styles.detailState}>
          {language === 'de' ? 'Detaildaten werden geladen …' : 'Loading detail data …'}
        </p>
      ) : null}
      {detail.isError ? (
        <p className={styles.detailState} data-error="true">
          {language === 'de'
            ? 'Detail-Endpunkt nicht verfügbar · Writer-Zeile wird angezeigt.'
            : 'Detail endpoint unavailable · showing Writer row data.'}
        </p>
      ) : null}

      {model.ipa ? (
        <section className={styles.pronunciation}>
          <code>/{model.ipa}/</code>
          {model.pronunciations.length > 1 ? (
            <div className={styles.variantList}>
              {model.pronunciations.slice(0, 4).map((item, index) => (
                <span key={`${item.ipa}:${index}`}>
                  <code>/{item.ipa}/</code>
                  <small>
                    {[
                      item.preferred
                        ? (language === 'de' ? 'Standard' : 'Standard')
                        : (language === 'de' ? 'Variante' : 'Alternate'),
                      item.locale,
                      item.register,
                      item.dialect,
                      item.source,
                    ].filter(Boolean).join(' · ')}
                  </small>
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {model.relations.length ? (
        <section className={styles.relations}>
          <small>{language === 'de' ? 'Klangbeziehungen' : 'Sound relations'}</small>
          <div>
            {model.relations.slice(0, 4).map((relation) => (
              <span key={relation.type}>
                {relation.type}
                {relation.score ? ` · ${Math.round(relation.score * 100)}%` : ''}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <dl className={styles.detailFacts}>
        {fact(language === 'de' ? 'Betonung' : 'Stress', model.primaryStress ?? model.stressPattern)}
        {fact(language === 'de' ? 'Wortart' : 'Part of speech', model.partOfSpeech)}
        {fact('Lemma', model.lemma)}
        {fact(language === 'de' ? 'Gebrauch' : 'Usage', model.usageRank ? `#${model.usageRank}` : model.usageCount)}
        {fact(language === 'de' ? 'Lexik-Tags' : 'Lexical tags', model.lexicalTags)}
        {fact(language === 'de' ? 'Phrasentyp' : 'Phrase type', model.phraseTypes)}
        {fact(language === 'de' ? 'Entity' : 'Named item', model.categories)}
        {fact('QID', model.entityQid)}
      </dl>

      {model.sources.length ? (
        <section className={styles.sources}>
          <small>{language === 'de' ? 'QUELLE / PROVENIENZ' : 'SOURCE / PROVENANCE'}</small>
          <div>
            {model.sources.slice(0, 6).map((source) => (
              <span key={source}>{source}</span>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.detailActions}>
        <button
          type="button"
          className={saved ? styles.savedDetailButton : styles.detailButton}
          aria-pressed={saved}
          onClick={() => onToggleSaved(row)}
        >
          <Icon name="bookmark" />
          {saved
            ? (language === 'de' ? '✓ Gemerkt' : '✓ Saved')
            : (language === 'de' ? '◇ Merken' : '◇ Save')}
        </button>
        <button
          type="button"
          className={styles.primaryDisabled}
          disabled
          title={language === 'de'
            ? 'Wird in R5 an Selection Proof + Editor gebunden.'
            : 'Connected to Selection Proof + editor in R5.'}
        >
          {language === 'de' ? 'Einsetzen ↵' : 'Insert ↵'}
        </button>
      </div>

      <p className={styles.detailSource}>
        Live Writer · {model.detailSource}
      </p>
    </aside>
  );
}
