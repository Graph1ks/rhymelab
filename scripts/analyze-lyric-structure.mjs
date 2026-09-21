#!/usr/bin/env node
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {aggregateLyricStructure} from './lyric-structure-core.mjs';

const args=process.argv.slice(2);
const sourceArgs=[];
let output='data/local/lyric-structure-v2-analysis.json';

for(let index=0;index<args.length;index+=1){
  const arg=args[index];
  if(arg==='--source')sourceArgs.push(args[++index]||'');
  else if(arg==='--out')output=args[++index]||output;
  else throw new Error('Unknown argument: '+arg);
}

if(!sourceArgs.length){
  throw new Error(
    'No lyric source configured. Pass one or more --source language=/path/to/lyrics.txt arguments.'
  );
}

function parseSource(value){
  const at=String(value).indexOf('=');
  if(at<=0||at===String(value).length-1){
    throw new Error('Invalid --source '+value+'; expected de=/path/file or en=/path/file');
  }
  const language=String(value).slice(0,at).toLocaleLowerCase('en-US');
  if(!['de','en'].includes(language)){
    throw new Error('Unsupported lyric source language: '+language);
  }
  return {language,path:resolve(String(value).slice(at+1))};
}

const sources=sourceArgs.filter(Boolean).map(parseSource);
const corpora=[];
for(const source of sources){
  const text=await readFile(source.path,'utf8');
  corpora.push({language:source.language,text});
}

const report=aggregateLyricStructure(corpora);
const serialized=JSON.stringify(report,null,2)+'\n';
await mkdir(dirname(resolve(output)),{recursive:true});
await writeFile(resolve(output),serialized,'utf8');
process.stdout.write(serialized);
