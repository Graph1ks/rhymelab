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
import { Dialog, Select } from '../../design-system/primitives';
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

function routeLanguageLabel(value: string): string {
  return value === 'both' ? 'DE + EN' : String(value || '').toUpperCase();
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
    const options = editions.map((edition) => ({
      value: edition,
      label: edition === 'lite' ? 'Lite' : edition === 'standard' ? 'Standard' : 'Full',
      disabled: runtime.summaryMap[edition]?.available !== true,
    }));
    return (
      <div className={styles.runtimeSelect}>
        <span>RUNTIME</span>
        <Select.Root
          items={options}
          value={runtime.selected ?? undefined}
          onValueChange={(value) => {
            if (value === 'lite' || value === 'standard' || value === 'full') {
              runtime.setRuntimeEdition(value);
            }
          }}
        >
          <Select.Trigger
            className={styles.runtimeSelectTrigger}
            aria-label={language === 'de' ? 'Runtime wählen' : 'Choose runtime'}
          >
            <Select.Value />
            <Select.Icon><Icon name="chevron" /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner
              className={styles.runtimeSelectPositioner}
              sideOffset={6}
              alignItemWithTrigger={false}
            >
              <Select.Popup className={styles.runtimeSelectPopup}>
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={styles.runtimeSelectOption}
                  >
                    <Select.ItemIndicator className={styles.runtimeSelectCheck}>
                      <Icon name="check" />
                    </Select.ItemIndicator>
                    <Select.ItemText>{option.label}</Select.ItemText>
                    {option.disabled ? (
                      <small>{language === 'de' ? 'NICHT VERFÜGBAR' : 'UNAVAILABLE'}</small>
                    ) : null}
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>
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
  onOpenHelp,
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
  onOpenHelp: () => void;
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
          onClick={onOpenHelp}
          title={language === 'de' ? 'Suchbegriffe und Filter erklären' : 'Explain search terms and filters'}
        >
          ? {language === 'de' ? 'Hilfe' : 'Help'}
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
  const [helpOpen, setHelpOpen] = useState(false);
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
  const routeStatus = `${routeLanguageLabel(state.queryBasis)} → ${routeLanguageLabel(state.resultLanguage)}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!enabled) return;
    if (variant === 'assistant' && editor?.followSelection) {
      editor.setFollowSelection(false);
    }
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

      <button
        type="button"
        className={styles.languageRouteStatus}
        data-active={state.queryBasis !== state.resultLanguage ? 'true' : 'false'}
        onClick={() => setFiltersOpen(true)}
        title={language === 'de'
          ? 'Eingabesprache → Ergebnissprache · klicken zum Ändern'
          : 'Query language → result language · click to change'}
      >
        <span>{language === 'de' ? 'SPRACHROUTE' : 'LANGUAGE ROUTE'}</span>
        <b>{routeStatus}</b>
      </button>

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
            onChange={(event) => {
              setDraftQuery(event.target.value);
              if (variant === 'assistant' && editor?.followSelection) {
                editor.setFollowSelection(false);
              }
            }}
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
        onOpenHelp={() => setHelpOpen(true)}
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

      <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.savedDialogBackdrop} />
          <Dialog.Viewport className={styles.savedDialogViewport}>
            <Dialog.Popup className={styles.searchHelpDialog}>
              <div className={styles.savedDialogHead}>
                <div>
                  <p>SEARCH GUIDE</p>
                  <h2>{language === 'de' ? 'Was sucht Rhyme Bureau hier eigentlich?' : 'What is Rhyme Bureau searching for?'}</h2>
                </div>
                <Dialog.Close aria-label={language === 'de' ? 'Schließen' : 'Close'}>×</Dialog.Close>
              </div>

              <div className={styles.searchHelpIntro}>
                <p>
                  {language === 'de'
                    ? 'Die Reimsuche arbeitet phonetisch. Schreibweise ist nur die Oberfläche: entscheidend sind Aussprache, Reimdomäne, Sprache und der ausgewählte Ergebniskanal.'
                    : 'Rhyme search is phonetic. Spelling is only the surface: pronunciation, rhyme domain, language and the selected result channel drive the search.'}
                </p>
              </div>

              <div className={styles.searchHelpGrid}>
                <section>
                  <h3>{language === 'de' ? 'Reimtypen' : 'Rhyme types'}</h3>
                  <dl>
                    <div><dt>{language === 'de' ? 'Vollreim' : 'Perfect rhyme'}</dt><dd>{language === 'de' ? 'Gleicher Reimklang ab dem betonten Kern.' : 'Matching rhyme sound from the stressed nucleus.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Vollreim · 2+ Reimsilben' : 'Perfect · 2+ rhyme syllables'}</dt><dd>{language === 'de' ? 'Vollreim über mindestens zwei Silben der Reimdomäne.' : 'Perfect rhyme across at least two rhyme-domain syllables.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Slant-Reim' : 'Slant rhyme'}</dt><dd>{language === 'de' ? 'Phonetisch nah, aber nicht identisch; Vokale und Konsonanten dürfen kontrolliert abweichen.' : 'Phonetically close but not identical; vowels and consonants may differ within the scoring model.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Slant · 2+ Reimsilben' : 'Slant · 2+ rhyme syllables'}</dt><dd>{language === 'de' ? 'Mehrsilbige Variante des Slant-Reims.' : 'Multisyllabic slant-rhyme relation.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Reimfamilie' : 'Rhyme family'}</dt><dd>{language === 'de' ? 'Lockerere, aber noch strukturell verwandte Reimnähe.' : 'Looser but still structurally related rhyme similarity.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Assonanz' : 'Assonance'}</dt><dd>{language === 'de' ? 'Ähnlichkeit vor allem in den Vokalen der Reimdomäne.' : 'Similarity mainly in the vowel sequence of the rhyme domain.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Konsonanz' : 'Consonance'}</dt><dd>{language === 'de' ? 'Ähnlichkeit vor allem in den Konsonanten der Reimdomäne.' : 'Similarity mainly in the consonant sequence of the rhyme domain.'}</dd></div>
                  </dl>
                </section>

                <section>
                  <h3>{language === 'de' ? 'Was die Filter tun' : 'What the filters do'}</h3>
                  <dl>
                    <div><dt>{language === 'de' ? 'Wörter' : 'Words'}</dt><dd>{language === 'de' ? 'Nur lexikalische Worttreffer. Bei einer ganzen Zeile wird dafür der rechte lexikalische Rand als Reimanker verwendet.' : 'Lexical word results only. For a full line, the lexical right edge is used as the rhyme anchor.'}</dd></div>
                    <div><dt>Phrase / Mosaic</dt><dd>{language === 'de' ? 'Mehrwort-Treffer gegen die komplette Phrase bzw. deren phonetische Struktur.' : 'Multiword matches against the full phrase and its phonetic structure.'}</dd></div>
                    <div><dt>Entities</dt><dd>{language === 'de' ? 'Namen, Personen, Werke, Orte und andere benannte Einträge aus dem Entity-Korpus.' : 'Names, people, works, places and other named entries from the entity corpus.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Sprachroute' : 'Language route'}</dt><dd>{language === 'de' ? 'Links steht die Sprache der Eingabe, rechts die Sprache der gewünschten Ergebnisse – z. B. DE → DE oder DE → DE + EN.' : 'Left is the query language, right is the result language – e.g. DE → DE or DE → DE + EN.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Silben' : 'Syllables'}</dt><dd>{language === 'de' ? 'Begrenzt Kandidaten nach Silbenzahl bzw. Abstand zur Silbenzahl des Reimankers.' : 'Restricts candidates by syllable count or distance from the anchor syllable count.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Varianten' : 'Variants'}</dt><dd>{language === 'de' ? 'Bezieht zusätzliche Aussprachevarianten ein statt nur der bevorzugten Aussprache.' : 'Includes additional pronunciation variants instead of only the preferred pronunciation.'}</dd></div>
                    <div><dt>{language === 'de' ? 'Historisch' : 'Historical'}</dt><dd>{language === 'de' ? 'Erlaubt historische Einträge, die im normalen aktuellen Korpus ausgeblendet bleiben.' : 'Allows historical entries normally excluded from the current corpus.'}</dd></div>
                    <div><dt>Generated</dt><dd>{language === 'de' ? 'Bezieht – sofern die Runtime sie besitzt – zusätzlich generierte Aussprache-Daten ein. Sie ersetzen keine kanonischen Quellen.' : 'Includes generated pronunciation data when the runtime provides it. It does not replace canonical sources.'}</dd></div>
                    <div><dt>Lite / Standard / Full</dt><dd>{language === 'de' ? 'Wählt die verfügbare lokale Runtime-Größe. Nicht installierte bzw. nicht freigegebene Editionen bleiben deaktiviert.' : 'Selects the available local runtime tier. Editions that are not installed or authorized remain disabled.'}</dd></div>
                  </dl>
                </section>

                <section>
                  <h3>{language === 'de' ? 'Reimanker & Resolver' : 'Rhyme anchor & resolver'}</h3>
                  <p>
                    {language === 'de'
                      ? 'Bekannte Wörter werden zuerst normal aus den Datenbanken aufgelöst. Erst wenn für eine angeforderte Sprache keine Query-Aussprache vorhanden ist, versucht der Client-Resolver eine Aussprache zu bilden und startet denselben Writer-Pfad erneut.'
                      : 'Known words are resolved from the databases first. Only when a requested language has no query pronunciation does the client resolver construct one and retry the same Writer path.'}
                  </p>
                  <p>
                    {language === 'de'
                      ? 'Bei langen aufgelösten Komposita kann der Wortkanal den source-backed rechten Bestandteil als lexikalischen Reimanker verwenden – etwa „Anker“ in „Altkassenverwaltungsanker“.'
                      : 'For long resolved compounds, the word channel can use the source-backed rightmost component as the lexical rhyme anchor – e.g. “anchor” in a longer compound.'}
                  </p>
                </section>

                <section>
                  <h3>{language === 'de' ? 'Anfangsklang ist etwas anderes' : 'Initial sound is a different axis'}</h3>
                  <p>
                    {language === 'de'
                      ? 'Resolve / Refrain / Recovery oder Alter / Altbau / Allgemein teilen vor allem den Wortanfang. Das ist eher Anlaut-/Anfangsklang bzw. Alliteration als ein normaler Endreim. Der aktuelle Reimtypen-Filter sucht rechts in der Reimdomäne und hat dafür noch keinen eigenen Modus.'
                      : 'Resolve / Refrain / Recovery or similar examples mainly share the beginning of the word. That is closer to onset/initial-sound matching or alliteration than a normal end rhyme. The current rhyme-type filter works on the right-edge rhyme domain and does not yet expose a dedicated mode for this.'}
                  </p>
                </section>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>

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
