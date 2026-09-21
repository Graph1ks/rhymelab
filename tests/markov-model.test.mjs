import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {
  END_TOKEN,
  MARKOV_MODEL_ORDER,
  MARKOV_MODEL_POLICY,
  MARKOV_MODEL_SCHEMA,
  START_TOKEN,
  createMarkovStorage,
  lexicalNorms,
  preferredSurfaceFor,
  sequenceFromSentence,
  sequenceHash,
  shapeKeyForTokens,
  stateKey,
  tokenShape,
  tokenizeCorpusSentence,
  writeMeta,
} from '../src/markov-model-core.mjs';
import {
  createMarkovRuntime,
  markovModelHealth,
} from '../src/markov-model-runtime.mjs';
import {
  analyzeLyricCandidateSet,
  candidateSimilarity,
  generateLyricCandidatesV2,
  generateLyricSectionV2,
  planLyricSection,
} from '../src/lyric-decoder-v2.mjs';
import {
  MARKOV_LYRIC_PROFILE,
  lyricLengthFit,
  lyricTargetBounds,
} from '../src/markov-lyric-profile.mjs';

const fixtureSentences=[
  'Nachts in der Stadt suche ich eine lange Reise.',
  'Mitten in der Stadt suche ich eine neue Weise.',
  'Wir laufen durch die Straßen bis zum hellen Morgen.',
  'Ich schreibe neue Zeilen bis zum frühen Morgen.',
  'Die Musik bleibt heute leise unter grauen Wolken.',
  'Meine Stimme trägt die Reise durch die leeren Straßen.',
  'Jede Zeile sucht die Weise hinter kalten Mauern.',
  'Wir drehen uns im Kreise durch die halbe Nacht.',
  'Keiner bleibt alleine auf der langen Reise.',
  'Heute klingt die Sprache anders in der alten Stadt.',
  'Zwischen Licht und Schatten wächst eine neue Reise.',
  'Unter diesen Dächern klingt die Musik noch leise.',
];

const writerRows=[
  {resultKind:'word',surface:'Reise',normalized:'reise',ipa:'ʁaɪ zə',score:.95,primaryType:'multisyllabic_perfect',usageRank:100,relations:[{type:'assonance',score:.95}]},
  {resultKind:'word',surface:'Weise',normalized:'weise',ipa:'vaɪ zə',score:.92,primaryType:'perfect',usageRank:200,relations:[{type:'assonance',score:.92}]},
  {resultKind:'word',surface:'leise',normalized:'leise',ipa:'laɪ zə',score:.88,primaryType:'slant',usageRank:300,relations:[{type:'assonance',score:.9}]},
  {resultKind:'word',surface:'Kreise',normalized:'kreise',ipa:'kʁaɪ zə',score:.86,primaryType:'perfect',usageRank:450,relations:[{type:'assonance',score:.88}]},
  {resultKind:'phrase',surface:'eine neue Weise',normalized:'eine neue weise',ipa:'aɪ nə nɔɪ ə vaɪ zə',score:.91,crossedWordBoundaries:2,leipzigCommonness:.9,relations:[{type:'assonance',score:.94}]},
  {resultKind:'entity',surface:'Michael Jackson',normalized:'michael jackson',ipa:'maɪ kəl dʒæk sən',score:.99,popularityPercentile:.99,entityCategories:[{category:'person.musician'}],relations:[{type:'assonance',score:.97}]},
  {resultKind:'entity',surface:'der Stadt',normalized:'der stadt',ipa:'deːɐ̯ ʃtat',score:.12,popularityPercentile:.99,entityCategories:[{category:'work.film'}],relations:[{type:'assonance',score:.08}]},
];

