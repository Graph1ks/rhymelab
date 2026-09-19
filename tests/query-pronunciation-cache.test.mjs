import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUERY_PRONUNCIATION_CACHE_SCHEMA,
  buildGeneratedPronunciationCacheRecord,
  generatedPronunciationCacheKey,
  isGeneratedPronunciationCacheRecordUsable,
} from '../src/ui/query-pronunciation-cache.mjs';
import {
  CLIENT_QUERY_PRONUNCIATION_POLICY,
  resolveUnknownClientPronunciation,
} from '../src/ui/query-pronunciation-client.mjs';

test('persistent pronunciation cache records are revision- and policy-gated',()=>{
  const detail={
    language:'de',
    surface:'Baladur',
    normalized:'baladur',
    ipa:'ˈbaladʊR',
    method:'client_rules',
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    sourceBacked:false,
  };
  const record=buildGeneratedPronunciationCacheRecord(
    detail,
    'db-revision-a',
    123456,
  );
  assert.ok(record);
  assert.equal(record.schema,QUERY_PRONUNCIATION_CACHE_SCHEMA);
  assert.equal(record.key,generatedPronunciationCacheKey('Baladur','de'));
  assert.equal(record.createdAt,123456);

  assert.equal(isGeneratedPronunciationCacheRecordUsable(record,{
    surface:'Baladur',
    language:'de',
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    databaseRevision:'db-revision-a',
  }),true);

  assert.equal(isGeneratedPronunciationCacheRecordUsable(record,{
    surface:'Baladur',
    language:'de',
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    databaseRevision:'db-revision-b',
  }),false);

  assert.equal(isGeneratedPronunciationCacheRecordUsable(record,{
    surface:'Baladur',
    language:'de',
    policy:'client-total-query-pronunciation-future',
    databaseRevision:'db-revision-a',
  }),false);
});

test('exact source-backed pronunciation is never written as generated cache truth',()=>{
  const record=buildGeneratedPronunciationCacheRecord({
    language:'de',
    surface:'heute',
    normalized:'heute',
    ipa:'ˈhɔʏtə',
    method:'client_source_reference',
    policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
    sourceBacked:true,
  },'db-revision-a');
  assert.equal(record,null);
});

test('current-revision cache hit avoids recomputing an unknown token',async()=>{
  let referenceLookups=0;
  let stores=0;
  const detail=await resolveUnknownClientPronunciation('Baladur','de',{
    lookupCachedPronunciation:async()=>({
      language:'de',
      surface:'Baladur',
      normalized:'baladur',
      ipa:'ˈbaladʊR',
      method:'client_rules',
      policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
      sourceBacked:false,
      clientOnly:true,
    }),
    lookupReference:async()=>{
      referenceLookups+=1;
      return null;
    },
    storeCachedPronunciation:async()=>{
      stores+=1;
    },
  });
  assert.equal(detail.cacheHit,true);
  assert.equal(detail.ipa,'ˈbaladʊR');
  assert.equal(referenceLookups,0);
  assert.equal(stores,0);
});

test('cache miss still prefers DB reference and only stores generated fallback',async()=>{
  let stores=0;
  const known=await resolveUnknownClientPronunciation('heute','de',{
    lookupCachedPronunciation:async()=>null,
    lookupReference:async(surface)=>surface==='heute'
      ?{surface:'heute',preferredIpa:'ˈhɔʏtə'}
      :null,
    storeCachedPronunciation:async()=>{
      stores+=1;
    },
  });
  assert.equal(known.method,'client_source_reference');
  assert.equal(known.ipa,'ˈhɔʏtə');
  assert.equal(stores,0);

  const unknown=await resolveUnknownClientPronunciation('Baladur','de',{
    lookupCachedPronunciation:async()=>null,
    lookupReference:async()=>null,
    storeCachedPronunciation:async(detail)=>{
      stores+=1;
      assert.equal(detail.method,'client_rules');
    },
  });
  assert.equal(unknown.method,'client_rules');
  assert.equal(stores,1);
});
