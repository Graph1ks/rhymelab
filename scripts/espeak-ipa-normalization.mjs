function normalizeLanguage(value){
  const language=String(value||'').trim().toLocaleLowerCase('en-US');
  if(!['de','en'].includes(language)){
    throw new TypeError(`Unsupported query-pronunciation language: ${value}`);
  }
  return language;
}

export function normalizeEspeakIpa(value,language){
  const code=normalizeLanguage(language);
  let ipa=String(value??'')
    .normalize('NFC')
    .replace(/\p{Cf}/gu,'')
    .replace(/[\r\n]+/gu,' ')
    .replace(/[‖|]+/gu,' ')
    .replace(/_/gu,' ')
    .replace(/\s+/gu,' ')
    .trim();

  if(code==='en'){
    ipa=ipa
      .replaceAll('ɫ','l')
      .replaceAll('ɾ','t')
      .replaceAll('ᵻ','ɪ')
      .replaceAll('ᵊ','ə')
      .replaceAll('ɡ','g')
      .replaceAll('əː','ɜ')
      .replaceAll('ɹ̩','ɚ')
      .replaceAll('oː','oʊ')
      .replaceAll('eː','eɪ')
      .replaceAll('ɛː','ɛ')
      .replaceAll('ɪː','i')
      .replaceAll('ʊː','u');
  }else{
    ipa=ipa
      .replaceAll('ɡ','g')
      .replaceAll('ɾ','r')
      .replaceAll('ɫ','l')
      .replaceAll('ᵊ','ə')
      .replaceAll('ɑː','aː')
      .replaceAll('ɒː','aː')
      .replaceAll('ɜː','ɐ')
      .replaceAll('ɜ','ɐ');
  }
  return ipa;
}
