import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { WriterResultRow } from '../../legacy/contracts';
import { useUiStore } from '../../state/uiStore';
import { resultKeyboardAction } from '../system/model';
import { Icon } from '../../shell/icons';
import {
  resultBadges,
  resultKindLabel,
  type ResultDensity,
} from './presentation';
import styles from './Search.module.css';

function relationShort(row: WriterResultRow, language: 'de' | 'en'): string {
  const labels: Record<string, [string, string]> = {
    multisyllabic_perfect: ['Multi-Voll', 'Multi-perfect'],
    perfect: ['Voll', 'Perfect'],
    multisyllabic_slant: ['Multi-Slant', 'Multi-slant'],
    family: ['Familie', 'Family'],
    slant: ['Slant', 'Slant'],
    assonance: ['Asson.', 'Asson.'],
    consonance: ['Konson.', 'Conson.'],
  };
  return labels[row.relationType]?.[language === 'de' ? 0 : 1]
    ?? (language === 'de' ? 'Klang' : 'Sound');
}

function ResultRow({
  row,
  density,
  selected,
  saved,
  onSelect,
  onToggleSaved,
  onInsert,
}: {
  row: WriterResultRow;
  density: ResultDensity;
  selected: boolean;
  saved: boolean;
  onSelect: (row: WriterResultRow) => void;
  onToggleSaved: (row: WriterResultRow) => void;
  onInsert?: (row: WriterResultRow) => void;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const badges = resultBadges(row, language);
  const score = Number.isFinite(Number(row.score))
    ? Math.max(0, Math.min(100, Math.round(Number(row.score) * 100)))
    : null;

  return (
    <article
      className={styles.resultRow}
      data-density={density}
      data-selected={selected ? 'true' : 'false'}
      data-kind={row.kind}
    >
      <button
        type="button"
        className={styles.resultMain}
        aria-pressed={selected}
        onClick={() => onSelect(row)}
      >
        <span className={styles.resultTitleLine}>
          <b>{row.word}</b>
          {row.kind !== 'word' ? (
            <span className={styles.kindBadge}>
              {resultKindLabel(row, language)}
            </span>
          ) : null}
        </span>

        <span className={styles.resultMeta}>
          <strong>{row.relationLabel || (language === 'de' ? 'Klangtreffer' : 'Sound match')}</strong>
          <span>{row.syll || '—'} {language === 'de' ? 'Silb.' : 'syl.'}</span>
          <span>{resultKindLabel(row, language)} · {row.lang.toUpperCase()}</span>
        </span>

        {density !== 'compact' && badges.length ? (
          <span className={styles.badgeRow}>
            {badges.map((badge) => (
              <i key={badge.label} data-kind={badge.kind}>{badge.label}</i>
            ))}
          </span>
        ) : null}
      </button>

      <span className={styles.relationCell}>
        {relationShort(row, language)}
      </span>

      <span className={styles.syllableCell}>
        {row.syll || '—'}
      </span>

      {density === 'list' && score != null ? (
        <span className={styles.scoreCell}>
          <i style={{ '--score': `${score}%` } as CSSProperties} />
          <small>{score}%</small>
        </span>
      ) : null}

      <div className={styles.resultActions}>
        <button
          type="button"
          className={saved ? styles.savedButton : styles.resultAction}
          aria-pressed={saved}
          aria-label={saved
            ? `${row.word} ${language === 'de' ? 'entmerken' : 'remove from saved'}`
            : `${row.word} ${language === 'de' ? 'merken' : 'save'}`}
          onClick={() => onToggleSaved(row)}
        >
          <Icon name="bookmark" />
        </button>
        <button
          type="button"
          className={styles.resultAction}
          disabled={!onInsert}
          aria-label={language === 'de'
            ? `${row.word} einsetzen`
            : `Insert ${row.word}`}
          title={!onInsert
            ? (language === 'de'
              ? 'Einsetzen ist nur mit aktiver Editor-Auswahl verfügbar.'
              : 'Insert requires an active editor selection.')
            : undefined}
          onClick={() => onInsert?.(row)}
        >
          +
        </button>
      </div>
    </article>
  );
}

export function ResultsList({
  rows,
  density,
  selectedId,
  onSelect,
  onToggleSaved,
  isSaved,
  visibleCount,
  setVisibleCount,
  onScrollActivity,
  onInsert,
  layout = 'list',
}: {
  rows: WriterResultRow[];
  density: ResultDensity;
  selectedId: string;
  onSelect: (row: WriterResultRow) => void;
  onToggleSaved: (row: WriterResultRow) => void;
  isSaved: (word: string) => boolean;
  visibleCount: number;
  setVisibleCount: (updater: number | ((current: number) => number)) => void;
  onScrollActivity?: () => void;
  onInsert?: (row: WriterResultRow) => void;
  layout?: 'list' | 'adaptive-grid';
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [gridColumns, setGridColumns] = useState(1);

  const visibleRows = useMemo(
    () => rows.slice(0, Math.min(rows.length, visibleCount)),
    [rows, visibleCount],
  );

  useEffect(() => {
    const element = scrollerRef.current;
    if (layout !== 'adaptive-grid' || !element) {
      if (gridColumns !== 1 && layout !== 'adaptive-grid') setGridColumns(1);
      return undefined;
    }

    const ResizeObserverCtor = element.ownerDocument.defaultView?.ResizeObserver
      ?? globalThis.ResizeObserver;
    if (!ResizeObserverCtor) return undefined;

    const updateColumns = (width: number) => {
      const next = width >= 1520 ? 4 : width >= 1080 ? 3 : width >= 680 ? 2 : 1;
      setGridColumns((current) => current === next ? current : next);
    };

    updateColumns(element.clientWidth);
    const observer = new ResizeObserverCtor((entries) => {
      const entry = entries[0];
      if (entry) updateColumns(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [gridColumns, layout]);

  const virtualCount = layout === 'adaptive-grid'
    ? Math.ceil(visibleRows.length / gridColumns)
    : visibleRows.length;

  const virtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => layout === 'adaptive-grid' ? 66 : density === 'compact' ? 58 : 88,
    overscan: 8,
  });

  const selectedIndex = rows.findIndex((row) => row.id === selectedId);

  const grow = (amount = density === 'compact' ? 24 : 12) => {
    setVisibleCount((current) => Math.min(rows.length, current + amount));
  };

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element || visibleCount >= rows.length) return;
    if (element.scrollHeight <= element.clientHeight + 100) grow();
  }, [density, rows.length, visibleCount]);

  const handleScroll = () => {
    const element = scrollerRef.current;
    if (!element) return;
    if (element.scrollTop > 0) onScrollActivity?.();
    if (
      element.scrollHeight
      - element.scrollTop
      - element.clientHeight
      < 120
      && visibleCount < rows.length
    ) {
      grow();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = resultKeyboardAction(
      event.key,
      selectedIndex,
      rows.length,
      Boolean(onInsert),
    );
    if (action.type === 'none') return;
    event.preventDefault();
    const row = rows[action.index];
    if (!row) return;

    if (action.type === 'select') {
      if (action.index >= visibleCount) {
        setVisibleCount(Math.min(rows.length, action.index + 12));
      }
      onSelect(row);
      const virtualIndex = layout === 'adaptive-grid'
        ? Math.floor(action.index / gridColumns)
        : action.index;
      requestAnimationFrame(() => virtualizer.scrollToIndex(virtualIndex, { align: 'auto' }));
      return;
    }
    if (action.type === 'insert') {
      onInsert?.(row);
      return;
    }
    onToggleSaved(row);
  };

  return (
    <div
      ref={scrollerRef}
      className={styles.resultsScroller}
      data-density={density}
      data-layout={layout}
      data-columns={layout === 'adaptive-grid' ? gridColumns : undefined}
      tabIndex={0}
      role="listbox"
      data-rhymelab-control="search.results-keyboard"
      aria-label={language === 'de'
        ? 'Reimtreffer; Pfeiltasten wählen, Enter setzt ein, Leertaste merkt'
        : 'Rhyme results; arrows select, Enter inserts, Space saves'}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
    >
      <div
        className={styles.virtualSpace}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          if (layout === 'adaptive-grid') {
            const start = item.index * gridColumns;
            const group = visibleRows.slice(start, start + gridColumns);
            if (!group.length) return null;
            return (
              <div
                key={`grid-${start}`}
                className={styles.virtualGridRow}
                style={{
                  transform: `translateY(${item.start}px)`,
                  '--result-columns': gridColumns,
                } as CSSProperties}
              >
                {group.map((row) => (
                  <ResultRow
                    key={row.id}
                    row={row}
                    density="compact"
                    selected={row.id === selectedId}
                    saved={isSaved(row.word)}
                    onSelect={onSelect}
                    onToggleSaved={onToggleSaved}
                    onInsert={onInsert}
                  />
                ))}
              </div>
            );
          }

          const row = visibleRows[item.index];
          if (!row) return null;
          return (
            <div
              key={row.id}
              className={styles.virtualRow}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <ResultRow
                row={row}
                density={density}
                selected={row.id === selectedId}
                saved={isSaved(row.word)}
                onSelect={onSelect}
                onToggleSaved={onToggleSaved}
                onInsert={onInsert}
              />
            </div>
          );
        })}
      </div>



      {visibleRows.length < rows.length ? (
        <div className={styles.moreResults} aria-live="polite">
          {language === 'de'
            ? `${visibleRows.length} von ${rows.length} geladen · weiter scrollen`
            : `${visibleRows.length} of ${rows.length} loaded · keep scrolling`}
        </div>
      ) : null}
    </div>
  );
}
