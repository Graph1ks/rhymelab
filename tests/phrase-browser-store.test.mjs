import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPhraseCatalogStorage, phraseIdForNormalized, registerPhraseSource, tokenizePhrase } from '../scripts/phrase-catalog-core.mjs';
import { ensurePhraseRegisterEvidenceStorage } from '../scripts/phrase-register-evidence-core.mjs';
import { documentIdFor, ensureRuegRegisterStorage, unitIdFor } from '../scripts/rueg-register-core.mjs';
import { getPhraseBrowserStats, getPhraseDetail, openPhraseBrowserDb, searchPhrases, searchRegisterUnits } from '../src/phrase-browser-store.mjs';

function insertPhrase(db, canonical, types=['phrase']) {
  const normalized=canonical.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('de-DE');
  const tokens=tokenizePhrase(canonical);const id=phraseIdForNormalized(normalized);
  db.prepare('INSERT INTO phrase(phrase_id,canonical,normalized,token_key,token_count,phrase_types_json,historical_state,modern_eligible,identity_fingerprint) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id,canonical,normalized,tokens.map(t=>t.normalized).join('\u001f'),tokens.length,JSON.stringify(types),'current_or_unmarked',1,'fixture-'+id);
  const ins=db.prepare('INSERT INTO phrase_token(phrase_id,token_index,surface,normalized,char_start,char_end,lexical_state,lexical_form_id) VALUES(?,?,?,?,?,?,?,NULL)');
  for(const t of tokens)ins.run(id,t.index,t.surface,t.normalized,t.charStart,t.charEnd,'unresolved');
  return id;
}

test('phrase browser searches catalog and RUEG contexts without touching Writer DB', async () => {
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-phrase-browser-'));const path=join(dir,'phrases.sqlite');
  const db=new DatabaseSync(path);
  const phraseId=insertPhrase.bind(null,db);
  try{
    db.exec('PRAGMA foreign_keys=ON;');createPhraseCatalogStorage(db);
    db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('schema','rhymelab-phrase-catalog-v1');
    registerPhraseSource(db,{source_id:'wiktionary-kaikki',name:'Wiktionary',role:'phraseology',homepage_url:null,license_id:'CC-BY-SA',license_url:null,attribution:null,redistribution_policy:'fixture'});
    registerPhraseSource(db,{source_id:'rueg-dakoda',name:'RUEG',role:'register',homepage_url:null,license_id:'CC0-1.0',license_url:null,attribution:null,redistribution_policy:'fixture'});
    ensurePhraseRegisterEvidenceStorage(db);ensureRuegRegisterStorage(db);
    const id=phraseId('keine Ahnung',['idiom','phrase']);
    const doc=documentIdFor({sourceId:'rueg-dakoda',subcorpus:'RUEG-L1',sourceRecordId:'fixture.exb'});
    db.prepare('INSERT INTO register_document(document_id,source_id,subcorpus,source_record_id,formality,mode,age_group) VALUES(?,?,?,?,?,?,?)').run(doc,'rueg-dakoda','RUEG-L1','fixture.exb','informal','spoken','adolescents');
    const unit=unitIdFor(doc,0);
    db.prepare('INSERT INTO register_unit(unit_id,document_id,unit_index,unit_type,dipl_text,norm_text,languages_json,dipl_token_count,norm_token_count) VALUES(?,?,?,?,?,?,?,?,?)').run(unit,doc,0,'cu','ja keine ahnung','ja keine Ahnung','["deu"]',3,3);
    db.prepare('INSERT INTO phrase_register_occurrence(phrase_id,unit_id,layer,occurrence_count) VALUES(?,?,?,?)').run(id,unit,'dipl',1);
  }finally{db.close()}
  const read=openPhraseBrowserDb(path);
  try{
    const rows=searchPhrases(read,{q:'keine',evidence:'rueg'});
    assert.equal(rows.length,1);assert.equal(rows[0].canonical,'keine Ahnung');assert.equal(rows[0].ruegOccurrences,1);
    const contexts=searchRegisterUnits(read,{q:'keine',formality:'informal',mode:'spoken',age:'adolescents'});
    assert.equal(contexts.length,1);assert.equal(contexts[0].subcorpus,'RUEG-L1');
    const detail=getPhraseDetail(read,rows[0].phraseId);assert.equal(detail.ruegExamples.length,1);assert.equal(detail.ruegExamples[0].layer,'dipl');
    const stats=getPhraseBrowserStats(read);assert.equal(stats.rueg.units,1);assert.equal(stats.phrases,1);
  }finally{read.close()}
});
