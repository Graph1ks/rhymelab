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
