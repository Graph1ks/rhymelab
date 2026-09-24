import {
  useEffect,
  useMemo,
  useRef,
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
  autoScroll,
  onInsert,
}: {
  rows: WriterResultRow[];
  density: ResultDensity;
  selectedId: string;
  onSelect: (row: WriterResultRow) => void;
  onToggleSaved: (row: WriterResultRow) => void;
  isSaved: (word: string) => boolean;
  visibleCount: number;
  setVisibleCount: (updater: number | ((current: number) => number)) => void;
  autoScroll: boolean;
  onInsert?: (row: WriterResultRow) => void;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pauseUntilRef = useRef(0);
  const lastFrameRef = useRef(0);

  const visibleRows = useMemo(
    () => rows.slice(0, Math.min(rows.length, visibleCount)),
    [rows, visibleCount],
  );

  const virtualizer = useVirtualizer({
    count: density === 'tiles' ? 0 : visibleRows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => density === 'compact' ? 58 : 88,
    overscan: 8,
  });

  const selectedIndex = rows.findIndex((row) => row.id === selectedId);

  const grow = (amount = density === 'compact' ? 24 : 12) => {
    setVisibleCount((current) => Math.min(rows.length, current + amount));
  };

  const pauseAutoScroll = () => {
    pauseUntilRef.current = performance.now() + 5000;
  };

  useEffect(() => {
    if (!autoScroll) return;
    const element = scrollerRef.current;
    if (!element) return;

    pauseUntilRef.current = performance.now() + 1000;
    lastFrameRef.current = 0;
    let frame = 0;

    const tick = (time: number) => {
      if (
        time > pauseUntilRef.current
        && !document.hidden
        && element.clientHeight > 0
      ) {
        element.scrollTop += (time - (lastFrameRef.current || time)) * 0.018;
        if (element.scrollTop + element.clientHeight >= element.scrollHeight - 2) {
          if (visibleCount < rows.length) {
            grow(6);
          } else {
            element.scrollTop = 0;
            pauseUntilRef.current = time + 1200;
          }
        }
      }
      lastFrameRef.current = time;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, density, rows.length, visibleCount]);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element || visibleCount >= rows.length) return;
    if (element.scrollHeight <= element.clientHeight + 100) grow();
  }, [density, rows.length, visibleCount]);

  const handleScroll = () => {
    const element = scrollerRef.current;
    if (!element) return;
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
      if (density !== 'tiles') {
        requestAnimationFrame(() => virtualizer.scrollToIndex(action.index, { align: 'auto' }));
      }
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
      tabIndex={0}
      role="listbox"
      data-rhymelab-control="search.results-keyboard"
      aria-label={language === 'de'
        ? 'Reimtreffer; Pfeiltasten wählen, Enter setzt ein, Leertaste merkt'
        : 'Rhyme results; arrows select, Enter inserts, Space saves'}
      onScroll={handleScroll}
      onWheel={pauseAutoScroll}
      onTouchStart={pauseAutoScroll}
      onPointerDown={pauseAutoScroll}
      onFocus={pauseAutoScroll}
      onKeyDown={handleKeyDown}
    >
      {density === 'tiles' ? (
        <div className={styles.tileGrid}>
          {visibleRows.map((row) => (
            <ResultRow
              key={row.id}
              row={row}
              density={density}
              selected={row.id === selectedId}
              saved={isSaved(row.word)}
              onSelect={onSelect}
              onToggleSaved={onToggleSaved}
              onInsert={onInsert}
            />
          ))}
        </div>
      ) : (
        <div
          className={styles.virtualSpace}
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
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
      )}

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
