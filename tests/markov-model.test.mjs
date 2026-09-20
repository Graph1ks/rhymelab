import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {
  MARKOV_MODEL_POLICY,
  MARKOV_MODEL_SCHEMA,
  START_TOKEN,
  END_TOKEN,
  createMarkovStorage,
  preferredSurfaceFor,
  sequenceFromSentence,
  stateKey,
  tokenShape,
  tokenizeCorpusSentence,
  writeMeta,
} from '../src/markov-model-core.mjs';
import {
  createMarkovRuntime,
  generateCorpusMarkovCandidates,
  markovModelHealth,
} from '../src/markov-model-runtime.mjs';

const fixtureSentences=[
  'Nachts in der Stadt klingt jede Straße anders.',
  'Nachts in der Stadt suche ich nach einer Reise.',
  'Ich fahre mit dem Zug auf eine lange Reise.',
  'Wir laufen durch die Straßen bis zum Morgen.',
  'Am Ende dieser Reise wartet eine neue Weise.',
  'Heute klingt die Musik noch leise.',
  'Zwischen Häusern und Lichtern bleibt die Stadt wach.',
  'Ich schreibe neue Zeilen bis zum Morgen.',
  'Wir suchen neue Wörter für die nächste Reise.',
  'Die Musik bleibt leise und die Straße wird wach.',
];

const writerRows=[
  {resultKind:'word',surface:'Reise',normalized:'reise',score:.95,primaryType:'multisyllabic_perfect',usageRank:100,relations:[{type:'assonance',score:.95}]},
  {resultKind:'word',surface:'Weise',normalized:'weise',score:.92,primaryType:'perfect',usageRank:200,relations:[{type:'assonance',score:.92}]},
  {resultKind:'word',surface:'leise',normalized:'leise',score:.88,primaryType:'slant',usageRank:300,relations:[{type:'assonance',score:.9}]},
  {resultKind:'phrase',surface:'eine neue Weise',normalized:'eine neue weise',score:.91,crossedWordBoundaries:2,leipzigCommonness:.9,relations:[{type:'assonance',score:.94}]},
  {resultKind:'entity',surface:'Michael Jackson',normalized:'michael jackson',score:.99,popularityPercentile:.99,entityCategories:[{category:'person.singer'}],relations:[{type:'assonance',score:.97}]},
];

function fixtureRuntime(){
  const db=new DatabaseSync(':memory:');
  createMarkovStorage(db);
  writeMeta(db,{schema:MARKOV_MODEL_SCHEMA,policy:MARKOV_MODEL_POLICY,language:'de',order:2,semantic_fingerprint:'fixture-v1',accepted_sentences:fixtureSentences.length,source_sentences:fixtureSentences.length});
  const tokenCounts=new Map();
  const transitions=new Map();
  const add=(direction,len,state,next)=>{
    const key=`${direction}\u0002${len}\u0002${state}\u0002${next}`;
    transitions.set(key,(transitions.get(key)||0)+1);
  };
  for(const sentence of fixtureSentences){
    const sequence=sequenceFromSentence(sentence,{language:'de'});
    for(const row of sequence.slice(2,-1)){
      const current=tokenCounts.get(row.norm)||{norm:row.norm,count:0,title_count:0,upper_count:0};
      current.count+=1;
      const shape=tokenShape(row.surface);
      if(shape==='title')current.title_count+=1;
      else if(shape==='upper')current.upper_count+=1;
      tokenCounts.set(row.norm,current);
    }
    const norms=sequence.map((row)=>row.norm);
    for(let i=2;i<norms.length;i+=1){
      add('forward',1,norms[i-1],norms[i]);
      add('forward',2,stateKey([norms[i-2],norms[i-1]]),norms[i]);
    }
    for(let i=norms.length-3;i>=1;i-=1){
      add('reverse',1,norms[i+1],norms[i]);
      add('reverse',2,stateKey([norms[i+1],norms[i+2]]),norms[i]);
    }
  }
  tokenCounts.set(START_TOKEN,{norm:START_TOKEN,count:1,title_count:0,upper_count:0});
  tokenCounts.set(END_TOKEN,{norm:END_TOKEN,count:1,title_count:0,upper_count:0});
  const tokenInsert=db.prepare('INSERT INTO token(norm,count,title_count,upper_count,preferred_surface) VALUES(?,?,?,?,?)');
  for(const row of tokenCounts.values())tokenInsert.run(row.norm,row.count,row.title_count,row.upper_count,preferredSurfaceFor(row));
  const stateInsert=db.prepare('INSERT OR IGNORE INTO state_count(state_key,count,retained) VALUES(?,?,1)');
  const transitionInsert=db.prepare('INSERT INTO transition(direction,context_len,state_key,next_token,count) VALUES(?,?,?,?,?)');
  for(const [key,count] of transitions){
    const [direction,len,state,next]=key.split('\u0002');
    transitionInsert.run(direction,Number(len),state,next,count);
    if(Number(len)===2)stateInsert.run(state,count);
  }
  return createMarkovRuntime(db,{path:':memory:'});
}

