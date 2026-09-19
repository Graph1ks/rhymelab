import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  backfillSummary,
  classifyClientResolution,
  classifyEspeakResolution,
  createPronunciationBackfillStorage,
  progressLine,
} from '../scripts/pronunciation-backfill-core.mjs';

test('pronunciation backfill storage is resumable and deduplicates language+normalized',()=>{
  const db=new DatabaseSync(':memory:');
  createPronunciationBackfillStorage(db);
  const insert=db.prepare([
    'INSERT INTO work_item(language,normalized,surface,token_count,updated_at)',
    'VALUES(?,?,?,?,?) ON CONFLICT(language,normalized) DO NOTHING',
  ].join(' '));
  insert.run('de','arbeitsweise','Arbeitsweise',1,'now');
  insert.run('de','arbeitsweise','arbeitsweise',1,'later');
  insert.run('en','arbeitsweise','Arbeitsweise',1,'later');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM work_item').get().c,2);

  const de=db.prepare("SELECT item_id FROM work_item WHERE language='de'").get();
  db.prepare([
    'INSERT INTO source_ref(item_id,scope,source_db,source_table,source_key,surface,context_json)',
    'VALUES(?,?,?,?,?,?,?)',
  ].join(' ')).run(de.item_id,'phrase_unresolved_token','phrases.sqlite','phrase_token','arbeitsweise','Arbeitsweise','{}');
  db.prepare("UPDATE work_item SET source_ref_count=1,espeak_status='accepted',client_status='skipped',final_status='resolved',quality_tier='A' WHERE item_id=?").run(de.item_id);

  const summary=backfillSummary(db);
  assert.equal(summary.unique_items,2);
  assert.equal(summary.source_refs,1);
  assert.equal(summary.espeak_accepted,1);
  assert.equal(summary.quality.A,1);
  assert.equal(summary.quality.pending,1);
  db.close();
});

test('eSpeak quality distinguishes unchanged and normalized analyzer-compatible IPA',()=>{
  assert.deepEqual(
    classifyEspeakResolution({status:'accepted',rawIpa:'ˈhaʊs',ipa:'ˈhaʊs'}),
    {
      qualityTier:'A',
      qualityReason:'espeak_analyzer_accepted_direct',
      method:'espeak_ng',
    },
  );
  assert.equal(
    classifyEspeakResolution({status:'accepted',rawIpa:'ˈhaʊɫ',ipa:'ˈhaʊl'}).qualityTier,
    'B',
  );
  assert.equal(classifyEspeakResolution({status:'rejected'}),null);
});

test('client quality separates rules from grapheme fallback and source composition',()=>{
  assert.equal(
    classifyClientResolution({ipa:'ˈtest',method:'client_rules',sourceBacked:false}).qualityTier,
    'C',
  );
  assert.equal(
    classifyClientResolution({
      ipa:'ˈtest',
      method:'client_token_chain',
      sourceBacked:false,
      tokens:[
        {method:'client_rules'},
        {method:'client_grapheme_fallback'},
      ],
    }).qualityTier,
    'D',
  );
  assert.equal(
    classifyClientResolution({
      ipa:'ˈtest',
      method:'client_source_reference_compound',
      sourceBacked:true,
    }).qualityTier,
    'B',
  );
});

test('progress line exposes rate, ETA and outcome counters',()=>{
  const line=progressLine({
    phase:'espeak',
    done:500,
    total:1000,
    startedAt:Date.now()-10_000,
    accepted:490,
    rejected:8,
    errors:2,
  });
  assert.match(line,/\[espeak\]/);
  assert.match(line,/500\/1,000/);
  assert.match(line,/50\.00%/);
  assert.match(line,/ETA/);
  assert.match(line,/accepted=490/);
  assert.match(line,/rejected=8/);
  assert.match(line,/errors=2/);
});
