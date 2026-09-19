import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGLISH_US_ARPA_REQUIRED_GRAPHEMES,
  ENGLISH_US_ARPA_REQUIRED_PHONES,
  inspectMfaEnglishUsArpa,
  prepareMfaEnglishUsArpaInput,
} from '../scripts/mfa-model-inspect-core.mjs';

test('MFA ARPA identity accepts official family even when inspect build version differs',()=>{
  const phones=ENGLISH_US_ARPA_REQUIRED_PHONES
    .map((phone)=>"'"+phone+"'")
    .join(', ');
  const graphemes=ENGLISH_US_ARPA_REQUIRED_GRAPHEMES
    .map((grapheme)=>"'"+grapheme+"'")
    .join(', ');
  const inspect=`{
    'Archive': {
      'name': 'english_us_arpa',
      'data': {
        'version': '2.0.0rc4.dev19+ged818cb.d20220404',
        'architecture': 'pynini',
        'train_date': '2022-06-02 11:55:13.170765',
        'phones': { ${phones} },
        'graphemes': { ${graphemes} },
        'evaluation': {'num_words': 1}
      }
    }
  }`;

  const result=inspectMfaEnglishUsArpa(inspect);
  assert.equal(result.valid,true);
  assert.equal(result.architecture,'pynini');
  assert.equal(
    result.reported_version,
    '2.0.0rc4.dev19+ged818cb.d20220404',
  );
  assert.equal(result.phone_count,69);
  assert.deepEqual(result.missing_required_phones,[]);
  assert.equal(result.grapheme_count,27);
  assert.deepEqual(result.missing_required_graphemes,[]);
  assert.match(result.inspect_fingerprint,/^[a-f0-9]{64}$/u);
});

test('MFA ARPA identity rejects incomplete or wrong architecture models',()=>{
  const inspect=`{
    'data': {
      'version': 'x',
      'architecture': 'phonetisaurus',
      'phones': {'AA0','AA1'},
      'graphemes': {'a'}
    }
  }`;
  const result=inspectMfaEnglishUsArpa(inspect);
  assert.equal(result.valid,false);
  assert.equal(result.architecture,'phonetisaurus');
  assert.ok(result.missing_required_phones.length>0);
});


test('MFA ARPA input normalization lowercases instead of letting MFA delete capitals',()=>{
  assert.deepEqual(
    prepareMfaEnglishUsArpaInput('Toyota'),
    {
      original:'Toyota',
      normalized:'toyota',
      model_input:'toyota',
      eligible:true,
      strategy:'lowercase_normalized',
      removed_combining_marks:0,
      unsupported_graphemes:[],
    },
  );
});

test('MFA ARPA input normalization records conservative diacritic folding',()=>{
  const celine=prepareMfaEnglishUsArpaInput('Céline');
  assert.equal(celine.eligible,true);
  assert.equal(celine.model_input,'celine');
  assert.equal(celine.strategy,'lowercase_diacritic_fold');
  assert.equal(celine.removed_combining_marks,1);

  const bjork=prepareMfaEnglishUsArpaInput('Björk');
  assert.equal(bjork.eligible,true);
  assert.equal(bjork.model_input,'bjork');

  const oconnor=prepareMfaEnglishUsArpaInput('O’Connor');
  assert.equal(oconnor.eligible,true);
  assert.equal(oconnor.model_input,"o'connor");
});

test('MFA ARPA input normalization rejects unsupported residual graphemes',()=>{
  const soren=prepareMfaEnglishUsArpaInput('Søren');
  assert.equal(soren.eligible,false);
  assert.equal(soren.model_input,null);
  assert.deepEqual(soren.unsupported_graphemes,['ø']);
});
