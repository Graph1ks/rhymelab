import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';

import type {
  RuntimeEdition,
  WriterResultRow,
} from '../../legacy/contracts';
import { Dialog } from '../../design-system/primitives';
import { useUiStore } from '../../state/uiStore';
import { useOptionalEditorSession } from '../editor/EditorSessionProvider';
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
import { SavedWorkspace } from './SavedWorkspace';
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
  compact = false,
}: {
  runtime: ReturnType<typeof useRuntimeEnvironment>;
  compact?: boolean;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const editions: RuntimeEdition[] = ['lite', 'standard', 'full'];
  const activeLabel = runtime.activeEdition?.toUpperCase()
    ?? String(runtime.capabilities?.runtime || 'Writer').replace(/^serving-v1\/?/u, '').toUpperCase();

  if (compact && runtime.payload) {
    return (
      <label className={styles.runtimeSelect}>
        <span>RUNTIME</span>
        <select
          value={runtime.selected ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'lite' || value === 'standard' || value === 'full') {
              runtime.setRuntimeEdition(value);
            }
          }}
          aria-label={language === 'de' ? 'Runtime wählen' : 'Choose runtime'}
        >
          {editions.map((edition) => {
            const available = runtime.summaryMap[edition]?.available === true;
            return (
              <option key={edition} value={edition} disabled={!available}>
                {edition === 'lite' ? 'Lite' : edition === 'standard' ? 'Standard' : 'Full'}
                {available ? '' : (language === 'de' ? ' · nicht verfügbar' : ' · unavailable')}
              </option>
            );
          })}
        </select>
      </label>
    );
  }

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
  variant,
  density,
  setDensity,
  hideUsed,
  setHideUsed,
  filtersOpen,
  setFiltersOpen,
  onOpenSaved,
  savedCount,
  resultCount,
  hiddenUsed,
  timing,
}: {
  variant: 'page' | 'assistant';
  density: ResultDensity;
  setDensity: (density: ResultDensity) => void;
  hideUsed: boolean;
  setHideUsed: (value: boolean) => void;
  filtersOpen: boolean;
  setFiltersOpen: (value: boolean) => void;
  onOpenSaved: () => void;
  savedCount: number;
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
        {variant === 'page' ? (
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
        ) : null}
        <button
          type="button"
          className={styles.toggleButton}
          data-rhymelab-control="search.filters"
          data-active={filtersOpen ? 'true' : 'false'}
          aria-pressed={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          ⚙ {language === 'de' ? 'Filter' : 'Filters'}
        </button>
        <button
          type="button"
          className={styles.toggleButton}
          onClick={onOpenSaved}
        >
          ☆ {language === 'de' ? 'Merkliste' : 'Saved'}{savedCount ? ` · ${savedCount}` : ''}
        </button>

        {variant === 'page' ? (
          <div
            className={styles.densityButtons}
            role="group"
            data-rhymelab-control="search.layout"
            aria-label={language === 'de' ? 'Ergebnisdarstellung' : 'Result layout'}
          >
            {(['list', 'compact'] as ResultDensity[]).map((value) => (
              <button
                key={value}
                type="button"
                data-active={density === value ? 'true' : 'false'}
                aria-pressed={density === value}
                onClick={() => setDensity(value)}
                title={value}
              >
                {value === 'list' ? '☷' : '≡'}
                <span>
                  {value === 'list'
                    ? (language === 'de' ? 'Liste' : 'List')
                    : (language === 'de' ? 'Kompakt' : 'Compact')}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SearchExperience({
  variant = 'page',
  enabled = true,
}: {
  variant?: 'page' | 'assistant';
  enabled?: boolean;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const reduceMotion = useReducedMotion();
  const editor = useOptionalEditorSession();
  const { state, patch, setSelectedResultId } = useSharedSearchState();
  const preferences = useSearchPreferences();
  const runtime = useRuntimeEnvironment();
  const writer = useWriterSearch(
    state,
    runtime.capabilities,
    runtime.runtimeDb,
    { enabled, paceMs: variant === 'assistant' ? 220 : 160 },
  );
  const trackedText = useActiveTrackedText();
  const [draftQuery, setDraftQuery] = useState(state.anchor);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const savedOpen = useUiStore((state) => state.savedOpen);
  const setSavedOpen = useUiStore((state) => state.setSavedOpen);
  const [visibleCount, setVisibleCount] = useState(
    preferences.density === 'compact' ? 24 : 12,
  );

  useEffect(() => {
    setDraftQuery(state.anchor);
  }, [state.anchor]);

  useEffect(() => {
    if (!filtersOpen) return;
    const closeOnExternalScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(
        '[data-rhymelab-filter-deck="true"], [data-search-filter-popup="true"]',
      )) {
        return;
      }
      setFiltersOpen(false);
    };
    window.addEventListener('wheel', closeOnExternalScroll, { capture: true, passive: true });
    window.addEventListener('touchmove', closeOnExternalScroll, { capture: true, passive: true });
    document.addEventListener('scroll', closeOnExternalScroll, true);
    return () => {
      window.removeEventListener('wheel', closeOnExternalScroll, true);
      window.removeEventListener('touchmove', closeOnExternalScroll, true);
      document.removeEventListener('scroll', closeOnExternalScroll, true);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!enabled || variant !== 'assistant' || !editor?.followSelection) return;
    const anchor = editor.selection?.anchor?.trim();
    if (!anchor || anchor === state.anchor) return;
    patch({ anchor, selectedResultId: '' });
  }, [
    editor?.followSelection,
    editor?.selection?.anchor,
    patch,
    state.anchor,
    variant,
    enabled,
  ]);

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
  const multisyllabicFilter = state.rhymeType === 'multisyllabic_perfect'
    || state.rhymeType === 'multisyllabic_slant';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!enabled) return;
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

  const insertRow = (row: WriterResultRow) => {
    if (!editor) return;
    void editor.insertCandidate(row.word);
  };

  return (
    <section
      className={styles.searchExperience}
      data-variant={variant}
      data-rhymelab-surface="search"
      data-enabled={enabled ? 'true' : 'false'}
      aria-label={language === 'de' ? 'Rhyme Bureau Reimsuche' : 'Rhyme Bureau rhyme search'}
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
        <RuntimeSelector runtime={runtime} compact={variant === 'assistant'} />
      </header>

      <form className={styles.searchForm} onSubmit={submit}>
        <div
          className={styles.anchorMeta}
          data-searching={writer.isFetching ? 'true' : 'false'}
        >
          <span>{language === 'de' ? 'AKTUELLER REIMANKER' : 'CURRENT RHYME ANCHOR'}</span>
          <motion.b
            key={state.anchor || 'empty-anchor'}
            initial={reduceMotion ? false : { opacity: 0, y: 7, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            title={state.anchor || undefined}
          >
            {state.anchor || '—'}
          </motion.b>
          <i className={styles.anchorScan} aria-hidden="true" />
          {variant === 'assistant' && editor ? (
            <div className={styles.anchorMode} role="group" aria-label={language === 'de' ? 'Reimanker-Modus' : 'Rhyme anchor mode'}>
              <button
                type="button"
                data-active={editor.followSelection ? 'true' : 'false'}
                aria-pressed={editor.followSelection}
                onClick={() => editor.setFollowSelection(true)}
              >
                {language === 'de' ? 'Auswahl folgen' : 'Follow selection'}
              </button>
              <button
                type="button"
                data-active={!editor.followSelection ? 'true' : 'false'}
                aria-pressed={!editor.followSelection}
                onClick={() => editor.setFollowSelection(false)}
              >
                {language === 'de' ? 'Fixieren' : 'Fixed anchor'}
              </button>
            </div>
          ) : null}
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

      {filtersOpen ? (
        <SearchControls
          compact={variant === 'assistant'}
          entityCategories={entityCategories}
          generatedAvailable={runtime.capabilities?.generated === true}
          onRequestClose={() => setFiltersOpen(false)}
        />
      ) : null}

      <div className={styles.capabilityBar} data-hidden={variant === 'assistant' ? 'true' : 'false'}>
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
        variant={variant}
        density={variant === 'assistant' ? 'compact' : preferences.density}
        setDensity={preferences.setDensity}
        hideUsed={preferences.hideUsed}
        setHideUsed={preferences.setHideUsed}
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
        onOpenSaved={() => setSavedOpen(true)}
        savedCount={preferences.saved.length}
        resultCount={processed.rows.length}
        hiddenUsed={processed.hiddenUsed}
        timing={timing}
      />

      <div className={styles.searchBody} data-detail={selectedRow ? 'true' : 'false'}>
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
                {multisyllabicFilter
                  ? (language === 'de'
                      ? 'Mehrsilbig bedeutet hier mindestens zwei Reimsilben ab Hauptakzent – nicht einfach zwei Silben im ganzen Wort.'
                      : 'Multisyllabic means at least two rhyme-domain syllables from primary stress, not merely two syllables in the whole word.')
                  : (language === 'de'
                      ? 'Query, Runtime oder Filter ändern – die Writer-Semantik selbst bleibt unverändert.'
                      : 'Change query, runtime or filters — Writer semantics stay unchanged.')}
              </p>
            </div>
          ) : (
            <ResultsList
              rows={processed.rows}
              density={variant === 'assistant' ? 'compact' : preferences.density}
              selectedId={state.selectedResultId}
              onSelect={selectRow}
              onToggleSaved={toggleSaved}
              isSaved={preferences.isSaved}
              visibleCount={visibleCount}
              setVisibleCount={setVisibleCount}
              onScrollActivity={() => {
                if (filtersOpen) setFiltersOpen(false);
                if (variant === 'assistant' && state.selectedResultId) setSelectedResultId('');
              }}
              onInsert={editor?.selection?.proof ? insertRow : undefined}
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
            ↑↓ {language === 'de' ? 'Auswahl' : 'select'} · Space {language === 'de' ? 'Merken' : 'save'} · Enter {language === 'de' ? 'sicher einsetzen' : 'safe insert'}
          </p>
        </div>

        {selectedRow ? (
          <ResultDetail
            row={selectedRow}
            runtimeDb={runtime.runtimeDb}
            onClose={() => setSelectedResultId('')}
            onToggleSaved={toggleSaved}
            saved={preferences.isSaved(selectedRow.word)}
          />
        ) : null}
      </div>

      <Dialog.Root open={savedOpen} onOpenChange={setSavedOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.savedDialogBackdrop} />
          <Dialog.Viewport className={styles.savedDialogViewport}>
            <Dialog.Popup className={styles.savedDialog}>
              <div className={styles.savedDialogHead}>
                <div>
                  <p>SAVED</p>
                  <h2>{language === 'de' ? 'Merkliste' : 'Saved'}</h2>
                </div>
                <Dialog.Close aria-label={language === 'de' ? 'Schließen' : 'Close'}>×</Dialog.Close>
              </div>
              <SavedWorkspace embedded onClose={() => setSavedOpen(false)} />
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
