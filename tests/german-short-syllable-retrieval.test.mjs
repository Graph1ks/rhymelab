import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import { prepareGermanRhymeAnchorAnalysis } from '../scripts/german-rhyme-anchors.mjs';
import { lookupGermanCandidateRowsForAnalysis } from '../src/local-engine.mjs';

function fixtureDb(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE hot(
      id INTEGER PRIMARY KEY,
      normalized TEXT NOT NULL,
      ipa TEXT NOT NULL,
      syllable_count INTEGER NOT NULL,
      pronunciation_preferred INTEGER NOT NULL DEFAULT 1,
      historical INTEGER NOT NULL DEFAULT 0,
      pronunciation_flags TEXT NOT NULL DEFAULT '[]',
      usage_rank INTEGER,
      exact_key TEXT,
      multisyllable_key TEXT,
      vowel_key TEXT,
      vowel_family TEXT,
      coda_key TEXT,
      coda_class TEXT
    );
  `);
  return db;
}

function insertCandidate(db,id,normalized,ipa,usageRank){
  const analysis=analyzeGermanIpa(ipa);
  db.prepare(`
    INSERT INTO hot(
      id,normalized,ipa,syllable_count,usage_rank,
      exact_key,multisyllable_key,vowel_key,vowel_family,coda_key,coda_class
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    normalized,
    analysis.ipa,
    analysis.syllableCount,
    usageRank,
    analysis.exactTailKey,
    analysis.multisyllableKey,
    analysis.vowelKey,
    analysis.vowelFamilyKey,
    analysis.codaKey,
    analysis.codaClassKey,
  );
}

test('external German short-syllable fallback retrieves one- and two-syllable candidates before limits',()=>{
  const db=fixtureDb();
  try{
    insertCandidate(db,1,'eis','aɪ̯s',1000);
    insertCandidate(db,2,'reise','ˈʁaɪ̯zə',500);
    insertCandidate(db,3,'weiterreise','ˈvaɪ̯tɐˌʁaɪ̯zə',100);

    const query=analyzeGermanIpa('ˈaʁbaɪ̯t͡sˌvaɪ̯zə');

    const onePrepared=prepareGermanRhymeAnchorAnalysis(query,{maxTailSyllables:1});
    const oneAnchor=onePrepared.anchors.find((anchor)=>
      anchor.clipped===true&&anchor.tailSyllables===1
    );
    assert.ok(oneAnchor);
    const one=lookupGermanCandidateRowsForAnalysis(
      db,
      oneAnchor.prepared.analysis,
      {
        queryNormalized:'external-arbeitsweise',
        querySyllables:query.syllableCount,
        syllableFilter:'1',
        poolLimit:50,
      },
    );
    assert.deepEqual(one.map((row)=>row.normalized),['eis']);
    assert.ok(one.every((row)=>row.syllable_count===1));

    const twoPrepared=prepareGermanRhymeAnchorAnalysis(query,{maxTailSyllables:2});
    const twoAnchor=twoPrepared.anchors
      .filter((anchor)=>anchor.clipped!==true)
      .sort((a,b)=>b.position-a.position)[0];
    assert.ok(twoAnchor);
    assert.equal(twoAnchor.tailSyllables,2);
    const two=lookupGermanCandidateRowsForAnalysis(
      db,
      twoAnchor.prepared.analysis,
      {
        queryNormalized:'external-arbeitsweise',
        querySyllables:query.syllableCount,
        syllableFilter:'2',
        poolLimit:50,
      },
    );
    assert.deepEqual(two.map((row)=>row.normalized),['reise']);
    assert.ok(two.every((row)=>row.syllable_count===2));
  }finally{
    db.close();
  }
});
