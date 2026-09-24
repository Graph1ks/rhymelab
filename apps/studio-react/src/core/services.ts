import * as sharedAnalysis from '../../../../packages/shared-core/src/services/analysis-adapter.mjs';
import * as sharedDetail from '../../../../packages/shared-core/src/services/detail-adapter.mjs';

import type {
  StudioAnalysisClient,
  StudioAnalysisOccurrence,
  StudioAnalysisPayload,
  StudioDetailClient,
  StudioDetailModel,
  StudioDetailPayload,
  StudioOccurrenceRelation,
  WriterResultRow,
} from './contracts';

type AnalysisApi = {
  studioAnalysisOccurrences(lines: string[], options?: { limit?: number }): StudioAnalysisOccurrence[];
  expandStudioRhymeRelations(
    payload: StudioAnalysisPayload,
    occurrences: StudioAnalysisOccurrence[],
  ): StudioOccurrenceRelation[];
  studioRhymeTypeCounts(relations: StudioOccurrenceRelation[]): Record<string, number>;
  extractStudioEndWord(line: unknown): string;
  studioAnalysisWords(lines: string[]): string[];
  createStudioAnalysisClient(options?: { fetchImpl?: typeof fetch }): StudioAnalysisClient;
};

type DetailApi = {
  studioDetailKey(row: WriterResultRow): string;
  createStudioDetailClient(options?: { fetchImpl?: typeof fetch }): StudioDetailClient;
  buildStudioDetailModel(
    row: WriterResultRow,
    payload?: StudioDetailPayload | null,
  ): StudioDetailModel;
};

const analysisApi = sharedAnalysis as unknown as AnalysisApi;
const detailApi = sharedDetail as unknown as DetailApi;

export const studioAnalysisOccurrences = analysisApi.studioAnalysisOccurrences;
export const expandStudioRhymeRelations = analysisApi.expandStudioRhymeRelations;
export const studioRhymeTypeCounts = analysisApi.studioRhymeTypeCounts;
export const extractStudioEndWord = analysisApi.extractStudioEndWord;
export const studioAnalysisWords = analysisApi.studioAnalysisWords;
export const createStudioAnalysisClient = analysisApi.createStudioAnalysisClient;

export const studioDetailKey = detailApi.studioDetailKey;
export const createStudioDetailClient = detailApi.createStudioDetailClient;
export const buildStudioDetailModel = detailApi.buildStudioDetailModel;
