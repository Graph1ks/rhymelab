export const SERVING_V1_PRONUNCIATION_IDENTITY_REVISION='canonical-phoneme-stress-v3';

function cleanToken(value){
  return String(value??'').normalize('NFC').trim();
}

export function canonicalPhonemeString(value,fallback=''){
  if(Array.isArray(value)){
    return value.map(cleanToken).filter(Boolean).join(' ');
  }
  const raw=String(value??'').normalize('NFC').trim();
  if(raw){
    if(raw.startsWith('[')){
      try{
        const parsed=JSON.parse(raw);
        if(Array.isArray(parsed)){
          const joined=parsed.map(cleanToken).filter(Boolean).join(' ');
          if(joined)return joined;
        }
      }catch{}
    }
    return raw.split(/\s+/u).filter(Boolean).join(' ');
  }
  return String(fallback??'').normalize('NFC').trim().replace(/\s+/gu,' ');
}

export function pronunciationIdentityKey({phonemes,stress='',fallback='' }={}){
  return canonicalPhonemeString(phonemes,fallback)
    +'|stress:'+String(stress??'').trim();
}

export function entityCanonicalPhonemesSql(
  analysisAlias='epa',
  pronunciationAlias='ep',
){
  const raw=`${analysisAlias}.phonemes`;
  return `COALESCE(
    NULLIF(
      CASE
        WHEN json_valid(${raw})=1 AND json_type(${raw})='array' THEN (
          SELECT group_concat(token,' ')
          FROM (
            SELECT CAST(value AS TEXT) token
            FROM json_each(${raw})
            ORDER BY CAST(key AS INTEGER)
          )
        )
        ELSE trim(${raw})
      END,
      ''
    ),
    ${pronunciationAlias}.ipa
  )`;
}

export function entityIdentityKeySql(
  analysisAlias='epa',
  pronunciationAlias='ep',
){
  return `(${entityCanonicalPhonemesSql(analysisAlias,pronunciationAlias)}
    ||'|stress:'||trim(COALESCE(${analysisAlias}.stress_pattern,'')))`;
}

export function entityAnalyzerSql(languageExpression){
  return `CASE ${languageExpression}
    WHEN 'en' THEN 'en-pron-v1-candidate'
    ELSE 'de-ipa-v2'
  END`;
}
