export const MARKOV_GENERATOR_POLICY='rhymelab-markov-bootstrap-v1';
export const MARKOV_MODEL_ORDER=2;

const MODEL_LINES={
  de:[
    'ich seh <CONTENT> und bleib bei <RHYME>',
    'ich zieh durch <CONTENT> bis <RHYME>',
    'ich red von <CONTENT> und denk an <RHYME>',
    'ich such in <CONTENT> nach <RHYME>',
    'ich fall durch <CONTENT> direkt in <RHYME>',
    'du siehst <CONTENT> und willst nur <RHYME>',
    'du redest von <CONTENT> ich denk an <RHYME>',
    'du läufst durch <CONTENT> bis <RHYME>',
    'wir ziehen durch <CONTENT> Richtung <RHYME>',
    'wir reden über <CONTENT> bis <RHYME>',
    'wir bleiben bei <CONTENT> trotz <RHYME>',
    'wir bauen aus <CONTENT> wieder <RHYME>',
    'heute klingt <CONTENT> fast wie <RHYME>',
    'heute wird aus <CONTENT> plötzlich <RHYME>',
    'heute bleibt von <CONTENT> nur <RHYME>',
    'nachts wird aus <CONTENT> wieder <RHYME>',
    'nachts zieht <CONTENT> vorbei an <RHYME>',
    'nachts klingt <CONTENT> nach <RHYME>',
    'zwischen <CONTENT> und <CONTENT> bleibt <RHYME>',
    'zwischen <CONTENT> und <ENTITY> liegt <RHYME>',
    'unter <CONTENT> such ich <RHYME>',
    'unter <CONTENT> wird alles zu <RHYME>',
    'mit <ENTITY> durch <CONTENT> bis <RHYME>',
    'mit <ENTITY> wird aus <CONTENT> noch <RHYME>',
    '<PHRASE> und plötzlich klingt alles nach <RHYME>',
    '<PHRASE> doch am Ende bleibt <RHYME>',
    '<PHRASE> bis daraus wieder <RHYME> wird',
    'kein <CONTENT> ohne <RHYME>',
    'kein Weg durch <CONTENT> ohne <RHYME>',
    'aus <CONTENT> wird <CONTENT> und am Ende <RHYME>',
    'aus <CONTENT> fällt <CONTENT> direkt auf <RHYME>',
    'wenn <CONTENT> fällt dann bleibt <RHYME>',
    'wenn <CONTENT> kommt dann klingt es nach <RHYME>',
    'wenn <ENTITY> auftaucht wird <CONTENT> zu <RHYME>',
    'solange <CONTENT> bleibt such ich <RHYME>',
    'solange <CONTENT> klingt bleibt auch <RHYME>',
    'hinter <CONTENT> wartet schon <RHYME>',
    'hinter <ENTITY> liegt <CONTENT> neben <RHYME>',
    'vor <CONTENT> steht <CONTENT> direkt bei <RHYME>',
    'alles an <CONTENT> zieht mich Richtung <RHYME>',
    'alles wird <CONTENT> und endet bei <RHYME>',
    'manchmal klingt <CONTENT> besser mit <RHYME>',
    'manchmal wird <CONTENT> einfach <RHYME>',
    'plötzlich steht <ENTITY> zwischen <CONTENT> und <RHYME>',
    'plötzlich wird <PHRASE> zu <RHYME>',
  ],
  en:[
    'I see <CONTENT> and stay with <RHYME>',
    'I move through <CONTENT> into <RHYME>',
    'I talk about <CONTENT> and think of <RHYME>',
    'I search through <CONTENT> for <RHYME>',
    'you see <CONTENT> and ask for <RHYME>',
    'you walk through <CONTENT> toward <RHYME>',
    'we turn <CONTENT> into <RHYME>',
    'we keep <CONTENT> beside <RHYME>',
    'tonight <CONTENT> sounds like <RHYME>',
    'tonight <CONTENT> becomes <RHYME>',
    'between <CONTENT> and <CONTENT> sits <RHYME>',
    'between <CONTENT> and <ENTITY> waits <RHYME>',
    'under <CONTENT> I look for <RHYME>',
    'with <ENTITY> through <CONTENT> into <RHYME>',
    '<PHRASE> and suddenly everything sounds like <RHYME>',
    '<PHRASE> but in the end there is <RHYME>',
    'no <CONTENT> without <RHYME>',
    'out of <CONTENT> comes <CONTENT> then <RHYME>',
    'when <CONTENT> falls there is <RHYME>',
    'when <ENTITY> appears <CONTENT> turns into <RHYME>',
    'behind <CONTENT> waits <RHYME>',
    'behind <ENTITY> sits <CONTENT> beside <RHYME>',
    'everything in <CONTENT> pulls toward <RHYME>',
    'sometimes <CONTENT> works better with <RHYME>',
    'suddenly <ENTITY> stands between <CONTENT> and <RHYME>',
    'suddenly <PHRASE> turns into <RHYME>',
  ],
};

