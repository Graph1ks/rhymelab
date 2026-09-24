import type {
  EditorSong,
  LegacyStudioSong,
  StudioAnalysisOccurrence,
  StudioAnalysisPayload,
  StudioOccurrenceRelation,
} from '../../legacy/contracts';
import {
  editorBracketSegments,
  editorLineKind,
  editorTrackableText,
  trackedEditorBarNumber,
  trackedEditorLineIndexes,
} from '../../legacy/editor';
import {
  extractStudioEndWord,
  studioRhymeTypeCounts,
} from '../../legacy/services';
import { estimateSyllables } from '../../legacy/search';
import { asEditorSong, ensureLegacyEditorSong } from '../editor/model';

export const ANALYSIS_RHYME_TYPE_ORDER = [
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
  'assonance',
  'consonance',
  'identity',
] as const;

export const ANALYSIS_RHYME_TYPE_LABELS: Record<string, { de: string; en: string }> = {
  identity: { de: 'Identisch', en: 'Identity' },
  multisyllabic_perfect: { de: 'Mehrsilbiger Vollreim', en: 'Multisyllabic perfect' },
  perfect: { de: 'Vollreim', en: 'Perfect rhyme' },
  multisyllabic_slant: { de: 'Mehrsilbiger Slant-Reim', en: 'Multisyllabic slant' },
  family: { de: 'Reimfamilie', en: 'Rhyme family' },
  slant: { de: 'Slant-Reim', en: 'Slant rhyme' },
  assonance: { de: 'Assonanz', en: 'Assonance' },
  consonance: { de: 'Konsonanz', en: 'Consonance' },
};

export interface CanonicalCoverage {
  resolved?: number;
  unique?: number;
  truncated?: boolean;
  unresolved?: string[];
}

export interface CanonicalWordDetail {
  surface?: string;
  normalized?: string;
  language?: string;
  ipa?: string;
  syllableCount?: number;
  stressPattern?: string;
  primaryStressSyllable?: number;
  primaryStressSyllables?: number[];
  generatedPronunciation?: boolean;
  unresolved?: boolean;
}

export interface CanonicalLineRelation {
  relation?: {
    type?: string;
    label?: string;
    score?: number;
    primary?: boolean;
    language?: string;
  } | null;
  prior?: number | null;
}

export interface CanonicalAnalysisPayload extends StudioAnalysisPayload {
  scheme?: string[];
  lineRelations?: CanonicalLineRelation[];
  wordDetails?: CanonicalWordDetail[];
  uniqueWordDetails?: CanonicalWordDetail[];
  coverage?: CanonicalCoverage;
  occurrences?: StudioAnalysisOccurrence[];
  occurrenceRelations?: StudioOccurrenceRelation[];
  runtimeTiming?: { currentMs?: number; [key: string]: unknown };
  clientCacheHit?: boolean;
}

export interface TrackedAnalysisDocument {
  songId: string;
  indexes: number[];
  lines: string[];
  barIds: string[];
  barRevisions: number[];
  endWords: string[];
}

export interface AnalysisSection {
  id: string;
  label: string;
  explicit: boolean;
  documentLineIndexes: number[];
  analysisLineIndexes: number[];
  barNumbers: number[];
}

export interface RhymeChainGroup {
  label: string;
  items: Array<{
    analysisIndex: number;
    documentLineIndex: number;
    barNumber: number;
    word: string;
  }>;
}

export interface AllRhymeBarModel {
  documentLineIndex: number;
  analysisLineIndex: number;
  barNumber: number;
  text: string;
  occurrences: StudioAnalysisOccurrence[];
  relations: StudioOccurrenceRelation[];
  counts: Record<string, number>;
}

export interface AnalysisTotals {
  bars: number;
  words: number;
  syllables: number;
  characters: number;
}

export interface AnalysisTextToken {
  text: string;
  wordIndex: number | null;
  normalized: string;
}

export interface RhymeTopologyGroup {
  id: string;
  index: number;
  occurrenceIndexes: number[];
  words: string[];
  barNumbers: number[];
  relationTypes: string[];
  relationCount: number;
  primaryRelationCount: number;
}


export function trackedAnalysisDocument(song: LegacyStudioSong): TrackedAnalysisDocument {
  ensureLegacyEditorSong(song);
  const editorSong = asEditorSong(song);
  const indexes = trackedEditorLineIndexes(editorSong);
  const lines = indexes.map((index) => editorTrackableText(editorSong.lines[index] ?? ''));
  return {
    songId: song.id,
    indexes,
    lines,
    barIds: indexes.map((index) => editorSong.barIds[index] ?? ''),
    barRevisions: indexes.map((index) => editorSong.barRevisions[index] ?? 0),
    endWords: lines.map(extractStudioEndWord),
  };
}

export function analysisDocumentSignature(song: LegacyStudioSong): string {
  const doc = trackedAnalysisDocument(song);
  return [
    doc.songId,
    ...doc.barIds.map((id, index) => `${id}:${doc.barRevisions[index] ?? 0}`),
  ].join('|');
}

