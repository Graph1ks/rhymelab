import {
  createSearchState,
  generateClientIpa,
  createWriterSearchClient,
  normalizeStudioCapabilities,
  chooseAvailableRuntimeEdition,
} from './search';
import {
  createStudioState,
  createStudioDocumentStore,
  createPortableStudioBackup,
} from './documents';
import {
  ensureEditorSong,
  createTypingUndoCoalescer,
  ensurePerformanceSong,
  compareEditorRevisions,
} from './editor';
import {
  createStudioAnalysisClient,
  createStudioDetailClient,
} from './services';
import {
  collectStudioEnvironmentDiagnostics,
  createStudioDeviceAcceptance,
} from './system';

export const R1_BRIDGE_RUNTIME_EXPORTS = Object.freeze([
  createSearchState,
  generateClientIpa,
  createWriterSearchClient,
  normalizeStudioCapabilities,
  chooseAvailableRuntimeEdition,
  createStudioState,
  createStudioDocumentStore,
  createPortableStudioBackup,
  ensureEditorSong,
  createTypingUndoCoalescer,
  ensurePerformanceSong,
  compareEditorRevisions,
  createStudioAnalysisClient,
  createStudioDetailClient,
  collectStudioEnvironmentDiagnostics,
  createStudioDeviceAcceptance,
]);

export const R1_BRIDGE_RUNTIME_EXPORT_COUNT = R1_BRIDGE_RUNTIME_EXPORTS.length;
