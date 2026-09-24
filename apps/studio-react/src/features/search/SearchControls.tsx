import { useMemo, useState } from 'react';

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

function FilterSelect({
  label,
  value,
  options,
  disabled = false,
  active = false,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly Option[];
  disabled?: boolean;
  active?: boolean;
  onChange: (value: string) => void;
}) {
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
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next);
        }}
      >
        <Select.Trigger className={styles.filterTrigger}>
          <Select.Value />
          <Select.Icon><Icon name="chevron" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className={styles.selectPositioner} sideOffset={5} alignItemWithTrigger={false}>
            <Select.Popup className={styles.filterPopup}>
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

export function SearchControls({
  entityCategories,
  generatedAvailable,
  compact = false,
}: {
  entityCategories: string[];
  generatedAvailable: boolean;
  compact?: boolean;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const { state, patch, resetFilters } = useSharedSearchState();
  const [entitiesOpen, setEntitiesOpen] = useState(false);

  const languageOptions: Option[] = [
    { value: 'de:both', label: 'DE → DE + EN' },
    { value: 'de:de', label: 'DE → DE' },
    { value: 'de:en', label: 'DE → EN' },
    { value: 'en:both', label: 'EN → DE + EN' },
    { value: 'en:en', label: 'EN → EN' },
    { value: 'en:de', label: 'EN → DE' },
    { value: 'both:both', label: 'DE + EN → DE + EN' },
    { value: 'both:de', label: 'DE + EN → DE' },
    { value: 'both:en', label: 'DE + EN → EN' },
  ];

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
    <div className={styles.controls} data-compact={compact ? 'true' : 'false'}>
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

      <div className={styles.filterGrid}>
        <FilterSelect
          label={language === 'de' ? 'SPRACHEN' : 'LANGUAGES'}
          value={languageRouteValue(state.queryBasis, state.resultLanguage)}
          options={languageOptions}
          active={state.queryBasis !== 'de' || state.resultLanguage !== 'both'}
          onChange={(value) => patch(parseLanguageRoute(value))}
        />
        <FilterSelect
          label={language === 'de' ? 'BEREICH' : 'SCOPE'}
          value={state.scope}
          options={scopeOptions}
          active={state.scope !== 'all'}
          onChange={(value) => patch({ scope: value as SearchScope })}
        />
        <FilterSelect
          label={language === 'de' ? 'REIM / KLANG' : 'RHYME / SOUND'}
          value={state.rhymeType}
          options={rhymeOptions}
          active={state.rhymeType !== 'all'}
          onChange={(value) => patch({ rhymeType: value as RhymeType })}
        />
        <FilterSelect
          label={language === 'de' ? 'SILBEN' : 'SYLLABLES'}
          value={state.syllableFilter}
          options={syllableOptions}
          active={state.syllableFilter !== 'all'}
          onChange={(value) => patch({ syllableFilter: value as SyllableFilter })}
        />
        <FilterSelect
          label={language === 'de' ? 'SORTIERUNG' : 'SORT'}
          value={state.sort}
          options={sortOptions}
          active={state.sort !== 'recommended'}
          onChange={(value) => patch({ sort: value as SearchSort })}
        />
        <FilterSelect
          label={language === 'de' ? 'AUSSPRACHE' : 'PRONUNCIATION'}
          value={state.variantMode}
          options={variantOptions}
          disabled={state.scope === 'phrases' || state.scope === 'entities'}
          active={state.variantMode !== 'preferred'}
          onChange={(value) => patch({ variantMode: value as VariantMode })}
        />
        <FilterSelect
          label={language === 'de' ? 'KORPUS' : 'CORPUS'}
          value={corpusModeValue(state)}
          options={corpusOptions}
          active={state.historical || state.generated || state.generatedOnly}
          onChange={(value) => patch(corpusModePatch(value as CorpusMode))}
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
          <Popover.Portal>
            <Popover.Positioner sideOffset={5} align="end">
              <Popover.Popup className={styles.entityPopup}>
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