function fixtureRuntime(){
  const db=new DatabaseSync(':memory:');
  createMarkovStorage(db);
  writeMeta(db,{
    schema:MARKOV_MODEL_SCHEMA,
    policy:MARKOV_MODEL_POLICY,
    language:'de',
    order:MARKOV_MODEL_ORDER,
    semantic_fingerprint:'fixture-v2',
    accepted_sentences:fixtureSentences.length,
    source_sentences:fixtureSentences.length,
  });

  const tokenCounts=new Map();
  const transitions=new Map();
  const sourceSequenceUpsert=db.prepare(
    "INSERT INTO source_sequence_hash(source_kind,hash,token_count,count) VALUES('sentence',?,?,1) ON CONFLICT(source_kind,hash) DO UPDATE SET count=count+1",
  );
  const sourceWindowUpsert=db.prepare(
    "INSERT INTO source_window_hash(source_kind,hash,window_size,count) VALUES('sentence',?,?,1) ON CONFLICT(source_kind,hash) DO UPDATE SET count=count+1",
  );
  const shapeUpsert=db.prepare(
    'INSERT INTO shape_pattern(token_count,shape_key,count) VALUES(?,?,1) ON CONFLICT(token_count,shape_key) DO UPDATE SET count=count+1',
  );

  const add=(direction,len,state,next)=>{
    const key=`${direction}\u0002${len}\u0002${state}\u0002${next}`;
    transitions.set(key,(transitions.get(key)||0)+1);
  };

  for(const sentence of fixtureSentences){
    const sequence=sequenceFromSentence(sentence,{language:'de'});
    for(const row of sequence.slice(MARKOV_MODEL_ORDER,-1)){
      const current=tokenCounts.get(row.norm)||{norm:row.norm,count:0,title_count:0,upper_count:0};
      current.count+=1;
      const shape=tokenShape(row.surface);
      if(shape==='title')current.title_count+=1;
      else if(shape==='upper')current.upper_count+=1;
      tokenCounts.set(row.norm,current);
    }

    const norms=sequence.map((row)=>row.norm);
    for(let i=1;i<norms.length;i+=1){
      for(let len=1;len<=Math.min(MARKOV_MODEL_ORDER,i);len+=1){
        add('forward',len,stateKey(norms.slice(i-len,i)),norms[i]);
      }
    }
    for(let i=norms.length-2;i>=0;i-=1){
      const available=norms.length-i-1;
      for(let len=1;len<=Math.min(MARKOV_MODEL_ORDER,available);len+=1){
        add('reverse',len,stateKey(norms.slice(i+1,i+1+len)),norms[i]);
      }
    }

    const lexical=lexicalNorms(sequence);
    sourceSequenceUpsert.run(sequenceHash(lexical),lexical.length);
    for(let size=4;size<=Math.min(8,lexical.length);size+=1){
      for(let start=0;start+size<=lexical.length;start+=1){
        sourceWindowUpsert.run(sequenceHash(lexical.slice(start,start+size)),size);
      }
    }
    shapeUpsert.run(lexical.length,shapeKeyForTokens(lexical,'de'));
  }

  tokenCounts.set(START_TOKEN,{norm:START_TOKEN,count:1,title_count:0,upper_count:0});
  tokenCounts.set(END_TOKEN,{norm:END_TOKEN,count:1,title_count:0,upper_count:0});
  const tokenInsert=db.prepare(
    'INSERT INTO token(norm,count,title_count,upper_count,preferred_surface) VALUES(?,?,?,?,?)',
  );
  for(const row of tokenCounts.values()){
    tokenInsert.run(row.norm,row.count,row.title_count,row.upper_count,preferredSurfaceFor(row));
  }
  const transitionInsert=db.prepare(
    'INSERT INTO transition(direction,context_len,state_key,next_token,count) VALUES(?,?,?,?,?)',
  );
  for(const [key,count] of transitions){
    const [direction,len,state,next]=key.split('\u0002');
    transitionInsert.run(direction,Number(len),state,next,count);
  }
  return createMarkovRuntime(db,{path:':memory:'});
}

