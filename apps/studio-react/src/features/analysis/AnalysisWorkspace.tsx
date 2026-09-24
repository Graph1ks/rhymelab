import { useState, type CSSProperties } from 'react';

import type { StudioOccurrenceRelation, StudioRhymePair } from '../../legacy/contracts';
import {
  ensurePerformanceSong,
  performanceBarDurationMs,
  performanceFlowFingerprint,
  performancePocketMetrics,
  performancePreviousBarPlacements,
  performanceSyllablesPerSecond,
  trackedEditorLineIndexes,
} from '../../legacy/editor';
import { estimateSyllables } from '../../legacy/search';
import { useUiStore } from '../../state/uiStore';
import { useEditorSession } from '../editor/EditorSessionProvider';
import { asEditorSong } from '../editor/model';
import { useRuntimeEnvironment } from '../search/data';
import { useSharedSearchState } from '../search/SearchStateProvider';
import { useCanonicalAnalysis } from './data';
import {
  ANALYSIS_RHYME_TYPE_ORDER,
  allRhymeBars,
  analysisLineTokens,
  analysisRhymeTypeLabel,
  analysisSections,
  analysisTotals,
  relationCounts,
  rhymeChainGroups,
  rhymeTopologyGroups,
  sectionRelations,
  strongestRhymeType,
  trackedAnalysisDocument,
  trackedBarAt,
  type CanonicalAnalysisPayload,
  type CanonicalWordDetail,
} from './model';
import styles from './Analysis.module.css';

type Scope = 'end' | 'all';
type RelationMode = 'all' | 'primary' | 'soft';

const RHYME_GROUP_COLORS = 12;

function rhymeGroupStyle(label: string | undefined): CSSProperties {
  const text = String(label || '?').toUpperCase();
  const code = text.codePointAt(0) ?? 0;
  const index = Math.abs(code - 65) % RHYME_GROUP_COLORS;
  return { '--rhyme-color': `var(--rl-rhyme-group-${index})` } as CSSProperties;
}

function topologyGroupStyle(index: number | null | undefined): CSSProperties {
  if (index == null || index < 0) return {};
  return {
    '--topology-color': `var(--rl-rhyme-group-${index % RHYME_GROUP_COLORS})`,
  } as CSSProperties;
}


function RhymeLegend() {
  const language = useUiStore((state) => state.uiLanguage);
  return (
    <div className={styles.rhymeLegend}>
      <span>{language === 'de' ? 'REIMTYPEN' : 'RHYME TYPES'}</span>
      {ANALYSIS_RHYME_TYPE_ORDER.map((type) => (
        <i key={type} data-rhyme-type={type}>{analysisRhymeTypeLabel(type, language)}</i>
      ))}
      <small>{language === 'de' ? 'Schemafarben markieren zusammengehörige Reimgruppen.' : 'Scheme colors identify matching rhyme groups.'}</small>
    </div>
  );
}


function percentage(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100)) + '%' : '—';
}

function stress(detail: CanonicalWordDetail | null | undefined) {
  if (!detail) return '—';
  if (detail.stressPattern) return String(detail.stressPattern);
  if (detail.primaryStressSyllable != null) return 'P' + String(detail.primaryStressSyllable);
  if (detail.primaryStressSyllables?.length) return 'P ' + detail.primaryStressSyllables.join(', ');
  return '—';
}

function relationText(entry: Record<string, unknown> | null | undefined) {
  const relation = entry?.relation && typeof entry.relation === 'object'
    ? entry.relation as Record<string, unknown>
    : null;
  if (!relation) return '—';
  const label = String(relation.label || relation.type || '—');
  return Number(relation.score) ? label + ' · ' + percentage(relation.score) : label;
}

function Metric({ label, value, copy }: { label: string; value: string | number; copy?: string }) {
  return (
    <article className={styles.metric}>
      <small>{label}</small>
      <b>{value}</b>
      {copy ? <span>{copy}</span> : null}
    </article>
  );
}

