#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const dbPath = resolve(process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec('PRAGMA query_only=ON;');

const scalar = (sql, ...args) => Number(Object.values(db.prepare(sql).get(...args) || { value: 0 })[0] || 0);
const value = (sql, ...args) => Object.values(db.prepare(sql).get(...args) || { value: null })[0] ?? null;
const supportedSchemas = new Set(['rhymelab-local-db-v3', 'rhymelab-local-db-v4']);

function preferredMarkedOverStandard(flag) {
  return scalar(`
    SELECT COUNT(*) FROM hot preferred
    WHERE preferred.pronunciation_preferred=1
      AND preferred.pronunciation_flags LIKE ?
      AND EXISTS (
        SELECT 1 FROM hot standard
        WHERE standard.publish_order=preferred.publish_order
          AND standard.pronunciation_eligible=1
          AND standard.pronunciation_flags NOT LIKE '%regional%'
          AND standard.pronunciation_flags NOT LIKE '%colloquial%'
          AND standard.pronunciation_flags NOT LIKE '%context_specific%'
          AND standard.pronunciation_flags NOT LIKE '%connected_speech%'
      )
  `, `%${flag}%`);
}

try {
  const schema = value("SELECT value FROM meta WHERE key='schema'");
  if (!supportedSchemas.has(schema)) throw new Error(`Expected supported local DB schema (${[...supportedSchemas].join(' or ')}), got ${schema || 'missing'}`);

  const forms = scalar('SELECT COUNT(DISTINCT publish_order) FROM hot');
  const rows = scalar('SELECT COUNT(*) FROM hot');
  const preferred = scalar('SELECT COUNT(*) FROM hot WHERE pronunciation_preferred=1');
  const formsWithoutExactlyOnePreferred = scalar(`
    SELECT COUNT(*) FROM (
      SELECT publish_order, SUM(pronunciation_preferred) AS c
      FROM hot
      GROUP BY publish_order
      HAVING c != 1
    )
  `);
  const preferredIneligible = scalar('SELECT COUNT(*) FROM hot WHERE pronunciation_preferred=1 AND pronunciation_eligible!=1');
  const preferredConnected = scalar("SELECT COUNT(*) FROM hot WHERE pronunciation_preferred=1 AND pronunciation_flags LIKE '%connected_speech%'");
  const preferredRegional = scalar("SELECT COUNT(*) FROM hot WHERE pronunciation_preferred=1 AND pronunciation_flags LIKE '%regional%'");
  const preferredColloquial = scalar("SELECT COUNT(*) FROM hot WHERE pronunciation_preferred=1 AND pronunciation_flags LIKE '%colloquial%'");
  const preferredContextSpecific = scalar("SELECT COUNT(*) FROM hot WHERE pronunciation_preferred=1 AND pronunciation_flags LIKE '%context_specific%'");
  const regionalOverStandard = preferredMarkedOverStandard('regional');
  const colloquialOverStandard = preferredMarkedOverStandard('colloquial');
  const contextOverStandard = preferredMarkedOverStandard('context_specific');

  const focusWords = ['Musik', 'er', 'ihr', 'ist', 'sich', 'so', 'damit', 'dabei', 'Spotify', 'Twitter'];
  const focus = {};
  for (const word of focusWords) {
    focus[word] = db.prepare(`
      SELECT surface, ipa, pronunciation_rank, pronunciation_preferred,
             pronunciation_eligible, pronunciation_evidence,
             pronunciation_source_order, pronunciation_tags,
             pronunciation_raw_tags, pronunciation_flags,
             locale, dialect, pronunciation_register, lexicon_layer, entity_kind
      FROM hot
      WHERE normalized = lower(?)
      ORDER BY pronunciation_preferred DESC, pronunciation_rank, surface, ipa
      LIMIT 20
    `).all(word);
  }

  const expectedPreferred = {
    Musik: 'muˈziːk',
    er: 'eːɐ̯',
    ihr: 'iːɐ̯',
    ist: 'ɪst',
    so: 'zoː',
    damit: 'daˈmɪt',
    dabei: 'daˈbaɪ̯',
  };
  const regression = {};
  for (const [word, ipa] of Object.entries(expectedPreferred)) {
    const normalized = word.toLocaleLowerCase('de-DE');
    const observed = value(`
      SELECT ipa FROM hot
      WHERE normalized=? AND pronunciation_preferred=1
      ORDER BY usage_rank IS NULL, usage_rank, surface
      LIMIT 1
    `, normalized);
    regression[word] = { expected: ipa, observed, ok: observed === ipa };
  }

  const ok = formsWithoutExactlyOnePreferred === 0
    && preferred === forms
    && preferredIneligible === 0
    && preferredConnected === 0
    && regionalOverStandard === 0
    && colloquialOverStandard === 0
    && contextOverStandard === 0
    && Object.values(regression).every((item) => item.ok);

  console.log(JSON.stringify({
    schema: 'rhymelab-pronunciation-audit-v3',
    database_schema: schema,
    ok,
    forms,
    rows,
    preferred_pronunciations: preferred,
    alternate_pronunciations: rows - preferred,
    forms_without_exactly_one_preferred: formsWithoutExactlyOnePreferred,
    preferred_ineligible: preferredIneligible,
    preferred_connected_speech: preferredConnected,
    preferred_regional_total: preferredRegional,
    preferred_colloquial_total: preferredColloquial,
    preferred_context_specific_total: preferredContextSpecific,
    preferred_regional_when_standard_available: regionalOverStandard,
    preferred_colloquial_when_standard_available: colloquialOverStandard,
    preferred_context_specific_when_standard_available: contextOverStandard,
    regression,
    focus,
  }, null, 2));
} finally {
  db.close();
}
