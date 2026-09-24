import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Popover, Select } from '../../design-system/primitives';
import type {
  QueryBasis,
  RhymeType,
  SearchScope,
  SearchSort,
  SyllableFilter,
  VariantMode,
} from '../../legacy/contracts';
import { useUiStore } from '../../state/uiStore';
import { Icon } from '../../shell/icons';
import {
  SEARCH_PRESETS,
  STUDIO_RHYME_TYPES,
  STUDIO_RHYME_TYPE_LABELS,
  corpusModePatch,
  corpusModeValue,
  entityCategoryLabel,
  languageRouteValue,
  parseLanguageRoute,
  presetPatch,
  type CorpusMode,
  type SearchPreset,
} from './presentation';
import { useSharedSearchState } from './SearchStateProvider';
import styles from './Search.module.css';

type Option = { value: string; label: string; disabled?: boolean };

const FILTER_DISMISS_DELAY_MS = 420;

function scheduleFilterDismiss(
  close: () => void,
  onDismiss?: () => void,
  ownerDocument: Document = document,
) {
  const ownerWindow = ownerDocument.defaultView ?? window;
  ownerWindow.setTimeout(() => {
    const hovering = ownerDocument.querySelector(
      '[data-rhymelab-filter-deck="true"]:hover, [data-search-filter-popup="true"]:hover',
    );
    if (hovering) return;
    close();
    onDismiss?.();
  }, FILTER_DISMISS_DELAY_MS);
}

function useTransientPopup(
  open: boolean,
  setOpen: (open: boolean) => void,
  onDismiss?: () => void,
  ownerDocument: Document = document,
) {
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const ownerWindow = ownerDocument.defaultView ?? window;
    const OwnerNode = ownerWindow.Node;
    const closeOnViewportActivity = (event: Event) => {
      const target = event.target;
      if (OwnerNode && target instanceof OwnerNode && popupRef.current?.contains(target)) return;
      setOpen(false);
      onDismiss?.();
    };
    ownerWindow.addEventListener('wheel', closeOnViewportActivity, { capture: true, passive: true });
    ownerWindow.addEventListener('touchmove', closeOnViewportActivity, { capture: true, passive: true });
    ownerDocument.addEventListener('scroll', closeOnViewportActivity, true);
    return () => {
      ownerWindow.removeEventListener('wheel', closeOnViewportActivity, true);
      ownerWindow.removeEventListener('touchmove', closeOnViewportActivity, true);
      ownerDocument.removeEventListener('scroll', closeOnViewportActivity, true);
    };
  }, [onDismiss, open, ownerDocument, setOpen]);

  return popupRef;
}


function FilterSelect({
  label,
  value,
  options,
  disabled = false,
  active = false,
  onChange,
  onDismiss,
  portalContainer,
}: {
  label: string;
  value: string;
  options: readonly Option[];
  disabled?: boolean;
  active?: boolean;
  onChange: (value: string) => void;
  onDismiss?: () => void;
  portalContainer?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const ownerDocument = portalContainer?.ownerDocument ?? document;
  const popupRef = useTransientPopup(open, setOpen, onDismiss, ownerDocument);

  return (
    <div
      className={styles.filterField}
      data-active={active ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
    >
      <span className={styles.filterLabel}>{label}</span>
      <Select.Root
        items={options}
        value={value}
        disabled={disabled}
        open={open}
        onOpenChange={setOpen}
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next);
        }}
      >
        <Select.Trigger className={styles.filterTrigger}>
          <Select.Value />
          <Select.Icon><Icon name="chevron" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal container={portalContainer}>
          <Select.Positioner className={styles.selectPositioner} sideOffset={5} alignItemWithTrigger={false}>
            <Select.Popup
              ref={popupRef}
              className={styles.filterPopup}
              data-search-filter-popup="true"
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') {
                  scheduleFilterDismiss(() => setOpen(false), onDismiss, ownerDocument);
                }
              }}
            >
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={styles.filterOption}
                >
                  <Select.ItemIndicator className={styles.filterOptionCheck}>
                    <Icon name="check" />
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