function BarInspector({ data }: { data?: CanonicalAnalysisPayload | null }) {
  const language = useUiStore((state) => state.uiLanguage);
  const editor = useEditorSession();
  const song = editor.activeSong;
  if (!song) return null;
  const bar = trackedBarAt(song, editor.selection?.barId);
  if (!bar) return null;

  const copy = structuredClone(song);
  const performanceSong = asEditorSong(copy);
  ensurePerformanceSong(performanceSong);
  const tracked = trackedEditorLineIndexes(performanceSong);
  const analysisIndex = tracked.indexOf(bar.index);
  const detail = analysisIndex >= 0 ? data?.wordDetails?.[analysisIndex] : null;
  const relation = analysisIndex >= 0
    ? data?.lineRelations?.[analysisIndex] as Record<string, unknown> | undefined
    : undefined;
  const syllables = estimateSyllables(bar.text);
  const duration = performanceBarDurationMs(performanceSong);
  const pocket = performancePocketMetrics(performanceSong, bar.barId);
  const previous = performancePreviousBarPlacements(performanceSong, bar.barId);
  const fingerprint = performanceFlowFingerprint(performanceSong, bar.barId);
  const syllablesPerSecond = performanceSyllablesPerSecond(performanceSong, syllables);
  const words = bar.text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div><p>BAR INSPECTOR · {String(bar.barNumber).padStart(2, '0')}</p><h2>{bar.text || '—'}</h2></div>
        <span className={styles.canonical}>WRITER + PERFORM</span>
      </div>
      <div className={styles.metrics}>
        <Metric label={language === 'de' ? 'WÖRTER' : 'WORDS'} value={words} />
        <Metric label={language === 'de' ? 'SILBEN ≈' : 'SYLLABLES ≈'} value={syllables} />
        <Metric label="BAR TIME" value={(duration / 1000).toFixed(2) + ' s'} />
        <Metric label="SYLL./SEC ≈" value={syllablesPerSecond.toFixed(2)} />
        <Metric label="CUES" value={pocket.cues} copy={String(pocket.hits) + ' hit · ' + String(pocket.accents) + ' accent'} />
        <Metric label="POCKET" value={String(Math.round(pocket.offBeatShare * 100)) + '% off'} />
        <Metric label="BREATH LOAD" value={pocket.breathLoad} />
        <Metric label="PREVIOUS" value={previous.previousBarId ? previous.sharedCount : '—'} />
      </div>
      <div className={styles.inspector}>
        <span><small>IPA</small><code>{detail?.ipa ? '/' + detail.ipa + '/' : '—'}</code></span>
        <span><small>STRESS</small><b>{stress(detail)}</b></span>
        <span><small>{language === 'de' ? 'REIM IM VERSE' : 'RHYME IN VERSE'}</small><b>{relationText(relation)}</b></span>
        <span><small>FLOW</small><code>{fingerprint || '·'}</code></span>
      </div>
    </section>
  );
}

