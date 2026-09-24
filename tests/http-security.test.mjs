import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RHYMELAB_CSP,
  assertSafeServerBinding,
  isAllowedLocalMutationRequest,
  isAllowedRequestHost,
  isCrossSiteBrowserRequest,
  publicHttpError,
  readJsonRequestBody,
  requestUrlFromTrustedBase,
  securityHeaders,
  validateRequestTarget,
} from '../src/http-security.mjs';

function requestBody(chunks,{headers={}}={}){
  return {
    headers,
    async *[Symbol.asyncIterator](){
      for(const chunk of chunks)yield Buffer.from(chunk);
    },
  };
}

test('browser security headers deny framing, objects and remote script execution',()=>{
  const headers=securityHeaders({contentType:'text/html; charset=utf-8',isHtml:true});
  assert.equal(headers['x-frame-options'],'DENY');
  assert.equal(headers['x-content-type-options'],'nosniff');
  assert.equal(headers['referrer-policy'],'no-referrer');
  assert.match(headers['content-security-policy'],/script-src 'self'/);
  assert.match(headers['content-security-policy'],/object-src 'none'/);
  assert.match(headers['content-security-policy'],/frame-ancestors 'none'/);
  assert.match(headers['content-security-policy'],/frame-src 'none'/);
  assert.match(headers['content-security-policy'],/script-src-attr 'none'/);
  assert.match(headers['content-security-policy'],/connect-src 'self'/);
  assert.doesNotMatch(headers['content-security-policy'],/unsafe-eval/);
  assert.doesNotMatch(headers['content-security-policy'],/script-src[^;]*\*/);
  assert.equal(RHYMELAB_CSP,headers['content-security-policy']);
});

test('remote server binding requires an explicit owner opt-in',()=>{
  assert.deepEqual(assertSafeServerBinding({host:'127.0.0.1',env:{}}),{remote:false});
  assert.deepEqual(assertSafeServerBinding({host:'::1',env:{}}),{remote:false});
  assert.throws(
    ()=>assertSafeServerBinding({host:'0.0.0.0',env:{}}),
    /RHYMELAB_ALLOW_REMOTE=1/,
  );
  assert.deepEqual(
    assertSafeServerBinding({host:'0.0.0.0',env:{RHYMELAB_ALLOW_REMOTE:'1'}}),
    {remote:true},
  );
});

test('request Host validation rejects DNS-rebinding hostnames',()=>{
  const request=(host)=>({headers:{host}});
  assert.equal(isAllowedRequestHost(request('127.0.0.1:3030')),true);
  assert.equal(isAllowedRequestHost(request('localhost:3030')),true);
  assert.equal(isAllowedRequestHost(request('[::1]:3030')),true);
  assert.equal(isAllowedRequestHost(request('evil.example:3030')),false);
  assert.equal(
    isAllowedRequestHost(request('192.168.1.20:3030'),{remote:true}),
    true,
  );
  assert.equal(
    isAllowedRequestHost(request('rhymelab.lan:3030'),{
      remote:true,
      allowedRemoteHosts:['rhymelab.lan'],
    }),
    true,
  );
});

test('cross-site browser requests are identifiable before API routing',()=>{
  assert.equal(isCrossSiteBrowserRequest({headers:{'sec-fetch-site':'cross-site'}}),true);
  assert.equal(isCrossSiteBrowserRequest({headers:{'sec-fetch-site':'same-origin'}}),false);
  assert.equal(isCrossSiteBrowserRequest({headers:{}}),false);
});

test('local mutation requests require exact localhost origin or loopback CLI peer',()=>{
  const request=(origin,remoteAddress='127.0.0.1',fetchSite='same-origin')=>({
    headers:{
      ...(origin==null?{}:{origin}),
      ...(fetchSite?{'sec-fetch-site':fetchSite}:{}),
    },
    socket:{remoteAddress},
  });

  assert.equal(
    isAllowedLocalMutationRequest(request('http://127.0.0.1:3030'),{port:3030}),
    true,
  );
  assert.equal(
    isAllowedLocalMutationRequest(request('http://localhost:3030'),{port:3030}),
    true,
  );
  assert.equal(
    isAllowedLocalMutationRequest(request('http://localhost'),{port:3030}),
    false,
  );
  assert.equal(
    isAllowedLocalMutationRequest(request('https://localhost:3030'),{port:3030}),
    false,
  );
  assert.equal(
    isAllowedLocalMutationRequest(request('http://evil.example:3030'),{port:3030}),
    false,
  );
  assert.equal(
    isAllowedLocalMutationRequest(request('http://127.0.0.1:3030','127.0.0.1','cross-site'),{port:3030}),
    false,
  );
  assert.equal(
    isAllowedLocalMutationRequest(request(null,'127.0.0.1','none'),{port:3030}),
    true,
  );
  assert.equal(
    isAllowedLocalMutationRequest(request(null,'192.168.1.50','none'),{port:3030}),
    false,
  );
});

test('request URL parsing does not trust the inbound Host header',()=>{
  const url=requestUrlFromTrustedBase('/api/writer?q=test',{host:'127.0.0.1',port:3030});
  assert.equal(url.origin,'http://127.0.0.1:3030');
  assert.equal(url.searchParams.get('q'),'test');
});

test('oversized request targets are rejected before routing',()=>{
  assert.throws(
    ()=>validateRequestTarget('/?q='+('x'.repeat(17*1024))),
    (error)=>error?.statusCode===414&&error?.code==='request_target_too_large',
  );
});

test('JSON body parsing enforces media type, syntax and size',async()=>{
  const parsed=await readJsonRequestBody(
    requestBody(['{"ok":true}'],{headers:{'content-type':'application/json'}}),
  );
  assert.deepEqual(parsed,{ok:true});

  await assert.rejects(
    readJsonRequestBody(requestBody(['x'],{headers:{'content-type':'text/plain'}})),
    (error)=>error?.statusCode===415,
  );
  await assert.rejects(
    readJsonRequestBody(requestBody(['{'],{headers:{'content-type':'application/json'}})),
    (error)=>error?.statusCode===400&&error?.code==='invalid_json',
  );
  await assert.rejects(
    readJsonRequestBody(
      requestBody(['123456789'],{
        headers:{'content-type':'application/json','content-length':'9'},
      }),
      {maxBytes:8},
    ),
    (error)=>error?.statusCode===413,
  );
});

test('unexpected server errors are not reflected to clients',()=>{
  const safe=publicHttpError(new Error('/private/rhymelab/private.sqlite exploded'),{requestId:'req-1'});
  assert.equal(safe.statusCode,500);
  assert.equal(safe.body.error,'Internal server error.');
  assert.equal(safe.body.code,'internal_error');
  assert.equal(safe.body.requestId,'req-1');
  assert.doesNotMatch(JSON.stringify(safe.body),/private\.sqlite|alice/);
});
