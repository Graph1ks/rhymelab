import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { materializedWriterRuntimeState } from './writer-materialized-runtime.mjs';

export const DEFAULT_WRITER_DB_PATH = resolve('data/local/rhymelab-v5.sqlite');

export function openWriterDb(dbPath = DEFAULT_WRITER_DB_PATH) {
  const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON;');
    const state = materializedWriterRuntimeState(db, { refresh: true });
    if (!state.active) {
      throw new Error(
        `Writer-v5 storage contract is incomplete: ${JSON.stringify(state)}`,
      );
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// Backward-compatible benchmark/import alias. The v5 writer runtime is now the
// normal writer database contract; historical scripts may keep the old name.
export const openExperimentalWriterDb = openWriterDb;
