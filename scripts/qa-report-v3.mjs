#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { applyPronunciationProvenanceIntegrity, auditPronunciationSourceDuplicates } from './qa-provenance-policy.mjs';

const root = process.cwd();
const dbPath = resolve(process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');

function runBaseQa() {
  const result = spawnSync(process.execPath, ['--no-warnings', 'scripts/qa-report.mjs'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const message = String(result.stderr || result.stdout || 'qa-report.mjs failed').trim();
    throw new Error(`qa-report.mjs failed with exit ${result.status ?? 'unknown'}: ${message.slice(-4000)}`);
  }
  const raw = String(result.stdout || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('qa-report.mjs did not return JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

const report = runBaseQa();
try {
  await access(dbPath);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON;');
    applyPronunciationProvenanceIntegrity(report, auditPronunciationSourceDuplicates(db));
  } finally {
    db.close();
  }
} catch (error) {
  if (!report.database?.missing) {
    report.database.provenance_duplicate_audit_error = error instanceof Error ? error.message : String(error);
    if (report.gates) report.gates.database_integrity = false;
    report.status = 'attention';
  }
}

report.schema = 'rhymelab-local-qa-report-v3';
console.log(JSON.stringify(report, null, 2));
