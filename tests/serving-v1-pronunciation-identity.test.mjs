import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {
  SERVING_V1_PRONUNCIATION_IDENTITY_REVISION,
  canonicalPhonemeString,
  entityCanonicalPhonemesSql,
  entityIdentityKeySql,
  pronunciationIdentityKey,
} from '../scripts/serving-v1-pronunciation-identity.mjs';

test('Serving pronunciation identity normalizes Entity JSON phonemes to the Word/Phrase canonical form',()=>{
  assert.equal(SERVING_V1_PRONUNCIATION_IDENTITY_REVISION,'canonical-phoneme-stress-v3');
  assert.equal(
    canonicalPhonemeString('["m","ɛ","t","a","l","ɪ","k","a"]'),
    'm ɛ t a l ɪ k a',
  );
  assert.equal(
    pronunciationIdentityKey({
      phonemes:'["m","ɛ","t","a","l","ɪ","k","a"]',
      stress:'0010',
    }),
    pronunciationIdentityKey({
      phonemes:'m ɛ t a l ɪ k a',
      stress:'0010',
    }),
  );
});

test('Serving Entity SQL identity produces the same key for JSON phonemes',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(`
      CREATE TABLE ep(ipa TEXT);
      CREATE TABLE epa(phonemes TEXT,stress_pattern TEXT);
    `);
    db.prepare('INSERT INTO ep VALUES(?)').run('mɛtaˈlɪka');
    db.prepare('INSERT INTO epa VALUES(?,?)')
      .run('["m","ɛ","t","a","l","ɪ","k","a"]','0010');

    const phonemes=db.prepare(
      `SELECT ${entityCanonicalPhonemesSql('epa','ep')} value FROM ep CROSS JOIN epa`
    ).get().value;
    const identity=db.prepare(
      `SELECT ${entityIdentityKeySql('epa','ep')} value FROM ep CROSS JOIN epa`
    ).get().value;

    assert.equal(phonemes,'m ɛ t a l ɪ k a');
    assert.equal(identity,'m ɛ t a l ɪ k a|stress:0010');
  }finally{
    db.close();
  }
});