test('corpus tokenizer keeps lexical order and removes terminal punctuation',()=>{
  assert.deepEqual(tokenizeCorpusSentence('Am Ende dieser Reise wartet eine neue Weise.',{language:'de'}).map((row)=>row.norm),[
    'am','ende','dieser','reise','wartet','eine','neue','weise',
  ]);
});

test('corpus Markov generation is deterministic and ends on a real rhyme candidate',()=>{
  const runtime=fixtureRuntime();
  const options={rows:writerRows,target:'Arbeitsweise',seed:4242,mode:'end',rhymePressure:86,naturalness:82,weirdness:28,targetTokens:9,count:5,attempts:40};
  const first=generateCorpusMarkovCandidates(runtime,options);
  const second=generateCorpusMarkovCandidates(runtime,options);
  assert.ok(first.length>=3);
  assert.deepEqual(first,second);
  assert.ok(first.every((candidate)=>['Reise','Weise','leise','eine neue Weise'].some((tail)=>candidate.sentence.toLocaleLowerCase('de-DE').includes(tail.toLocaleLowerCase('de-DE')))));
  assert.ok(first.every((candidate)=>candidate.model.policy===MARKOV_MODEL_POLICY));
  assert.ok(first.every((candidate)=>candidate.scores.utility>=0&&candidate.scores.utility<=1));
  runtime.close();
});

test('high naturalness refuses unsupported random Entity tails instead of forcing them',()=>{
  const runtime=fixtureRuntime();
  const candidates=generateCorpusMarkovCandidates(runtime,{rows:writerRows,target:'Arbeitsweise',seed:91,mode:'end',rhymePressure:92,naturalness:96,weirdness:12,targetTokens:9,count:6,attempts:60,allowEntities:true});
  assert.ok(candidates.length);
  assert.equal(candidates.some((candidate)=>candidate.sentence.includes('Michael Jackson')),false);
  runtime.close();
});

test('Phrase and Entity toggles are hard generator boundaries',()=>{
  const runtime=fixtureRuntime();
  const candidates=generateCorpusMarkovCandidates(runtime,{rows:writerRows,target:'Arbeitsweise',seed:99,mode:'mosaic',rhymePressure:80,naturalness:70,weirdness:35,targetTokens:10,count:6,attempts:60,allowEntities:false,allowPhrases:false});
  assert.ok(candidates.length);
  for(const candidate of candidates){
    assert.equal(candidate.tokens.some((token)=>token.kind==='entity'),false);
    assert.equal(candidate.tokens.some((token)=>token.kind==='phrase'),false);
  }
  runtime.close();
});

test('seed text is joined through observed forward context at high naturalness',()=>{
  const runtime=fixtureRuntime();
  const candidates=generateCorpusMarkovCandidates(runtime,{rows:writerRows,target:'Arbeitsweise',seedText:'Nachts in der Stadt',seed:42,mode:'end',rhymePressure:80,naturalness:90,weirdness:10,targetTokens:9,count:4,attempts:80});
  assert.ok(candidates.length);
  assert.ok(candidates.every((candidate)=>candidate.sentence.startsWith('Nachts in der Stadt')));
  assert.ok(candidates.every((candidate)=>candidate.scores.boundary>0));
  runtime.close();
});

test('runtime health exposes corpus model identity',()=>{
  const runtime=fixtureRuntime();
  const health=markovModelHealth(runtime);
  assert.equal(health.available,true);
  assert.equal(health.policy,MARKOV_MODEL_POLICY);
  assert.equal(health.accepted_sentences,fixtureSentences.length);
  runtime.close();
});
