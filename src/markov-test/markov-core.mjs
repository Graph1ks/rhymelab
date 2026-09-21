export const MARKOV_GENERATOR_POLICY='rhymelab-constrained-lyric-decoder-v2';

const IPA_VOWEL_GROUP=/[aeiouyɑɒæɛəɜɪiɔoʊuʌœøɐɯɨɤɶɞɚɝʏɵ]+/giu;

function clamp(value,min=0,max=1){
  const number=Number(value);
  if(!Number.isFinite(number))return min;
  return Math.max(min,Math.min(max,number));
}

export function markovMaterialKind(row){
  const kind=String(row?.resultKind||'word').toLowerCase();
  if(kind==='phrase')return 'phrase';
  if(kind==='entity')return 'entity';
  const surface=String(row?.surface||row?.word||'').normalize('NFKC').trim();
  // Serving-v1 surface consolidation can legally carry a multi-token surface
  // through the Word channel. For Markov material controls that is still a
  // phrase/chunk, not a single word.
  if(surface&&surface.split(/\s+/u).filter(Boolean).length>1)return 'phrase';
  return 'word';
}

export function vowelSignature(ipa){
  const matches=String(ipa||'').normalize('NFKC').match(IPA_VOWEL_GROUP)||[];
  return matches.map((part)=>part.toLocaleLowerCase('en-US'));
}

function normalizedEditSimilarity(left,right){
  const a=[...left],b=[...right];
  if(!a.length&&!b.length)return 1;
  if(!a.length||!b.length)return 0;
  const rows=Array.from({length:a.length+1},()=>new Array(b.length+1).fill(0));
  for(let i=0;i<=a.length;i+=1)rows[i][0]=i;
  for(let j=0;j<=b.length;j+=1)rows[0][j]=j;
  for(let i=1;i<=a.length;i+=1){
    for(let j=1;j<=b.length;j+=1){
      const cost=a[i-1]===b[j-1]?0:1;
      rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+cost);
    }
  }
  return clamp(1-(rows[a.length][b.length]/Math.max(a.length,b.length)));
}

export function vowelSimilarity(leftIpa,rightIpa){
  const left=vowelSignature(leftIpa).join('');
  const right=vowelSignature(rightIpa).join('');
  if(!left||!right)return 0;
  return normalizedEditSimilarity(left,right);
}

export function normalizeMarkovPool(rows,{target='',allowEntities=true,allowPhrases=true}={}){
  const seen=new Set();
  const normalizedTarget=String(target||'').normalize('NFKC').trim().toLocaleLowerCase('en-US');
  const out=[];
  for(const row of rows||[]){
    const surface=String(row?.surface||row?.word||'').normalize('NFKC').trim();
    if(!surface)continue;
    const normalized=String(row?.normalized||surface).toLocaleLowerCase('en-US');
    if(normalized===normalizedTarget)continue;
    const kind=markovMaterialKind(row);
    if(kind==='entity'&&!allowEntities)continue;
    if(kind==='phrase'&&!allowPhrases)continue;
    const key=`${kind}:${normalized}`;
    if(seen.has(key))continue;
    seen.add(key);
    out.push({raw:row,surface,normalized,kind});
  }
  return out;
}

export function summarizePool(rows){
  const counts={total:0,word:0,phrase:0,entity:0,generated:0};
  for(const row of rows||[]){
    const kind=markovMaterialKind(row);
    counts.total+=1;
    counts[kind]+=1;
    if(row?.generatedPronunciation||String(row?.lexiconLayer||'').includes('generated'))counts.generated+=1;
  }
  return counts;
}

export function compactWriterRows(rows){
  return (rows||[]).map((row)=>({
    resultKind:markovMaterialKind(row),
    surface:row?.surface,
    word:row?.word,
    normalized:row?.normalized,
    ipa:row?.ipa,
    preferredIpa:row?.preferredIpa,
    score:row?.score,
    primaryType:row?.primaryType,
    type:row?.type,
    usageRank:row?.usageRank,
    usageCount:row?.usageCount,
    popularityPercentile:row?.popularityPercentile,
    leipzigCommonness:row?.leipzigCommonness,
    crossedWordBoundaries:row?.crossedWordBoundaries,
    entityCategories:Array.isArray(row?.entityCategories)?row.entityCategories.slice(0,8):[],
    generatedPronunciation:Boolean(row?.generatedPronunciation),
    lexiconLayer:row?.lexiconLayer,
    relations:Array.isArray(row?.relations)
      ?row.relations.filter((entry)=>['assonance','consonance'].includes(String(entry?.type||'').toLowerCase())).slice(0,8)
      :[],
  }));
}
