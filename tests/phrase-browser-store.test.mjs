import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPhraseCatalogStorage, phraseIdForNormalized, registerPhraseSource, tokenizePhrase } from '../scripts/phrase-catalog-core.mjs';
import { ensurePhraseRegisterEvidenceStorage } from '../scripts/phrase-register-evidence-core.mjs';
import { getPhraseBrowserStats, getPhraseDetail, openPhraseBrowserDb, searchPhrases } from '../src/phrase-browser-store.mjs';

function insertPhrase(db, canonical, types=['phrase']) {
  const normalized=canonical.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('de-DE');
  const tokens=tokenizePhrase(canonical);const id=phraseIdForNormalized(normalized);
  db.prepare('INSERT INTO phrase(phrase_id,canonical,normalized,token_key,token_count,phrase_types_json,historical_state,modern_eligible,identity_fingerprint) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id,canonical,normalized,tokens.map(t=>t.normalized).join('\u001f'),tokens.length,JSON.stringify(types),'current_or_unmarked',1,'fixture-'+id);
  const ins=db.prepare('INSERT INTO phrase_token(phrase_id,token_index,surface,normalized,char_start,char_end,lexical_state,lexical_form_id) VALUES(?,?,?,?,?,?,?,NULL)');
  for(const t of tokens)ins.run(id,t.index,t.surface,t.normalized,t.charStart,t.charEnd,'unresolved');
  return id;
}

test('phrase browser searches the phrase catalog without touching Writer DB', async () => {
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-phrase-browser-'));const path=join(dir,'phrases.sqlite');
  const db=new DatabaseSync(path);
  try{
    db.exec('PRAGMA foreign_keys=ON;');createPhraseCatalogStorage(db);
    db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('schema','rhymelab-phrase-catalog-v1');
    registerPhraseSource(db,{source_id:'wiktionary-kaikki',name:'Wiktionary',role:'phraseology',homepage_url:null,license_id:'CC-BY-SA',license_url:null,attribution:null,redistribution_policy:'fixture'});
    ensurePhraseRegisterEvidenceStorage(db);
    insertPhrase(db,'keine Ahnung',['idiom','phrase']);
  }finally{db.close()}
  const read=openPhraseBrowserDb(path);
  try{
    const rows=searchPhrases(read,{q:'keine'});
    assert.equal(rows.length,1);
    assert.equal(rows[0].canonical,'keine Ahnung');
    const detail=getPhraseDetail(read,rows[0].phraseId);
    assert.equal(detail.canonical,'keine Ahnung');
    assert.equal(detail.tokens.length,2);
    assert.deepEqual(detail.register,[]);
    const stats=getPhraseBrowserStats(read);
    assert.equal(stats.phrases,1);
    assert.equal(stats.register.matchedPhrases,0);
    assert.equal(Object.hasOwn(stats,'rueg'),false);
  }finally{read.close()}
});
