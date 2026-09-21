#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const args=process.argv.slice(2);
let input='';
let output='data/local/markov-private-lyrics-analysis.json';

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--input')input=args[++i]||'';
  else if(arg==='--out')output=args[++i]||output;
  else throw new Error(`Unknown argument: ${arg}`);
}

if(!input){
  throw new Error('Missing --input /path/to/private-lyrics.json');
}

const SECTION=/^\s*(?:#+\s*)?\[[^\]]+\]\s*$/iu;
const META=/^\s*(?:##?\s*)?(?:lyrics\s*@|vocals:|voice\s*@|this song|whatever you read|deutsche übersetzung:|slovenisch:|#+\s*lyrics\s*#+)/iu;
const URL=/(?:https?:\/\/|www\.)/iu;
const TOKEN=/[\p{L}\p{M}\p{N}]+(?:[’'\-][\p{L}\p{M}\p{N}]+)*/gu;
const VOWEL=/[aeiouyäöüáàâéèêíìîóòôúùûæœ]/u;

function normalizeLine(value){
  return String(value??'')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu,' ')
    .trim();
}

function tokens(value){
  return String(value??'').normalize('NFKC').match(TOKEN)||[];
}

function cleanContentLine(raw){
  let line=String(raw??'').trim();
  if(!line||SECTION.test(line)||META.test(line)||URL.test(line))return null;
  if(/^[#\-=*_~. ]+$/u.test(line))return null;
  line=line.replace(/^[+\-]\s+/u,'');
  const words=tokens(line);
  if(!words.length)return null;
  return {normalized:normalizeLine(line),words};
}

function quantile(values,q){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const pos=(sorted.length-1)*q;
  const low=Math.floor(pos);
  const high=Math.min(sorted.length-1,low+1);
  const fraction=pos-low;
  return sorted[low]*(1-fraction)+sorted[high]*fraction;
}

function mean(values){
  return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
}

function lastWord(line){
  return line.words.at(-1)?.toLocaleLowerCase('de-DE')||'';
}

function rhymeProxy(word){
  const clean=String(word||'').replace(/[^\p{L}]/gu,'').toLocaleLowerCase('de-DE');
  if(!clean)return '';
  let index=-1;
  for(let i=0;i<clean.length;i+=1){
    if(VOWEL.test(clean[i]))index=i;
  }
  if(index<0)return clean.slice(-3);
  while(index>0&&VOWEL.test(clean[index-1]))index-=1;
  return clean.slice(index);
}

const payload=JSON.parse(await readFile(resolve(input),'utf8'));
if(!Array.isArray(payload))throw new Error('Expected a JSON array of lyric records.');

let tracksWithLyrics=0;
const lines=[];
const blocks=[];

for(const record of payload){
  const lyric=String(record?.lyrics??'');
  if(!lyric.trim())continue;
  tracksWithLyrics+=1;
  let block=[];
  const flush=()=>{if(block.length){blocks.push(block);block=[];}};
  for(const raw of lyric.split(/\r?\n/u)){
    const trimmed=raw.trim();
    if(!trimmed||SECTION.test(trimmed)){flush();continue;}
    const clean=cleanContentLine(raw);
    if(!clean)continue;
    lines.push(clean);
    block.push(clean);
  }
  flush();
}

const lineLengths=lines.map((line)=>line.words.length);
const unique=new Map();
for(const line of lines){
  if(!unique.has(line.normalized))unique.set(line.normalized,line.words.length);
}
const uniqueLengths=[...unique.values()];
const blockLengths=blocks.map((block)=>block.length);
const rhymeDistances={1:0,2:0,3:0,4:0};

for(const block of blocks){
  const endings=block.map((line)=>({word:lastWord(line),proxy:rhymeProxy(lastWord(line))}));
  for(let index=0;index<endings.length;index+=1){
    for(let distance=1;distance<=4;distance+=1){
      const other=endings[index+distance];
      if(!other)break;
      const current=endings[index];
      if(!current.word||!other.word||current.word===other.word)continue;
      if(current.proxy.length>=2&&current.proxy===other.proxy)rhymeDistances[distance]+=1;
    }
  }
}

const rhymeTotal=Object.values(rhymeDistances).reduce((sum,value)=>sum+value,0);
const safeReport={
  schema:'rhymelab-private-lyric-analysis-v1',
  privacy:{
    raw_text_emitted:false,
    identifiers_emitted:false,
    titles_emitted:false,
    urls_emitted:false,
    transition_sequences_emitted:false,
  },
  tracks:payload.length,
  tracks_with_lyrics:tracksWithLyrics,
  lyric_lines:lines.length,
  unique_normalized_lines:unique.size,
  repeated_line_instances:Math.max(0,lines.length-unique.size),
  repetition_rate:lines.length?Number(((lines.length-unique.size)/lines.length).toFixed(6)):0,
  token_length:{
    mean:Number(mean(lineLengths).toFixed(3)),
    median:quantile(lineLengths,0.5),
    p25:quantile(lineLengths,0.25),
    p75:quantile(lineLengths,0.75),
    p90:quantile(lineLengths,0.9),
    p95:quantile(lineLengths,0.95),
    deduplicated_median:quantile(uniqueLengths,0.5),
  },
  stanza_shape:{
    blocks:blockLengths.length,
    median_lines:quantile(blockLengths,0.5),
    p75_lines:quantile(blockLengths,0.75),
  },
  rhyme_distance_proxy:{
    method:'orthographic-final-vowel-tail-exact-match',
    pairs:rhymeTotal,
    distance_1:rhymeDistances[1],
    distance_2:rhymeDistances[2],
    distance_3:rhymeDistances[3],
    distance_4:rhymeDistances[4],
    normalized:rhymeTotal?{
      1:Number((rhymeDistances[1]/rhymeTotal).toFixed(4)),
      2:Number((rhymeDistances[2]/rhymeTotal).toFixed(4)),
      3:Number((rhymeDistances[3]/rhymeTotal).toFixed(4)),
      4:Number((rhymeDistances[4]/rhymeTotal).toFixed(4)),
    }:{1:0,2:0,3:0,4:0},
  },
  recommended_profile:{
    default_target_tokens:Math.round(quantile(uniqueLengths,0.5)||6),
    compact_line_tokens:Math.round(quantile(lineLengths,0.25)||3),
    common_line_tokens:Math.round(quantile(lineLengths,0.9)||9),
    long_line_tokens:Math.round(quantile(uniqueLengths,0.95)||12),
    stanza_lines_median:Math.round(quantile(blockLengths,0.5)||4),
  },
};

const serialized=`${JSON.stringify(safeReport,null,2)}\n`;
await mkdir(dirname(resolve(output)),{recursive:true});
await writeFile(resolve(output),serialized,'utf8');
process.stdout.write(serialized);