const VOWELS=/[aeiouyɑɒæɛəɜɪiɔoʊuʌœøɐɯɨɤɶɞɚɝɒɔɐɪʏʊɘɵɻɡ]/iu;
const IPA_VOWEL_GROUP=/[aeiouyɑɒæɛəɜɪiɔoʊuʌœøɐɯɨɤɶɞɚɝɒɔɐɪʏʊɘɵ]+/giu;
const PLACEHOLDERS=new Set(['<CONTENT>','<ENTITY>','<PHRASE>','<RHYME>']);

function clamp(value,min=0,max=1){
  const number=Number(value);
  if(!Number.isFinite(number))return min;
  return Math.max(min,Math.min(max,number));
}

function hashString(value){
  let hash=2166136261>>>0;
  for(const ch of String(value??'')){
    hash^=ch.codePointAt(0);
    hash=Math.imul(hash,16777619)>>>0;
  }
  return hash>>>0;
}

export function createSeededRandom(seed){
  let state=hashString(seed)||0x6d2b79f5;
  return ()=>{
    state|=0;
    state=state+0x6D2B79F5|0;
    let t=state;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function tokenizeModelLine(line){
  return String(line).trim().split(/\s+/u).filter(Boolean);
}

function buildModel(lines){
  const transitions=new Map();
  for(const line of lines){
    const tokens=['^','^',...tokenizeModelLine(line),'$'];
    for(let index=MARKOV_MODEL_ORDER;index<tokens.length;index+=1){
      const key=tokens.slice(index-MARKOV_MODEL_ORDER,index).join('\u0001');
      const next=tokens[index];
      const row=transitions.get(key)||new Map();
      row.set(next,(row.get(next)||0)+1);
      transitions.set(key,row);
    }
  }
  return transitions;
}

const MODELS={
  de:buildModel(MODEL_LINES.de),
  en:buildModel(MODEL_LINES.en),
};

function weightedChoice(entries,random){
  const total=entries.reduce((sum,row)=>sum+row.weight,0);
  if(total<=0)return entries[0]?.value??null;
  let point=random()*total;
  for(const row of entries){
    point-=row.weight;
    if(point<=0)return row.value;
  }
  return entries.at(-1)?.value??null;
}

function transitionPath(language,random,{minimumTokens=5,maximumTokens=14}={}){
  const model=MODELS[language]||MODELS.de;
  const state=['^','^'];
  const tokens=[];
  const probabilities=[];
  const maxSteps=Math.max(6,maximumTokens+8);
  for(let step=0;step<maxSteps;step+=1){
    const key=state.join('\u0001');
    const choices=model.get(key);
    if(!choices)break;
    let rows=[...choices.entries()].map(([value,weight])=>({value,weight}));
    if(tokens.length<minimumTokens)rows=rows.filter((row)=>row.value!=='$');
    if(!rows.length)rows=[...choices.entries()].map(([value,weight])=>({value,weight}));
    const next=weightedChoice(rows,random);
    const total=rows.reduce((sum,row)=>sum+row.weight,0)||1;
    const chosenWeight=rows.find((row)=>row.value===next)?.weight||1;
    probabilities.push(chosenWeight/total);
    if(next==='$')break;
    tokens.push(next);
    state.shift();
    state.push(next);
    if(tokens.length>=maximumTokens){
      const endChoices=model.get(state.join('\u0001'));
      if(endChoices?.has('$'))break;
    }
  }
  if(!tokens.includes('<RHYME>'))tokens.push('<RHYME>');
  const probability=probabilities.length
    ?Math.exp(probabilities.reduce((sum,value)=>sum+Math.log(Math.max(value,1e-9)),0)/probabilities.length)
    :0;
  return {tokens,probability:clamp(probability)};
}

function normalizeKind(row){
  const kind=String(row?.resultKind||'word').toLowerCase();
  if(kind==='phrase')return 'phrase';
  if(kind==='entity')return 'entity';
  return 'word';
}

function usageQuality(row){
  if(Number.isFinite(Number(row?.popularityPercentile)))return clamp(Number(row.popularityPercentile));
  if(Number.isFinite(Number(row?.leipzigCommonness)))return clamp(Number(row.leipzigCommonness));
  const rank=Number(row?.usageRank);
  if(Number.isFinite(rank)&&rank>0)return clamp(1-(Math.log10(rank+1)/7));
  const count=Number(row?.usageCount);
  if(Number.isFinite(count)&&count>0)return clamp(Math.log10(count+1)/6);
  return 0.5;
}

function relationScore(row,type){
  const relation=(row?.relations||[]).find((entry)=>entry?.type===type);
  return clamp(relation?.score??0);
}

export function vowelSignature(ipa){
  const matches=String(ipa||'').normalize('NFKC').match(IPA_VOWEL_GROUP)||[];
  return matches.map((part)=>part.toLocaleLowerCase('en-US'));
}

function normalizedEditSimilarity(left,right){
  const a=[...left];
  const b=[...right];
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

function consonantSignature(ipa){
  return [...String(ipa||'').normalize('NFKC').toLocaleLowerCase('en-US')]
    .filter((ch)=>/[\p{L}]/u.test(ch)&&!VOWELS.test(ch))
    .join('');
}

function consonantSimilarity(leftIpa,rightIpa){
  const left=consonantSignature(leftIpa);
  const right=consonantSignature(rightIpa);
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
    const kind=normalizeKind(row);
    if(kind==='entity'&&!allowEntities)continue;
    if(kind==='phrase'&&!allowPhrases)continue;
    const key=\`\${kind}:\${normalized}\`;
    if(seen.has(key))continue;
    seen.add(key);
    out.push({
      raw:row,
      surface,
      normalized,
      kind,
      ipa:String(row?.ipa||row?.preferredIpa||''),
      baseScore:clamp(row?.score??0),
      assonance:relationScore(row,'assonance'),
      consonance:relationScore(row,'consonance'),
      naturalness:usageQuality(row),
      primaryType:String(row?.primaryType||row?.type||''),
      crossedWordBoundaries:Number(row?.crossedWordBoundaries||0),
      entityCategories:Array.isArray(row?.entityCategories)?row.entityCategories:[],
      generated:Boolean(row?.generatedPronunciation||String(row?.lexiconLayer||'').includes('generated')),
    });
  }
  return out;
}

function modeScore(candidate,mode,previousCandidate=null){
  const base=candidate.baseScore;
  const assonance=candidate.assonance||vowelSimilarity(candidate.ipa,previousCandidate?.ipa||'');
  const consonance=candidate.consonance||consonantSimilarity(candidate.ipa,previousCandidate?.ipa||'');
  const multi=candidate.primaryType.includes('multisyllabic')?Math.max(base,0.92):base*0.72;
  const mosaic=candidate.kind==='phrase'
    ?clamp(base*0.75+Math.min(1,candidate.crossedWordBoundaries/2)*0.25)
    :base*0.45;
  const chain=previousCandidate
    ?clamp(assonance*0.55+vowelSimilarity(candidate.ipa,previousCandidate.ipa)*0.45)
    :Math.max(assonance,base*0.7);
  const internal=clamp(Math.max(assonance,consonance)*0.72+base*0.28);
  switch(mode){
    case 'end':return base;
    case 'multi':return multi;
    case 'mosaic':return mosaic;
    case 'slant':return /slant|family/u.test(candidate.primaryType)?Math.max(base,0.88):base*0.62;
    case 'assonance':return Math.max(assonance,base*0.45);
    case 'chain':return chain;
    case 'consonance':return Math.max(consonance,base*0.45);
    case 'internal':return internal;
    default:return clamp(base*0.55+assonance*0.2+consonance*0.1+multi*0.15);
  }
}

function chooseCandidate(candidates,random,{mode,rhymePressure,weirdness,previousCandidate,used}){
  const pressure=clamp(rhymePressure/100);
  const weird=clamp(weirdness/100);
  const available=candidates.filter((candidate)=>!used.has(\`\${candidate.kind}:\${candidate.normalized}\`));
  const source=available.length?available:candidates;
  if(!source.length)return null;
  const rows=source.map((candidate)=>{
    const phonetic=modeScore(candidate,mode,previousCandidate);
    const repetition=used.has(\`\${candidate.kind}:\${candidate.normalized}\`)?0.18:0;
    const score=clamp(
      candidate.naturalness*(1-pressure)*0.85
      +phonetic*pressure
      +candidate.baseScore*0.12
      -repetition,
    );
    const jitter=(random()-0.5)*0.4*weird;
    return {candidate,score:score+jitter,phonetic};
  }).sort((a,b)=>b.score-a.score||a.candidate.surface.localeCompare(b.candidate.surface));
  const topCount=Math.max(1,Math.round(1+weird*Math.min(10,rows.length-1)));
  const shortlist=rows.slice(0,topCount);
  const selected=shortlist[Math.floor(random()*shortlist.length)]||shortlist[0];
  return selected?{...selected.candidate,selectionScore:clamp(selected.score),modeScore:selected.phonetic}:null;
}

function poolForPlaceholder(pool,placeholder,options){
  const words=pool.filter((candidate)=>candidate.kind==='word');
  if(placeholder==='<ENTITY>'&&options.allowEntities){
    const entities=pool.filter((candidate)=>candidate.kind==='entity'||candidate.entityCategories.length);
    if(entities.length)return entities;
  }
  if(placeholder==='<PHRASE>'&&options.allowPhrases){
    const phrases=pool.filter((candidate)=>candidate.kind==='phrase');
    if(phrases.length)return phrases;
  }
  if(placeholder==='<RHYME>')return pool.length?pool:words;
  return words.length?words:pool;
}

function titleCaseFirst(value,language){
  const text=String(value||'').trim();
  if(!text)return '';
  const locale=language==='de'?'de-DE':'en-US';
  return text[0].toLocaleUpperCase(locale)+text.slice(1);
}

function materializePath(path,pool,random,options){
  const used=new Set();
  const tokenRows=[];
  const selected=[];
  let previousCandidate=null;
  for(const token of path.tokens){
    if(!PLACEHOLDERS.has(token)){
      tokenRows.push({text:token,kind:'structure'});
      continue;
    }
    const source=poolForPlaceholder(pool,token,options);
    const candidate=chooseCandidate(source,random,{
      mode:options.mode,
      rhymePressure:token==='<RHYME>'?Math.max(options.rhymePressure,55):options.rhymePressure,
      weirdness:options.weirdness,
      previousCandidate,
      used,
    });
    if(!candidate)continue;
    const key=\`\${candidate.kind}:\${candidate.normalized}\`;
    used.add(key);
    selected.push(candidate);
    previousCandidate=candidate;
    const displayKind=token==='<ENTITY>'&&options.allowEntities?'entity':candidate.kind;
    tokenRows.push({
      text:candidate.surface,
      kind:displayKind,
      ipa:candidate.ipa,
      score:candidate.baseScore,
      modeScore:candidate.modeScore,
      generated:candidate.generated,
      placeholder:token,
    });
  }
  if(options.seedText){
    tokenRows.unshift({text:String(options.seedText).trim().replace(/[,.!?;:]+$/u,''),kind:'seed'});
  }
  const clean=tokenRows.filter((row)=>row.text);
  const pieces=clean.map((row,index)=>{
    if(index===0)return row.text;
    if(index===1&&clean[0]?.kind==='seed')return \`— \${row.text}\`;
    return row.text;
  });
  let sentence=pieces.join(' ').replace(/\s+/gu,' ').trim();
  sentence=titleCaseFirst(sentence,options.language);
  if(sentence&&!/[.!?…]$/u.test(sentence))sentence+='.';
  return {sentence,tokens:clean,selected};
}

function pairwiseScore(selected,metric){
  if(selected.length<2)return selected[0]?metric(selected[0],selected[0]):0;
  let sum=0;
  let count=0;
  for(let index=1;index<selected.length;index+=1){
    sum+=metric(selected[index-1],selected[index]);
    count+=1;
  }
  return count?clamp(sum/count):0;
}

function scoreMaterialized(path,materialized,options){
  const selected=materialized.selected;
  const rhyme=selected.length
    ?clamp(selected.reduce((sum,candidate,index)=>sum+candidate.modeScore*(index===selected.length-1?1.45:1),0)/(selected.length+0.45))
    :0;
  const lexicalNaturalness=selected.length
    ?selected.reduce((sum,candidate)=>sum+candidate.naturalness,0)/selected.length
    :0.5;
  const naturalness=clamp(path.probability*0.72+lexicalNaturalness*0.28);
  const assonanceChain=pairwiseScore(selected,(left,right)=>vowelSimilarity(left.ipa,right.ipa));
  const internalRhyme=pairwiseScore(selected,(left,right)=>Math.max(
    vowelSimilarity(left.ipa,right.ipa),
    consonantSimilarity(left.ipa,right.ipa),
  ));
  const targetLength=Math.max(4,Number(options.targetTokens)||10);
  const actualLength=materialized.sentence.split(/\s+/u).filter(Boolean).length;
  const lengthFit=clamp(1-Math.abs(actualLength-targetLength)/Math.max(targetLength,1));
  const pressure=clamp(options.rhymePressure/100);
  const naturalWeight=clamp(options.naturalness/100);
  const weird=clamp(options.weirdness/100);
  const phonetic=options.mode==='chain'?clamp(rhyme*0.45+assonanceChain*0.55)
    :options.mode==='internal'?clamp(rhyme*0.45+internalRhyme*0.55)
      :rhyme;
  const utility=clamp(
    naturalness*(0.38+naturalWeight*0.32)
    +phonetic*(0.18+pressure*0.38)
    +lengthFit*0.12
    +Math.min(0.08,selected.length*0.012)
    +(1-naturalness)*weird*0.08,
  );
  return {utility,naturalness,rhyme:phonetic,assonanceChain,internalRhyme,lengthFit,actualLength};
}

function sourceCounts(tokens){
  const counts={word:0,phrase:0,entity:0,structure:0,seed:0,generated:0};
  for(const token of tokens){
    if(Object.hasOwn(counts,token.kind))counts[token.kind]+=1;
    if(token.generated)counts.generated+=1;
  }
  return counts;
}

export function generateMarkovCandidates({
  rows=[],
  language='de',
  seedText='',
  target='',
  seed=1337,
  targetTokens=10,
  rhymePressure=65,
  naturalness=72,
  weirdness=38,
  mode='balanced',
  allowEntities=true,
  allowPhrases=true,
  count=8,
  attempts=32,
}={}){
  const code=language==='en'?'en':'de';
  const pool=normalizeMarkovPool(rows,{target,allowEntities,allowPhrases});
  if(!pool.length)return [];
  const desired=Math.max(1,Math.min(12,Number(count)||8));
  const attemptCount=Math.max(desired,Math.min(96,Number(attempts)||32));
  const minimum=Math.max(4,Math.min(12,Math.round(Number(targetTokens||10)*0.55)));
  const maximum=Math.max(minimum+2,Math.min(24,Math.round(Number(targetTokens||10)*1.25)));
  const seen=new Set();
  const candidates=[];
  for(let attempt=0;attempt<attemptCount;attempt+=1){
    const seedMaterial=[MARKOV_GENERATOR_POLICY,code,seedText,target,seed,targetTokens,rhymePressure,naturalness,weirdness,mode,attempt].join('|');
    const random=createSeededRandom(seedMaterial);
    const path=transitionPath(code,random,{minimumTokens:minimum,maximumTokens:maximum});
    const materialized=materializePath(path,pool,random,{
      language:code,seedText,mode,rhymePressure,naturalness,weirdness,allowEntities,allowPhrases,
    });
    if(!materialized.sentence||seen.has(materialized.sentence))continue;
    seen.add(materialized.sentence);
    const scores=scoreMaterialized(path,materialized,{targetTokens,rhymePressure,naturalness,weirdness,mode});
    candidates.push({
      id:\`mk-\${hashString(\`\${seedMaterial}|\${materialized.sentence}\`).toString(16)}\`,
      sentence:materialized.sentence,
      tokens:materialized.tokens,
      scores,
      sourceCounts:sourceCounts(materialized.tokens),
      model:{policy:MARKOV_GENERATOR_POLICY,order:MARKOV_MODEL_ORDER,language:code,pathProbability:path.probability},
      seed:Number(seed)||0,
      mode,
    });
  }
  return candidates
    .sort((a,b)=>b.scores.utility-a.scores.utility||b.scores.rhyme-a.scores.rhyme||a.sentence.localeCompare(b.sentence))
    .slice(0,desired)
    .map((candidate,index)=>({...candidate,rank:index+1}));
}

export function summarizePool(rows){
  const summary={total:0,word:0,phrase:0,entity:0,generated:0};
  for(const row of rows||[]){
    summary.total+=1;
    const kind=normalizeKind(row);
    summary[kind]+=1;
    if(row?.generatedPronunciation||String(row?.lexiconLayer||'').includes('generated'))summary.generated+=1;
  }
  return summary;
}
