export const WRITER_RUNTIME_ID = 'materialized-writer-v5-v1';

export function useLegacyRanking(searchParams) {
  return searchParams?.get?.('ranking') === 'legacy';
}

export function selectRhymeRuntimeDatabases({ writerDb, legacyDb }, searchParams) {
  if (useLegacyRanking(searchParams)) {
    if (!legacyDb) {
      throw new Error('Legacy v4 control database is unavailable. Build data/local/rhymelab.sqlite or set RHYMELAB_LEGACY_DB.');
    }
    return {
      mode: 'legacy',
      database: legacyDb,
      runtimeId: 'legacy-v4-control',
    };
  }
  if (!writerDb) throw new Error('Writer v5 database is unavailable.');
  return {
    mode: 'writer',
    database: writerDb,
    runtimeId: WRITER_RUNTIME_ID,
  };
}
