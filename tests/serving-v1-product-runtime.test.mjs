import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createServingV1Storage} from '../scripts/serving-v1-core.mjs';
import {createServingV1RuntimeStorage} from '../scripts/serving-v1-runtime-core.mjs';
import {
  SERVING_V1_PRODUCT_REVISION,
  SERVING_V1_PRODUCT_SCHEMA,
  createServingV1ProductStorage,
} from '../scripts/serving-v1-product-core.mjs';
import {
  openServingV1ProductRuntime,
  servingV1ProductRuntimeState,
} from '../src/serving-v1-product-runtime.mjs';
import {getWord} from '../src/local-engine.mjs';
import {findWriterRhymes} from '../src/writer-search.mjs';
import {getEnglishWord,searchEnglishWriter} from '../src/english-writer-runtime.mjs';
import {getPhraseBrowserStats,getPhraseDetail} from '../src/phrase-browser-store.mjs';
import {searchEntityRhymes} from '../src/entity-writer-runtime.mjs';
import {
  phraseMosaicV2QueryAnchors,
  retrievePhraseMosaicCandidatesV2,
} from '../scripts/phrase-mosaic-retrieval-v2-core.mjs';
import {enrichPhraseMosaicCandidates} from '../scripts/phrase-mosaic-ranking-evidence-core.mjs';
import {
  lookupMaterializedWriterAnchorRows,
  materializedWriterRuntimeState,
  resolveMaterializedWriterMorphologyBatch,
} from '../src/writer-materialized-runtime.mjs';
import {searchUnifiedWriter,unifiedWriterCapabilities} from '../src/unified-writer-search.mjs';
import {createServingV1ParallelWriterRuntime} from '../src/unified-writer-parallel.mjs';
import {getPhonologyProfile} from '../scripts/phonology-profiles.mjs';
import {analyzeGermanIpa} from '../scripts/german-ipa.mjs';

function meta(db,key,value){
  db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key,String(value));
}

