import test from 'node:test';
import assert from 'node:assert/strict';

import {createWriterSearchClient} from '../src/studio/search-adapter.mjs';

function jsonResponse(status,payload){
  const raw=JSON.stringify(payload);
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get:()=>null},
    async json(){return payload},
    async text(){return raw},
  };
}

test('Studio resolves an unknown German query in the client and retries the same Writer pipeline',async()=>{
  const calls=[];
  const fetchImpl=async(url)=>{
    const target=new URL(String(url),'http://rhymelab.test');
    calls.push(target);
    if(target.pathname==='/api/word/trag'){
      return jsonResponse(404,{error:'Word not found'});
    }
    if(target.pathname==='/api/writer'){
      const supplied=target.searchParams.get('query_ipa_de');
      if(!supplied){
        return jsonResponse(404,{
          status:'query_not_found',
          queries:{de:null,en:null},
          capabilities:{languages:{de:{available:true},en:{available:false}}},
          results:[],
          warnings:[],
        });
      }
      return jsonResponse(200,{
        status:'ok',
        query:{
          kind:'word',
          language:'de',
          surface:'TRAG',
          preferredIpa:supplied,
          ipa:supplied,
          syllableCount:1,
          generatedPronunciation:true,
        },
        queries:{
          de:{
            kind:'word',
            language:'de',
            surface:'TRAG',
            preferredIpa:supplied,
            ipa:supplied,
            syllableCount:1,
            generatedPronunciation:true,
          },
          en:null,
        },
        capabilities:{languages:{de:{available:true},en:{available:false}}},
        results:[{
          resultKind:'word',
          language:'de',
          resultId:'tag',
          word:'Tag',
          normalized:'tag',
          syllableCount:1,
          primaryType:'perfect',
          score:1,
        }],
        warnings:[],
      });
    }
    throw new Error('Unexpected request: '+target.pathname);
  };

  const client=createWriterSearchClient({fetchImpl});
  const result=await client.search({
    query:'TRAG',
    queryBasis:'de',
    resultLanguage:'de',
    scope:'words',
    queryPronunciationRevision:'test-revision',
  });

  const writerCalls=calls.filter((url)=>url.pathname==='/api/writer');
  assert.equal(writerCalls.length,2);
  assert.equal(calls.filter((url)=>url.pathname==='/api/word/trag').length,1);
  assert.equal(writerCalls[0].searchParams.has('query_ipa_de'),false);
  assert.equal(writerCalls[1].searchParams.get('query_ipa_de'),'ˈtRaːk');
  assert.equal(writerCalls[1].searchParams.get('query_method_de'),'client_rules');
  assert.equal(result.status,'ready');
  assert.equal(result.rows[0].word,'Tag');
  assert.equal(result.query.preferredIpa,'ˈtRaːk');
});

test('Studio never invokes the client resolver when the normal Writer request resolves the query',async()=>{
  const calls=[];
  const fetchImpl=async(url)=>{
    const target=new URL(String(url),'http://rhymelab.test');
    calls.push(target);
    if(target.pathname!=='/api/writer')throw new Error('Resolver probing must not run for known queries');
    return jsonResponse(200,{
      status:'ok',
      query:{
        kind:'word',
        language:'de',
        surface:'Tag',
        preferredIpa:'ˈtaːk',
        ipa:'ˈtaːk',
        syllableCount:1,
      },
      queries:{
        de:{
          kind:'word',
          language:'de',
          surface:'Tag',
          preferredIpa:'ˈtaːk',
          ipa:'ˈtaːk',
          syllableCount:1,
        },
        en:null,
      },
      capabilities:{languages:{de:{available:true},en:{available:false}}},
      results:[{
        resultKind:'word',
        language:'de',
        resultId:'tag',
        word:'Tag',
        normalized:'tag',
        syllableCount:1,
        primaryType:'perfect',
        score:1,
      }],
      warnings:[],
    });
  };

  const client=createWriterSearchClient({fetchImpl});
  const result=await client.search({
    query:'Tag',
    queryBasis:'de',
    resultLanguage:'de',
    scope:'words',
    queryPronunciationRevision:'test-revision',
  });

  assert.equal(calls.length,1);
  assert.equal(calls[0].pathname,'/api/writer');
  assert.equal(calls[0].searchParams.has('query_ipa_de'),false);
  assert.equal(result.rows[0].word,'Tag');
  assert.equal(result.query.preferredIpa,'ˈtaːk');
});
