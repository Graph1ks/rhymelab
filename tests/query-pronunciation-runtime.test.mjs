import test from 'node:test';
import assert from 'node:assert/strict';

import { getPhonologyProfile } from '../scripts/phonology-profiles.mjs';
import {
  QUERY_PRONUNCIATION_POLICY,
  deterministicRuleQueryPronunciation,
  inspectEspeakQueryPronunciation,
  normalizeEspeakIpa,
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


test('eSpeak IPA adapter strips format joiners before diphthong and affricate analysis',()=>{
  assert.equal(normalizeEspeakIpa('vˈa\u200dɪts','de'),'vˈaɪts');
  assert.equal(normalizeEspeakIpa('d\u200dʒˈe\u200dɪ','en'),'dʒˈeɪ');

  const de=tryEspeakQueryPronunciation('Veits','de',{
    command:'espeak-ng-test',
    runner:()=>({status:0,stdout:'vˈa\u200dɪts',stderr:''}),
  });
  assert.ok(de);
  assert.equal(de.ipa,'vˈaɪts');
  assert.equal(de.analysis.syllableCount,1);
  assert.equal(de.analysis.exactTailKey,'aɪts');
  assert.doesNotMatch(de.analysis.canonicalPhonemes,/\u200d/u);
});

test('eSpeak adapter maps observed DE long-a output into the accepted German inventory',()=>{
  const resolved=tryEspeakQueryPronunciation('Haags','de',{
    command:'espeak-ng-test',
    runner:()=>({status:0,stdout:'hˈɑːks',stderr:''}),
  });
  assert.ok(resolved);
  assert.equal(resolved.ipa,'hˈaːks');
  assert.equal(resolved.analysis.syllableCount,1);
  assert.equal(resolved.analysis.exactTailKey,'aːks');
});

test('eSpeak adapter accepts the previously rejected EN sentinel phone shapes',()=>{
  const fixtures=new Map([
    ['Holladio','hɑːlˈe\u200dɪdɪˌo\u200dʊ'],
    ['Ironworm','ˈa\u200dɪ\u200dɚnwɜːm'],
    ['Baladur','bˈælɐdjˌʊ\u200dɹ'],
    ['Cawdor','kˈɔːdoː\u200dɹ'],
    ['Rêver','ɹˈɛːvɚ'],
  ]);
  for(const [surface,raw] of fixtures){
    const resolved=tryEspeakQueryPronunciation(surface,'en',{
      command:'espeak-ng-test',
      runner:()=>({status:0,stdout:raw,stderr:''}),
    });
    assert.ok(resolved,`${surface} should be analyzer-compatible after adapter normalization`);
    assert.ok(resolved.analysis.syllableCount>=1);
    assert.ok(resolved.analysis.exactTailKey);
    assert.doesNotMatch(resolved.ipa,/\p{Cf}/u);
  }
});

test('eSpeak inspection preserves rejected raw IPA and analyzer error for benchmark diagnosis',()=>{
  const inspected=inspectEspeakQueryPronunciation('BadFixture','en',{
    command:'espeak-ng-test',
    runner:()=>({status:0,stdout:'???',stderr:''}),
  });
  assert.equal(inspected.status,'rejected');
  assert.equal(inspected.rawIpa,'???');
  assert.equal(inspected.ipa,'???');
  assert.match(inspected.analyzerError,/Unsupported English IPA symbol/);
});

test('analyzer rejection does not mark an auto-discovered eSpeak executable as unavailable',()=>{
  let calls=0;
  const runner=(command,args)=>{
    calls+=1;
    return {status:0,stdout:calls===1?'???':'dɹˈægən',stderr:''};
  };
  const first=inspectEspeakQueryPronunciation('BadFixture','en',{runner});
  assert.equal(first.status,'rejected');
  const second=inspectEspeakQueryPronunciation('Dragon','en',{runner});
  assert.equal(second.status,'accepted');
});
