import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createPhraseCatalogStorage, phraseIdForNormalized, registerPhraseSnapshot, registerPhraseSource, tokenizePhrase, tokenKey } from '../scripts/phrase-catalog-core.mjs';
import { ensurePhraseRegisterEvidenceStorage, writeRegisterEvidence } from '../scripts/phrase-register-evidence-core.mjs';
import { createRuegRegisterStorage, insertRuegRegisterUnit, writeUnitPhraseMatches, RUEG_DIPL_MATCH_POLICY } from '../scripts/rueg-register-core.mjs';
import { createPhraseBrowser } from '../src/phrase-browser.mjs';

function insertPhrase(db,canonical,types=['phrase']){
 const normalized=canonical.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('de-DE');const tokens=tokenizePhrase(canonical);const id=phraseIdForNormalized(normalized);
 db.prepare('INSERT INTO phrase(phrase_id,canonical,normalized,token_key,token_count,phrase_types_json,historical_state,modern_eligible,identity_fingerprint) VALUES(?,?,?,?,?,?,?,?,?)').run(id,canonical,normalized,tokenKey(tokens),tokens.length,JSON.stringify(types),'current_or_unmarked',1,'fixture-'+id);
 const ins=db.prepare('INSERT INTO phrase_token(phrase_id,token_index,surface,normalized,char_start,char_end,lexical_state,lexical_form_id) VALUES(?,?,?,?,?,?,?,NULL)');for(const tok of tokens)ins.run(id,tok.index,tok.surface,tok.normalized,tok.charStart,tok.charEnd,'unresolved');return id;
}

test('phrase browser searches evidence and exposes RUEG dual-layer samples',()=>{
 const db=new DatabaseSync(':memory:');try{
  createPhraseCatalogStorage(db);ensurePhraseRegisterEvidenceStorage(db);createRuegRegisterStorage(db);
  registerPhraseSource(db,{source_id:'fixture',name:'Fixture',role:'fixture',homepage_url:'https://example.invalid',license_id:'CC0-1.0',license_url:'https://creativecommons.org/publicdomain/zero/1.0/',attribution:'fixture',redistribution_policy:'fixture'});
  const snap='snapshot:fixture';registerPhraseSnapshot(db,{snapshot_id:snap,source_id:'fixture',snapshot_label:'fixture',artifact_path:'/tmp/f',artifact_sha256:'a'.repeat(64),upstream_url:'https://example.invalid/f',evidence_year:2023,genre:'spoken',country:'DE',metadata:{}});
  const id=insertPhrase(db,'keine Ahnung',['idiom','phrase']);
  db.prepare('INSERT INTO phrase_usage_evidence(phrase_id,snapshot_id,policy,occurrence_count,sentence_count,corpus_token_count,corpus_sentence_count,per_million_tokens,per_million_sentences,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,snap,'fixture',5,4,1000,100,5000,40000,'{}');
  writeRegisterEvidence(db,{snapshotId:snap,policy:'fixture-register',registerTags:['youth'],occurrenceCounts:new Map([[id,2]]),unitCounts:new Map([[id,2]]),corpusTokenCount:100,corpusUnitCount:10,evidence:{}});
  const unitId=insertRuegRegisterUnit(db,{snapshotId:snap,sourceRecordId:'DE_x_isD',subcorpus:'RUEG-Lx',unit:{unitIndex:0,diplText:'ja keine ahnung',normText:'ja keine Ahnung',languageValues:['deu'],germanTokenRatio:1,formality:'informal',mode:'spoken'},speakerProfile:'multilingual'});
  writeUnitPhraseMatches(db,{unitId,policy:RUEG_DIPL_MATCH_POLICY,counts:new Map([[id,1]])});
  const browser=createPhraseBrowser(db);
  const found=browser.searchPhrases({q:'keine ahnung',type:'idiom',evidence:'any',register:'any'});assert.equal(found.total,1);assert.equal(found.results[0].phrase_id,id);assert.equal(found.results[0].register_evidence_rows,1);
  const detail=browser.getPhrase(id);assert.equal(detail.usage.length,1);assert.equal(detail.registerEvidence.length,1);assert.equal(detail.registerSamples.length,1);assert.equal(detail.registerSamples[0].dipl_text,'ja keine ahnung');
  const corpus=browser.searchRegisterUnits({q:'keine',layer:'both',subcorpus:'RUEG-Lx',mode:'spoken',formality:'informal'});assert.equal(corpus.total,1);assert.equal(corpus.results[0].matched_phrases,1);
 }finally{db.close();}
});
