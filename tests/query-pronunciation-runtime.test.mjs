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
  tokenizeClientPronunciationInput,
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

test('German OOV resolver keeps TRAG and WARG in their expected rhyme domains',()=>{
  const profile=getPhonologyProfile('de');
  const trag=generateClientIpa('TRAG','de');
  const warg=generateClientIpa('WARG','de');
  const tag=profile.analyzeIpa('ˈtaːk');
  const karg=profile.analyzeIpa('ˈkaRk');
  const stark=profile.analyzeIpa('ˈʃtaRk');

  assert.equal(trag.ipa,'ˈtRaːk');
  assert.equal(warg.ipa,'ˈvaRk');
  assert.equal(profile.analyzeIpa(trag.ipa).exactTailKey,tag.exactTailKey);
  assert.equal(profile.analyzeIpa(warg.ipa).exactTailKey,karg.exactTailKey);
  assert.equal(profile.analyzeIpa(warg.ipa).exactTailKey,stark.exactTailKey);
  assert.doesNotMatch(trag.ipa,/g$/u);
  assert.doesNotMatch(warg.ipa,/g$/u);
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
  assert.equal(de.method,'client_source_reference_compound_right_edge');
  assert.deepEqual(de.components,['Winter','Wolf']);
  assert.equal(de.sourceBacked,true);
  assert.equal(de.ipa,'ˌvɪntɐˈvɔlf');
  assert.ok(getPhonologyProfile('de').analyzeIpa(de.ipa).exactTailKey);

  const en=await resolveUnknownClientPronunciation('Dragonspawn','en',{lookupReference});
  assert.equal(en.method,'client_source_reference_compound_right_edge');
  assert.deepEqual(en.components,['dragon','spawn']);
  assert.equal(en.sourceBacked,true);
  assert.equal(en.ipa,'ˌdɹægənˈspɔn');
  assert.ok(getPhonologyProfile('en').analyzeIpa(en.ipa).exactTailKey);
});

test('browser resolver restores recursive source-backed compound decomposition for art words',async()=>{
  const references=new Map([
    ['arsch',{surface:'Arsch',preferredIpa:'ˈaRʃ'}],
    ['geweih',{surface:'Geweih',preferredIpa:'gəˈvaɪ'}],
    ['anbeter',{surface:'Anbeter',preferredIpa:'ˈanbeːtɐ'}],
  ]);
  const detail=await resolveUnknownClientPronunciation('Arschgeweihanbeter','de',{
    lookupReference:async(surface)=>references.get(surface)||null,
  });

  assert.equal(detail.method,'client_source_reference_compound_right_edge');
  assert.equal(detail.sourceBacked,true);
  assert.deepEqual(detail.components,['Arsch','Geweih','Anbeter']);
  assert.ok(detail.ipa);
  const analysis=getPhonologyProfile('de').analyzeIpa(detail.ipa);
  assert.ok(analysis.exactTailKey);
  assert.ok(analysis.primaryStressSyllable>1);
});

test('GROWTHHORMONPRODUCER keeps a usable right-edge rhyme anchor in EN and DE',async()=>{
  const references={
    en:new Map([
      ['growth',{surface:'growth',preferredIpa:'ˈgɹaʊθ'}],
      ['producer',{surface:'producer',preferredIpa:'pɹəˈdusɚ'}],
    ]),
    de:new Map([
      ['growth',{surface:'Growth',preferredIpa:'ˈgRoːt'}],
      ['hormon',{surface:'Hormon',preferredIpa:'hɔRˈmoːn'}],
      ['producer',{surface:'Producer',preferredIpa:'pRoˈduːtsɐ'}],
    ]),
  };

  for(const language of ['en','de']){
    const detail=await resolveUnknownClientPronunciation(
      'GROWTHHORMONPRODUCER',
      language,
      {lookupReference:async(surface,code)=>references[code].get(surface)||null},
    );
    assert.ok(detail?.ipa,language+' compound must resolve');
    assert.match(detail.method,/compound_right_edge$/u);
    assert.equal(detail.components.at(-1)?.toLocaleLowerCase('en-US'),'producer');

    const profile=getPhonologyProfile(language);
    const analysis=profile.analyzeIpa(detail.ipa);
    const producer=profile.analyzeIpa(references[language].get('producer').preferredIpa);
    assert.ok(analysis.primaryStressSyllable>1,language+' must not anchor at syllable 1');
    assert.equal(
      analysis.finalTail.replaceAll(' ',''),
      producer.finalTail.replaceAll(' ',''),
      language+' must preserve the source-backed right edge',
    );
    assert.ok(analysis.exactTailKey);
  }
});

test('long fully generated OOV tokens use a bounded right-edge query anchor',()=>{
  for(const language of ['de','en']){
    const detail=generateClientIpa('growthhormonproducer',language);
    const analysis=getPhonologyProfile(language).analyzeIpa(detail.ipa);
    assert.ok(analysis.primaryStressSyllable>1);
    assert.ok(analysis.stressedSyllableCount<=2);
    assert.ok(analysis.exactTailKey);
  }
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


test('browser resolver resolves arbitrary mixed source-backed/generated word chains',async()=>{
  const query='heute abend große gangbang party';
  assert.deepEqual(
    tokenizeClientPronunciationInput(query),
    ['heute','abend','große','gangbang','party'],
  );

  const generatedReference=(surface)=>generateClientIpa(surface,'de');
  const references=new Map(
    ['heute','abend','große','party'].map((surface)=>[
      surface,
      {
        surface,
        preferredIpa:generatedReference(surface).ipa,
      },
    ]),
  );
  const detail=await resolveUnknownClientPronunciation(query,'de',{
    lookupReference:async(surface)=>references.get(surface)||null,
  });

  assert.equal(detail.method,'client_token_chain');
  assert.equal(detail.tokenCount,5);
  assert.equal(detail.sourceBacked,false);
  assert.deepEqual(detail.components,['heute','abend','große','gangbang','party']);
  assert.deepEqual(detail.generatedTokens,['gangbang']);
  assert.deepEqual(detail.sourceBackedTokens,['heute','abend','große','party']);
  assert.equal(detail.tokens.length,5);
  assert.equal(detail.tokens[3].surface,'gangbang');
  assert.equal(detail.tokens[3].sourceBacked,false);
  assert.equal(detail.ipa.split(' ').length,5);

  const analysis=getPhonologyProfile('de').analyzeIpa(detail.ipa);
  assert.ok(analysis.syllableCount>=5);
  assert.ok(analysis.exactTailKey);
});

test('browser resolver can resolve a fully unknown multiword chain without DB pronunciation hits',async()=>{
  const detail=await resolveUnknownClientPronunciation(
    'Vulkanschnecken Dragonspawn Baladur',
    'en',
    {lookupReference:async()=>null},
  );
  assert.equal(detail.method,'client_token_chain');
  assert.equal(detail.tokenCount,3);
  assert.equal(detail.generatedTokens.length,3);
  assert.equal(detail.sourceBackedTokens.length,0);
  assert.equal(detail.ipa.split(' ').length,3);
  assert.ok(getPhonologyProfile('en').analyzeIpa(detail.ipa).exactTailKey);
});
