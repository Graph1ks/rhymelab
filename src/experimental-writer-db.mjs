import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { materializedWriterRuntimeState } from './writer-materialized-runtime.mjs';

export function openExperimentalWriterDb(dbPath = 'data/local/rhymelab-v5.sqlite') {
  const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON;');
    const state = materializedWriterRuntimeState(db, { refresh: true });
    if (!state.active) {
      throw new Error(
        `Experimental writer-v5 storage contract is incomplete: ${JSON.stringify(state)}`,
      );
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
