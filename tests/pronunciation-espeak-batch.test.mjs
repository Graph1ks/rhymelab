import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  ESPEAK_BATCH_BOUNDARY_SURFACE,
  mapEspeakBatchWorkers,
  parseEspeakBatchOutput,
  splitFramedEspeakOutput,
} from '../scripts/pronunciation-espeak-batch.mjs';

function fakeChildFromOutput(counter,outputFactory){
  return (_command,_args,_options)=>{
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
          const output=outputFactory(String(input),call);
          child.stdout.emit('data',output);
          child.emit('close',0,null);
        });
      },
    };
    return child;
  };
}

function fakePlainSpawn(counter){
  return fakeChildFromOutput(counter,(input)=>{
    const lines=input.replace(/\r/gu,'').split('\n').filter(Boolean);
    return lines.map(()=> 'ˈhaːloː').join('\n')+'\n';
  });
}

function boundaryAwareOutput(input,{multiline=new Set()}={}){
  const lines=String(input).replace(/\r/gu,'').split('\n').filter(Boolean);
  const output=[];
  let lexicalIndex=0;
  for(const line of lines){
    if(line===ESPEAK_BATCH_BOUNDARY_SURFACE){
      output.push('BOUNDARY');
      continue;
    }
    lexicalIndex+=1;
    if(multiline.has(lexicalIndex)) output.push('ˈhaː','loː');
    else output.push('ˈhaːloː');
  }
  return output.join('\n')+'\n';
}

test('batch output parser preserves one response line per input line',()=>{
  assert.deepEqual(parseEspeakBatchOutput(' a\r\n b\r\n'),[' a',' b']);
  assert.deepEqual(parseEspeakBatchOutput('x\n\n'),['x']);
});

test('framed output parser keeps multiline IPA attached to its marker group',()=>{
  const parsed=splitFramedEspeakOutput(
    'first-a\nfirst-b\nBOUNDARY\nsecond\nBOUNDARY\n',
    'BOUNDARY',
  );
  assert.deepEqual(parsed.groups,[['first-a','first-b'],['second']]);
  assert.deepEqual(parsed.trailing,[]);
});

test('clean rows stay on the plain four-worker batch path',async()=>{
  const counter={count:0};
  const rows=Array.from({length:10},(_,index)=>({
    item_id:index+1,
    language:'de',
    surface:'Hallo'+index,
    shape:'clean_single',
  }));
  const result=await mapEspeakBatchWorkers(rows,'de',{
    command:'mock-espeak',
    engineVersion:'mock',
    workers:4,
    batchSize:3,
    spawnProcess:fakePlainSpawn(counter),
    boundaryRawIpa:'BOUNDARY',
    frameGroupSize:2,
  });
  assert.equal(counter.count,4);
  assert.equal(result.length,rows.length);
  assert.deepEqual(result.map((row)=>row.row.item_id),rows.map((row)=>row.item_id));
  assert.ok(result.every((row)=>row.mode==='batch_process'));
  assert.ok(result.every((row)=>row.inspected?.status==='accepted'));
});

test('complex rows use one sparse boundary per group instead of one marker per row',async()=>{
  const counter={count:0};
  const inputs=[];
  const spawnProcess=fakeChildFromOutput(counter,(input)=>{
    inputs.push(input);
    return boundaryAwareOutput(input);
  });
  const rows=Array.from({length:4},(_,index)=>({
    item_id:index+1,
    language:'de',
    surface:'Hallo Welt '+index,
    shape:'multiword',
  }));
  const result=await mapEspeakBatchWorkers(rows,'de',{
    command:'mock-espeak',
    engineVersion:'mock',
    workers:4,
    batchSize:128,
    frameGroupSize:2,
    spawnProcess,
    boundaryRawIpa:'BOUNDARY',
  });

  assert.equal(counter.count,1);
  assert.equal((inputs[0].match(new RegExp(ESPEAK_BATCH_BOUNDARY_SURFACE,'g'))||[]).length,2);
  assert.ok(result.every((row)=>row.mode==='sparse_framed_batch'));
  assert.ok(result.every((row)=>row.sparse_frame_group_size===2));
  assert.ok(result.every((row)=>row.inspected?.status==='accepted'));
});