test('V2 tokenizer keeps lexical order and order-4 sentence boundaries',()=>{
  assert.deepEqual(
    tokenizeCorpusSentence('Am Ende dieser Reise wartet eine neue Weise.',{language:'de'})
      .map((row)=>row.norm),
    ['am','ende','dieser','reise','wartet','eine','neue','weise'],
  );
  const sequence=sequenceFromSentence('Heute bleibt die Musik leise.',{language:'de'});
  assert.deepEqual(sequence.slice(0,MARKOV_MODEL_ORDER).map((row)=>row.norm),[
    START_TOKEN,START_TOKEN,START_TOKEN,START_TOKEN,
  ]);
});

test('V2 runtime exposes variable-order, novelty and shape evidence',()=>{
  const runtime=fixtureRuntime();
  const health=markovModelHealth(runtime);
  assert.equal(health.available,true);
  assert.equal(health.policy,MARKOV_MODEL_POLICY);
  assert.equal(health.schema,MARKOV_MODEL_SCHEMA);
  assert.equal(health.order,4);
  assert.ok(health.source_sequences>0);
  assert.ok(health.source_windows>0);
  assert.ok(health.shape_patterns>0);

  const source=fixtureSentences[0];
  const tokens=tokenizeCorpusSentence(source,{language:'de'}).map((row)=>row.norm);
  const novelty=runtime.sourceNovelty(tokens);
  assert.equal(novelty.exactSource,true);
  assert.ok(novelty.longestSourceRun>=4);
  assert.equal(novelty.byKind.sentence.exact,true);
  assert.equal(novelty.byKind.phrase.exact,false);
  assert.ok(runtime.shapeEvidence(tokens).fit>0);
  runtime.close();
});

test('V2 decoder is deterministic, exact-length and uses real rhyme tails',()=>{
  const runtime=fixtureRuntime();
  const options={
    rows:writerRows,
    target:'Arbeitsweise',
    seed:4242,
    mode:'end',
    rhymePressure:86,
    naturalness:62,
    weirdness:55,
    targetTokens:9,
    count:4,
    attempts:160,
    allowEntities:false,
  };
  const first=generateLyricCandidatesV2(runtime,options);
  const second=generateLyricCandidatesV2(runtime,options);
  assert.ok(first.length>=2);
  assert.deepEqual(first,second);
  assert.ok(first.every((candidate)=>candidate.scores.actualLength===9));
  assert.ok(first.every((candidate)=>candidate.scores.lengthWithinTarget===true));
  assert.ok(first.every((candidate)=>candidate.scores.exactSource===false));
  assert.ok(first.every((candidate)=>candidate.scores.copiedTooFar===false));
  assert.ok(first.every((candidate)=>candidate.model.policy==='rhymelab-constrained-lyric-decoder-v2'));
  assert.ok(first.every((candidate)=>['Reise','Weise','leise','Kreise','eine neue Weise']
    .some((tail)=>candidate.sentence.toLocaleLowerCase('de-DE')
      .includes(tail.toLocaleLowerCase('de-DE')))));
  runtime.close();
});

test('V2 decoder can place selected entities inside the line instead of only at the tail',()=>{
  const runtime=fixtureRuntime();
  const candidates=generateLyricCandidatesV2(runtime,{
    rows:writerRows,
    target:'Arbeitsweise',
    seed:9191,
    mode:'end',
    rhymePressure:88,
    naturalness:48,
    weirdness:62,
    targetTokens:9,
    count:8,
    attempts:256,
    allowEntities:true,
    entityCategories:['work.film'],
    allowPhrases:false,
  });
  const withInternalEntity=candidates.find((candidate)=>
    candidate.tokens.some((token)=>token.placeholder==='<ENTITY>')
  );
  assert.ok(withInternalEntity,'expected at least one context-supported internal entity splice');
  const entityIndex=withInternalEntity.tokens.findIndex((token)=>token.placeholder==='<ENTITY>');
  const rhymeIndex=withInternalEntity.tokens.findIndex((token)=>token.placeholder==='<RHYME>');
  assert.ok(entityIndex>=0);
  assert.ok(rhymeIndex>entityIndex);
  assert.equal(withInternalEntity.scores.actualLength,9);
  assert.equal(withInternalEntity.scores.lengthWithinTarget,true);
  assert.deepEqual(
    withInternalEntity.tokens[entityIndex].entityCategories,
    ['work.film'],
  );
  runtime.close();
});

