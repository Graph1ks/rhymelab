import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  mapEspeakBatchWorkers,
  parseEspeakBatchOutput,
} from '../scripts/pronunciation-espeak-batch.mjs';

function fakeBatchSpawn(counter){
  return (_command,_args,_options)=>{
    counter.count+=1;
    const child=new EventEmitter();
    child.stdout=new EventEmitter();
    child.stderr=new EventEmitter();
    child.stdout.setEncoding=()=>{};
    child.stderr.setEncoding=()=>{};
    child.kill=()=>{};
    child.stdin={
      end(input){
        queueMicrotask(()=>{
          const lines=String(input).replace(/\r/gu,'').split('\n').filter(Boolean);
          const output=lines.map(()=> 'ˈhaːloː').join('\n')+'\n';
          child.stdout.emit('data',output);
          child.emit('close',0,null);
        });
      },
    };
    return child;
  };
}

test('batch output parser preserves one response line per input line',()=>{
  assert.deepEqual(parseEspeakBatchOutput(' a\r\n b\r\n'),[' a',' b']);
  assert.deepEqual(parseEspeakBatchOutput('x\n\n'),['x']);
});

test('four-worker batch mapper preserves row order and uses bounded batch processes',async()=>{
  const counter={count:0};
  const rows=Array.from({length:10},(_,index)=>({
    item_id:index+1,
    language:'de',
    surface:'Hallo'+index,
  }));
  const result=await mapEspeakBatchWorkers(rows,'de',{
    command:'mock-espeak',
    engineVersion:'mock',
    workers:4,
    batchSize:3,
    spawnProcess:fakeBatchSpawn(counter),
  });
  assert.equal(counter.count,4);
  assert.equal(result.length,rows.length);
  assert.deepEqual(result.map((row)=>row.row.item_id),rows.map((row)=>row.item_id));
  assert.ok(result.every((row)=>row.mode==='batch_process'));
  assert.ok(result.every((row)=>row.inspected?.status==='accepted'));
});

test('batch mapper rejects mixed-language input',async()=>{
  await assert.rejects(
    ()=>mapEspeakBatchWorkers([
      {language:'de',surface:'Hallo'},
      {language:'en',surface:'hello'},
    ],'de',{
      command:'mock-espeak',
      workers:4,
      batchSize:2,
      spawnProcess:fakeBatchSpawn({count:0}),
    }),
    /Mixed-language batch/u,
  );
});