test('only ambiguous sparse groups are re-run through dense framing',async()=>{
  const counter={count:0};
  const inputs=[];
  const spawnProcess=fakeChildFromOutput(counter,(input,call)=>{
    inputs.push(input);
    if(call===1){
      // Two sparse groups of two rows. Group 1 maps 2→2. Group 2 emits
      // three IPA lines for two rows and therefore needs dense rescue.
      const lines=input.replace(/\r/gu,'').split('\n').filter(Boolean);
      const output=[];
      let group=0;
      let rowInGroup=0;
      for(const line of lines){
        if(line===ESPEAK_BATCH_BOUNDARY_SURFACE){
          output.push('BOUNDARY');
          group+=1;
          rowInGroup=0;
          continue;
        }
        rowInGroup+=1;
        if(group===1&&rowInGroup===1) output.push('ˈhaː','loː');
        else output.push('ˈhaːloː');
      }
      return output.join('\n')+'\n';
    }
    // Dense rescue contains only rows 3/4 with one marker per row.
    return boundaryAwareOutput(input,{multiline:new Set([1])});
  });
  const rows=Array.from({length:4},(_,index)=>({
    item_id:index+1,
    language:'de',
    surface:'Komplex '+index,
    shape:'multiword',
  }));

  const result=await mapEspeakBatchWorkers(rows,'de',{
    command:'mock-espeak',
    engineVersion:'mock',
    workers:4,
    batchSize:128,
    frameGroupSize:2,
    spawnProcess,
    boundaryRawIpa:'BOUNDARY',
  });

  assert.equal(counter.count,2);
  assert.equal((inputs[0].match(new RegExp(ESPEAK_BATCH_BOUNDARY_SURFACE,'g'))||[]).length,2);
  assert.equal((inputs[1].match(new RegExp(ESPEAK_BATCH_BOUNDARY_SURFACE,'g'))||[]).length,2);
  assert.deepEqual(result.map((row)=>row.row.item_id),[1,2,3,4]);
  assert.equal(result[0].mode,'sparse_framed_batch');
  assert.equal(result[1].mode,'sparse_framed_batch');
  assert.equal(result[2].mode,'dense_framed_rescue');
  assert.equal(result[3].mode,'dense_framed_rescue');
  assert.equal(result[2].dense_frame_output_lines,2);
  assert.ok(result.every((row)=>row.inspected?.status==='accepted'));
  assert.ok(result.every((row)=>!String(row.mode).startsWith('row_process_fallback')));
});

test('plain batch cardinality mismatch falls back to sparse framing, not recursive row spawns',async()=>{
  const counter={count:0};
  const spawnProcess=fakeChildFromOutput(counter,(input,call)=>{
    if(call===1)return 'ˈhaː\nloː\nextra\n';
    return boundaryAwareOutput(input);
  });
  const rows=[
    {item_id:1,language:'de',surface:'Hallo',shape:'clean_single'},
    {item_id:2,language:'de',surface:'Welt',shape:'clean_single'},
  ];
  const result=await mapEspeakBatchWorkers(rows,'de',{
    command:'mock-espeak',
    engineVersion:'mock',
    workers:4,
    batchSize:128,
    frameGroupSize:2,
    spawnProcess,
    boundaryRawIpa:'BOUNDARY',
  });

  assert.equal(counter.count,2);
  assert.ok(result.every((row)=>row.mode==='sparse_framed_after_cardinality_mismatch'));
  assert.ok(result.every((row)=>row.inspected?.status==='accepted'));
});

test('batch mapper rejects mixed-language input',async()=>{
  await assert.rejects(
    ()=>mapEspeakBatchWorkers([
      {language:'de',surface:'Hallo',shape:'clean_single'},
      {language:'en',surface:'hello',shape:'clean_single'},
    ],'de',{
      command:'mock-espeak',
      workers:4,
      batchSize:2,
      spawnProcess:fakePlainSpawn({count:0}),
      boundaryRawIpa:'BOUNDARY',
    }),
    /Mixed-language batch/u,
  );
});

test('batch mapper offloads row analysis through supplied analyzer pool',async()=>{
  const counter={count:0};
  const analyzerCalls=[];
  const analyzerPool={
    async analyze(payload){
      analyzerCalls.push(payload);
      return {
        inspection:{
          status:'accepted',
          method:'espeak_ng',
          engine:'espeak-ng',
          engineCommand:payload.engineCommand,
          engineVersion:payload.engineVersion,
          language:payload.language,
          surface:payload.surface,
          rawIpa:payload.rawIpa,
          ipa:payload.rawIpa,
          analysis:{
            syllableCount:2,
            primaryStressSyllable:0,
            stressPattern:'10',
            exactTailKey:'a',
            vowelKey:'a',
            codaKey:'',
          },
          attempts:[],
        },
        analyzer_elapsed_ms:1.25,
        analyzer_queue_ms:.5,
        analyzer_roundtrip_ms:2,
        worker_index:2,
      };
    },
  };
  const rows=Array.from({length:8},(_,index)=>({
    item_id:index+1,
    language:'de',
    surface:'Hallo'+index,
    shape:'clean_single',
  }));
  const result=await mapEspeakBatchWorkers(rows,'de',{
    command:'mock-espeak',
    engineVersion:'mock',
    workers:4,
    batchSize:4,
    spawnProcess:fakePlainSpawn(counter),
    boundaryRawIpa:'BOUNDARY',
    analyzerPool,
  });

  assert.equal(analyzerCalls.length,8);
  assert.equal(result.length,8);
  assert.ok(result.every((row)=>row.analyzer_mode==='worker_thread'));
  assert.ok(result.every((row)=>row.analyzer_worker===2));
  assert.ok(result.every((row)=>row.analyzer_elapsed_ms===1.25));
  assert.ok(result.every((row)=>row.inspected?.status==='accepted'));
});