test('V2 result-set selection penalizes near-duplicate endings',()=>{
  const base={
    model:{language:'de'},
    tokens:[],
    flatNorms:['wir','gehen','durch','die','nacht','reise'],
    tail:{normalized:'reise',family:'aɪ zə'},
  };
  const same={
    ...base,
    flatNorms:['sie','laufen','durch','die','nacht','reise'],
    tail:{normalized:'reise',family:'aɪ zə'},
  };
  const different={
    ...base,
    flatNorms:['heute','klingt','alles','anders','und','leise'],
    tail:{normalized:'leise',family:'laɪ zə'},
  };
  assert.ok(candidateSimilarity(base,same)>candidateSimilarity(base,different));
  assert.equal(candidateSimilarity(base,same),1);
});

test('section planner is deterministic and preserves rhyme slots',()=>{
  const a=planLyricSection({scheme:'ABAB',lines:8,targetTokens:12,section:'verse',seed:9});
  const b=planLyricSection({scheme:'ABAB',lines:8,targetTokens:12,section:'verse',seed:9});
  assert.deepEqual(a,b);
  assert.deepEqual(a.lines.map((line)=>line.rhymeSlot),['A','B','A','B','A','B','A','B']);
  assert.ok(a.lines.every((line)=>line.targetTokens>=11&&line.targetTokens<=13));
});

test('aggregate lyric profile treats explicit long targets as real targets',()=>{
  assert.equal(MARKOV_LYRIC_PROFILE.defaultTargetTokens,6);
  assert.ok(lyricLengthFit(16,16)>lyricLengthFit(2,16));
  assert.equal(lyricLengthFit(16,16),1);
  assert.deepEqual(lyricTargetBounds(16,{weirdness:.28}),{
    target:16,
    tolerance:2,
    min:14,
    max:18,
  });
  assert.equal(Object.hasOwn(MARKOV_LYRIC_PROFILE,'lyrics'),false);
});


test('decoder metrics measure tail diversity, exact length and pairwise collapse',()=>{
  const make=(tail,final,naturalness=.7)=>({
    model:{language:'de'},
    tokens:[],
    flatNorms:['wir','gehen','durch','die','nacht',final],
    tail:{normalized:tail,family:tail},
    scores:{
      actualLength:6,
      targetLength:6,
      copiedTooFar:false,
      exactSource:false,
      naturalness,
      rhyme:.8,
    },
  });
  const metrics=analyzeLyricCandidateSet([
    make('reise','reise'),
    make('weise','weise'),
    make('leise','leise'),
  ]);
  assert.equal(metrics.count,3);
  assert.equal(metrics.uniqueTailRatio,1);
  assert.equal(metrics.uniqueFinalTokenRatio,1);
  assert.equal(metrics.exactLengthRate,1);
  assert.equal(metrics.sourceCopyRate,0);
  assert.ok(metrics.meanPairwiseSimilarity<1);
});

test('section generation reports missing rhyme-slot pools explicitly',()=>{
  const runtime=fixtureRuntime();
  const section=generateLyricSectionV2(runtime,{
    scheme:'ABAB',
    lines:4,
    targetTokens:9,
    slots:{},
    seed:12,
  });
  assert.equal(section.complete,false);
  assert.equal(section.lines.length,0);
  assert.deepEqual(section.failures.map((row)=>row.rhymeSlot),['A','B','A','B']);
  assert.ok(section.failures.every((row)=>row.reason==='missing_slot_candidates'));
  runtime.close();
});
