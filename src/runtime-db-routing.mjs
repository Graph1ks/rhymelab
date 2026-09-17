export const WRITER_RUNTIME_ID = 'materialized-writer-v5-v1';

export function useLegacyRanking(searchParams) {
  return searchParams?.get?.('ranking') === 'legacy';
}

export function selectRhymeRuntimeDatabases({ writerDb, legacyDb }, searchParams) {
  if (useLegacyRanking(searchParams)) {
    return {
      mode: 'legacy',
      database: legacyDb,
      runtimeId: 'legacy-v4-control',
    };
  }
  return {
    mode: 'writer',
    database: writerDb,
    runtimeId: WRITER_RUNTIME_ID,
  };
}
