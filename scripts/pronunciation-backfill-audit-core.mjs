import { createHash } from 'node:crypto';

export const BACKFILL_AUDIT_SCHEMA='rhymelab-pronunciation-backfill-audit-v1';
export const BACKFILL_AUDIT_SAMPLE_SCHEMA='rhymelab-pronunciation-backfill-audit-sample-v1';

export function stableScore(seed,key){
  return createHash('sha256').update(String(seed)+'\0'+String(key)).digest('hex');
}

export function classifySurface(surface,tokenCount=1){
  const text=String(surface||'').normalize('NFKC').trim();
  const letters=[...text].filter((char)=>/\p{L}/u.test(char));
  const hasLetters=letters.length>0;
  const hasDigits=/\p{N}/u.test(text);
  const hasWhitespace=/\s/u.test(text);
  const hasHyphen=/[-‐‑‒–—]/u.test(text);
  const hasApostrophe=/['’]/u.test(text);
  const stripped=text
    .replace(/[\p{L}\p{M}\p{N}\s'’\-‐‑‒–—]/gu,'');
  const hasOtherPunctuation=stripped.length>0;
  const hasNonLatin=letters.some((char)=>!/[\p{Script=Latin}\p{M}]/u.test(char));
  const length=[...text].length;
  const lengthBucket=length<=1?'1':length<=3?'2-3':length<=7?'4-7':length<=15?'8-15':length<=31?'16-31':'32+';

  let shape='clean_single';
  if(hasNonLatin) shape='non_latin_letters';
  else if(hasOtherPunctuation) shape='other_punctuation';
  else if(hasDigits&&hasLetters) shape='mixed_alnum';
  else if(hasDigits) shape='numeric';
  else if(Number(tokenCount)>1||hasWhitespace) shape='multiword';
  else if(hasHyphen||hasApostrophe) shape='joined_lexeme';
  else if(length<=1) shape='single_character';
  else if(!hasLetters) shape='nonlexical';

  return {
    shape,
    length,
    length_bucket:lengthBucket,
    token_count:Number(tokenCount)||1,
    has_digits:hasDigits,
    has_whitespace:hasWhitespace,
    has_hyphen:hasHyphen,
    has_apostrophe:hasApostrophe,
    has_other_punctuation:hasOtherPunctuation,
    has_non_latin_letters:hasNonLatin,
  };
}

export function deterministicTake(rows,limit,seed,keyFn){
  const selected=[];
  for(const row of rows){
    const rank=stableScore(seed,keyFn(row));
    if(selected.length<limit){
      selected.push({rank,row});
      if(selected.length===limit) selected.sort((a,b)=>b.rank.localeCompare(a.rank));
      continue;
    }
    if(rank>=selected[0].rank) continue;
    selected[0]={rank,row};
    selected.sort((a,b)=>b.rank.localeCompare(a.rank));
  }
  return selected.sort((a,b)=>a.rank.localeCompare(b.rank)).map(({row})=>row);
}

export function allocateEqualQuotas(keys,total){
  const sorted=[...keys].sort();
  const base=Math.floor(total/sorted.length);
  let remainder=total-base*sorted.length;
  return new Map(sorted.map((key)=>[key,base+(remainder-->0?1:0)]));
}
