export type JsonRecord = Record<string, unknown>;

export interface StorageLike {
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
}

export type QueryBasis = 'de' | 'en' | 'both';
export type SearchScope = 'all' | 'words' | 'phrases' | 'entities';
export type RhymeType =
  | 'all'
  | 'multisyllabic_perfect'
  | 'perfect'
  | 'multisyllabic_slant'
  | 'family'
  | 'slant'
  | 'assonance'
  | 'consonance';
export type SyllableFilter = 'all' | 'same' | 'near' | 'near1' | 'near2' | 'near3' | '1' | '2' | '3';
export type SearchSort = 'recommended' | 'syllables' | 'common' | 'closest' | 'alpha';
export type VariantMode = 'preferred' | 'all';

export interface SearchState {
  schema: string;
  anchor: string;
  queryBasis: QueryBasis;
  resultLanguage: QueryBasis;
  scope: SearchScope;
  rhymeType: RhymeType;
  syllableFilter: SyllableFilter;
  sort: SearchSort;
  variantMode: VariantMode;
  historical: boolean;
  generated: boolean;
  generatedOnly: boolean;
  entityCategory: string;
  entityCategories: string[];
  selectedResultId: string;
}

export type SearchStateInput = Partial<SearchState> & {
  basis?: QueryBasis | string;
  query?: string;
  type?: RhymeType | string;
  variants?: VariantMode | string;
};

export interface WriterParamLimits {
  wordLimit?: number;
  wordPool?: number;
  phraseLimit?: number;
  phrasePool?: number;
  phrasePerChannel?: number;
  entityLimit?: number;
  entityPool?: number;
}

export type PronunciationLanguage = 'de' | 'en';

export interface PronunciationReference extends JsonRecord {
  surface?: string;
  preferredIpa?: string;
  ipa?: string;
  generatedPronunciation?: boolean;
}

