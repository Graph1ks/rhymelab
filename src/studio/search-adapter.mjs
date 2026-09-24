import {
  readGeneratedPronunciationCache,
  writeGeneratedPronunciationCache,
} from '../../packages/platform-web/src/query-pronunciation-cache.mjs';
import {
  createWriterSearchClient as createSharedWriterSearchClient,
} from '../../packages/shared-core/src/search/search-adapter.mjs';

export {
  estimateSyllables,
  writerScope,
  writerRelationType,
  writerRelationGroup,
  writerRelationLabel,
  mapWriterResult,
  buildWriterParams,
  resolvedRightEdgeComponent,
} from '../../packages/shared-core/src/search/search-adapter.mjs';

export function createWriterSearchClient(options={}){
  return createSharedWriterSearchClient({
    ...options,
    readPronunciationCache:readGeneratedPronunciationCache,
    writePronunciationCache:writeGeneratedPronunciationCache,
  });
}
