import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type {
  LegacyStudioSong,
  SearchState,
  StudioCapabilities,
} from '../../legacy/contracts';
import { createStudioAnalysisClient } from '../../legacy/services';
import {
  analysisDocumentSignature,
  trackedAnalysisDocument,
  type CanonicalAnalysisPayload,
} from './model';

const analysisClient = createStudioAnalysisClient();

export function analysisQueryIdentity(
  song: LegacyStudioSong | null,
  state: SearchState,
  capabilities: StudioCapabilities | null,
  runtimeDb: string,
  scope: 'end' | 'all',
): string[] {
  return [
    'studio-analysis',
    scope,
    song ? analysisDocumentSignature(song) : 'no-song',
    state.queryBasis,
    state.generated ? 'generated' : 'canonical-only',
    state.generatedOnly ? 'generated-only' : 'mixed',
    capabilities?.queryPronunciationRevision || 'no-revision',
    runtimeDb || 'default',
  ];
}

export function useCanonicalAnalysis(
  song: LegacyStudioSong | null,
  state: SearchState,
  capabilities: StudioCapabilities | null,
  runtimeDb: string,
  scope: 'end' | 'all',
) {
  const document = useMemo(
    () => song ? trackedAnalysisDocument(song) : null,
    [song],
  );

  const query = useQuery<CanonicalAnalysisPayload>({
    queryKey: analysisQueryIdentity(song, state, capabilities, runtimeDb, scope),
    queryFn: async ({ signal }) => {
      if (!document?.lines.length) return {};
      const options = {
        language: state.queryBasis,
        generated: state.generated,
        generatedOnly: state.generatedOnly,
        runtimeDb,
        signal,
      };
      return scope === 'all'
        ? analysisClient.analyzeAll(document.lines, options) as Promise<CanonicalAnalysisPayload>
        : analysisClient.analyze(document.lines, options) as Promise<CanonicalAnalysisPayload>;
    },
    enabled: Boolean(song && document?.lines.length && capabilities?.status === 'ready'),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    document,
  };
}