function surface(db,{id,language,normalized,surface,core=false,generated=false,role='lexical',usageRank=null}){
  db.prepare(`
    INSERT INTO surface(
      surface_id,language,normalized,display_surface,canonical_available,generated_available,
      authority_rank,authority_kind,usage_rank,usage_count,historical,lemma,part_of_speech,lexicon_layer
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,language,normalized,surface,core?1:0,generated?1:0,
    core?10:110,core?'core_word':'generated_word',usageRank,null,0,normalized,
    role==='phrase'?'phrase':'noun',role==='phrase'?'phrase':'dictionary'
  );
  db.prepare('INSERT INTO surface_role(surface_id,role,canonical_available,generated_available) VALUES(?,?,?,?)')
    .run(id,role,1,0);
}

function pron(db,{id,surfaceId,core=false,generated=false,ipa,phonemes,stress='1',syllables=1,exact='tail',vowel='aɪ',family='AI',coda='m'}){
  db.prepare(`
    INSERT INTO pronunciation(
      pronunciation_id,surface_id,identity_key,notation,raw,ipa,phonemes,syllable_count,
      stress_pattern,primary_stress,exact_key,multisyllable_key,vowel_key,vowel_family,coda_key,
      eligible,canonical_available,generated_available,canonical_preferred,generated_preferred,
      authority_rank,authority_kind
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,surfaceId,phonemes+'|stress:'+stress,'ipa',ipa,ipa,phonemes,syllables,stress,1,
    exact,null,vowel,family,coda,1,core?1:0,generated?1:0,core?1:0,generated?1:0,
    core?10:110,core?'core_word':'generated_word'
  );
  db.prepare(`
    INSERT INTO runtime_target(
      target_id,target_kind,language,pronunciation_id,syllable_count,
      canonical_available,generated_available,canonical_preferred,generated_preferred
    )
    SELECT ?, 'pronunciation',s.language,?,?,?,?,?,?
    FROM surface s WHERE s.surface_id=?
  `).run(id,id,syllables,core?1:0,generated?1:0,core?1:0,generated?1:0,surfaceId);
}

function lexicalProfile(db,{surfaceId,pronunciationId,generated=false,source='German Wiktionary',rank=1,zipf=null,language='de'}){
  db.prepare(`
    INSERT INTO runtime_lexical_profile(
      surface_id,source_priority,lexical_tags_json,en_surface_variants_json,en_poses_json,
      en_lemmas_json,en_relation_kinds_json,en_evidence_kinds_json,en_wordfreq_zipf,en_default_eligible
    ) VALUES(?,?,'[]','[]','["noun"]',?,'[]','[]',?,1)
  `).run(surfaceId,generated?110:10,JSON.stringify(['lemma-'+surfaceId]),zipf);
  db.prepare(`
    INSERT INTO runtime_pronunciation_profile(
      pronunciation_id,source_row_id,source_priority,source,pronunciation_rank,evidence_count,tags_json,
      raw_tags_json,flags_json,locale,locales_json,locale_us,locale_gb,rhyme_tail,final_tail,
      vowels,consonants,coda_class,rhyme_syllables,default_profile_eligible
    ) VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
  `).run(
    pronunciationId,pronunciationId,generated?110:10,source,rank,
    generated?'["generated"]':'[]',
    generated?'["generated"]':'[]',
    generated?'["generated","secondary_opt_in"]':'[]',
    language==='en'?'en-US':'de-DE',
    language==='en'?'["en-US"]':'["de-DE"]',
    language==='en'?1:0,0,'tail','tail','aɪ','m','m',1
  );
}

test('Serving product adapter exposes one DB as Core/all legacy-compatible runtimes',async()=>{
  const phraseQueryIpa='ˈliːbə';
  const phraseAnchor=phraseMosaicV2QueryAnchors(analyzeGermanIpa(phraseQueryIpa))[0];
  assert.ok(phraseAnchor);
  assert.equal(phraseAnchor.syllableCount,2);
  const root=await mkdtemp(join(tmpdir(),'rhymelab-serving-product-'));
  const path=join(root,'serving.sqlite');
  try{
    const db=new DatabaseSync(path);
    try{
      createServingV1Storage(db);
      createServingV1RuntimeStorage(db);
      createServingV1ProductStorage(db);
      meta(db,'schema','rhymelab-serving-v1');
      meta(db,'status','complete');
      meta(db,'runtime_status','complete');
      meta(db,'runtime_semantic_fingerprint','a'.repeat(64));
      meta(db,'identity_revision','canonical-phoneme-stress-v3');
      meta(db,'product_adapter_schema',SERVING_V1_PRODUCT_SCHEMA);
      meta(db,'product_adapter_revision',SERVING_V1_PRODUCT_REVISION);
      meta(db,'product_adapter_identity_revision','canonical-phoneme-stress-v3');
      meta(db,'product_adapter_status','complete');
      meta(db,'product_adapter_semantic_fingerprint','b'.repeat(64));

      surface(db,{id:1,language:'de',normalized:'zeit',surface:'Zeit',core:true,usageRank:1});
      pron(db,{id:1,surfaceId:1,core:true,ipa:'tsaɪt',phonemes:'t s aɪ t',coda:'t'});
      lexicalProfile(db,{surfaceId:1,pronunciationId:1});
      db.prepare(`
        INSERT INTO runtime_de_surface_profile(
          surface_id,source_hot_id,display_surface,usage_rank,usage_score,usage_count,usage_source_count,
          lemma,part_of_speech,gender,lexicon_layer,entity_kind,historical,lexical_tags_json,
          selection_usage_rank_missing,selection_pronunciation_preferred,selection_pronunciation_rank,selection_ipa
        ) VALUES(1,1,'Zeit',1,6.0,10,2,'zeit','noun','f','dictionary',NULL,0,'[]',0,1,1,'tsaɪt')
      `).run();

      surface(db,{id:2,language:'de',normalized:'krankenscheindrucker',surface:'Krankenscheindrucker',generated:true});
      pron(db,{id:2,surfaceId:2,generated:true,ipa:'kʁaŋk',phonemes:'k ʁ a ŋ k',coda:'k'});
      lexicalProfile(db,{surfaceId:2,pronunciationId:2,generated:true,source:'eSpeak-NG Backfill V2'});
      db.prepare(`
        INSERT INTO runtime_de_surface_profile(
          surface_id,source_hot_id,display_surface,usage_rank,usage_score,usage_count,usage_source_count,
          lemma,part_of_speech,gender,lexicon_layer,entity_kind,historical,lexical_tags_json,
          selection_usage_rank_missing,selection_pronunciation_preferred,selection_pronunciation_rank,selection_ipa
        ) VALUES(2,2,'Krankenscheindrucker',NULL,NULL,NULL,NULL,'krankenscheindrucker','noun',NULL,'dictionary',NULL,0,'[]',1,1,1,'kʁaŋk')
      `).run();
      const deProfile=getPhonologyProfile('de');
      const deAnalysis=db.prepare(
        'INSERT INTO runtime_de_analysis(pronunciation_id,analyzer_id,analysis_json) VALUES(?,?,?)'
      );
      deAnalysis.run(1,deProfile.analyzerVersion,JSON.stringify(deProfile.analyzeIpa('tsaɪt')));
      deAnalysis.run(2,deProfile.analyzerVersion,JSON.stringify(deProfile.analyzeIpa('kʁaŋk')));
      db.prepare(`
        INSERT INTO runtime_de_candidate(
          pronunciation_id,normalized,syllable_count,usage_rank,historical,core_preferred,all_preferred,
          canonical_available,generated_available,generated_only,source_order,exact_key,multisyllable_key,
          vowel_key,vowel_family,stressed_family,coda_key,coda_class
        ) VALUES
          (1,'zeit',1,1,0,1,1,1,0,0,1,'tail',NULL,'aɪ','AI','AI','t','m'),
          (2,'krankenscheindrucker',1,NULL,0,0,1,0,1,1,2,'tail',NULL,'aɪ','AI','AI','k','m')
      `).run();
      db.prepare("INSERT INTO runtime_key(language,channel,key_value) VALUES('de','writer_right_edge','aɪ-k')").run();
      const keyId=Number(db.prepare("SELECT key_id FROM runtime_key WHERE channel='writer_right_edge'").get().key_id);
      db.prepare('INSERT INTO runtime_key_member(key_id,target_id) VALUES(?,?)').run(keyId,2);
      db.prepare(`
        INSERT INTO runtime_de_writer_candidate(
          key_value,pronunciation_id,normalized,syllable_count,usage_rank,historical,
          core_preferred,all_preferred,canonical_available,generated_available,generated_only,source_order
        ) VALUES('aɪ-k',2,'krankenscheindrucker',1,NULL,0,0,1,0,1,1,2)
      `).run();

      db.prepare(`
        INSERT INTO runtime_surface_morphology(
          surface_id,policy,status,family_key,construction_rule,analysis_count,stored_positive_count,supported_family_count
        ) VALUES(1,'de-attested-right-head-v4','attested_right_head_candidate','right:zeit',NULL,1,1,1)
      `).run();

      surface(db,{id:3,language:'en',normalized:'time',surface:'time',core:true,usageRank:1});
      pron(db,{id:3,surfaceId:3,core:true,ipa:'taɪm',phonemes:'t aɪ m'});
      lexicalProfile(db,{surfaceId:3,pronunciationId:3,language:'en',source:'cmudict',zipf:6.1});

      surface(db,{id:4,language:'en',normalized:'chime',surface:'chime',generated:true});
      pron(db,{id:4,surfaceId:4,generated:true,ipa:'tʃaɪm',phonemes:'tʃ aɪ m'});
      lexicalProfile(db,{surfaceId:4,pronunciationId:4,language:'en',generated:true,source:'espeak_ng_generated_secondary',zipf:3.1});
      db.prepare("INSERT INTO runtime_key(language,channel,key_value) VALUES('en','exact_tail','tail')").run();
      const enKeyId=Number(db.prepare("SELECT key_id FROM runtime_key WHERE language='en' AND channel='exact_tail'").get().key_id);
      db.prepare('INSERT INTO runtime_key_member(key_id,target_id) VALUES(?,?)').run(enKeyId,4);
      db.prepare(`
        INSERT INTO runtime_en_key_candidate(
          channel,key_value,pronunciation_id,surface_id,source_order,
          canonical_available,generated_available,default_eligible
        ) VALUES('exact_tail','tail',4,4,4,0,1,1)
      `).run();

      surface(db,{id:5,language:'de',normalized:'bei klarer reise',surface:'bei klarer Reise',core:true,role:'phrase'});
      pron(db,{id:5,surfaceId:5,core:true,ipa:'baɪ klaːʁɐ ʁaɪzə',phonemes:'b aɪ k l a ʁ ɐ ʁ aɪ z ə',stress:'01010',syllables:5,exact:'tail-reise',vowel:'aɪ-a',family:'AI-A',coda:'z ə'});
      db.prepare(`
        INSERT INTO runtime_phrase(
          runtime_phrase_id,source_layer,source_phrase_id,source_phrase_pronunciation_id,source_surface,
          surface_id,pronunciation_id,canonical_available,generated_available,phrase_types_json,
          historical_state,modern_eligible,commonness_score,style_tags_json,evidence_ready
        ) VALUES(1,'core','phrase-1','pp-1','bei klarer Reise',5,5,1,0,'["idiom"]','current_or_unmarked',1,1.2,'["modern"]',1)
      `).run();
      db.prepare("INSERT INTO runtime_phrase_profile VALUES(1,3,1,'[2]','[]')").run();
      db.prepare(`
        INSERT INTO runtime_phrase_window(
          runtime_window_id,runtime_phrase_id,source_window_id,syllable_start,syllable_end,syllable_count,
          phoneme_start,phoneme_end,phoneme_count,token_start_index,token_end_index,token_count,
          crossed_word_boundaries,starts_inside_token,ends_inside_token,phoneme_key,vowel_key,stress_pattern,
          final_coda_key,exact_tail_key,final_nucleus,final_coda_class,vowel_family_key,
          canonical_available,generated_available
        ) VALUES('core:w1',1,'w1',0,2,2,0,4,4,0,1,2,1,0,0,'b aɪ','aɪ-a','10','z ə','tail-reise','ə','OPEN','AI-A',1,0)
      `).run();
      db.prepare(`
        INSERT INTO runtime_phrase_window(
          runtime_window_id,runtime_phrase_id,source_window_id,syllable_start,syllable_end,syllable_count,
          phoneme_start,phoneme_end,phoneme_count,token_start_index,token_end_index,token_count,
          crossed_word_boundaries,starts_inside_token,ends_inside_token,phoneme_key,vowel_key,stress_pattern,
          final_coda_key,exact_tail_key,final_nucleus,final_coda_class,vowel_family_key,
          canonical_available,generated_available
        )
        SELECT
          'core:w0',runtime_phrase_id,'w0',syllable_start,syllable_end,syllable_count,
          phoneme_start,phoneme_end,phoneme_count,token_start_index,token_end_index,token_count,
          crossed_word_boundaries,starts_inside_token,ends_inside_token,phoneme_key,vowel_key,stress_pattern,
          final_coda_key,exact_tail_key,final_nucleus,final_coda_class,vowel_family_key,
          canonical_available,generated_available
        FROM runtime_phrase_window WHERE runtime_window_id='core:w1'
      `).run();
      db.prepare(`
        INSERT INTO runtime_target(
          target_id,target_kind,language,pronunciation_id,runtime_phrase_id,runtime_window_id,
          syllable_count,canonical_available,generated_available,canonical_preferred,generated_preferred
        ) VALUES
          (100,'phrase_window','de',5,1,'core:w1',2,1,0,1,0),
          (101,'phrase_window','de',5,1,'core:w0',2,1,0,1,0)
      `).run();
      db.prepare(
        "INSERT INTO runtime_key(language,channel,key_value) VALUES('de','phrase_exact_tail',?)"
      ).run(phraseAnchor.exactTailKey);
      const phraseKeyId=Number(db.prepare("SELECT key_id FROM runtime_key WHERE channel='phrase_exact_tail'").get().key_id);
      db.prepare('INSERT INTO runtime_key_member(key_id,target_id) VALUES(?,?)').run(phraseKeyId,100);
      db.prepare('INSERT INTO runtime_key_member(key_id,target_id) VALUES(?,?)').run(phraseKeyId,101);
      db.prepare("INSERT INTO runtime_phrase_usage VALUES(1,'deu_news_2024_1M',1,1,1,1)").run();
      db.prepare('INSERT INTO runtime_phrase_attestation VALUES(?,?,?)').run(1,1,'["modern"]');
      db.prepare(
        'INSERT INTO runtime_phrase_ranking_evidence(runtime_phrase_id,evidence_json) VALUES(?,?)'
      ).run(1,JSON.stringify({
        commonness:{
          policy:'leipzig-equal-weight-log1p-per-million-sentences-v1',
          corpusCount:1,occurrenceSum:1,sentenceSum:1,
          equalWeightCommonness:Number((Math.log1p(1)/3).toFixed(6)),
          corpora:{},
        },
        styleTags:['modern'],
      }));

      db.prepare("INSERT INTO runtime_entity_identity VALUES(1,'Q1','group.music_group',0.9,0.9,'A')").run();
      db.prepare("INSERT INTO runtime_entity_category VALUES(1,'group.music_group',0.9,1,0.9,'A',0,1)").run();
      db.prepare("INSERT INTO runtime_entity_name VALUES(1,1,1,'Zeit','zeit','de','auto','label',1,1,'wikidata','Q1')").run();
      db.prepare("INSERT INTO runtime_entity_name VALUES(2,1,1,'Zeit','zeit','en','auto','label',1,1,'wikidata','Q1')").run();
      db.prepare(`
        INSERT INTO runtime_entity_pronunciation(
          product_pronunciation_id,name_id,serving_pronunciation_id,source_priority,locale,
          pronunciation_role,ipa,preferred,source_kind,source_record,generated,review_state
        ) VALUES(1,1,1,10,'de-DE','source','tsaɪt',1,'wikidata_p898','Q1',0,'accepted_source_backed')
      `).run();
      db.prepare(`
        INSERT INTO runtime_entity_pronunciation(
          product_pronunciation_id,name_id,serving_pronunciation_id,source_priority,locale,
          pronunciation_role,ipa,preferred,source_kind,source_record,generated,review_state
        ) VALUES(2,1,1,20,'de-DE','source','tsaɪt',0,'serving_core_absorbed','generated:Q1',0,'accepted')
      `).run();
      db.prepare("INSERT INTO runtime_entity_writer_anchor VALUES('de-ipa-v2','writer_secondary_anchor','aɪ-t',1)").run();
      db.prepare(`
        INSERT INTO runtime_entity_analysis(
          product_pronunciation_id,analyzer_id,phonemes_json,syllables_json,syllable_count,
          primary_stress,secondary_stress_json,stress_pattern,vowel_sequence,consonant_sequence,
          rhyme_tail,rhyme_signature
        ) VALUES(
          1,'de-ipa-v2','["t","s","aɪ","t"]',
          '[{"position":1,"onset":["t","s"],"nucleus":"aɪ","coda":["t"],"stressLevel":2}]',
          1,1,'[]','2','aɪ','t','aɪ t','aɪt'
        )
      `).run();
      db.prepare(`
        INSERT INTO runtime_entity_analysis(
          product_pronunciation_id,analyzer_id,phonemes_json,syllables_json,syllable_count,
          primary_stress,secondary_stress_json,stress_pattern,vowel_sequence,consonant_sequence,
          rhyme_tail,rhyme_signature
        ) VALUES(
          2,'de-ipa-v2','["t","s","aɪ","t"]',
          '[{"position":1,"onset":["t","s"],"nucleus":"aɪ","coda":["t"],"stressLevel":2}]',
          1,1,'[]','2','aɪ','t','aɪ t','aɪt'
        )
      `).run();
      db.prepare("INSERT INTO runtime_entity_anchor_occurrence VALUES('de-ipa-v2','exact_tail','aɪt',1)").run();
      db.prepare("INSERT INTO runtime_entity_anchor_occurrence VALUES('de-ipa-v2','writer_secondary_anchor','aɪ-t',1)").run();
      db.prepare("INSERT INTO runtime_entity_anchor_occurrence VALUES('de-ipa-v2','exact_tail','aɪt',2)").run();
      db.prepare("INSERT INTO runtime_entity_anchor_occurrence VALUES('de-ipa-v2','writer_secondary_anchor','aɪ-t',2)").run();
      db.prepare(`
        INSERT INTO runtime_entity_anchor_ranked(
          analyzer_id,channel,anchor_key,product_pronunciation_id,language,locale,
          canonical_available,generated_available,popularity_score,name_preferred,qid,name_id
        ) VALUES
          ('de-ipa-v2','exact_tail','aɪt',1,'de','de-DE',1,0,0.9,1,'Q1',1),
          ('de-ipa-v2','writer_secondary_anchor','aɪ-t',1,'de','de-DE',1,0,0.9,1,'Q1',1),
          ('de-ipa-v2','exact_tail','aɪt',2,'de','de-DE',1,0,0.9,0,'Q1',1),
          ('de-ipa-v2','writer_secondary_anchor','aɪ-t',2,'de','de-DE',1,0,0.9,0,'Q1',1)
      `).run();
    }finally{db.close();}

    const runtime=openServingV1ProductRuntime(path);
    try{
      const coreState=servingV1ProductRuntimeState(runtime.coreDb);
      const allState=servingV1ProductRuntimeState(runtime.allDb);
      assert.equal(coreState.available,true);
      assert.equal(allState.available,true);
      assert.equal(coreState.distribution.edition,'master');
      assert.equal(coreState.distribution.markov,false);
      assert.equal(allState.distribution.markov,false);

      assert.equal(
        Number(runtime.allDb.prepare(
          'SELECT COUNT(*) c FROM temp.serving_entity_ambiguous_name'
        ).get().c),
        2,
      );
      assert.deepEqual(
        runtime.allDb.prepare(
          'SELECT pronunciation_id,source_kind FROM entity_pronunciation ORDER BY pronunciation_id'
        ).all().map((row)=>[Number(row.pronunciation_id),row.source_kind]),
        [[1,'wikidata_p898']],
      );

      assert.equal(getWord(runtime.coreDb,'Krankenscheindrucker'),null);
      const generatedDe=getWord(runtime.allDb,'Krankenscheindrucker');
      assert.equal(generatedDe.surface,'Krankenscheindrucker');
      assert.equal(generatedDe.generatedPronunciation,true);

      const profiledDe=findWriterRhymes(runtime.allDb,'Zeit',{
        limit:10,poolLimit:50,profileStages:true,syllableFilter:'1',
      });
      assert.equal(profiledDe.status??'ok','ok');
      assert.ok(profiledDe.performanceProfile);
      assert.ok(Number.isFinite(
        profiledDe.performanceProfile.stages_ms.analysis_feature_preparation_ms
      ));
      assert.ok(Number.isFinite(
        profiledDe.performanceProfile.stages_ms.writer_phonetic_scoring_ms
      ));
      assert.ok(
        profiledDe.performanceProfile.counters.scoring_calls
        >=profiledDe.performanceProfile.counters.unique_scoring_pairs
      );
      assert.ok(Number.isFinite(
        profiledDe.performanceProfile.stages_ms.ranking_metadata_hydration_ms
      ));
      assert.ok(Number.isFinite(
        profiledDe.performanceProfile.stages_ms.selected_result_hydration_ms
      ));
      assert.ok(profiledDe.performanceProfile.counters.rich_results_hydrated>=1);
      assert.ok(
        profiledDe.performanceProfile.counters.writer_seeded_analysis_cache_entries>0,
        'Serving-v1 Writer must seed base analysis evidence from thin scoring rows',
      );
      assert.ok(
        profiledDe.performanceProfile.counters.writer_seeded_prepared_cache_entries>0,
        'Serving-v1 short mode must seed prepared Writer evidence',
      );
      assert.ok(
        profiledDe.performanceProfile.counters.writer_seeded_score_cache_entries>0,
        'Serving-v1 short mode must seed Writer scores using pronunciation-id keys',
      );
      assert.ok(profiledDe.results.every((row)=>typeof row.word==='string'&&row.word.length>0));
      assert.ok(profiledDe.results.every((row)=>typeof row.ipa==='string'&&row.ipa.length>0));
      assert.ok(profiledDe.results.every((row)=>!('_pronunciationId' in row)));
      assert.ok(profiledDe.results.every((row)=>!('_scoreObject' in row)));

      for(const [mode,db] of [
        ['core',runtime.coreDb],
        ['all',runtime.allDb],
      ]){
        const optimized=findWriterRhymes(db,'Zeit',{
          limit:10,
          poolLimit:50,
        });
        const fullScorer=findWriterRhymes(db,'Zeit',{
          limit:10,
          poolLimit:50,
          disableSafePrefilter:true,
        });
        assert.deepEqual(
          optimized,
          fullScorer,
          `safe scorer prefilter changed Serving-v1 ${mode} Writer response`,
        );
      }

      assert.equal(getEnglishWord(runtime.coreDb,'chime'),null);
      assert.equal(getEnglishWord(runtime.allDb,'chime').generatedPronunciation,true);

      const englishSearch=searchEnglishWriter(runtime.allDb,'time',{generatedOnly:true,limit:10});
      assert.equal(englishSearch.status,'ok');
      assert.ok(englishSearch.results.some((row)=>row.normalized==='chime'));

      const phraseRetrieval=retrievePhraseMosaicCandidatesV2(runtime.coreDb,phraseQueryIpa,{
        perChannelLimit:1,maxCandidates:16,includeWeakUnrelated:true,
      });
      const phraseEvidence=enrichPhraseMosaicCandidates(runtime.coreDb,'Liebe',phraseRetrieval);
      assert.equal(phraseEvidence.retrievalCandidateCount,phraseRetrieval.candidates.length);
      assert.equal(phraseRetrieval.bounds.channelsPerAnchor,5);
      assert.equal(phraseRetrieval.retrieval.rawAnchorWindowMatches,1);
      assert.equal(phraseRetrieval.candidates.length,1);
      assert.equal(phraseRetrieval.candidates[0].windowId,'w0');

      const phraseStats=getPhraseBrowserStats(runtime.coreDb);
      assert.equal(phraseStats.phrases,1);
      assert.equal(phraseStats.sources.length,1);
      const phraseDetail=getPhraseDetail(runtime.coreDb,'phrase-1');
      assert.equal(phraseDetail.canonical,'bei klarer Reise');
      assert.deepEqual(phraseDetail.tokens,[]);

      const entitySearch=searchEntityRhymes(runtime.coreDb,{
        surface:'Testwort',
        preferredIpa:'tsaɪt',
        syllableCount:1,
        language:'de',
      },{
        language:'de',limit:10,poolLimit:16,profileStages:true,
      });
      assert.equal(entitySearch.available,true);
      assert.deepEqual(
        entitySearch.results.map((row)=>row.pronunciationSource),
        ['wikidata_p898'],
      );
      assert.ok(Number.isFinite(
        entitySearch.performanceProfile.stages_ms.anchor_lookup_ms
      ));
      assert.ok(Number.isFinite(
        entitySearch.performanceProfile.stages_ms.anchor_hydration_ms
      ));
      assert.ok(Number.isFinite(
        entitySearch.performanceProfile.stages_ms.category_hydration_ms
      ));
      assert.ok(Number.isFinite(
        entitySearch.performanceProfile.stages_ms.ranking_diversity_ms
      ));

      const state=materializedWriterRuntimeState(runtime.allDb);
      assert.equal(state.active,true);
      assert.equal(state.servingV1,true);
      const rows=lookupMaterializedWriterAnchorRows(runtime.allDb,'aɪ-k',{
        queryNormalized:'zeit',querySyllables:1,generatedOnly:true,
      });
      assert.deepEqual(rows.map((row)=>row.normalized),['krankenscheindrucker']);
      const compatibilityRow=runtime.allDb.prepare('SELECT * FROM hot WHERE id=2').get();
      const writerFields=[
        'id','surface','normalized','usage_rank','usage_score','usage_count','usage_source_count',
        'lemma','pos','lexicon_layer','entity_kind','historical','lexical_tags','ipa','syllable_count',
        'pronunciation_rank','pronunciation_preferred','pronunciation_source','pronunciation_flags',
        'locale','dialect','pronunciation_register','serving_analysis_json',
      ];
      assert.deepEqual(
        Object.fromEntries(writerFields.map((key)=>[key,rows[0][key]])),
        Object.fromEntries(writerFields.map((key)=>[key,compatibilityRow[key]])),
      );

      const morph=resolveMaterializedWriterMorphologyBatch(runtime.coreDb,[{normalized:'zeit'}]);
      assert.equal(morph.get('zeit').familyKey,'right:zeit');

      const capabilities=unifiedWriterCapabilities(runtime.allDatabases);
      assert.equal(capabilities.languages.de.wordWriter,true);
      assert.equal(capabilities.languages.de.phraseMosaic,true);
      assert.equal(capabilities.languages.de.entityRhymes,true);
      assert.equal(capabilities.languages.en.wordWriter,true);

      const parallel=createServingV1ParallelWriterRuntime(path);
      try{
        await parallel.ready();
        const parallelOptions={
          language:'de',
          resultLanguage:'de',
          scope:'all',
          type:'all',
          wordLimit:10,
          wordPoolLimit:50,
          phraseLimit:10,
          phrasePoolLimit:16,
          phrasePerChannelLimit:4,
          entityLimit:10,
          entityPoolLimit:16,
        };
        const serialCore=searchUnifiedWriter(
          runtime.coreDatabases,
          'Zeit',
          parallelOptions,
        );
        const parallelCore=await parallel.search(
          'Zeit',
          parallelOptions,
          {generatedOverlay:false},
        );
        assert.deepEqual(parallelCore,serialCore);

        const serialAll=searchUnifiedWriter(
          runtime.allDatabases,
          'Zeit',
          parallelOptions,
        );
        const parallelAll=await parallel.search(
          'Zeit',
          parallelOptions,
          {generatedOverlay:true},
        );
        assert.deepEqual(parallelAll,serialAll);
        assert.equal(parallel.health().workers,5);
        assert.equal(parallel.health().caching,false);
      }finally{
        await parallel.close();
      }

      const generatedOnlyCount=runtime.allDb.prepare(`
        SELECT COUNT(*) c FROM entity_pronunciation WHERE source_kind='espeak_ng_generated_secondary'
      `).get().c;
      assert.equal(Number(generatedOnlyCount),0,'Core entity pronunciation must not become Generated');
    }finally{
      runtime.close();
    }

    const invalid=new DatabaseSync(path);
    try{
      meta(invalid,'product_adapter_revision','stale-product-revision');
      let state=servingV1ProductRuntimeState(invalid);
      assert.equal(state.available,false);
      assert.equal(state.reason,'serving_v1_product_revision_mismatch');

      meta(invalid,'product_adapter_revision',SERVING_V1_PRODUCT_REVISION);
      meta(invalid,'product_adapter_identity_revision','stale-identity-revision');
      state=servingV1ProductRuntimeState(invalid);
      assert.equal(state.available,false);
      assert.equal(state.reason,'serving_v1_product_identity_revision_mismatch');
    }finally{
      invalid.close();
    }
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
