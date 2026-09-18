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
const DAKODA_EXB = `<?xml version="1.0" encoding="UTF-8"?>
<basic-transcription>
 <common-timeline>
  <tli id="TLI_w1"/><tli id="TLI_w2"/><tli id="TLI_w3"/>
  <tli id="TLI_w4"/><tli id="TLI_w5"/><tli id="TLI_w6"/>
 </common-timeline>
 <tier id="TIE_TH_MERGED" category="spacy_mixtral_th1_merged" type="a" speaker="SPK0">
  <event start="TLI_w1" end="TLI_w3"/>
  <event start="TLI_w3" end="TLI_w6"/>
 </tier>
 <tier id="TIE1" category="text" type="t" speaker="SPK0">
  <event start="TLI_w1" end="TLI_w2">ich</event>
  <event start="TLI_w2" end="TLI_w3">hab</event>
  <event start="TLI_w3" end="TLI_w4">keine</event>
  <event start="TLI_w4" end="TLI_w5">Ahnung</event>
  <event start="TLI_w5" end="TLI_w6">heute</event>
 </tier>
</basic-transcription>`;

const DAKODA_META = JSON.stringify({
  corpus: { subcorpus: { corpus_subcorpus_targetLanguage: 'deu' } },
  task: { interaction: {
    task_interaction_formality: 'formal',
    task_interaction_mode: ['spoken'],
  } },
  learner: {
    learner_id: 'notAvailable',
    learner_id_orig: 'DEbi01FT',
    sociodemographic: { learner_socio_ageProduction: 24 },
  },
  text: {
    text_language: { iso_code_639_3: 'deu' },
    text_timeOfCreation: '2018-11-27',
  },
});


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


test('RUEG parser handles the real DAKODA EXB shape without inventing a norm layer', () => {
  const parsed = parseRuegExb(DAKODA_EXB);
  assert.equal(parsed.unitType, 'dakoda_clause');
  assert.equal(parsed.boundarySourceCategory, 'spacy_mixtral_th1_merged');
  assert.equal(parsed.surfaceSourceCategory, 'text');
  assert.equal(parsed.normSourceCategory, null);
  assert.equal(parsed.normAvailable, false);
  assert.equal(parsed.units.length, 2);
  assert.equal(parsed.units[0].dipl, 'ich hab');
  assert.equal(parsed.units[0].norm, '');
  assert.equal(parsed.units[0].diplTokenCount, 2);
  assert.equal(parsed.units[1].dipl, 'keine Ahnung heute');
  assert.equal(parsed.units[1].norm, '');
  assert.equal(parsed.units[1].diplTokenCount, 3);
});

test('RUEG metadata parser reads nested DAKODA JSON metadata', () => {
  const meta = parseRuegMeta(DAKODA_META);
  assert.equal(meta.speakerId, 'DEbi01FT');
  assert.equal(meta.formality, 'formal');
  assert.equal(meta.mode, 'spoken');
  assert.equal(meta.speakerAge, '24');
  assert.equal(meta.elicitationLanguage, 'deu');
  assert.equal(meta.elicitationDate, '2018-11-27');
  assert.equal(meta.raw['task.interaction.task-interaction-formality'], 'formal');
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
