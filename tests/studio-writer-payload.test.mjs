import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compactStudioWriterPayload,
  compactStudioWriterResult,
  studioWriterPayloadStats,
} from '../src/studio-writer-payload.mjs';
import {mapWriterResult} from '../packages/shared-core/src/search/search-adapter.mjs';
import {buildStudioDetailModel} from '../packages/shared-core/src/services/detail-adapter.mjs';

const heavyRow={
  resultKind:'entity',
  language:'en',
  resultId:'entity:Q1',
  word:'Bach',
  surface:'Bach',
  normalized:'bach',
  ipa:'bɑːk',
  syllableCount:1,
  syllableDistance:0,
  score:.91,
  primaryType:'perfect',
  relationTypes:['perfect','assonance'],
  relations:[
    {type:'assonance',strength:'strong',score:.82,components:{huge:'discard-me'}},
  ],
  usageRank:25,
  usageCount:1200,
  usageSourceCount:3,
  generatedPronunciation:false,
  pronunciationSource:'wikidata_p898',
  pronunciationSourceRecord:'Q1',
  pronunciationProvenance:'accepted',
  lexiconLayer:'entity',
  partOfSpeech:null,
  lemma:null,
  lexicalTags:['proper'],
  historical:false,
  phraseTypes:[],
  crossedWordBoundaries:0,
  retrievalChannels:['exact_tail'],
  primaryCategory:'person.musician',
  selectedCategory:'person.musician',
  entityCategories:['person.musician','person.actor'],
  entityQid:'Q1',
  popularityPercentile:.97,
  popularityTier:'A',
  channelRank:2,
  writerRank:2,
  phraseRankingEvidence:{very:'large',nested:Array(100).fill('not-for-studio')},
  diversitySuppression:{debug:'not-for-studio'},
  arbitraryBackendDebug:{also:'discard'},
};

test('compact Studio Writer row preserves mapped result and detail fields while dropping heavy diagnostics',()=>{
  const compact=compactStudioWriterResult(heavyRow);
  const fullMapped=mapWriterResult(heavyRow);
  const compactMapped=mapWriterResult(compact);

  assert.deepEqual(
    {
      word:compactMapped.word,
      kind:compactMapped.kind,
      lang:compactMapped.lang,
      id:compactMapped.id,
      relationType:compactMapped.relationType,
      score:compactMapped.score,
      syll:compactMapped.syll,
    },
    {
      word:fullMapped.word,
      kind:fullMapped.kind,
      lang:fullMapped.lang,
      id:fullMapped.id,
      relationType:fullMapped.relationType,
      score:fullMapped.score,
      syll:fullMapped.syll,
    },
  );

  const model=buildStudioDetailModel(compactMapped,{
    kind:'entity',
    detail:null,
    raw:compact,
    source:'writer-result',
  });
  assert.equal(model.entityQid,'Q1');
  assert.deepEqual(model.categories,['person.musician','person.actor']);
  assert.equal(model.popularity,97);
  assert.equal(model.relations[0].type,'assonance');

  assert.equal(compact.phraseRankingEvidence,undefined);
  assert.equal(compact.diversitySuppression,undefined);
  assert.equal(compact.arbitraryBackendDebug,undefined);
  assert.deepEqual(compact.relations,[{type:'assonance',strength:'strong',score:.82}]);
});

test('compact Studio Writer payload preserves result ordering, query pronunciation and capability surface',()=>{
  const payload=compactStudioWriterPayload({
    schema:'rhymelab-unified-writer-v1',
    policy:'policy',
    status:'ok',
    input:'Bach',
    languageBasis:'en',
    resultLanguageBasis:'en',
    scope:'all',
    capabilities:{languages:{en:{available:true}},entities:{categories:['person.musician']}},
    warnings:['x'],
    query:{surface:'Bach',preferredIpa:'bɑːk',syllableCount:1,huge:'drop'},
    queries:{en:{surface:'Bach',preferredIpa:'bɑːk',syllableCount:1,huge:'drop'}},
    counts:{words:1,entities:1,total:2},
    performanceProfile:{stages_ms:{words_en:1.2},total_ms:2.1},
    results:[
      {...heavyRow,resultKind:'word',resultId:'word:1',word:'Rock',entityQid:null},
      heavyRow,
    ],
    channels:{massive:{debug:Array(100).fill('drop')}},
  });

  assert.deepEqual(payload.results.map((row)=>row.resultId),['word:1','entity:Q1']);
  assert.equal(payload.queries.en.preferredIpa,'bɑːk');
  assert.equal(payload.queries.en.huge,undefined);
  assert.equal(payload.channels,undefined);
  assert.equal(payload.performanceProfile.total_ms,2.1);
  assert.deepEqual(studioWriterPayloadStats(payload),{
    total:2,
    kinds:{word:1,phrase:0,entity:1,other:0},
    languages:{de:0,en:2,other:0},
  });
});
