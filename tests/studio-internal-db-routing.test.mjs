import test from 'node:test';
import assert from 'node:assert/strict';

import {createWriterSearchClient} from '../src/studio/search-adapter.mjs';
import {createStudioDetailClient} from '../src/studio/detail-adapter.mjs';
import {createStudioAnalysisClient} from '../src/studio/analysis-adapter.mjs';
import {loadStudioCapabilities} from '../src/studio/capability-adapter.mjs';

function response(payload,{status=200}={}){
  return {
    ok:status>=200&&status<300,
    status,
    async json(){return payload},
  };
}

test('Studio Writer sends selected runtime_db and preserves backend identity',async()=>{
  const urls=[];
  const client=createWriterSearchClient({
    fetchImpl:async(url)=>{
      urls.push(String(url));
      return response({
        status:'ok',
        results:[{word:'Reise',resultKind:'word',language:'de',resultId:'1'}],
        query:{syllableCount:2,ipa:'x'},
        queries:{de:{ipa:'x'}},
        capabilities:{languages:{de:{available:true}}},
        runtimeTiming:{searchMs:3.4,averageLast100Ms:4.2,sampleCount:7},
        runtimeDb:'lite',
        runtimeExecution:'direct-internal-db-lab',
      });
    },
  });

  const result=await client.search({
    query:'Weise',
    queryBasis:'de',
    resultLanguage:'de',
    generated:false,
    runtimeDb:'lite',
  });

  assert.equal(urls.length,1);
  const requestUrl=new URL(urls[0],'http://local/');
  assert.equal(requestUrl.searchParams.get('runtime_db'),'lite');
  assert.equal(requestUrl.searchParams.get('studio'),'1');
  assert.equal(result.effectiveRequest.runtime_db,'lite');
  assert.equal(result.effectiveRequest.studio,'1');
  assert.equal(result.runtimeDb,'lite');
  assert.equal(result.runtimeExecution,'direct-internal-db-lab');
  assert.ok(result.clientTiming.roundTripMs>=0);
  assert.ok(result.clientTiming.parseMs>=0);
  assert.ok(result.clientTiming.mapMs>=0);
});

test('Studio detail lookup stays on selected runtime DB',async()=>{
  const urls=[];
  const client=createStudioDetailClient({
    fetchImpl:async(url)=>{
      urls.push(String(url));
      return response({surface:'Reise',preferredIpa:'x'});
    },
  });
  await client.load({
    kind:'word',
    lang:'de',
    id:'1',
    word:'Reise',
    raw:{resultKind:'word'},
  },{runtimeDb:'standard'});

  assert.equal(
    new URL(urls[0],'http://local/').searchParams.get('runtime_db'),
    'standard',
  );
});

test('Studio song analysis stays on selected runtime DB',async()=>{
  let url='';
  const client=createStudioAnalysisClient({
    fetchImpl:async(value)=>{
      url=String(value);
      return response({scheme:['A'],coverage:{resolved:1,unique:1}});
    },
  });
  await client.analyze(['Das ist Weise'],{
    language:'de',
    runtimeDb:'full',
  });
  assert.equal(new URL(url,'http://local/').searchParams.get('runtime_db'),'full');
});

test('Studio capability probes use the same selected runtime DB',async()=>{
  const urls=[];
  await loadStudioCapabilities({
    runtimeDb:'lite',
    fetchImpl:async(url)=>{
      urls.push(String(url));
      if(String(url).startsWith('/api/health')){
        return response({
          status:'ok',
          serving_v1:{enabled:true},
          writer_database:'lite.sqlite',
          english_available:true,
          phrase_available:false,
          entity_available:false,
          generated_optin:{available:false,default_enabled:false},
        });
      }
      return response({
        totals:{core:50000,generated:0,total:50000,consistent:true},
      });
    },
  });
  assert.equal(urls.length,2);
  for(const url of urls){
    assert.equal(new URL(url,'http://local/').searchParams.get('runtime_db'),'lite');
  }
});


test('Studio benchmark profiling is explicit and does not leak into normal requests',async()=>{
  const urls=[];
  const client=createWriterSearchClient({
    fetchImpl:async(url)=>{
      urls.push(String(url));
      return response({
        status:'ok',
        results:[],
        query:{syllableCount:1,ipa:'x'},
        queries:{de:{ipa:'x'}},
        capabilities:{languages:{de:{available:true}}},
        runtimeDb:'full',
      });
    },
  });

  await client.search({query:'Zeit',queryBasis:'de',resultLanguage:'de',runtimeDb:'full'});
  await client.search({
    query:'Zeit',
    queryBasis:'de',
    resultLanguage:'de',
    runtimeDb:'full',
    internalProfile:true,
  });

  const normal=new URL(urls[0],'http://local/');
  const profiled=new URL(urls[1],'http://local/');
  assert.equal(normal.searchParams.get('studio'),'1');
  assert.equal(normal.searchParams.has('profile'),false);
  assert.equal(profiled.searchParams.get('studio'),'1');
  assert.equal(profiled.searchParams.get('profile'),'1');
});
