import test from 'node:test';
import assert from 'node:assert/strict';

import { getPhonologyProfile } from '../scripts/phonology-profiles.mjs';
import {
  QUERY_PRONUNCIATION_POLICY,
  deterministicRuleQueryPronunciation,
  resolveUnknownQueryPronunciation,
  tryEspeakQueryPronunciation,
} from '../src/query-pronunciation-runtime.mjs';

const SENTINELS=[
  'Vulkanschnecken',
  'Glutamat',
  'Winterwolf',
  'Holladio',
  'Dragonspawn',
  'Ironworm',
  'Baladur',
];

test('total query pronunciation resolves every product sentinel in DE and EN without external tools',()=>{
  for(const language of ['de','en']){
    const profile=getPhonologyProfile(language);
    for(const surface of SENTINELS){
      const detail=resolveUnknownQueryPronunciation(surface,language,{
        preferEspeak:false,
        useCache:false,
      });
      assert.ok(detail,`${language} ${surface} must resolve`);
      assert.equal(detail.generatedPronunciation,true);
      assert.equal(detail.resolvable,true);
      assert.equal(detail.queryPronunciation.policy,QUERY_PRONUNCIATION_POLICY);
      assert.equal(detail.queryPronunciation.ephemeral,true);
      assert.equal(detail.queryPronunciation.persisted,false);
      assert.equal(detail.queryPronunciation.canonicalLexicalFact,false);
      assert.ok(detail.preferredIpa);
      assert.ok(detail.syllableCount>=1);
      assert.ok(detail.primaryStressSyllable>=1);
      assert.equal('confidence' in detail.queryPronunciation,false);
      const analysis=profile.analyzeIpa(detail.preferredIpa);
      assert.ok(analysis.exactTailKey,`${language} ${surface} needs a rhyme-tail key`);
      assert.equal(analysis.syllableCount,detail.syllableCount);
    }
  }
});

test('deterministic query rules repeat exactly',()=>{
  for(const language of ['de','en']){
    for(const surface of SENTINELS){
      const first=deterministicRuleQueryPronunciation(surface,language);
      const second=deterministicRuleQueryPronunciation(surface,language);
      assert.equal(first.ipa,second.ipa);
      assert.equal(first.analysis.exactTailKey,second.analysis.exactTailKey);
      assert.equal(first.analysis.stressPattern,second.analysis.stressPattern);
    }
  }
});

test('eSpeak-NG adapter accepts analyzer-compatible host IPA without making it lexical truth',()=>{
  const calls=[];
  const runner=(command,args)=>{
    calls.push({command,args});
    const language=args[args.indexOf('-v')+1];
    return {
      status:0,
      stdout:language==='de'?'ˈvʊlkan':'ˈdɹægən',
      stderr:'',
    };
  };

  const de=tryEspeakQueryPronunciation('Vulkan','de',{
    command:'espeak-ng-test',
    runner,
  });
  const en=tryEspeakQueryPronunciation('dragon','en',{
    command:'espeak-ng-test',
    runner,
  });

  assert.equal(de.method,'espeak_ng');
  assert.equal(en.method,'espeak_ng');
  assert.equal(de.engine,'espeak-ng');
  assert.equal(en.engine,'espeak-ng');
  assert.ok(de.analysis.exactTailKey);
  assert.ok(en.analysis.exactTailKey);
  assert.equal(calls.length,2);
  assert.ok(calls.every(({args})=>args.includes('--ipa=3')));
  assert.ok(calls.some(({args})=>args.includes('de')));
  assert.ok(calls.some(({args})=>args.includes('en-us')));
});

test('invalid eSpeak output falls through to deterministic total resolution',()=>{
  const runner=()=>({status:0,stdout:'???',stderr:''});
  const detail=resolveUnknownQueryPronunciation('Baladur','en',{
    espeakCommand:'espeak-ng-test',
    runner,
    useCache:false,
  });
  assert.equal(detail.generatedPronunciation,true);
  assert.match(detail.queryPronunciation.method,/^deterministic_/);
  assert.ok(detail.preferredIpa);
  assert.ok(detail.syllableCount>=1);
});
