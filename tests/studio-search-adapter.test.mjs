import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWriterParams,
  createWriterSearchClient,
  resolvedRightEdgeComponent,
  writerScope,
} from '../src/studio/search-adapter.mjs';

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

test('Studio preserves explicit Writer scope filters instead of collapsing them to all',()=>{
  assert.equal(writerScope('words'),'words');
  assert.equal(writerScope('phrases'),'phrases');
  assert.equal(writerScope('entities'),'entities');
  assert.equal(writerScope('word'),'words');
  assert.equal(writerScope('phrase'),'phrases');
  assert.equal(writerScope('entity'),'entities');

  assert.equal(buildWriterParams({query:'abends',scope:'words'}).get('scope'),'words');
  assert.equal(buildWriterParams({query:'abends',scope:'phrases'}).get('scope'),'phrases');
  assert.equal(buildWriterParams({query:'abends',scope:'entities'}).get('scope'),'entities');
});

test('Studio extracts a nested right-edge compound from a multi-token resolver chain',()=>{
  assert.equal(resolvedRightEdgeComponent({
    method:'client_token_chain',
    tokens:[
      {surface:'Eins',method:'client_source_reference'},
      {
        surface:'Murmeltierabende',
        method:'client_mixed_reference_compound_right_edge',
        components:['murmeltier','Abende'],
      },
    ],
  }),'Abende');
});

test('Studio transports Murmeltierabende right edge through a multi-token resolver retry',async()=>{
  const calls=[];
  let writerAttempt=0;
  const sourceIpa=new Map([
    ['eins',{surface:'Eins',preferredIpa:'ˈaɪns'}],
    ['zwei',{surface:'Zwei',preferredIpa:'ˈtsvaɪ'}],
    ['drei',{surface:'Drei',preferredIpa:'ˈdRaɪ'}],
    ['vier',{surface:'Vier',preferredIpa:'ˈfiːɐ'}],
    ['abende',{surface:'Abende',preferredIpa:'ˈaːbəntə'}],
  ]);
  const fetchImpl=async(url)=>{
    const target=new URL(String(url),'http://rhyme-bureau.test');
    calls.push(target);
    if(target.pathname.startsWith('/api/word/')){
      const surface=decodeURIComponent(target.pathname.slice('/api/word/'.length))
        .toLocaleLowerCase('de-DE');
      const detail=sourceIpa.get(surface);
      return detail
        ?jsonResponse(200,detail)
        :jsonResponse(404,{error:'Word not found'});
    }
    if(target.pathname==='/api/writer'){
      writerAttempt+=1;
      if(writerAttempt===1){
        return jsonResponse(404,{
          status:'query_not_found',
          queries:{de:null,en:null},
          capabilities:{languages:{de:{available:true},en:{available:false}}},
          results:[],
          warnings:[],
        });
      }
      assert.equal(target.searchParams.get('query_method_de'),'client_token_chain');
      assert.equal(target.searchParams.get('query_right_edge_de'),'Abende');
      return jsonResponse(200,{
        status:'ok',
        query:{
          kind:'phrase',
          language:'de',
          surface:'Eins Zwei Drei Vier Murmeltierabende',
          preferredIpa:target.searchParams.get('query_ipa_de'),
          ipa:target.searchParams.get('query_ipa_de'),
          syllableCount:9,
          generatedPronunciation:true,
        },
        queries:{de:{preferredIpa:target.searchParams.get('query_ipa_de')},en:null},
        capabilities:{languages:{de:{available:true},en:{available:false}}},
        results:[{
          resultKind:'word',
          language:'de',
          resultId:'spende',
          word:'Spende',
          normalized:'spende',
          syllableCount:2,
          primaryType:'slant',
          score:.9,
        }],
        warnings:[],
      });
    }
    throw new Error('Unexpected request: '+target.pathname);
  };

  const client=createWriterSearchClient({fetchImpl});
  const result=await client.search({
    query:'Eins Zwei Drei Vier Murmeltierabende',
    queryBasis:'de',
    resultLanguage:'de',
    scope:'words',
    queryPronunciationRevision:'test-nested-compound',
  });

  const writerCalls=calls.filter((url)=>url.pathname==='/api/writer');
  assert.equal(writerCalls.length,2);
  assert.equal(writerCalls[1].searchParams.get('query_right_edge_de'),'Abende');
  assert.equal(result.status,'ready');
  assert.equal(result.rows[0].word,'Spende');
});

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

test('Studio retries GROWTHHORMONPRODUCER with DE and EN right-edge query pronunciations',async()=>{
  const calls=[];
  let writerAttempt=0;
  const fetchImpl=async(url)=>{
    const target=new URL(String(url),'http://rhyme-bureau.test');
    calls.push(target);

    if(target.pathname.startsWith('/api/word/')){
      const surface=decodeURIComponent(target.pathname.slice('/api/word/'.length)).toLocaleLowerCase('en-US');
      const language=target.searchParams.get('language');
      if(surface==='producer'){
        return language==='en'
          ?jsonResponse(200,{surface:'producer',preferredIpa:'pɹəˈdusɚ'})
          :jsonResponse(200,{surface:'Producer',preferredIpa:'pRoˈduːtsɐ'});
      }
      return jsonResponse(404,{error:'Word not found'});
    }

    if(target.pathname==='/api/writer'){
      writerAttempt+=1;
      const de=target.searchParams.get('query_ipa_de');
      const en=target.searchParams.get('query_ipa_en');
      if(writerAttempt===1){
        assert.equal(de,null);
        assert.equal(en,null);
        return jsonResponse(404,{
          status:'query_not_found',
          queries:{de:null,en:null},
          capabilities:{languages:{de:{available:true},en:{available:true}}},
          results:[],
          warnings:[],
        });
      }

      assert.ok(de);
      assert.ok(en);
      assert.equal(
        target.searchParams.get('query_method_de'),
        'client_mixed_reference_compound_right_edge',
      );
      assert.equal(
        target.searchParams.get('query_method_en'),
        'client_mixed_reference_compound_right_edge',
      );
      return jsonResponse(200,{
        status:'ok',
        query:{
          kind:'word',
          language:'de',
          surface:'GROWTHHORMONPRODUCER',
          preferredIpa:de,
          ipa:de,
          syllableCount:6,
          generatedPronunciation:true,
        },
        queries:{
          de:{
            kind:'word',
            language:'de',
            surface:'GROWTHHORMONPRODUCER',
            preferredIpa:de,
            ipa:de,
            syllableCount:6,
            generatedPronunciation:true,
          },
          en:{
            kind:'word',
            language:'en',
            surface:'GROWTHHORMONPRODUCER',
            preferredIpa:en,
            ipa:en,
            syllableCount:6,
            generatedPronunciation:true,
          },
        },
        capabilities:{languages:{de:{available:true},en:{available:true}}},
        results:[{
          resultKind:'word',
          language:'en',
          resultId:'producer-rhyme',
          word:'reproducer',
          normalized:'reproducer',
          syllableCount:4,
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
    query:'GROWTHHORMONPRODUCER',
    queryBasis:'both',
    resultLanguage:'both',
    scope:'words',
    queryPronunciationRevision:'test-v4',
  });

  const writerCalls=calls.filter((url)=>url.pathname==='/api/writer');
  assert.equal(writerCalls.length,2);
  assert.ok(writerCalls[1].searchParams.get('query_ipa_de'));
  assert.ok(writerCalls[1].searchParams.get('query_ipa_en'));
  assert.equal(result.status,'ready');
  assert.equal(result.rows[0].word,'reproducer');
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
