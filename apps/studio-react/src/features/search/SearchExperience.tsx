import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';

import type {
  RuntimeEdition,
  WriterResultRow,
} from '../../legacy/contracts';
import { useUiStore } from '../../state/uiStore';
import { Icon } from '../../shell/icons';
import {
  useActiveTrackedText,
  useRuntimeEnvironment,
  useWriterSearch,
  writerEntityCategories,
} from './data';
import {
  filterStudioWriterRows,
  filterUnusedWriterRows,
  sortStudioWriterRows,
  type ResultDensity,
} from './presentation';
import { ResultDetail } from './ResultDetail';
import { ResultsList } from './ResultsList';
import { SearchControls } from './SearchControls';
import { useSearchPreferences } from './useSearchPreferences';
import { useSharedSearchState } from './SearchStateProvider';
import styles from './Search.module.css';

function runtimeTimingText(value: Record<string, unknown> | null | undefined): string {
  if (!value) return '';
  const parts: string[] = [];
  const current = Number(value.searchMs);
  const average = Number(value.averageLast100Ms);
  const count = Number(value.sampleCount || 0);
  if (Number.isFinite(current)) parts.push(`${current.toFixed(current < 10 ? 1 : 0)} ms`);
  if (Number.isFinite(average)) parts.push(`Ø100 ${average.toFixed(average < 10 ? 1 : 0)} ms`);
  if (count) parts.push(`n=${count}`);
  return parts.join(' · ');
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function RuntimeSelector({
  runtime,
}: {
  runtime: ReturnType<typeof useRuntimeEnvironment>;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const editions: RuntimeEdition[] = ['lite', 'standard', 'full'];
  const activeLabel = runtime.activeEdition?.toUpperCase()
    ?? String(runtime.capabilities?.runtime || 'Writer').replace(/^serving-v1\/?/u, '').toUpperCase();

  return (
    <div className={styles.runtimeStrip}>
      <div className={styles.runtimeStatus}>
        <i data-ready={runtime.capabilities?.status === 'ready' ? 'true' : 'false'} />
        <span>
          <small>RUNTIME</small>
          <b>DB {activeLabel || '…'}</b>
        </span>
      </div>

      {runtime.payload ? (
        <div className={styles.runtimeEditions} role="group" aria-label={language === 'de' ? 'Runtime-Datenbank' : 'Runtime database'}>
          {editions.map((edition) => {
            const available = runtime.summaryMap[edition]?.available === true;
            const active = runtime.selected === edition;
            return (
              <button
                key={edition}
                type="button"
                disabled={!available}
                data-active={active ? 'true' : 'false'}
                onClick={() => runtime.setRuntimeEdition(edition)}
                title={!available
                  ? (language === 'de' ? 'Nicht lokal installiert' : 'Not installed locally')
                  : undefined}
              >
                {edition.toUpperCase()}
                <small>{available ? (active ? 'ACTIVE' : 'READY') : 'OFF'}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <span className={styles.runtimeDefault}>
          {language === 'de' ? 'lokale Standard-Runtime' : 'local default runtime'}
        </span>
      )}
    </div>
  );
}

function ResultToolbar({
  density,
  setDensity,
  hideUsed,
  setHideUsed,
  autoScroll,
  setAutoScroll,
  resultCount,
  hiddenUsed,
  timing,
}: {
  density: ResultDensity;
  setDensity: (density: ResultDensity) => void;
  hideUsed: boolean;
  setHideUsed: (value: boolean) => void;
  autoScroll: boolean;
  setAutoScroll: (value: boolean) => void;
  resultCount: number;
  hiddenUsed: number;
  timing: string;
}) {
  const language = useUiStore((state) => state.uiLanguage);

  return (
    <div className={styles.resultToolbar}>
      <div className={styles.resultCount}>
        <b>{resultCount} {language === 'de' ? 'Treffer' : 'results'}</b>
        {hiddenUsed ? (
          <small>
            {hiddenUsed} {language === 'de' ? 'verwendet ausgeblendet' : 'used hidden'}
          </small>
        ) : null}
        {timing ? <small>{timing}</small> : null}
      </div>

      <div className={styles.resultTools}>
        <button
          type="button"
          className={styles.toggleButton}
          data-active={hideUsed ? 'true' : 'false'}
          aria-pressed={hideUsed}
          onClick={() => setHideUsed(!hideUsed)}
        >
          {hideUsed
            ? (language === 'de' ? '✓ Verwendete aus' : '✓ Hide used')
            : (language === 'de' ? '○ Verwendete zeigen' : '○ Show used')}
        </button>
        <button
          type="button"
          className={styles.toggleButton}
          data-active={autoScroll ? 'true' : 'false'}
          aria-pressed={autoScroll}
          onClick={() => setAutoScroll(!autoScroll)}
        >
          ↕ {language === 'de' ? 'Auto-Scroll' : 'Auto-scroll'}: {autoScroll
            ? (language === 'de' ? 'An' : 'On')
            : (language === 'de' ? 'Aus' : 'Off')}
        </button>

        <div className={styles.densityButtons} role="group" aria-label={language === 'de' ? 'Ergebnisdarstellung' : 'Result layout'}>
          {(['list', 'compact', 'tiles'] as ResultDensity[]).map((value) => (
            <button
              key={value}
              type="button"
              data-active={density === value ? 'true' : 'false'}
              aria-pressed={density === value}
              onClick={() => setDensity(value)}
              title={value}
            >
              {value === 'list' ? '☷' : value === 'compact' ? '≡' : '▦'}
              <span>
                {value === 'list'
                  ? (language === 'de' ? 'Liste' : 'List')
                  : value === 'compact'
                    ? (language === 'de' ? 'Kompakt' : 'Compact')
                    : (language === 'de' ? 'Feld' : 'Tiles')}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SearchExperience({
  variant = 'page',
}: {
  variant?: 'page' | 'assistant';
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const { state, patch, setSelectedResultId } = useSharedSearchState();
  const preferences = useSearchPreferences();
  const runtime = useRuntimeEnvironment();
  const writer = useWriterSearch(state, runtime.capabilities, runtime.runtimeDb);
  const trackedText = useActiveTrackedText();
  const [draftQuery, setDraftQuery] = useState(state.anchor);
  const [autoScroll, setAutoScroll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(
    preferences.density === 'compact' ? 24 : 12,
  );

  useEffect(() => {
    setDraftQuery(state.anchor);
  }, [state.anchor]);

  useEffect(() => {
    if (runtime.capabilities?.generated === false && (state.generated || state.generatedOnly)) {
      patch({ generated: false, generatedOnly: false });
    }
  }, [patch, runtime.capabilities?.generated, state.generated, state.generatedOnly]);

  const entityCategories = useMemo(
    () => writerEntityCategories(writer.data),
    [writer.data],
  );

  useEffect(() => {
    if (!entityCategories.length || !state.entityCategories.length) return;
    const valid = state.entityCategories.filter((value) => entityCategories.includes(value));
    if (valid.length !== state.entityCategories.length) {
      patch({
        entityCategories: valid,
        entityCategory: valid[0] ?? 'all',
      });
    }
  }, [entityCategories, patch, state.entityCategories]);

  const processed = useMemo(() => {
    const source = writer.data?.rows ?? [];
    const filtered = filterStudioWriterRows(source, {
      rhymeType: state.rhymeType,
      syllableMode: state.syllableFilter,
      querySyllables: writer.data?.querySyllables ?? 0,
    });
    const unused = filterUnusedWriterRows(
      filtered,
      trackedText.data ?? '',
      preferences.hideUsed,
    );
    const rows = sortStudioWriterRows(unused.rows, {
      sort: state.sort,
      rhymeType: state.rhymeType,
      querySyllables: writer.data?.querySyllables ?? 0,
      locale: state.queryBasis === 'en' ? 'en' : 'de',
    });
    return {
      rows,
      hiddenUsed: unused.hidden,
    };
  }, [
    preferences.hideUsed,
    state.queryBasis,
    state.rhymeType,
    state.sort,
    state.syllableFilter,
    trackedText.data,
    writer.data,
  ]);

  const signature = [
    state.anchor,
    state.queryBasis,
    state.resultLanguage,
    state.scope,
    state.rhymeType,
    state.syllableFilter,
    state.sort,
    state.variantMode,
    state.historical,
    state.generated,
    state.generatedOnly,
    state.entityCategories.join(','),
    preferences.density,
    runtime.runtimeDb,
  ].join('|');

  useEffect(() => {
    setVisibleCount(preferences.density === 'compact' ? 24 : 12);
  }, [signature, preferences.density]);

  useEffect(() => {
    if (!state.selectedResultId) return;
    if (!processed.rows.some((row) => row.id === state.selectedResultId)) {
      setSelectedResultId('');
    }
  }, [processed.rows, setSelectedResultId, state.selectedResultId]);

  const selectedRow = processed.rows.find((row) => row.id === state.selectedResultId) ?? null;
  const timing = runtimeTimingText(writer.data?.runtimeTiming);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = draftQuery.trim();
    if (!next) return;
    if (next === state.anchor) {
      void writer.refetch();
    } else {
      patch({ anchor: next, selectedResultId: '' });
    }
  };

  const selectRow = (row: WriterResultRow) => {
    setSelectedResultId(row.id);
  };

  const toggleSaved = (row: WriterResultRow) => {
    preferences.toggleSaved(row.word, state.anchor);
  };

  return (
    <section
      className={styles.searchExperience}
      data-variant={variant}
      aria-label={language === 'de' ? 'RhymeLab Reimsuche' : 'RhymeLab rhyme search'}
    >
      <header className={styles.searchHeader}>
        <div className={styles.searchTitle}>
          <p>{variant === 'assistant' ? 'SOUND EXPLORER' : 'UNIFIED RHYME WRITER'}</p>
          <h1>
            {variant === 'assistant'
              ? (language === 'de' ? 'Dein nächster Treffer.' : 'Your next match.')
              : (language === 'de' ? 'Reime finden.' : 'Find rhymes.')}
          </h1>
          <span>
            {language === 'de'
              ? 'Wörter · Phrasen / Mosaic · Namen'
              : 'Words · Phrases / Mosaic · names'}
          </span>
        </div>
        <RuntimeSelector runtime={runtime} />
      </header>

      <form className={styles.searchForm} onSubmit={submit}>
        <div className={styles.anchorMeta}>
          <span>{language === 'de' ? 'REIMANKER' : 'RHYME ANCHOR'}</span>
          <b>{state.anchor || '—'}</b>
        </div>
        <label className={styles.searchInputWrap}>
          <Icon name="search" />
          <input
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder={language === 'de'
              ? 'Wort oder Phrase suchen …'
              : 'Search a word or phrase …'}
            autoComplete="off"
            aria-label={language === 'de' ? 'Reimanker suchen' : 'Search rhyme anchor'}
          />
          {runtime.activeEdition ? (
            <span className={styles.inputDbBadge}>{runtime.activeEdition.toUpperCase()}</span>
          ) : null}
          <button type="submit" className={styles.searchSubmit}>
            <span>{language === 'de' ? 'Suchen' : 'Search'}</span>
            →
          </button>
        </label>
      </form>

      <SearchControls
        compact={variant === 'assistant'}
        entityCategories={entityCategories}
        generatedAvailable={runtime.capabilities?.generated === true}
      />

      <div className={styles.capabilityBar}>
        <span data-state={runtime.capabilities?.deWriter ? 'on' : 'off'}>DE</span>
        <span data-state={runtime.capabilities?.enWriter ? 'on' : 'off'}>EN</span>
        <span data-state={runtime.capabilities?.phrases ? 'on' : 'off'}>Phrase / Mosaic</span>
        <span data-state={runtime.capabilities?.entities ? 'on' : 'off'}>Entities</span>
        <span data-state={runtime.capabilities?.generated ? 'on' : 'off'}>Generated</span>
        {runtime.capabilities?.dataset?.total ? (
          <small>{formatCount(runtime.capabilities.dataset.total)} records</small>
        ) : null}
      </div>

      <ResultToolbar
        density={preferences.density}
        setDensity={preferences.setDensity}
        hideUsed={preferences.hideUsed}
        setHideUsed={preferences.setHideUsed}
        autoScroll={autoScroll}
        setAutoScroll={setAutoScroll}
        resultCount={processed.rows.length}
        hiddenUsed={processed.hiddenUsed}
        timing={timing}
      />

      <div className={styles.searchBody}>
        <div className={styles.resultsPane}>
          {writer.isPending || (writer.isFetching && !writer.data) ? (
            <div className={styles.searchState}>
              <span className={styles.loadingLine} />
              <b>{language === 'de' ? 'Writer sucht …' : 'Writer is searching …'}</b>
              <p>
                {language === 'de'
                  ? 'Wörter, Phrasen und Entities werden über die bestehende lokale Runtime abgefragt.'
                  : 'Words, phrases and entities are queried through the existing local runtime.'}
              </p>
            </div>
          ) : writer.isError ? (
            <div className={styles.searchState} data-error="true">
              <b>{language === 'de' ? 'Writer nicht verfügbar' : 'Writer unavailable'}</b>
              <p>{writer.error instanceof Error ? writer.error.message : String(writer.error)}</p>
              <button type="button" onClick={() => void writer.refetch()}>
                {language === 'de' ? 'Erneut versuchen' : 'Retry'}
              </button>
            </div>
          ) : processed.rows.length === 0 ? (
            <div className={styles.searchState}>
              <b>{language === 'de' ? 'Keine passenden Treffer.' : 'No matching results.'}</b>
              <p>
                {language === 'de'
                  ? 'Query, Runtime oder Filter ändern – die Writer-Semantik selbst bleibt unverändert.'
                  : 'Change query, runtime or filters — Writer semantics stay unchanged.'}
              </p>
            </div>
          ) : (
            <ResultsList
              rows={processed.rows}
              density={preferences.density}
              selectedId={state.selectedResultId}
              onSelect={selectRow}
              onToggleSaved={toggleSaved}
              isSaved={preferences.isSaved}
              visibleCount={visibleCount}
              setVisibleCount={setVisibleCount}
              autoScroll={autoScroll}
            />
          )}

          {writer.data?.warnings?.length ? (
            <div className={styles.warningRow}>
              {writer.data.warnings.slice(0, 3).map((warning, index) => (
                <span key={index}>{String(warning)}</span>
              ))}
            </div>
          ) : null}

          <p className={styles.keyboardHint}>
            ↑↓ {language === 'de' ? 'Auswahl' : 'select'} · Space {language === 'de' ? 'Merken' : 'save'} ·
            Enter {language === 'de' ? 'Einsetzen folgt in R5 mit Selection Proof' : 'insert connects in R5 with Selection Proof'}
          </p>
        </div>

        <ResultDetail
          row={selectedRow}
          runtimeDb={runtime.runtimeDb}
          onClose={() => setSelectedResultId('')}
          onToggleSaved={toggleSaved}
          saved={selectedRow ? preferences.isSaved(selectedRow.word) : false}
        />
      </div>
    </section>
  );
}
