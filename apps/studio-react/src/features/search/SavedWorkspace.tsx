import { useUiStore } from '../../state/uiStore';
import { Icon } from '../../shell/icons';
import { useSharedSearchState } from './SearchStateProvider';
import { useSearchPreferences } from './useSearchPreferences';
import styles from './Search.module.css';

export function SavedWorkspace({
  embedded = false,
  onClose,
}: {
  embedded?: boolean;
  onClose?: () => void;
} = {}) {
  const language = useUiStore((state) => state.uiLanguage);
  const navigate = useUiStore((state) => state.navigate);
  const { patch } = useSharedSearchState();
  const preferences = useSearchPreferences();

  return (
    <section className={styles.savedWorkspace} data-embedded={embedded ? 'true' : 'false'}>
      <header className={styles.savedHeader}>
        <div>
          <p>SAVED</p>
          <h1>{language === 'de' ? 'Merkliste.' : 'Saved.'}</h1>
          <span>
            {language === 'de'
              ? 'Gespeicherte Writer-Treffer aus dem bestehenden Studio-Preference-Store.'
              : 'Writer results saved in the existing Studio preference store.'}
          </span>
        </div>
        <strong>{preferences.saved.length}</strong>
      </header>

      {preferences.saved.length ? (
        <div className={styles.savedGrid}>
          {preferences.saved.map((item) => (
            <article key={item.word} className={styles.savedCard}>
              <span className={styles.savedIcon}><Icon name="bookmark" /></span>
              <div>
                <b>{item.word}</b>
                <small>
                  {item.anchor
                    ? `${language === 'de' ? 'Anker' : 'Anchor'}: ${item.anchor}`
                    : (language === 'de' ? 'Gespeicherter Treffer' : 'Saved result')}
                </small>
              </div>
              <button
                type="button"
                onClick={() => {
                  patch({ anchor: item.anchor || item.word, selectedResultId: '' });
                  if (!embedded) navigate('search');
                  onClose?.();
                }}
              >
                {language === 'de' ? 'Suchen ↗' : 'Search ↗'}
              </button>
              <button
                type="button"
                className={styles.savedRemove}
                onClick={() => preferences.toggleSaved(item.word, item.anchor)}
                aria-label={language === 'de' ? `${item.word} entfernen` : `Remove ${item.word}`}
              >
                ×
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.savedEmpty}>
          <Icon name="bookmark" />
          <b>{language === 'de' ? 'Noch nichts gemerkt.' : 'Nothing saved yet.'}</b>
          <p>
            {language === 'de'
              ? 'Treffer lassen sich direkt in Search oder im Studio-Assistenten merken.'
              : 'Save results directly in Search or the Studio assistant.'}
          </p>
        </div>
      )}
    </section>
  );
}
