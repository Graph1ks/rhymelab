import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getPhonologyProfile } from '../scripts/phonology-profiles.mjs';
import {
  inspectEspeakQueryPronunciation,
  normalizeEspeakIpa,
  tryEspeakQueryPronunciation,
} from '../scripts/query-pronunciation-espeak-adapter.mjs';
import {
  CLIENT_QUERY_PRONUNCIATION_POLICY,
  generateClientIpa,
  resolveUnknownClientPronunciation,
} from '../src/ui/query-pronunciation-client.mjs';

const SENTINELS=[
  'Vulkanschnecken',
  'Glutamat',
  'Winterwolf',
  'Holladio',
  'Dragonspawn',
  'Ironworm',
  'Baladur',
];

test('browser-safe resolver produces analyzer-compatible IPA for every product sentinel in DE and EN',()=>{
  for(const language of ['de','en']){
    const profile=getPhonologyProfile(language);
    for(const surface of SENTINELS){
      const detail=generateClientIpa(surface,language);
      assert.equal(detail.policy,CLIENT_QUERY_PRONUNCIATION_POLICY);
      assert.equal(detail.clientOnly,true);
      assert.equal(detail.sourceBacked,false);
      assert.ok(detail.ipa,`${language} ${surface} must produce IPA`);
      const analysis=profile.analyzeIpa(detail.ipa);
      assert.ok(analysis.syllableCount>=1);
      assert.ok(analysis.exactTailKey,`${language} ${surface} needs a rhyme-tail key`);
    }
  }
});

test('browser-safe resolver is deterministic',()=>{
  for(const language of ['de','en']){
    for(const surface of SENTINELS){
      const first=generateClientIpa(surface,language);
      const second=generateClientIpa(surface,language);
      assert.deepEqual(first,second);
    }
  }
});

test('browser resolver may compose an unknown spelling from source-backed DB references',async()=>{
  const references={
    de:new Map([
      ['winter',{surface:'Winter',preferredIpa:'ˈvɪntɐ'}],
      ['wolf',{surface:'Wolf',preferredIpa:'ˈvɔlf'}],
    ]),
    en:new Map([
      ['dragon',{surface:'dragon',preferredIpa:'ˈdɹægən'}],
      ['spawn',{surface:'spawn',preferredIpa:'ˈspɔn'}],
    ]),
  };
  const lookupReference=async(surface,language)=>references[language].get(surface)||null;

  const de=await resolveUnknownClientPronunciation('Winterwolf','de',{lookupReference});
  assert.equal(de.method,'client_source_reference_compound');
  assert.deepEqual(de.components,['Winter','Wolf']);
  assert.equal(de.sourceBacked,true);
  assert.equal(de.ipa,'ˈvɪntɐˌvɔlf');
  assert.ok(getPhonologyProfile('de').analyzeIpa(de.ipa).exactTailKey);

  const en=await resolveUnknownClientPronunciation('Dragonspawn','en',{lookupReference});
  assert.equal(en.method,'client_source_reference_compound');
  assert.deepEqual(en.components,['dragon','spawn']);
  assert.equal(en.sourceBacked,true);
  assert.equal(en.ipa,'ˈdɹægənˌspɔn');
  assert.ok(getPhonologyProfile('en').analyzeIpa(en.ipa).exactTailKey);
});

test('browser pronunciation module contains no host executable, Node runtime, network, or search implementation',async()=>{
  const source=await readFile('src/ui/query-pronunciation-client.mjs','utf8');
  assert.doesNotMatch(source,/node:child_process|spawnSync|execFile|process\.|RHYMELAB_ESPEAK|espeak/iu);
  assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(source,/findWriterRhymes|searchEnglishWriter|searchEntityRhymes|rankClientRhymeCandidates/);
  assert.match(source,/resolveUnknownClientPronunciation/);
  assert.match(source,/lookupReference/);
});

test('eSpeak benchmark adapter remains benchmark-only and normalizes host IPA',()=>{
  assert.equal(normalizeEspeakIpa('vˈa\u200dɪts','de'),'vˈaɪts');
  assert.equal(normalizeEspeakIpa('d\u200dʒˈe\u200dɪ','en'),'dʒˈeɪ');

  const calls=[];
  const runner=(command,args)=>{
    calls.push({command,args});
    const language=args[args.indexOf('-v')+1];
    return {status:0,stdout:language==='de'?'ˈvʊlkan':'ˈdɹægən',stderr:''};
  };
  const de=tryEspeakQueryPronunciation('Vulkan','de',{command:'espeak-ng-test',runner});
  const en=tryEspeakQueryPronunciation('dragon','en',{command:'espeak-ng-test',runner});
  assert.equal(de.method,'espeak_ng');
  assert.equal(en.method,'espeak_ng');
  assert.ok(de.analysis.exactTailKey);
  assert.ok(en.analysis.exactTailKey);
  assert.equal(calls.length,2);
});

test('eSpeak benchmark inspection preserves rejected raw IPA and analyzer error',()=>{
  const inspected=inspectEspeakQueryPronunciation('BadFixture','en',{
    command:'espeak-ng-test',
    runner:()=>({status:0,stdout:'???',stderr:''}),
  });
  assert.equal(inspected.status,'rejected');
  assert.equal(inspected.rawIpa,'???');
  assert.equal(inspected.ipa,'???');
  assert.match(inspected.analyzerError,/Unsupported English IPA symbol/);
});


test('product runtime contains no eSpeak or child_process query pronunciation dependency',async()=>{
  const [server,unified,app]=await Promise.all([
    readFile('src/server.mjs','utf8'),
    readFile('src/unified-writer-search.mjs','utf8'),
    readFile('src/ui/app.js','utf8'),
  ]);
  const productSource=[server,unified,app].join('\n');
  assert.doesNotMatch(productSource,/node:child_process|spawnSync|RHYMELAB_ESPEAK|tryEspeakQueryPronunciation|inspectEspeakQueryPronunciation/);
  await assert.rejects(
    readFile('src/query-pronunciation-runtime.mjs','utf8'),
    /ENOENT/,
  );
});
