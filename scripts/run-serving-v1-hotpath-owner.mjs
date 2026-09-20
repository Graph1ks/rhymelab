#!/usr/bin/env node
import {spawnSync} from 'node:child_process';

function run(script,args=[]){
  const result=spawnSync(process.execPath,['--no-warnings',script,...args],{
    stdio:'inherit',
    shell:false,
  });
  if(result.error)throw result.error;
  if(Number(result.status)!==0)process.exit(Number(result.status)||1);
}

console.log('[serving-owner] Product v3 rebuild from the existing accepted Serving runtime...');
run('scripts/build-serving-v1-product.mjs',['--reset','--replace']);

console.log('[serving-owner] Strict bounded-hotpath benchmark...');
run('scripts/benchmark-serving-v1-hotpaths.mjs');

console.log('[serving-owner] Hotpath gate passed; starting full Product acceptance...');
run('scripts/accept-serving-v1-product.mjs',['--reset']);