export function analysisSections(song: LegacyStudioSong): AnalysisSection[] {
  ensureLegacyEditorSong(song);
  const editorSong = asEditorSong(song);
  const trackedIndexes = trackedEditorLineIndexes(editorSong);
  const trackedSet = new Set(trackedIndexes);
  const sections: AnalysisSection[] = [];
  let current: AnalysisSection | null = null;
  let pendingLabel = '';
  let automatic = 1;

  const close = () => {
    if (current?.documentLineIndexes.length) sections.push(current);
    current = null;
  };

  for (let lineIndex = 0; lineIndex < editorSong.lines.length; lineIndex += 1) {
    const raw = editorSong.lines[lineIndex] ?? '';
    const kind = editorLineKind(raw);
    if (kind === 'bracket') {
      close();
      pendingLabel = editorBracketSegments(raw)
        .map((entry) => String(entry.content || '').trim())
        .filter(Boolean)
        .join(' · ');
      continue;
    }
    if (kind === 'blank') {
      if (current?.documentLineIndexes.length) close();
      continue;
    }
    if (!trackedSet.has(lineIndex)) continue;
    if (!current) {
      current = {
        id: `section-${sections.length}-${lineIndex}`,
        label: pendingLabel || `Section ${automatic++}`,
        explicit: Boolean(pendingLabel),
        documentLineIndexes: [],
        analysisLineIndexes: [],
        barNumbers: [],
      };
      pendingLabel = '';
    }
    current.documentLineIndexes.push(lineIndex);
    current.analysisLineIndexes.push(trackedIndexes.indexOf(lineIndex));
    const number = trackedEditorBarNumber(editorSong, lineIndex);
    if (number != null) current.barNumbers.push(number);
  }
  close();
  return sections;
}

export function relationCounts(relations: StudioOccurrenceRelation[]): Record<string, number> {
  return studioRhymeTypeCounts(relations);
}

export function analysisRhymeTypeLabel(type: string, language: 'de' | 'en'): string {
  return ANALYSIS_RHYME_TYPE_LABELS[type]?.[language] ?? type.replace(/_/g, ' ');
}

export function strongestRhymeType(types: Iterable<string>): string {
  const rank = new Map(ANALYSIS_RHYME_TYPE_ORDER.map((type, index) => [type, index]));
  return [...types].sort(
    (left, right) => (rank.get(left as typeof ANALYSIS_RHYME_TYPE_ORDER[number]) ?? 99)
      - (rank.get(right as typeof ANALYSIS_RHYME_TYPE_ORDER[number]) ?? 99),
  )[0] ?? '';
}

export function rhymeChainGroups(
  scheme: string[],
  document: TrackedAnalysisDocument,
): RhymeChainGroup[] {
  const groups = new Map<string, RhymeChainGroup['items']>();
  scheme.forEach((label, analysisIndex) => {
    if (!label || label === '—' || label === '?') return;
    const items = groups.get(label) ?? [];
    items.push({
      analysisIndex,
      documentLineIndex: document.indexes[analysisIndex] ?? 0,
      barNumber: analysisIndex + 1,
      word: document.endWords[analysisIndex] || '—',
    });
    groups.set(label, items);
  });
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

export function allRhymeBars(
  document: TrackedAnalysisDocument,
  data: CanonicalAnalysisPayload | null | undefined,
): AllRhymeBarModel[] {
  const occurrences = Array.isArray(data?.occurrences) ? data.occurrences : [];
  const relations = Array.isArray(data?.occurrenceRelations) ? data.occurrenceRelations : [];
  return document.indexes.map((documentLineIndex, analysisLineIndex) => {
    const barRelations = relations.filter(
      (relation) => relation.left?.lineIndex === analysisLineIndex
        || relation.right?.lineIndex === analysisLineIndex,
    );
    return {
      documentLineIndex,
      analysisLineIndex,
      barNumber: analysisLineIndex + 1,
      text: document.lines[analysisLineIndex] ?? '',
      occurrences: occurrences.filter((entry) => entry.lineIndex === analysisLineIndex),
      relations: barRelations,
      counts: relationCounts(barRelations),
    };
  });
}

export function sectionRelations(
  section: AnalysisSection,
  relations: StudioOccurrenceRelation[],
): StudioOccurrenceRelation[] {
  const indexes = new Set(section.analysisLineIndexes);
  return relations.filter(
    (relation) => indexes.has(relation.left?.lineIndex)
      && indexes.has(relation.right?.lineIndex),
  );
}

export function analysisLineTokens(line: string): AnalysisTextToken[] {
  const source = String(line ?? '');
  const tokens: AnalysisTextToken[] = [];
  const pattern = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
  let cursor = 0;
  let wordIndex = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({
        text: source.slice(cursor, start),
        wordIndex: null,
        normalized: '',
      });
    }
    const text = match[0] ?? '';
    tokens.push({
      text,
      wordIndex,
      normalized: text.normalize('NFKC').toLocaleLowerCase().trim(),
    });
    wordIndex += 1;
    cursor = start + text.length;
  }
  if (cursor < source.length) {
    tokens.push({
      text: source.slice(cursor),
      wordIndex: null,
      normalized: '',
    });
  }
  return tokens.length ? tokens : [{ text: source, wordIndex: null, normalized: '' }];
}

