import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  ESPEAK_BATCH_BOUNDARY_SURFACE,
  mapEspeakBatchWorkers,
  parseEspeakBatchOutput,
  splitFramedEspeakOutput,
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
    boundaryRawIpa:'boundary',
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
      boundaryRawIpa:'boundary',
    }),
    /Mixed-language batch/u,
  );
});


test('framed output parser keeps multiline IPA attached to the correct row',()=>{
  const parsed=splitFramedEspeakOutput(
    'first-a\nfirst-b\nBOUNDARY\nsecond\nBOUNDARY\n',
    'BOUNDARY',
  );
  assert.deepEqual(parsed.groups,[['first-a','first-b'],['second']]);
  assert.deepEqual(parsed.trailing,[]);
});

test('complex rows use boundary framing instead of recursive row-process fallback',async()=>{
  const counter={count:0};
  const spawnProcess=(_command,_args,_options)=>{
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
          const output=[];
          for(const line of lines){
            if(line===ESPEAK_BATCH_BOUNDARY_SURFACE){
              output.push('BOUNDARY');
            }else{
              output.push('ˈhaː','loː');
            }
          }
          child.stdout.emit('data',output.join('\n')+'\n');
          child.emit('close',0,null);
        });
      },
    };
    return child;
  };

  const rows=[
    {item_id:1,language:'de',surface:'Hallo Welt',shape:'multiword'},
    {item_id:2,language:'de',surface:'Guten Tag',shape:'multiword'},
  ];
  const result=await mapEspeakBatchWorkers(rows,'de',{
    command:'mock-espeak',
    engineVersion:'mock',
    workers:4,
    batchSize:256,
    spawnProcess,
    boundaryRawIpa:'BOUNDARY',
  });

  assert.equal(counter.count,1);
  assert.deepEqual(result.map((row)=>row.row.item_id),[1,2]);
  assert.ok(result.every((row)=>row.mode==='framed_batch_process'));
  assert.ok(result.every((row)=>row.framed_output_lines===2));
  assert.ok(result.every((row)=>row.inspected?.status==='accepted'));
});

test('plain batch cardinality mismatch retries the whole chunk with framing',async()=>{
  const counter={count:0};
  const spawnProcess=(_command,_args,_options)=>{
    counter.count+=1;
    const call=counter.count;
    const child=new EventEmitter();
    child.stdout=new EventEmitter();
    child.stderr=new EventEmitter();
    child.stdout.setEncoding=()=>{};
    child.stderr.setEncoding=()=>{};
    child.kill=()=>{};
    child.stdin={
      end(input){
        queueMicrotask(()=>{
          if(call===1){
            child.stdout.emit('data','ˈhaː\nloː\nextra\n');
          }else{
            const lines=String(input).replace(/\r/gu,'').split('\n').filter(Boolean);
            const output=lines.map((line)=>
              line===ESPEAK_BATCH_BOUNDARY_SURFACE?'BOUNDARY':'ˈhaːloː'
            );
            child.stdout.emit('data',output.join('\n')+'\n');
          }
          child.emit('close',0,null);
        });
      },
    };
    return child;
  };

  const rows=[
    {item_id:1,language:'de',surface:'Hallo'},
    {item_id:2,language:'de',surface:'Welt'},
  ];
  const result=await mapEspeakBatchWorkers(rows,'de',{
    command:'mock-espeak',
    engineVersion:'mock',
    workers:4,
    batchSize:256,
    spawnProcess,
    boundaryRawIpa:'BOUNDARY',
  });

  assert.equal(counter.count,2);
  assert.ok(result.every((row)=>row.mode==='framed_batch_after_cardinality_mismatch'));
  assert.ok(result.every((row)=>row.inspected?.status==='accepted'));
});