export interface QueryPronunciationCacheMeta {
  persistent: true;
  schema: string;
  databaseRevision: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface QueryPronunciationDetail extends JsonRecord {
  language: PronunciationLanguage;
  surface: string;
  normalized: string;
  ipa: string;
  method: string;
  policy: string;
  sourceBacked: boolean;
  clientOnly: true;
  generatedReference?: boolean;
  components?: string[] | null;
  tokenCount?: number;
  generatedTokens?: string[];
  sourceBackedTokens?: string[];
  tokens?: QueryPronunciationDetail[];
  cacheHit?: boolean;
  cache?: QueryPronunciationCacheMeta;
}

export interface QueryPronunciationResolveOptions {
  lookupReference?: ((surface: string, language: PronunciationLanguage) =>
    PronunciationReference | null | Promise<PronunciationReference | null>) | null;
  lookupCachedPronunciation?: ((surface: string, language: PronunciationLanguage) =>
    QueryPronunciationDetail | null | Promise<QueryPronunciationDetail | null>) | null;
  storeCachedPronunciation?: ((detail: QueryPronunciationDetail) =>
    unknown | Promise<unknown>) | null;
  maxTokens?: number;
}

export interface QueryPronunciationCacheRecord extends JsonRecord {
  key: string;
  schema: string;
  language: PronunciationLanguage;
  normalized: string;
  surface: string;
  ipa: string;
  method: string;
  policy: string;
  sourceBacked: boolean;
  clientOnly: true;
  components: string[] | null;
  databaseRevision: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
}

export interface StudioFolderRow extends JsonRecord {
  id: string;
  name: string;
  orderKey: number;
  createdAt: number;
  updatedAt: number;
}

export interface StudioBarRow extends JsonRecord {
  id: string;
  songId: string;
  orderKey: number;
  text: string;
  revision?: number;
}

export interface PerformanceCue {
  type: 'hit' | 'accent' | 'pause' | 'breath' | 'hold';
  length: number;
}

export interface PerformanceConfig {
  bpm: number;
  grid: 8 | 16;
  feel: 'straight' | 'triplet';
  tempoScale: 0.5 | 1 | 2;
  pauseLength: number;
}

export interface StudioSongRow extends JsonRecord {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  editorNextBarId: number;
  steps: Record<string, unknown>;
  performance: Partial<PerformanceConfig> & JsonRecord;
  performanceCues: Record<string, PerformanceCue | string | unknown>;
  performanceAnchors: Record<string, number | unknown>;
  schemaVersion: number;
}

export interface StudioRevisionSnapshotBar extends JsonRecord {
  id: string;
  orderKey: number;
  text: string;
  revision?: number;
}

export interface StudioRevisionDocumentSnapshot extends JsonRecord {
  title: string;
  editorNextBarId: number;
  steps: Record<string, unknown>;
  performance: Partial<PerformanceConfig> & JsonRecord;
  performanceCues: Record<string, unknown>;
  performanceAnchors: Record<string, unknown>;
  bars: StudioRevisionSnapshotBar[];
}

export interface StudioRevisionRow extends JsonRecord {
  id: string;
  songId: string;
  createdAt: number;
  reason: string;
  documentSnapshot: StudioRevisionDocumentSnapshot;
}

export interface StudioDocumentSnapshot extends JsonRecord {
  schema: string;
  schemaVersion: number;
  activeSongId: string | null;
  meta: {
    nextSongId: number;
    nextBarId: number;
    nextRevisionId: number;
    [key: string]: unknown;
  };
  folders: StudioFolderRow[];
  songs: StudioSongRow[];
  bars: StudioBarRow[];
  revisions: StudioRevisionRow[];
}

export interface StudioDocumentValidation {
  valid: boolean;
  errors: string[];
}

export interface StudioMigrationReport extends JsonRecord {
  sourceSchema: string;
  targetSchema: string;
  valid: boolean;
  errors: string[];
  counts: {
    songs: number;
    bars: number;
    revisions: number;
    folders: number;
  };
  sourceSignature: string;
  targetSignature: string;
  backupSignature: string;
}

export interface StudioDocumentMigration {
  snapshot: StudioDocumentSnapshot;
  backup: string;
  report: StudioMigrationReport;
}

export interface LegacyStudioRevision extends JsonRecord {
  at?: number;
  reason?: string;
  text?: string;
  snapshot?: EditorSnapshot;
}

export interface LegacyStudioSong extends JsonRecord {
  id: string;
  title?: string;
  folder?: string;
  lines: string[];
  barIds?: string[];
  barRevisions?: number[];
  editorNextBarId?: number;
  revisions?: LegacyStudioRevision[];
  steps?: Record<string, unknown>;
  performance?: Partial<PerformanceConfig> & JsonRecord;
  performanceCues?: Record<string, unknown>;
  performanceAnchors?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
  deleted?: boolean;
  deletedAt?: number | null;
}

export interface LegacyStudioState extends JsonRecord {
  songs: LegacyStudioSong[];
  active: string | null;
  folders: string[];
  saved?: unknown[];
  theme?: string;
  themeSlots?: JsonRecord;
  customThemes?: unknown[];
  fontSize?: number;
  hideUsed?: boolean;
  density?: string;
  motion?: string;
  assistWidth?: number;
  editorFont?: string;
  uiLanguage?: string;
}

export interface StudioPreferences extends JsonRecord {
  saved?: unknown[];
  theme?: string;
  themeSlots?: JsonRecord;
  customThemes?: unknown[];
  fontSize?: number;
  hideUsed?: boolean;
  density?: string;
  motion?: string;
  assistWidth?: number;
  editorFont?: string;
  uiLanguage?: string;
}

export interface StudioDocumentStore {
  available(): Promise<boolean>;
  saveSnapshot(snapshot: StudioDocumentSnapshot): Promise<JsonRecord>;
  loadSnapshot(): Promise<StudioDocumentSnapshot | null>;
  saveLegacyBackup(migration: StudioDocumentMigration): Promise<JsonRecord>;
  saveDocumentBackup(snapshot: StudioDocumentSnapshot, options?: { reason?: string }): Promise<JsonRecord>;
  getBackup(id: string): Promise<JsonRecord | null>;
  listBackups(): Promise<JsonRecord[]>;
  restoreDocumentBackup(id: string): Promise<JsonRecord>;
  close(): void;
}

export interface EditorSong extends JsonRecord {
  id: string;
  lines: string[];
  barIds: string[];
  barRevisions: number[];
  editorNextBarId: number;
  steps: Record<string, unknown>;
  performance?: Partial<PerformanceConfig> & JsonRecord;
  performanceCues?: Record<string, PerformanceCue | string | unknown>;
  performanceAnchors?: Record<string, number | unknown>;
}

export interface EditorBarIdentity {
  id: string;
  revision: number;
  index: number;
  text: string;
}

export interface EditorBracketSegment {
  text: string;
  content: string;
  start: number;
  end: number;
}

export interface EditorPosition {
  index: number;
  offset: number;
}

export interface EditorSnapshot extends JsonRecord {
  lines: string[];
  steps: Record<string, unknown>;
  performance: Partial<PerformanceConfig> & JsonRecord;
  performanceCues: Record<string, unknown>;
  performanceAnchors: Record<string, unknown>;
  barIds: string[];
  barRevisions: number[];
  editorNextBarId: number;
}

export interface SelectionProof {
  songId: string;
  barId: string;
  barRevision: number;
  start: number;
  end: number;
  text: string;
}

export interface SelectionProofValidation {
  valid: boolean;
  reason: 'song_changed' | 'bar_missing' | 'bar_changed' | 'range_changed' | null;
  index: number;
}

export interface TypingCheckpointInput {
  songId?: string;
  barId?: string;
  inputType?: string;
  now?: number;
  composing?: boolean;
}

export interface TypingUndoCoalescer {
  shouldCheckpoint(input?: TypingCheckpointInput): boolean;
  reset(): void;
  noteBoundary(): void;
  inspect(): { songId: string; barId: string; inputType: string; at: number } | null;
  windowMs: number;
}

export interface PerformanceBarMetrics {
  cues: number;
  hits: number;
  accents: number;
  pauses: number;
  breaths: number;
  holds: number;
  density: number;
  needsReview: boolean;
}

export interface PerformancePocketMetrics extends PerformanceBarMetrics {
  onBeat: number;
  offBeat: number;
  onBeatShare: number;
  offBeatShare: number;
  pauseUnits: number;
  breathLoad: number;
}

export interface PerformancePreviousPlacements {
  previousBarId: string | null;
  previousSteps: number[];
  currentSteps: number[];
  sharedSteps: number[];
  sharedCount: number;
}

export interface PortableStudioBackup extends JsonRecord {
  schema: string;
  version: number;
  exportedAt: number;
  documentSchema: string;
  documentSchemaVersion: number;
  snapshot: StudioDocumentSnapshot;
  preferences: StudioPreferences;
  searchState: Partial<SearchState> & JsonRecord;
  legacyRawSnapshot?: boolean;
}

export type WriterResultKind = 'word' | 'phrase' | 'entity';

export interface WriterResultRow extends JsonRecord {
  word: string;
  kind: WriterResultKind;
  relation: string;
  relationType: string;
  relationLabel: string;
  syll: number;
  syllableDistance: number | null;
  lang: string;
  id: string;
  score: number;
  usageRank: number | null;
  usageCount: number | null;
  generatedPronunciation: boolean;
  raw: JsonRecord;
}

export interface WriterSearchOptions {
  query?: string;
  queryBasis?: QueryBasis;
  resultLanguage?: QueryBasis;
  scope?: SearchScope | string;
  includeVariants?: boolean;
  includeHistorical?: boolean;
  generated?: boolean;
  generatedOnly?: boolean;
  entityCategory?: string;
  entityCategories?: string[];
  rhymeType?: RhymeType | string;
  syllableFilter?: SyllableFilter | string;
  queryPronunciationRevision?: string;
  runtimeDb?: string;
  internalProfile?: boolean;
}

export interface WriterSearchResult extends JsonRecord {
  status: 'idle' | 'ready';
  rows: WriterResultRow[];
  query: JsonRecord | null;
  queries?: JsonRecord | null;
  querySyllables: number;
  warnings: unknown[];
  runtimeTiming: JsonRecord | null;
  runtimeDb?: string | null;
  runtimeExecution?: JsonRecord | null;
  effectiveRequest?: Record<string, string | string[]>;
  clientTiming?: JsonRecord | null;
  serverTransport?: JsonRecord | null;
  capabilities?: JsonRecord | null;
  raw: JsonRecord | null;
}

export interface WriterSearchClient {
  cancel(): void;
  search(options?: WriterSearchOptions): Promise<WriterSearchResult>;
}

export interface StudioAnalysisOccurrence {
  index: number;
  lineIndex: number;
  wordIndex: number;
  surface: string;
  normalized: string;
}

export interface StudioRhymePair extends JsonRecord {
  left: string;
  right: string;
  type: string;
  label?: string;
  score?: number;
  primary?: boolean;
  language?: string;
}

export interface StudioAnalysisPayload extends JsonRecord {
  language?: string;
  pairs?: StudioRhymePair[];
}

export interface StudioOccurrenceRelation extends JsonRecord {
  index: number;
  left: StudioAnalysisOccurrence;
  right: StudioAnalysisOccurrence;
  type: string;
  label: string;
  score: number;
  primary: boolean;
  language: string;
  sameBar: boolean;
}

export interface StudioAnalysisOptions {
  language?: QueryBasis;
  generated?: boolean;
  generatedOnly?: boolean;
  runtimeDb?: string;
  signal?: AbortSignal;
}

export interface StudioAnalysisClient {
  analyze(lines: string[], options?: StudioAnalysisOptions): Promise<StudioAnalysisPayload>;
  analyzeAll(lines: string[], options?: StudioAnalysisOptions): Promise<StudioAnalysisPayload & {
    occurrences: StudioAnalysisOccurrence[];
    occurrenceRelations: StudioOccurrenceRelation[];
  }>;
}

export interface StudioDetailPayload extends JsonRecord {
  kind: string;
  detail: JsonRecord | null;
  raw: JsonRecord;
  source: string;
}

export interface StudioDetailClient {
  cancel(): void;
  clear(): void;
  load(row: WriterResultRow, options?: { runtimeDb?: string }): Promise<StudioDetailPayload>;
}

export interface StudioDetailPronunciation {
  ipa: string;
  preferred: boolean;
  locale: string | null;
  register: string | null;
  dialect: string | null;
  source: string | null;
}

export interface StudioDetailModel extends JsonRecord {
  key: string;
  kind: string;
  word: string;
  language: string;
  ipa: string;
  pronunciations: StudioDetailPronunciation[];
  syllables: number | null;
  primaryStress: unknown;
  stressPattern: unknown;
  partOfSpeech: unknown;
  lemma: unknown;
  lexicalTags: string[];
  usageRank: unknown;
  usageCount: unknown;
  usageSourceCount: unknown;
  historical: boolean;
  generated: boolean;
  phraseTypes: string[];
  crossedWordBoundaries: unknown;
  retrievalChannels: unknown[];
  categories: string[];
  entityQid: unknown;
  popularity: number | null;
  popularityTier: unknown;
  relationLabel: string;
  relationType: string;
  score: number;
  relations: Array<{ type: string; strength: unknown; score: number }>;
  components: unknown;
  sources: string[];
  detailSource: string;
}

export interface StudioCapabilities extends JsonRecord {
  status: 'ready' | 'degraded' | string;
  runtime: string;
  servingV1: boolean;
  deWriter: boolean;
  enWriter: boolean;
  phrases: boolean;
  entities: boolean;
  generated: boolean;
  generatedDefault: boolean;
  queryPronunciationRevision: string;
  dataset: {
    core: number;
    generated: number;
    total: number;
    consistent: boolean;
  };
}

export type RuntimeEdition = 'lite' | 'standard' | 'full';

export interface RuntimeEditionSummary extends JsonRecord {
  id?: RuntimeEdition | string;
  available?: boolean;
  capabilities?: {
    generated?: boolean;
    [key: string]: unknown;
  };
  file?: { sizeBytes?: number; [key: string]: unknown };
  meta?: { distribution_total_target?: number | string; [key: string]: unknown };
}

export interface RuntimeEditionPayload extends JsonRecord {
  enabled?: boolean;
  defaultDatabase?: RuntimeEdition | string;
  databases?: RuntimeEditionSummary[] | JsonRecord;
}

export interface StudioDiagnosticCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface StudioDiagnostics extends JsonRecord {
  schema: string;
  createdAt: number;
  viewport: JsonRecord;
  input: JsonRecord;
  preferences: JsonRecord;
  platform: JsonRecord;
  runtime: JsonRecord;
  checks: StudioDiagnosticCheck[];
  summary: {
    passing: number;
    total: number;
    failing: string[];
  };
}

export interface DeviceEnvironment extends JsonRecord {
  userAgent?: string;
  language?: string;
  platform?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  maxTouchPoints?: number;
  coarsePointer?: boolean;
  audioSupported?: boolean;
  visualViewportSupported?: boolean;
}

export interface StudioDeviceGate {
  id: string;
  label: string;
  instruction: string;
  requirements: Readonly<Record<string, boolean>>;
}

export interface StudioDeviceResult {
  passed: boolean;
  note: string;
  testedAt: number;
  environment: Required<DeviceEnvironment>;
  eligibility: string;
}

export interface StudioDeviceAcceptance extends JsonRecord {
  schema: string;
  version: number;
  testedAt: number;
  environment: Required<DeviceEnvironment>;
  results: Record<string, StudioDeviceResult>;
  notes: string;
}

export interface RevisionDiffBar {
  id: string;
  index: number;
  text: string;
  revision: number;
}

export type RevisionDiffType = 'same' | 'changed' | 'moved' | 'added' | 'removed';

export interface RevisionDiffRow {
  type: RevisionDiffType;
  id: string;
  current: RevisionDiffBar | null;
  previous: RevisionDiffBar | null;
  textChanged: boolean;
  moved: boolean;
  currentLine: number | null;
  previousLine: number | null;
}

export interface RevisionDiff {
  rows: RevisionDiffRow[];
  changedRows: RevisionDiffRow[];
  summary: {
    added: number;
    removed: number;
    changed: number;
    moved: number;
    unchanged: number;
    currentBars: number;
    previousBars: number;
  };
  current: RevisionDiffBar[];
  previous: RevisionDiffBar[];
}