function topologyGroupLabel(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  const cycle = Math.floor(index / 26);
  return cycle ? letter + String(cycle + 1) : letter;
}

export function rhymeTopologyGroups(
  occurrences: StudioAnalysisOccurrence[],
  relations: StudioOccurrenceRelation[],
): {
  groups: RhymeTopologyGroup[];
  occurrenceGroup: Map<number, number>;
} {
  if (!occurrences.length || !relations.length) {
    return { groups: [], occurrenceGroup: new Map<number, number>() };
  }

  const parent = new Map<number, number>();
  const rank = new Map<number, number>();
  const occurrenceByIndex = new Map(occurrences.map((entry) => [entry.index, entry]));

  const ensure = (value: number) => {
    if (!parent.has(value)) {
      parent.set(value, value);
      rank.set(value, 0);
    }
  };
  const find = (value: number): number => {
    ensure(value);
    const current = parent.get(value) ?? value;
    if (current === value) return value;
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const union = (left: number, right: number) => {
    let rootLeft = find(left);
    let rootRight = find(right);
    if (rootLeft === rootRight) return;
    const leftRank = rank.get(rootLeft) ?? 0;
    const rightRank = rank.get(rootRight) ?? 0;
    if (leftRank < rightRank) [rootLeft, rootRight] = [rootRight, rootLeft];
    parent.set(rootRight, rootLeft);
    if (leftRank === rightRank) rank.set(rootLeft, leftRank + 1);
  };

  const primaryRelations = relations.filter((relation) => relation.primary === true);
  const strongRelations = primaryRelations.length
    ? primaryRelations
    : relations.filter((relation) => Number(relation.score) >= 0.82);
  strongRelations.forEach((relation) => {
    ensure(relation.left.index);
    ensure(relation.right.index);
    union(relation.left.index, relation.right.index);
  });

  const members = new Map<number, Set<number>>();
  parent.forEach((_value, occurrenceIndex) => {
    const root = find(occurrenceIndex);
    const bucket = members.get(root) ?? new Set<number>();
    bucket.add(occurrenceIndex);
    members.set(root, bucket);
  });

  const sortedRoots = [...members.entries()]
    .filter(([, values]) => values.size >= 2)
    .sort((left, right) => Math.min(...left[1]) - Math.min(...right[1]));

  const occurrenceGroup = new Map<number, number>();
  const groups = sortedRoots.map(([, values], groupIndex) => {
    const occurrenceIndexes = [...values].sort((a, b) => a - b);
    occurrenceIndexes.forEach((value) => occurrenceGroup.set(value, groupIndex));
    const groupRelations = relations.filter(
      (relation) => values.has(relation.left.index) && values.has(relation.right.index),
    );
    const words = [...new Set(
      occurrenceIndexes
        .map((index) => occurrenceByIndex.get(index)?.surface ?? '')
        .filter(Boolean),
    )];
    const barNumbers = [...new Set(
      occurrenceIndexes
        .map((index) => occurrenceByIndex.get(index)?.lineIndex)
        .filter((index): index is number => Number.isInteger(index))
        .map((index) => index + 1),
    )].sort((a, b) => a - b);
    return {
      id: topologyGroupLabel(groupIndex),
      index: groupIndex,
      occurrenceIndexes,
      words,
      barNumbers,
      relationTypes: [...new Set(groupRelations.map((relation) => relation.type))],
      relationCount: groupRelations.length,
      primaryRelationCount: groupRelations.filter((relation) => relation.primary).length,
    };
  });

  return { groups, occurrenceGroup };
}

export function analysisTotals(song: LegacyStudioSong): AnalysisTotals {
  const document = trackedAnalysisDocument(song);
  const text = document.lines.join(' ');
  const words = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? [];
  return {
    bars: document.lines.length,
    words: words.length,
    syllables: document.lines.reduce((sum, line) => sum + estimateSyllables(line), 0),
    characters: document.lines.reduce((sum, line) => sum + line.length, 0),
  };
}

export function trackedBarAt(
  song: LegacyStudioSong,
  barId: string | null | undefined,
): { index: number; barId: string; barNumber: number; text: string } | null {
  ensureLegacyEditorSong(song);
  const editorSong: EditorSong = asEditorSong(song);
  const tracked = trackedEditorLineIndexes(editorSong);
  if (!tracked.length) return null;
  let index = barId ? editorSong.barIds.indexOf(barId) : -1;
  if (!tracked.includes(index)) index = tracked[0] ?? -1;
  if (index < 0) return null;
  return {
    index,
    barId: editorSong.barIds[index] ?? '',
    barNumber: tracked.indexOf(index) + 1,
    text: editorTrackableText(editorSong.lines[index] ?? ''),
  };
}