function presetLabel(preset: SearchPreset, language: 'de' | 'en'): string {
  const fixed: Partial<Record<SearchPreset, [string, string]>> = {
    best: ['Beste', 'Best'],
    words: ['Wörter', 'Words'],
    phrases: ['Phrasen', 'Phrases'],
    entities: ['Entities', 'Entities'],
  };
  if (fixed[preset]) return fixed[preset]![language === 'de' ? 0 : 1];
  const de = STUDIO_RHYME_TYPE_LABELS[preset as RhymeType] ?? String(preset);
  if (language === 'de') return de;
  return ({
    multisyllabic_perfect: 'Multisyllabic perfect',
    perfect: 'Perfect rhyme',
    multisyllabic_slant: 'Multisyllabic slant',
    family: 'Rhyme family',
    slant: 'Slant rhyme',
    assonance: 'Assonance',
    consonance: 'Consonance',
  } as Record<string, string>)[preset] ?? String(preset);
}

function LanguageRoutePicker({
  onDismiss,
  portalContainer,
}: {
  onDismiss?: () => void;
  portalContainer?: HTMLElement | null;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const { state, patch } = useSharedSearchState();
  const [open, setOpen] = useState(false);
  const ownerDocument = portalContainer?.ownerDocument ?? document;
  const popupRef = useTransientPopup(open, setOpen, onDismiss, ownerDocument);
  const current = languageRouteValue(state.queryBasis, state.resultLanguage);
  const routeLabel = (value: string) => value === 'both' ? 'DE + EN' : value.toUpperCase();
  const queryRows = [
    { value: 'de', label: 'DE' },
    { value: 'en', label: 'EN' },
    { value: 'both', label: 'DE + EN' },
  ] as const;
  const resultCols = [
    { value: 'de', label: 'DE' },
    { value: 'en', label: 'EN' },
    { value: 'both', label: 'DE + EN' },
  ] as const;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div
        className={styles.filterField}
        data-active={state.queryBasis !== state.resultLanguage ? 'true' : 'false'}
      >
        <span className={styles.filterLabel}>{language === 'de' ? 'SPRACHEN' : 'LANGUAGES'}</span>
        <Popover.Trigger className={styles.filterTrigger}>
          <span>{routeLabel(state.queryBasis)} → {routeLabel(state.resultLanguage)}</span>
          <Icon name="chevron" />
        </Popover.Trigger>
      </div>
      <Popover.Portal container={portalContainer}>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup
            ref={popupRef}
            className={styles.languageRoutePopup}
            data-search-filter-popup="true"
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') {
                scheduleFilterDismiss(() => setOpen(false), onDismiss, ownerDocument);
              }
            }}
          >
            <Popover.Title className={styles.languageRouteTitle}>
              {language === 'de' ? 'Sprache klar wählen' : 'Choose language route'}
            </Popover.Title>
            <p>
              {language === 'de'
                ? 'Zeile = Aussprachebasis · Spalte = Ergebnis-Sprache'
                : 'Row = query pronunciation · column = result language'}
            </p>
            <div className={styles.languageRouteMatrix}>
              <span />
              {resultCols.map((result) => <b key={result.value}>{result.label}</b>)}
              {queryRows.flatMap((query) => [
                <strong key={query.value + '-label'}>{query.label}</strong>,
                ...resultCols.map((result) => {
                  const value = `${query.value}:${result.value}`;
                  const active = current === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-active={active ? 'true' : 'false'}
                      aria-pressed={active}
                      onClick={() => {
                        patch(parseLanguageRoute(value));
                        setOpen(false);
                      }}
                    >
                      {query.label} → {result.label}
                    </button>
                  );
                }),
              ])}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SearchControls({
  entityCategories,
  generatedAvailable,
  compact = false,
  onRequestClose,
  portalContainer,
}: {
  entityCategories: string[];
  generatedAvailable: boolean;
  compact?: boolean;
  onRequestClose?: () => void;
  portalContainer?: HTMLElement | null;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const { state, patch, resetFilters } = useSharedSearchState();
  const [entitiesOpen, setEntitiesOpen] = useState(false);
  const ownerDocument = portalContainer?.ownerDocument ?? document;
  const entityPopupRef = useTransientPopup(entitiesOpen, setEntitiesOpen, onRequestClose, ownerDocument);

  const scopeOptions: Option[] = [
    { value: 'all', label: language === 'de' ? 'Alles' : 'All' },
    { value: 'words', label: language === 'de' ? 'Wörter' : 'Words' },
    { value: 'phrases', label: language === 'de' ? 'Phrasen / Mosaic' : 'Phrases / Mosaic' },
    { value: 'entities', label: 'Entities' },
  ];

  const rhymeOptions: Option[] = [
    { value: 'all', label: language === 'de' ? 'Alle Beziehungen' : 'All relations' },
    ...STUDIO_RHYME_TYPES.filter((value) => value !== 'all').map((value) => ({
      value,
      label: presetLabel(value, language),
    })),
  ];

  const syllableOptions: Option[] = [
    { value: 'all', label: language === 'de' ? 'Alle' : 'All' },
    { value: 'same', label: language === 'de' ? 'Wie Anker' : 'Same as anchor' },
    { value: 'near', label: language === 'de' ? 'Anker ±1' : 'Anchor ±1' },
    { value: 'near2', label: language === 'de' ? 'Anker ±2' : 'Anchor ±2' },
    { value: 'near3', label: language === 'de' ? 'Anker ±3' : 'Anchor ±3' },
    { value: '1', label: language === 'de' ? '1 Silbe' : '1 syllable' },
    { value: '2', label: language === 'de' ? '2 Silben' : '2 syllables' },
    { value: '3', label: language === 'de' ? '3+ Silben' : '3+ syllables' },
  ];

  const sortOptions: Option[] = [
    { value: 'recommended', label: language === 'de' ? 'Empfohlen' : 'Recommended' },
    { value: 'closest', label: language === 'de' ? 'Klangnähe' : 'Closest rhyme' },
    { value: 'common', label: language === 'de' ? 'Häufigkeit' : 'Most common' },
    { value: 'syllables', label: language === 'de' ? 'Silbendistanz' : 'Syllable distance' },
    { value: 'alpha', label: 'A–Z' },
  ];

  const variantOptions: Option[] = [
    { value: 'preferred', label: language === 'de' ? 'Standard' : 'Standard' },
    { value: 'all', label: language === 'de' ? 'Alle Varianten' : 'All variants' },
  ];

  const corpusOptions: Option[] = [
    { value: 'current', label: language === 'de' ? 'Aktuell · kanonisch' : 'Current · canonical' },
    { value: 'generated', label: language === 'de' ? 'Aktuell + Generated' : 'Current + generated', disabled: !generatedAvailable },
    { value: 'generated_only', label: language === 'de' ? 'Nur Generated' : 'Generated only', disabled: !generatedAvailable },
    { value: 'historical', label: language === 'de' ? '+ Historisch' : '+ historical' },
    { value: 'complete', label: language === 'de' ? 'Historisch + Generated' : 'Historical + generated', disabled: !generatedAvailable },
    { value: 'historical_generated_only', label: language === 'de' ? 'Historisch · nur Generated' : 'Historical · generated only', disabled: !generatedAvailable },
  ];

  const activePreset = useMemo<SearchPreset | null>(() => {
    if (state.scope === 'all' && state.rhymeType === 'all') return 'best';
    if (state.scope !== 'all' && state.rhymeType === 'all') return state.scope;
    if (state.scope === 'all' && state.rhymeType !== 'all') return state.rhymeType;
    return null;
  }, [state.rhymeType, state.scope]);

  const entityAvailable = entityCategories.length > 0
    && (state.scope === 'all' || state.scope === 'entities');

  return (
    <div
      className={styles.controls}
      data-compact={compact ? 'true' : 'false'}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        scheduleFilterDismiss(() => onRequestClose?.());
      }}
      data-rhymelab-filter-deck="true"
      data-rhymelab-control="search.languages"
    >
      <div className={styles.presetRow} aria-label={language === 'de' ? 'Presets' : 'Presets'}>
        {SEARCH_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={styles.presetButton}
            data-active={preset === activePreset ? 'true' : 'false'}
            onClick={() => patch(presetPatch(preset))}
          >
            {presetLabel(preset, language)}
          </button>
        ))}
      </div>

      <div className={styles.filterGrid} data-rhymelab-control="search.scope">
        <LanguageRoutePicker onDismiss={onRequestClose} portalContainer={portalContainer} />
        <FilterSelect
          label={language === 'de' ? 'BEREICH' : 'SCOPE'}
          value={state.scope}
          options={scopeOptions}
          active={state.scope !== 'all'}
          onChange={(value) => patch({ scope: value as SearchScope })}
                  onDismiss={onRequestClose}
          portalContainer={portalContainer}
        />
        <FilterSelect
          label={language === 'de' ? 'REIM / KLANG' : 'RHYME / SOUND'}
          value={state.rhymeType}
          options={rhymeOptions}
          active={state.rhymeType !== 'all'}
          onChange={(value) => patch({ rhymeType: value as RhymeType })}
                  onDismiss={onRequestClose}
          portalContainer={portalContainer}
        />
        <FilterSelect
          label={language === 'de' ? 'SILBEN' : 'SYLLABLES'}
          value={state.syllableFilter}
          options={syllableOptions}
          active={state.syllableFilter !== 'all'}
          onChange={(value) => patch({ syllableFilter: value as SyllableFilter })}
                  onDismiss={onRequestClose}
          portalContainer={portalContainer}
        />
        <FilterSelect
          label={language === 'de' ? 'SORTIERUNG' : 'SORT'}
          value={state.sort}
          options={sortOptions}
          active={state.sort !== 'recommended'}
          onChange={(value) => patch({ sort: value as SearchSort })}
                  onDismiss={onRequestClose}
          portalContainer={portalContainer}
        />
        <FilterSelect
          label={language === 'de' ? 'AUSSPRACHE' : 'PRONUNCIATION'}
          value={state.variantMode}
          options={variantOptions}
          disabled={state.scope === 'phrases' || state.scope === 'entities'}
          active={state.variantMode !== 'preferred'}
          onChange={(value) => patch({ variantMode: value as VariantMode })}
                  onDismiss={onRequestClose}
          portalContainer={portalContainer}
        />
        <FilterSelect
          label={language === 'de' ? 'KORPUS' : 'CORPUS'}
          value={corpusModeValue(state)}
          options={corpusOptions}
          active={state.historical || state.generated || state.generatedOnly}
          onChange={(value) => patch(corpusModePatch(value as CorpusMode))}
                  onDismiss={onRequestClose}
          portalContainer={portalContainer}
        />

        <Popover.Root open={entitiesOpen} onOpenChange={setEntitiesOpen}>
          <div
            className={styles.filterField}
            data-active={state.entityCategories.length ? 'true' : 'false'}
            data-disabled={!entityAvailable ? 'true' : 'false'}
          >
            <span className={styles.filterLabel}>
              {language === 'de' ? 'ENTITY-KATEGORIEN' : 'ENTITY CATEGORIES'}
            </span>
            <Popover.Trigger
              className={styles.filterTrigger}
              disabled={!entityAvailable}
              aria-label={language === 'de' ? 'Entity-Kategorien wählen' : 'Choose entity categories'}
            >
              <span>
                {state.entityCategories.length
                  ? `${state.entityCategories.length} ${language === 'de' ? 'gewählt' : 'selected'}`
                  : language === 'de' ? 'Alle Kategorien' : 'All categories'}
              </span>
              <Icon name="chevron" />
            </Popover.Trigger>
          </div>
          <Popover.Portal container={portalContainer}>
            <Popover.Positioner sideOffset={5} align="end">
              <Popover.Popup
                ref={entityPopupRef}
                className={styles.entityPopup}
                data-search-filter-popup="true"
                onPointerLeave={(event) => {
                  if (event.pointerType === 'mouse') {
                    scheduleFilterDismiss(() => setEntitiesOpen(false), onRequestClose, ownerDocument);
                  }
                }}
              >
                <Popover.Title className={styles.entityPopupTitle}>
                  {language === 'de' ? 'Entity-Kategorien' : 'Entity categories'}
                </Popover.Title>
                <div className={styles.entityList}>
                  {entityCategories.map((category) => {
                    const checked = state.entityCategories.includes(category);
                    return (
                      <label key={category} className={styles.entityCheck}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? state.entityCategories.filter((item) => item !== category)
                              : [...state.entityCategories, category].slice(0, 24);
                            patch({
                              entityCategories: next,
                              entityCategory: next[0] ?? 'all',
                            });
                          }}
                        />
                        <span>{entityCategoryLabel(category, language)}</span>
                      </label>
                    );
                  })}
                </div>
                <Button
                  className={styles.entityClear}
                  onClick={() => patch({ entityCategory: 'all', entityCategories: [] })}
                >
                  {language === 'de' ? 'Alle Kategorien' : 'All categories'}
                </Button>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div className={styles.controlFooter}>
        <Button className={styles.resetButton} onClick={resetFilters}>
          ↺ {language === 'de' ? 'Filter zurücksetzen' : 'Reset filters'}
        </Button>
        {!generatedAvailable ? (
          <span className={styles.controlHint}>
            {language === 'de'
              ? 'Generated ist in der aktiven Runtime nicht verfügbar.'
              : 'Generated data is unavailable in the active runtime.'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
