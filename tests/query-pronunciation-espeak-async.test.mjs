import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectEspeakQueryPronunciationAsync } from '../scripts/query-pronunciation-espeak-adapter.mjs';

test('async eSpeak adapter accepts analyzer-compatible mocked IPA',async()=>{
  const result=await inspectEspeakQueryPronunciationAsync('Quarterback','de',{
    command:'mock-espeak',
    runner:async(command,args)=>{
      assert.equal(command,'mock-espeak');
      assert.ok(args.includes('--ipa=3'));
      assert.ok(args.includes('de'));
      return {status:0,stdout:'kvˈartɐbˌak\n',stderr:''};
    },
  });
  assert.equal(result.status,'accepted');
  assert.equal(result.ipa,'kvˈartɐbˌak');
  assert.equal(result.language,'de');
});

test('async eSpeak adapter reports unavailable mocked process failures',async()=>{
  const result=await inspectEspeakQueryPronunciationAsync('test','en',{
    command:'missing-espeak',
    runner:async()=>({status:1,stdout:'',stderr:'missing'}),
  });
  assert.equal(result.status,'unavailable');
  assert.equal(result.attempts.length,1);
});