function EndAnalysis({ data, onOpenEditor }: { data: CanonicalAnalysisPayload; onOpenEditor: () => void }) {
  const language = useUiStore((state) => state.uiLanguage);
  const editor = useEditorSession();
  const { patch } = useSharedSearchState();
  const [relationMode, setRelationMode] = useState<RelationMode>('all');
  const [chainVisible, setChainVisible] = useState(false);
  const song = editor.activeSong;
  if (!song) return null;

  const document = trackedAnalysisDocument(structuredClone(song));
  const totals = analysisTotals(structuredClone(song));
  const scheme = Array.isArray(data.scheme) ? data.scheme : document.lines.map(() => '?');
  const pairs = Array.isArray(data.pairs) ? data.pairs : [];
  const filteredPairs = pairs.filter((pair) => (
    relationMode === 'all'
      || (relationMode === 'primary' && pair.primary === true)
      || (relationMode === 'soft' && pair.primary !== true)
  ));
  const chain = rhymeChainGroups(scheme, document);
  const timingSong = asEditorSong(structuredClone(song));
  ensurePerformanceSong(timingSong);
  const totalSeconds = performanceBarDurationMs(timingSong) * totals.bars / 1000;

  const chooseAnchor = (value: string) => {
    const anchor = String(value || '').trim();
    if (!anchor) return;
    editor.setFollowSelection(false);
    patch({ anchor, selectedResultId: '' });
  };

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div><p>{language === 'de' ? 'KANONISCHES REIMSCHEMA' : 'CANONICAL RHYME SCHEME'}</p><h2>{scheme.join(' ') || '—'}</h2></div>
          <button type="button" onClick={() => setChainVisible((value) => !value)} aria-pressed={chainVisible}>Rhyme Chain</button>
        </div>
        <div className={styles.scheme}>
          {document.indexes.map((lineIndex, analysisIndex) => (
            <button
              type="button"
              key={song.barIds?.[lineIndex] ?? String(lineIndex)}
              style={rhymeGroupStyle(scheme[analysisIndex])}
              onClick={() => {
                editor.jumpToBar(song.barIds?.[lineIndex] ?? '');
                onOpenEditor();
              }}
            >
              <span>{String(analysisIndex + 1).padStart(2, '0')}</span>
              <strong>{scheme[analysisIndex] || '—'}</strong>
              <b>{document.endWords[analysisIndex] || '—'}<small>{stress(data.wordDetails?.[analysisIndex])}</small></b>
              <em>{analysisIndex === 0 ? 'Start' : relationText(data.lineRelations?.[analysisIndex] as Record<string, unknown> | undefined)}</em>
            </button>
          ))}
        </div>
        {chainVisible ? (
          <div className={styles.chain}>
            {chain.map((group) => (
              <div key={group.label} style={rhymeGroupStyle(group.label)}>
                <strong>{group.label}</strong>
                <span>{group.items.map((item) => (
                  <button type="button" key={item.analysisIndex} onClick={() => chooseAnchor(item.word)}>
                    {String(item.barNumber).padStart(2, '0')} · {item.word}
                  </button>
                ))}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><div><p>VERSE TOTALS</p><h2>{totals.bars} Bars</h2></div><span className={styles.approx}>LOCAL ≈</span></div>
        <div className={styles.metrics}>
          <Metric label={language === 'de' ? 'WÖRTER' : 'WORDS'} value={totals.words} />
          <Metric label={language === 'de' ? 'SILBEN ≈' : 'SYLLABLES ≈'} value={totals.syllables} />
          <Metric label={language === 'de' ? 'ZEICHEN' : 'CHARACTERS'} value={totals.characters} />
          <Metric label={language === 'de' ? 'DAUER ≈' : 'DURATION ≈'} value={totalSeconds.toFixed(1) + ' s'} />
        </div>
        <div className={styles.density}>
          {document.lines.map((line, index) => {
            const count = estimateSyllables(line);
            return (
              <div key={song.barIds?.[document.indexes[index] ?? 0] ?? String(index)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <i><b style={{ width: String(Math.min(100, Math.max(2, count * 4))) + '%' }} /></i>
                <strong>{count}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div><p>RELATIONS INSIDE VERSE</p><h2>{pairs.length}</h2></div>
          <div className={styles.segmented}>
            {(['all', 'primary', 'soft'] as RelationMode[]).map((value) => (
              <button type="button" key={value} data-active={relationMode === value} onClick={() => setRelationMode(value)}>
                {value === 'all' ? (language === 'de' ? 'Alle' : 'All') : value === 'primary' ? (language === 'de' ? 'Primär' : 'Primary') : 'Soft'}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.pairs}>
          {filteredPairs.map((pair: StudioRhymePair, index) => (
            <button type="button" key={pair.left + pair.right + String(index)} data-rhyme-type={pair.type} onClick={() => chooseAnchor(pair.left)}>
              <span><b>{pair.left}</b><i>↔</i><b>{pair.right}</b></span>
              <em>{pair.label || pair.type}</em><strong>{percentage(pair.score)}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><div><p>WORD LABORATORY</p><h2>IPA / Stress</h2></div><span className={styles.canonical}>CANONICAL</span></div>
        <div className={styles.fingerprint}>
          {(data.wordDetails ?? []).map((detail, index) => (
            <button type="button" key={String(index)} onClick={() => chooseAnchor(document.endWords[index] || '')}>
              <small>{String(index + 1).padStart(2, '0')}</small><b>{stress(detail)}</b>
            </button>
          ))}
        </div>
        <div className={styles.wordGrid}>
          {(data.uniqueWordDetails ?? []).map((detail, index) => (
            <article key={String(detail.normalized || detail.surface || index)} data-unresolved={detail.unresolved ? 'true' : 'false'}>
              <header><button type="button" onClick={() => chooseAnchor(String(detail.surface || detail.normalized || ''))}>{String(detail.surface || detail.normalized || '—')}</button><span>{String(detail.language || '').toUpperCase()}</span></header>
              <code>{detail.ipa ? '/' + detail.ipa + '/' : 'IPA —'}</code>
              <div><span><small>{language === 'de' ? 'SILBEN' : 'SYLLABLES'}</small><b>{detail.syllableCount ?? '—'}</b></span><span><small>STRESS</small><b>{stress(detail)}</b></span></div>
            </article>
          ))}
        </div>
      </section>

      <BarInspector data={data} />
    </div>
  );
}

function AllAnalysis({ data, onOpenEditor }: { data: CanonicalAnalysisPayload; onOpenEditor: () => void }) {
  const language = useUiStore((state) => state.uiLanguage);
  const editor = useEditorSession();
  const { patch } = useSharedSearchState();
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);
  const [relationFocus, setRelationFocus] = useState<'all' | 'primary'>('all');
  const song = editor.activeSong;
  if (!song) return null;

  const document = trackedAnalysisDocument(structuredClone(song));
  const rows = allRhymeBars(document, data);
  const relations = Array.isArray(data.occurrenceRelations) ? data.occurrenceRelations : [];
  const occurrences = Array.isArray(data.occurrences) ? data.occurrences : [];
  const sections = analysisSections(structuredClone(song));
  const counts = relationCounts(relations);
  const primary = relations.filter((relation) => relation.primary).length;
  const topology = rhymeTopologyGroups(occurrences, relations);
  const activeGroup = hoveredGroup ?? selectedGroup;
  const rhymingBars = new Set<number>();
  relations.forEach((relation) => {
    if (relation.left?.lineIndex != null) rhymingBars.add(relation.left.lineIndex);
    if (relation.right?.lineIndex != null) rhymingBars.add(relation.right.lineIndex);
  });

  const chooseAnchor = (value: string) => {
    const anchor = value.trim();
    if (!anchor) return;
    editor.setFollowSelection(false);
    patch({ anchor, selectedResultId: '' });
  };

  const barBlocks = Array.from(
    { length: Math.ceil(rows.length / 4) },
    (_, blockIndex) => rows.slice(blockIndex * 4, blockIndex * 4 + 4),
  );

  return (
    <div className={styles.all}>
      <section className={styles.overview}>
        <Metric label={language === 'de' ? 'GESAMTER TEXT' : 'WHOLE TEXT'} value={relations.length} />
        <Metric label={language === 'de' ? 'PRIMÄR' : 'PRIMARY'} value={primary} />
        <Metric label="SOFT" value={relations.length - primary} />
        <Metric
          label={language === 'de' ? 'REIMKETTEN' : 'RHYME CHAINS'}
          value={topology.groups.length}
          copy={String(rhymingBars.size) + '/' + String(document.indexes.length) + ' Bars'}
        />
      </section>

      <section className={styles.rhymeMapCard}>
        <div className={styles.rhymeMapHeader}>
          <div>
            <p>{language === 'de' ? 'RHYME TOPOLOGY' : 'RHYME TOPOLOGY'}</p>
            <h2>{language === 'de' ? 'Der Text bleibt Text.' : 'Keep the lyrics readable.'}</h2>
            <span>
              {language === 'de'
                ? 'Gruppenfarbe = zusammenhängende Reimkette · Unterkante = stärkster Reimtyp · Hover verbindet alle Treffer.'
                : 'Group color = connected rhyme chain · underline = strongest rhyme type · hover links every occurrence.'}
            </span>
          </div>
          <div className={styles.segmented}>
            <button
              type="button"
              data-active={relationFocus === 'all'}
              onClick={() => setRelationFocus('all')}
            >
              {language === 'de' ? 'Alle Beziehungen' : 'All relations'}
            </button>
            <button
              type="button"
              data-active={relationFocus === 'primary'}
              onClick={() => setRelationFocus('primary')}
            >
              {language === 'de' ? 'Primär fokussieren' : 'Primary focus'}
            </button>
          </div>
        </div>

        <div className={styles.rhymeMap}>
          {barBlocks.map((block, blockIndex) => {
            const blockGroups = [...new Set(
              block.flatMap((row) => row.occurrences
                .map((entry) => topology.occurrenceGroup.get(entry.index))
                .filter((value): value is number => value != null)),
            )];
            return (
              <section className={styles.rhymeBlock} key={String(blockIndex)}>
                <header>
                  <span>
                    BARS {String(block[0]?.barNumber ?? 0).padStart(2, '0')}–{String(block.at(-1)?.barNumber ?? 0).padStart(2, '0')}
                  </span>
                  <div>
                    {blockGroups.map((groupIndex) => {
                      const group = topology.groups[groupIndex];
                      return group ? (
                        <button
                          type="button"
                          key={group.id}
                          style={topologyGroupStyle(groupIndex)}
                          data-active={activeGroup === groupIndex ? 'true' : 'false'}
                          onPointerEnter={() => setHoveredGroup(groupIndex)}
                          onPointerLeave={() => setHoveredGroup(null)}
                          onClick={() => setSelectedGroup((current) => current === groupIndex ? null : groupIndex)}
                          title={group.words.join(' · ')}
                        >
                          {group.id}
                        </button>
                      ) : null;
                    })}
                  </div>
                </header>

                <div className={styles.lyricBlock}>
                  {block.map((row) => {
                    const occurrenceByWord = new Map(row.occurrences.map((entry) => [entry.wordIndex, entry]));
                    const groupIds = [...new Set(
                      row.occurrences
                        .map((entry) => topology.occurrenceGroup.get(entry.index))
                        .filter((value): value is number => value != null),
                    )];
                    return (
                      <article className={styles.lyricBar} key={song.barIds?.[row.documentLineIndex] ?? String(row.documentLineIndex)}>
                        <button
                          type="button"
                          className={styles.lyricBarNumber}
                          onClick={() => {
                            editor.jumpToBar(song.barIds?.[row.documentLineIndex] ?? '');
                            onOpenEditor();
                          }}
                        >
                          {String(row.barNumber).padStart(2, '0')}
                        </button>

                        <p>
                          {analysisLineTokens(row.text).map((token, tokenIndex) => {
                            if (token.wordIndex == null) {
                              return <span key={'gap-' + String(tokenIndex)}>{token.text}</span>;
                            }
                            const occurrence = occurrenceByWord.get(token.wordIndex);
                            if (!occurrence) {
                              return <span key={'word-' + String(tokenIndex)}>{token.text}</span>;
                            }

                            const occurrenceRelations = row.relations.filter(
                              (relation: StudioOccurrenceRelation) => (
                                relation.left.index === occurrence.index
                                || relation.right.index === occurrence.index
                              ),
                            );
                            const primaryOccurrence = occurrenceRelations.some((relation) => relation.primary);
                            if (relationFocus === 'primary' && !primaryOccurrence) {
                              return <span key={'soft-' + String(tokenIndex)}>{token.text}</span>;
                            }

                            const types = new Set(occurrenceRelations.map((relation) => relation.type));
                            const strongest = strongestRhymeType(types);
                            const groupIndex = topology.occurrenceGroup.get(occurrence.index);
                            const group = groupIndex == null ? null : topology.groups[groupIndex];
                            const dimmed = activeGroup != null && groupIndex !== activeGroup;
                            return (
                              <button
                                type="button"
                                key={'rhyme-' + String(occurrence.index)}
                                className={styles.rhymeWord}
                                data-rhyme-type={strongest || undefined}
                                data-grouped={group ? 'true' : 'false'}
                                data-dimmed={dimmed ? 'true' : 'false'}
                                style={topologyGroupStyle(groupIndex)}
                                title={[
                                  group ? 'Chain ' + group.id : '',
                                  strongest ? analysisRhymeTypeLabel(strongest, language) : '',
                                  occurrenceRelations.length + ' relations',
                                ].filter(Boolean).join(' · ')}
                                onPointerEnter={() => {
                                  if (groupIndex != null) setHoveredGroup(groupIndex);
                                }}
                                onPointerLeave={() => setHoveredGroup(null)}
                                onClick={() => {
                                  chooseAnchor(occurrence.surface);
                                  if (groupIndex != null) setSelectedGroup(groupIndex);
                                }}
                              >
                                {token.text}
                                {group ? <sup>{group.id}</sup> : null}
                              </button>
                            );
                          })}
                        </p>

                        <div className={styles.lyricBarChains}>
                          {groupIds.map((groupIndex) => {
                            const group = topology.groups[groupIndex];
                            return group ? (
                              <button
                                type="button"
                                key={group.id}
                                style={topologyGroupStyle(groupIndex)}
                                onPointerEnter={() => setHoveredGroup(groupIndex)}
                                onPointerLeave={() => setHoveredGroup(null)}
                                onClick={() => setSelectedGroup((current) => current === groupIndex ? null : groupIndex)}
                              >
                                {group.id}
                              </button>
                            ) : null;
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className={styles.chainIndex}>
          <div className={styles.chainIndexHead}>
            <span>{language === 'de' ? 'REIMKETTEN' : 'RHYME CHAINS'}</span>
            <small>
              {language === 'de'
                ? 'Kette anklicken = im gesamten Text isolieren'
                : 'Click a chain to isolate it across the lyric'}
            </small>
          </div>
          <div className={styles.chainIndexGrid}>
            {topology.groups.length ? topology.groups.map((group) => (
              <button
                type="button"
                key={group.id}
                className={styles.chainIndexItem}
                style={topologyGroupStyle(group.index)}
                data-active={activeGroup === group.index ? 'true' : 'false'}
                data-dimmed={activeGroup != null && activeGroup !== group.index ? 'true' : 'false'}
                onPointerEnter={() => setHoveredGroup(group.index)}
                onPointerLeave={() => setHoveredGroup(null)}
                onClick={() => setSelectedGroup((current) => current === group.index ? null : group.index)}
              >
                <strong>{group.id}</strong>
                <span>
                  <b>{group.words.slice(0, 4).join(' · ')}</b>
                  <small>Bars {group.barNumbers.join(', ')} · {group.relationCount} relations</small>
                </span>
              </button>
            )) : (
              <p className={styles.noChains}>
                {language === 'de'
                  ? 'Keine zusammenhängende primäre Reimkette erkannt. Soft-Beziehungen bleiben direkt im Text markiert.'
                  : 'No connected primary rhyme chain detected. Soft relations remain marked directly in the lyric.'}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div><p>{language === 'de' ? 'NACH REIMTYP' : 'BY RHYME TYPE'}</p><h2>{relations.length}</h2></div>
          <span className={styles.canonical}>CANONICAL</span>
        </div>
        <div className={styles.types}>
          {ANALYSIS_RHYME_TYPE_ORDER.filter((type) => counts[type]).map((type) => (
            <article key={type} data-rhyme-type={type}>
              <small>{analysisRhymeTypeLabel(type, language)}</small>
              <b>{counts[type]}</b>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div><p>VERSE / SECTION</p><h2>{sections.length}</h2></div>
        </div>
        <div className={styles.sections}>
          {sections.map((section) => {
            const internal = sectionRelations(section, relations);
            const sectionCounts = relationCounts(internal);
            return (
              <article key={section.id}>
                <header>
                  <b>{section.label}</b>
                  <span>{section.barNumbers.length ? 'Bars ' + String(section.barNumbers[0]) + '–' + String(section.barNumbers.at(-1)) : ''}</span>
                </header>
                <strong>{internal.length} relations</strong>
                <div>
                  {ANALYSIS_RHYME_TYPE_ORDER.filter((type) => sectionCounts[type]).map((type) => (
                    <span key={type}>{sectionCounts[type]} {analysisRhymeTypeLabel(type, language)}</span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function AnalysisWorkspace({ onOpenEditor }: { onOpenEditor: () => void }) {
  const language = useUiStore((state) => state.uiLanguage);
  const editor = useEditorSession();
  const { state, patch } = useSharedSearchState();
  const runtime = useRuntimeEnvironment();
  const [scope, setScope] = useState<Scope>('end');
  const query = useCanonicalAnalysis(editor.activeSong, state, runtime.capabilities, runtime.runtimeDb, scope);
  const hasBars = Boolean(query.document?.lines.length);

  return (
    <section className={styles.workspace} data-r6-analysis="true">
      <header className={styles.header}>
        <div><p>R6 · CANONICAL SONG ANALYSIS</p><h1>{language === 'de' ? 'Klang, Struktur, Spannung.' : 'Sound, structure, tension.'}</h1><span>{language === 'de' ? 'Writer-kanonische Phonetik und lokale Flow-Metriken bleiben sauber getrennt.' : 'Writer-canonical phonetics and local flow metrics stay explicitly separated.'}</span></div>
        <div className={styles.headerControls}>
          <div className={styles.segmented}><button type="button" data-active={scope === 'end'} onClick={() => setScope('end')}>{language === 'de' ? 'Endreime' : 'End rhymes'}</button><button type="button" data-active={scope === 'all'} onClick={() => setScope('all')}>{language === 'de' ? 'Alle Reime' : 'All rhymes'}</button></div>
          <div className={styles.segmented}>{(['de', 'en', 'both'] as const).map((value) => <button type="button" key={value} data-active={state.queryBasis === value} onClick={() => patch({ queryBasis: value, selectedResultId: '' })}>{value === 'both' ? 'DE+EN' : value.toUpperCase()}</button>)}</div>
          <span className={styles.runtime}>DB {String(runtime.activeEdition ?? 'default').toUpperCase()}</span>
          <button type="button" onClick={() => void query.refetch()}>{language === 'de' ? 'Neu analysieren' : 'Refresh'}</button>
        </div>
      </header>

      <RhymeLegend />

      {!hasBars ? <div className={styles.state}>{language === 'de' ? 'Noch keine getrackten Bars.' : 'No tracked bars yet.'}</div> : null}
      {hasBars && (query.isPending || query.isFetching) ? <div className={styles.state}>{language === 'de' ? 'Writer analysiert …' : 'Writer is analyzing …'}</div> : null}
      {query.isError ? <div className={styles.state} data-error="true">{query.error instanceof Error ? query.error.message : String(query.error)}</div> : null}
      {query.data && scope === 'end' ? <EndAnalysis data={query.data} onOpenEditor={onOpenEditor} /> : null}
      {query.data && scope === 'all' ? <AllAnalysis data={query.data} onOpenEditor={onOpenEditor} /> : null}
    </section>
  );
}
