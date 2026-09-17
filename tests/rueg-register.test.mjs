import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createPhraseCatalogStorage, registerPhraseSource } from '../scripts/phrase-catalog-core.mjs';
import {
  computeRuegDetailFingerprint,
  documentIdFor,
  ensureRuegRegisterStorage,
  parseRuegExb,
  parseRuegMeta,
  unitIdFor,
} from '../scripts/rueg-register-core.mjs';

const EXB = `<?xml version="1.0" encoding="UTF-8"?>
<basic-transcription>
 <common-timeline>
  <tli id="T0"/><tli id="T1"/><tli id="T2"/><tli id="T3"/><tli id="T4"/>
 </common-timeline>
 <tier id="TIE0" category="cu"><event start="T0" end="T4">cu</event></tier>
 <tier id="TIE1" category="dipl">
  <event start="T0" end="T1">ich</event><event start="T1" end="T2">hab</event>
  <event start="T2" end="T3">keine</event><event start="T3" end="T4">Ahnung</event>
 </tier>
 <tier id="TIE2" category="norm">
  <event start="T0" end="T1">ich</event><event start="T1" end="T2">habe</event>
  <event start="T2" end="T3">keine</event><event start="T3" end="T4">Ahnung</event>
 </tier>
 <tier id="TIE3" category="language"><event start="T0" end="T4">deu</event></tier>
</basic-transcription>`;

test('RUEG EXB parser preserves diplomatic and normalized layers separately', () => {
  const parsed = parseRuegExb(EXB);
  assert.equal(parsed.unitType, 'cu');
  assert.equal(parsed.units.length, 1);
  assert.equal(parsed.units[0].dipl, 'ich hab keine Ahnung');
  assert.equal(parsed.units[0].norm, 'ich habe keine Ahnung');
  assert.equal(parsed.units[0].diplTokenCount, 4);
  assert.equal(parsed.units[0].normTokenCount, 4);
  assert.deepEqual(parsed.units[0].languages, ['deu']);
});

test('RUEG metadata parser preserves register dimensions needed for filtering', () => {
  const meta = parseRuegMeta([
    'speaker-id = S17',
    'formality = informal',
    'mode = spoken',
    'speaker-age-group = adolescents',
    'speaker-age = 18',
    'speaker-bilingual = true',
    'elicitation-language = German',
    'elicitation-country = Germany',
  ].join('\n'));
  assert.equal(meta.speakerId, 'S17');
  assert.equal(meta.formality, 'informal');
  assert.equal(meta.mode, 'spoken');
  assert.equal(meta.ageGroup, 'adolescents');
  assert.equal(meta.speakerAge, '18');
  assert.equal(meta.elicitationLanguage, 'German');
});

test('RUEG detail fingerprint is deterministic and sensitive to dipl/norm content', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON;');
    createPhraseCatalogStorage(db);
    registerPhraseSource(db, {
      source_id: 'rueg-dakoda', name: 'RUEG', role: 'register',
      homepage_url: null, license_id: 'CC0-1.0', license_url: null,
      attribution: null, redistribution_policy: 'fixture',
    });
    ensureRuegRegisterStorage(db);
    const documentId = documentIdFor({ sourceId: 'rueg-dakoda', subcorpus: 'RUEG-L1', sourceRecordId: 'fixture.exb' });
    db.prepare('INSERT INTO register_document(document_id,source_id,subcorpus,source_record_id,formality,mode,age_group) VALUES(?,?,?,?,?,?,?)')
      .run(documentId, 'rueg-dakoda', 'RUEG-L1', 'fixture.exb', 'informal', 'spoken', 'adolescents');
    const unitId = unitIdFor(documentId, 0);
    db.prepare('INSERT INTO register_unit(unit_id,document_id,unit_index,unit_type,dipl_text,norm_text,languages_json,dipl_token_count,norm_token_count) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(unitId, documentId, 0, 'cu', 'ich hab keine Ahnung', 'ich habe keine Ahnung', '["deu"]', 4, 4);
    const first = computeRuegDetailFingerprint(db);
    const second = computeRuegDetailFingerprint(db);
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/u);
    db.prepare('UPDATE register_unit SET dipl_text=? WHERE unit_id=?').run('ich hab echt keine Ahnung', unitId);
    assert.notEqual(computeRuegDetailFingerprint(db), first);
  } finally {
    db.close();
  }
});
