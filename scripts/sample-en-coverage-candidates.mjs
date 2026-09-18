#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const input=resolve(argValue('--input','data/local/en-coverage-candidates-v1.jsonl'));
const outputArg=argValue('--out','');
const output=outputArg?resolve(outputArg):null;
const status=argValue('--status','');
const minRank=Math.max(1,Number.parseInt(argValue('--min-rank','1'),10)||1);
const maxRank=Math.max(minRank,Number.parseInt(argValue('--max-rank','999999999'),10)||999999999);
const n=Math.max(1,Math.min(500,Number.parseInt(argValue('--n','50'),10)||50));
const seed=argValue('--seed','phase12b6-review-v1');

function score(row){
  return createHash('sha256')
    .update(`${seed}\u0000${row.rank}\u0000${row.normalized}\u0000${row.status}`)
    .digest('hex');
}

const rows=[];
const rl=createInterface({input:createReadStream(input),crlfDelay:Infinity});
for await(const line of rl){
  if(!line) continue;
  const row=JSON.parse(line);
  if(row.rank<minRank||row.rank>maxRank) continue;
  if(status&&row.status!==status) continue;
  rows.push(row);
}

const sampled=rows
  .map((row)=>({row,score:score(row)}))
  .sort((a,b)=>a.score.localeCompare(b.score))
  .slice(0,n)
  .map(({row})=>row)
  .sort((a,b)=>a.rank-b.rank||a.normalized.localeCompare(b.normalized,'en'));

const result={
  schema:'rhymelab-en-coverage-review-sample-v1',
  input,
  filters:{status:status||null,min_rank:minRank,max_rank:maxRank},
  seed,
  population:rows.length,
  requested:n,
  returned:sampled.length,
  sample:sampled,
};

if(output) await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
