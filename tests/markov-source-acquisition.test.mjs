import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessGermanSentence,
  extractTarMember,
  parseLeipzigSentenceFile,
  parseTatoebaDetailedFile,
  sentenceIdentity,
  sourceStageRows,
} from '../scripts/markov-source-acquisition-core.mjs';

function tarHeader(name,size){
  const header=Buffer.alloc(512,0);
  header.write(name,0,Math.min(Buffer.byteLength(name),100),'utf8');
  header.write('0000777\0',100,'ascii');
  header.write('0000000\0',108,'ascii');
  header.write('0000000\0',116,'ascii');
  const octal=size.toString(8).padStart(11,'0')+'\0';
  header.write(octal,124,'ascii');
  header.write('00000000000\0',136,'ascii');
  header.fill(0x20,148,156);
  header[156]='0'.charCodeAt(0);
  header.write('ustar\0',257,'ascii');
  let sum=0;
  for(const byte of header)sum+=byte;
  header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,'ascii');
  return header;
}

function makeTar(name,text){
  const data=Buffer.from(text,'utf8');
  const padding=Buffer.alloc((512-(data.length%512))%512,0);
  return Buffer.concat([
    tarHeader(name,data.length),
    data,
    padding,
    Buffer.alloc(1024,0),
  ]);
}

test('sentence staging accepts usable modern German sentences and rejects obvious noise',()=>{
  assert.equal(
    assessGermanSentence('Heute klingt die Musik anders als noch vor einigen Jahren.').accepted,
    true,
  );
  assert.equal(assessGermanSentence('https://example.com foo bar baz').reason,'url');
  assert.equal(assessGermanSentence('ABC ___ DEF ___ GHI ___').accepted,false);
});

test('sentence identity normalizes harmless presentation differences',()=>{
  assert.equal(
    sentenceIdentity('„Heute ist ein guter Tag.“'),
    sentenceIdentity('"Heute ist ein guter Tag."'),
  );
});

test('Leipzig parser keeps sentence text after the first tab',()=>{
  const rows=parseLeipzigSentenceFile(
    '1\tHeute ist ein vollständiger deutscher Satz.\n2\tAuch dieser Satz bleibt erhalten.\n',
  );
  assert.deepEqual(rows,[
    {id:'1',sentence:'Heute ist ein vollständiger deutscher Satz.'},
    {id:'2',sentence:'Auch dieser Satz bleibt erhalten.'},
  ]);
});

test('Tatoeba detailed parser preserves attribution metadata',()=>{
  const rows=parseTatoebaDetailedFile(
    '42\tdeu\tIch denke, dass ich dir vertrauen kann.\tuserA\t2020-03-04\t2024-01-01\n'
      +'43\teng\tI think I can trust you.\tuserB\t2020-03-04\t2024-01-01\n',
  );
  assert.deepEqual(rows,[{
    id:'42',
    sentence:'Ich denke, dass ich dir vertrauen kann.',
    username:'userA',
    dateAdded:'2020-03-04',
    dateModified:'2024-01-01',
  }]);
});

test('tar extraction finds the requested Leipzig sentence member',()=>{
  const tar=makeTar(
    'deu_news_2024_300K/deu_news_2024_300K-sentences.txt',
    '1\tHeute ist ein vollständiger deutscher Satz.\n',
  );
  const member=extractTarMember(tar,(name)=>name.endsWith('deu_news_2024_300K-sentences.txt'));
  assert.ok(member);
  assert.match(member.data.toString('utf8'),/vollständiger deutscher Satz/u);
});

test('global source staging deduplicates across source boundaries',()=>{
  const seen=new Set();
  const first=sourceStageRows([
    {id:'1',sentence:'Heute ist ein vollständiger deutscher Satz.'},
    {id:'2',sentence:'Wir gehen gemeinsam durch die Straßen dieser Stadt.'},
  ],{seen,sourceCode:'first'});

  const second=sourceStageRows([
    {id:'3',sentence:'Heute ist ein vollständiger deutscher Satz.'},
    {id:'4',sentence:'Morgen klingt die Musik vielleicht schon wieder anders.'},
  ],{seen,sourceCode:'second'});

  assert.equal(first.stats.accepted,2);
  assert.equal(second.stats.accepted,1);
  assert.equal(second.stats.duplicates,1);
  assert.equal(seen.size,3);
});
