import { createHash } from 'node:crypto';

export const ENGLISH_US_ARPA_REQUIRED_PHONES=[
  'AA0','AA1','AA2','AE0','AE1','AE2','AH0','AH1','AH2','AO0','AO1','AO2',
  'AW0','AW1','AW2','AY0','AY1','AY2','B','CH','D','DH','EH0','EH1','EH2',
  'ER0','ER1','ER2','EY0','EY1','EY2','F','G','HH','IH0','IH1','IH2',
  'IY0','IY1','IY2','JH','K','L','M','N','NG','OW0','OW1','OW2','OY0',
  'OY1','OY2','P','R','S','SH','T','TH','UH0','UH1','UH2','UW0','UW1',
  'UW2','V','W','Y','Z','ZH',
];

function matchValue(text,key){
  const pattern=new RegExp(
    "['\"]"+key+"['\"]\\s*:\\s*['\"]([^'\"]+)['\"]",
    'u',
  );
  return String(text||'').match(pattern)?.[1]||null;
}

export function inspectMfaEnglishUsArpa(text){
  const raw=String(text||'');
  const phoneBlock=raw.match(
    /['"]phones['"]\s*:\s*\{([\s\S]*?)\}\s*,\s*['"]graphemes['"]/u
  )?.[1]||'';
  const phones=new Set(
    [...phoneBlock.matchAll(/['"]([A-Z]+[0-2]?)['"]/gu)]
      .map((match)=>match[1])
  );
  const missingPhones=ENGLISH_US_ARPA_REQUIRED_PHONES
    .filter((phone)=>!phones.has(phone));

  const metadata={
    reported_version:matchValue(raw,'version'),
    architecture:matchValue(raw,'architecture'),
    train_date:matchValue(raw,'train_date'),
    phone_count:phones.size,
    missing_required_phones:missingPhones,
    inspect_fingerprint:createHash('sha256').update(raw).digest('hex'),
  };

  return {
    ...metadata,
    valid:
      metadata.architecture==='pynini'
      &&missingPhones.length===0
      &&phones.size===ENGLISH_US_ARPA_REQUIRED_PHONES.length,
  };
}
