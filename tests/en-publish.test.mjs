import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cmudictPronunciationEvidence,
  determineEnglishPublishEligibility,
  lexicalEvidenceForHeadword,
  lexicalEvidenceForListedForms,
  mergeEsdbEvidence,
  finalizeEsdbEvidence,
  isEnglishPublishSurface,
  parseCmudictPronunciationLine,
  wiktionaryPronunciationEvidence,
} from '../scripts/en-publish-core.mjs';

test('CMUdict publish parser preserves alternate pronunciations and en-US provenance',()=>{
  const parsed=parseCmudictPronunciationLine("ROUTE(2)  R AW1 T");
  assert.deepEqual(parsed,{
    normalized:'route',
    source_surface:'ROUTE(2)',
    phones:'R AW1 T',
    alternate_index:2,
  });
  assert.deepEqual(cmudictPronunciationEvidence(parsed),{
    source:'cmudict',
    notation:'arpabet',
    raw:'R AW1 T',
    locales:['en-US'],
    locale_status:'qualified',
    tags:[],
    alternate_index:2,
  });
});

test('Wiktionary pronunciation locale distinguishes mapped, tagless, profiled and tagged-unmapped evidence',()=>{
  const us=wiktionaryPronunciationEvidence({ipa:'/kɑɹ/',tags:['General-American']});
  const uk=wiktionaryPronunciationEvidence({ipa:'/kɑː/',tags:['Received-Pronunciation']});
  const bare=wiktionaryPronunciationEvidence({ipa:'/lʌv/'});
  const australian=wiktionaryPronunciationEvidence({ipa:'/lɐv/',tags:['Australia']});
  const newZealand=wiktionaryPronunciationEvidence({ipa:'/lɐv/',tags:['new-zealand']});
  const merger=wiktionaryPronunciationEvidence({ipa:'/lɑv/',tags:['cot-caught-merger']});
  assert.deepEqual(us.locales,['en-US']);
  assert.deepEqual(uk.locales,['en-GB']);
  assert.equal(bare.locale_status,'source_attested_unprofiled');
  assert.deepEqual(bare.locales,[]);
  assert.equal(australian.locale_status,'source_attested_other_profiled');
  assert.equal(newZealand.locale_status,'source_attested_other_profiled');
  assert.equal(merger.locale_status,'source_attested_tagged_unmapped');
  assert.deepEqual(australian.locales,[]);
});

test('headword and listed-form evidence preserve lexical relationship instead of inventing lemma truth',()=>{
  const entry={
    word:'walk',
    lang_code:'en',
    pos:'verb',
    senses:[{}],
    forms:[
      {form:'walked',tags:['past']},
      {form:'walks',tags:['third-person','singular']},
      {form:'walk',tags:['canonical']},
    ],
  };
  const head=lexicalEvidenceForHeadword(entry);
  assert.equal(head.normalized,'walk');
  const forms=lexicalEvidenceForListedForms(entry);
  assert.deepEqual(forms.map((row)=>row.normalized),['walked','walks']);
  assert.deepEqual(forms[0].lemma_candidates,['walk']);
  assert.deepEqual(forms[0].relation_kinds,['listed_form_of']);
});

test('form-of headword records retain source lemma target',()=>{
  const evidence=lexicalEvidenceForHeadword({
    word:'went',
    pos:'verb',
    senses:[{form_of:[{word:'go'}]}],
  });
  assert.deepEqual(evidence.lemma_candidates,['go']);
  assert.deepEqual(evidence.relation_kinds,['form_of']);
});


test('publish lexical evidence keeps mixed current+historical senses current',()=>{
  const mixed=lexicalEvidenceForHeadword({
    word:'charge',
    pos:'noun',
    senses:[
      {glosses:['current meaning']},
      {glosses:['obsolete meaning'],tags:['obsolete']},
    ],
  });
  assert.equal(mixed.history.obsolete,true);
  assert.equal(mixed.history.historical_only,false);

  const oldOnly=lexicalEvidenceForHeadword({
    word:'yclept',
    pos:'verb',
    senses:[
      {tags:['archaic']},
      {tags:['obsolete']},
    ],
  });
  assert.equal(oldOnly.history.historical_only,true);
});


test('publish lexical evidence does not turn a common record proper-only from one sense tag',()=>{
  const evidence=lexicalEvidenceForHeadword({
    word:'college',
    pos:'noun',
    senses:[
      {glosses:['an institution']},
      {glosses:['a named college'],tags:['proper-noun']},
    ],
  });
  assert.equal(evidence.proper_name,false);
});

test('ESDB evidence merges independent lexical guard signals',()=>{
  let value=null;
  value=mergeEsdbEvidence(value,{size:60,region:'US',posClass:'v',archaic:false,uncommon:false,invalid:false});
  value=mergeEsdbEvidence(value,{size:80,region:'GB',posClass:'v',archaic:true,uncommon:false,invalid:false});
  assert.deepEqual(finalizeEsdbEvidence(value),{
    min_size:60,
    regions:['GB','US'],
    pos_classes:['v'],
    archaic:true,
    uncommon:false,
    invalid:false,
  });
});

test('default eligibility is en-US analyzed, current, non-proper-only and ESDB-valid',()=>{
  const base={
    pronunciations:[{analysis:{e:'AYM'},locales:['en-US']}],
    lexical_current_evidence:1,
    lexical_historical_evidence:0,
    proper_name_evidence:0,
    common_lexical_evidence:1,
    esdb:null,
  };
  assert.equal(determineEnglishPublishEligibility(base).default_eligible,true);
  assert.equal(determineEnglishPublishEligibility({...base,lexical_current_evidence:0,lexical_historical_evidence:1}).default_eligible,false);
  assert.equal(determineEnglishPublishEligibility({...base,proper_name_evidence:1,common_lexical_evidence:0}).default_eligible,false);
  assert.equal(determineEnglishPublishEligibility({...base,proper_name_evidence:1,common_lexical_evidence:1}).default_eligible,true);
  assert.equal(determineEnglishPublishEligibility({...base,esdb:{invalid:true}}).default_eligible,false);
  assert.equal(determineEnglishPublishEligibility({...base,pronunciations:[{analysis:{},locales:['en-GB']}]}).default_eligible,false);
});

test('publish surface policy is narrower than broad source diagnostics',()=>{
  assert.equal(isEnglishPublishSurface("can't"),true);
  assert.equal(isEnglishPublishSurface('ice-cream'),true);
  assert.equal(isEnglishPublishSurface('naïve'),true);
  assert.equal(isEnglishPublishSurface('hello!'),false);
  assert.equal(isEnglishPublishSurface('and/or'),false);
  assert.equal(isEnglishPublishSurface('two words'),false);
});
