import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARALLEL_WRITER_CHANNELS,
  PARALLEL_WRITER_EXECUTION,
  mergeParallelUnifiedWriterResponses,
  parallelWriterTaskSpecs,
} from '../src/unified-writer-parallel.mjs';

test('parallel Writer fans a DE+EN all-scope search into five persistent channels',()=>{
  assert.deepEqual(
    parallelWriterTaskSpecs({
      language:'both',
      resultLanguage:'both',
      scope:'all',
    }).map((row)=>row.channel),
    PARALLEL_WRITER_CHANNELS,
  );
});

test('parallel Writer dispatch is scope and result-language aware',()=>{
  assert.deepEqual(
    parallelWriterTaskSpecs({
      language:'de',
      resultLanguage:'de',
      scope:'words',
    }).map((row)=>row.channel),
    ['words_de'],
  );
  assert.deepEqual(
    parallelWriterTaskSpecs({
      language:'de',
      resultLanguage:'en',
      scope:'phrases',
    }).map((row)=>[row.channel,row.options.resultLanguage]),
    [['phrases_de','en']],
  );
  assert.deepEqual(
    parallelWriterTaskSpecs({
      language:'both',
      resultLanguage:'en',
      scope:'entities',
    }).map((row)=>row.channel),
    ['entities_en'],
  );
});

function baseResponse({
  resultLanguageBasis,
  scope,
  wordDe=[],
  wordEn=[],
  entityDe=[],
  entityEn=[],
  phrase=[],
}){
  const emptyWord=(language)=>({
    available:true,
    reason:null,
    rankingPolicy:'rank-'+language,
    writerRetrieval:language==='de'
      ?{mergedCandidates:wordDe.length}
      :{normalizedCandidates:wordEn.length},
    results:language==='de'?wordDe:wordEn,
  });
  const emptyEntity=(language)=>({
    available:true,
    reason:null,
    language,
    scoredCandidateCount:language==='de'?entityDe.length:entityEn.length,
    results:language==='de'?entityDe:entityEn,
  });
  return {
    schema:'rhymelab-unified-writer-v1',
    policy:'de-unified-word-phrase-writer-v1',
    status:'ok',
    input:'x',
    languageBasis:'both',
    resultLanguageBasis,
    scope,
    generatedOnly:false,
    capabilities:{
      languages:{
        de:{available:true,wordWriter:true},
        en:{available:true,wordWriter:true},
      },
    },
    requestedLanguages:['de','en'],
    resultLanguages:resultLanguageBasis==='both'?['de','en']:[resultLanguageBasis],
    activeLanguages:['de','en'],
    activeResultLanguages:resultLanguageBasis==='both'?['de','en']:[resultLanguageBasis],
    unavailableLanguages:[],
    unavailableResultLanguages:[],
    resolvedLanguages:['de','en'],
    warnings:[],
    query:{language:'de',preferredIpa:'x'},
    queries:{
      de:{language:'de',preferredIpa:'x'},
      en:{language:'en',preferredIpa:'x'},
    },
    ordering:{},
    channels:{
      words:{
        available:true,
        reason:null,
        rankingPolicy:'rank',
        byLanguage:{
          de:emptyWord('de'),
          en:emptyWord('en'),
        },
        results:[...wordDe,...wordEn],
      },
      phrases:{
        available:true,
        reason:null,
        candidateCount:phrase.length,
        results:phrase,
      },
      entities:{
        available:true,
        reason:null,
        byLanguage:{
          de:emptyEntity('de'),
          en:emptyEntity('en'),
        },
        results:[...entityDe,...entityEn],
      },
    },
    results:[...wordDe,...wordEn,...phrase,...entityDe,...entityEn],
    counts:{},
    performanceProfile:{
      stages_ms:{query_de:1},
      counters:{},
      total_ms:1,
    },
  };
}

test('parallel Writer merge preserves channel ordering and uses wall time',()=>{
  const deWord={resultKind:'word',language:'de',normalized:'de',channelRank:1};
  const enWord={resultKind:'word',language:'en',normalized:'en',channelRank:1};
  const phrase={resultKind:'phrase',language:'de',normalized:'phrase',channelRank:1};
  const deEntity={resultKind:'entity',language:'de',normalized:'de-entity',channelRank:1};
  const enEntity={resultKind:'entity',language:'en',normalized:'en-entity',channelRank:1};

  const responses={
    words_de:baseResponse({
      resultLanguageBasis:'de',
      scope:'words',
      wordDe:[deWord],
    }),
    words_en:baseResponse({
      resultLanguageBasis:'en',
      scope:'words',
      wordEn:[enWord],
    }),
    phrases_de:baseResponse({
      resultLanguageBasis:'both',
      scope:'phrases',
      phrase:[phrase],
    }),
    entities_de:baseResponse({
      resultLanguageBasis:'de',
      scope:'entities',
      entityDe:[deEntity],
    }),
    entities_en:baseResponse({
      resultLanguageBasis:'en',
      scope:'entities',
      entityEn:[enEntity],
    }),
  };

  const merged=mergeParallelUnifiedWriterResponses(
    responses,
    'x',
    {
      language:'both',
      resultLanguage:'both',
      scope:'all',
      profileStages:true,
    },
    {generatedOverlay:false,totalMs:12.3456},
  );

  assert.deepEqual(
    merged.results.map((row)=>[
      row.resultKind,
      row.language,
      row.normalized,
    ]),
    [
      ['word','de','de'],
      ['word','en','en'],
      ['phrase','de','phrase'],
      ['entity','de','de-entity'],
      ['entity','en','en-entity'],
    ],
  );
  assert.equal(merged.counts.words,2);
  assert.equal(merged.counts.phrases,1);
  assert.equal(merged.counts.entities,2);
  assert.equal(merged.performanceProfile.total_ms,12.346);
  assert.equal(
    merged.performanceProfile.execution,
    PARALLEL_WRITER_EXECUTION,
  );
});


test('parallel merge absorbs same-surface Entities into the word result',()=>{
  const word={
    resultKind:'word',language:'en',normalized:'rain',word:'Rain',
    surface:'Rain',ipa:'reɪn',channelRank:1,
  };
  const singer={
    resultKind:'entity',language:'en',normalized:'rain',word:'Rain',
    surface:'Rain',ipa:'reɪn',channelRank:1,entityQid:'Q1',
    primaryCategory:'person.singer',
    entityCategories:[{category:'person.singer'}],
  };
  const game={
    resultKind:'entity',language:'en',normalized:'rain',word:'Rain',
    surface:'Rain',ipa:'reɪn',channelRank:2,entityQid:'Q2',
    primaryCategory:'work.video_game',
    entityCategories:[{category:'work.video_game'}],
  };
  const responses={
    words_en:baseResponse({
      resultLanguageBasis:'en',
      scope:'words',
      wordEn:[word],
    }),
    entities_en:baseResponse({
      resultLanguageBasis:'en',
      scope:'entities',
      entityEn:[singer,game],
    }),
  };
  const merged=mergeParallelUnifiedWriterResponses(
    responses,
    'rain',
    {language:'en',resultLanguage:'en',scope:'all'},
    {generatedOverlay:false,totalMs:1},
  );
  assert.equal(merged.results.length,1);
  assert.equal(merged.results[0].resultKind,'word');
  assert.deepEqual(
    merged.results[0].entityCategories.map((entry)=>entry.category),
    ['person.singer','work.video_game'],
  );
  assert.equal(merged.counts.entities,0);
  assert.equal(merged.counts.words,1);
});
