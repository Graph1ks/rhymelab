import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGLISH_US_ARPA_REQUIRED_PHONES,
  inspectMfaEnglishUsArpa,
} from '../scripts/mfa-model-inspect-core.mjs';

test('MFA ARPA identity accepts official family even when inspect build version differs',()=>{
  const phones=ENGLISH_US_ARPA_REQUIRED_PHONES
    .map((phone)=>"'"+phone+"'")
    .join(', ');
  const inspect=`{
    'Archive': {
      'name': 'english_us_arpa',
      'data': {
        'version': '2.0.0rc4.dev19+ged818cb.d20220404',
        'architecture': 'pynini',
        'train_date': '2022-06-02 11:55:13.170765',
        'phones': { ${phones} },
        'graphemes': {'a','b','c'}
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
