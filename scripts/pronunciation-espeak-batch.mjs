import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  inspectEspeakIpaOutput,
  inspectEspeakQueryPronunciationAsync,
} from './query-pronunciation-espeak-adapter.mjs';
import { mapConcurrent } from './pronunciation-espeak-parallel.mjs';

function normalizeLanguage(language){
  const code=String(language||'').trim().toLocaleLowerCase('en-US');
  if(!['de','en'].includes(code))throw new TypeError('Unsupported eSpeak batch language: '+language);
  return code;
}

function inputLine(surface){
  return String(surface??'')
    .normalize('NFKC')
    .replace(/[\r\n]+/gu,' ')
    .replace(/\s+/gu,' ')
    .trim();
}

export function parseEspeakBatchOutput(stdout){
  const lines=String(stdout??'').replace(/\r/gu,'').split('\n');
  while(lines.length&&lines.at(-1)==='')lines.pop();
  return lines;
}

async function executeBatchProcess(command,args,input,{timeoutMs=60000,spawnProcess=spawn}={}){
  const started=performance.now();
  return await new Promise((resolve)=>{
    let stdout='';
    let stderr='';
    let settled=false;
    let child;
    let timer=null;

    const finish=(result)=>{
      if(settled)return;
      settled=true;
      if(timer)clearTimeout(timer);
      resolve({...result,stdout,stderr,elapsed_ms:performance.now()-started});
    };

    try{
      child=spawnProcess(command,args,{
        windowsHide:true,
        stdio:['pipe','pipe','pipe'],
      });
    }catch(error){
      finish({status:null,error});
      return;
    }

    child.stdout?.setEncoding?.('utf8');
    child.stderr?.setEncoding?.('utf8');
    child.stdout?.on?.('data',(chunk)=>{ stdout+=String(chunk); });
    child.stderr?.on?.('data',(chunk)=>{ stderr+=String(chunk); });
    child.on?.('error',(error)=>finish({status:null,error}));
    child.on?.('close',(code,signal)=>finish({
      status:Number.isInteger(code)?code:null,
      signal:signal||null,
      error:null,
    }));

    timer=setTimeout(()=>{
      try{child.kill?.();}catch{}
      finish({
        status:null,
        signal:'timeout',
        error:new Error('eSpeak batch process timeout after '+timeoutMs+'ms'),
      });
    },timeoutMs);

    try{
      child.stdin?.end?.(input);
    }catch(error){
      try{child.kill?.();}catch{}
      finish({status:null,error});
    }
  });
}

async function processChunk(rows,language,{
  command,
  engineVersion=null,
  timeoutMs=60000,
  spawnProcess=spawn,
  fallbackSingle=true,
}={}){
  const code=normalizeLanguage(language);
  const voice=code==='de'?'de':'en-us';
  const lines=rows.map((row)=>inputLine(row.surface));
  const processResult=await executeBatchProcess(
    command,
    ['-q','--ipa=3','-v',voice],
    lines.join('\n')+'\n',
    {timeoutMs,spawnProcess},
  );

  if(processResult.error||processResult.status!==0){
    const message=processResult.error
      ?String(processResult.error.message||processResult.error)
      :'eSpeak batch exited with status '+String(processResult.status);
    return rows.map((row)=>({
      row,
      inspected:null,
      error:new Error(message),
      elapsed:processResult.elapsed_ms/Math.max(1,rows.length),
      mode:'batch_process_error',
      batch_size:rows.length,
      batch_elapsed_ms:processResult.elapsed_ms,
      stderr:String(processResult.stderr||'').trim()||null,
    }));
  }

  const outputLines=parseEspeakBatchOutput(processResult.stdout);
  if(outputLines.length===rows.length){
    return rows.map((row,index)=>({
      row,
      inspected:inspectEspeakIpaOutput(row.surface,code,outputLines[index],{
        engineCommand:command,
        engineVersion,
      }),
      error:null,
      elapsed:processResult.elapsed_ms/Math.max(1,rows.length),
      mode:'batch_process',
      batch_size:rows.length,
      batch_elapsed_ms:processResult.elapsed_ms,
      stderr:String(processResult.stderr||'').trim()||null,
    }));
  }

  if(rows.length>1){
    const midpoint=Math.ceil(rows.length/2);
    const left=await processChunk(rows.slice(0,midpoint),code,{
      command,engineVersion,timeoutMs,spawnProcess,fallbackSingle,
    });
    const right=await processChunk(rows.slice(midpoint),code,{
      command,engineVersion,timeoutMs,spawnProcess,fallbackSingle,
    });
    return [...left,...right];
  }

  if(fallbackSingle){
    const started=performance.now();
    try{
      const inspected=await inspectEspeakQueryPronunciationAsync(
        rows[0].surface,code,{command},
      );
      return [{
        row:rows[0],
        inspected,
        error:null,
        elapsed:performance.now()-started,
        mode:'row_process_fallback',
        batch_size:1,
        batch_elapsed_ms:processResult.elapsed_ms,
        stderr:String(processResult.stderr||'').trim()||null,
        cardinality_mismatch:{
          expected:1,
          actual:outputLines.length,
        },
      }];
    }catch(error){
      return [{
        row:rows[0],
        inspected:null,
        error,
        elapsed:performance.now()-started,
        mode:'row_process_fallback_error',
        batch_size:1,
        batch_elapsed_ms:processResult.elapsed_ms,
        stderr:String(processResult.stderr||'').trim()||null,
        cardinality_mismatch:{
          expected:1,
          actual:outputLines.length,
        },
      }];
    }
  }

  return [{
    row:rows[0],
    inspected:null,
    error:new Error('eSpeak batch output cardinality mismatch: expected 1, got '+outputLines.length),
    elapsed:processResult.elapsed_ms,
    mode:'batch_cardinality_mismatch',
    batch_size:1,
    batch_elapsed_ms:processResult.elapsed_ms,
    stderr:String(processResult.stderr||'').trim()||null,
    cardinality_mismatch:{
      expected:1,
      actual:outputLines.length,
    },
  }];
}

export async function mapEspeakBatchWorkers(rows,language,{
  command,
  engineVersion=null,
  workers=4,
  batchSize=512,
  timeoutMs=60000,
  spawnProcess=spawn,
}={}){
  const list=Array.from(rows||[]);
  if(!list.length)return [];
  const code=normalizeLanguage(language);
  for(const row of list){
    if(String(row.language||code)!==code){
      throw new Error('Mixed-language batch passed to eSpeak batch workers.');
    }
  }
  const size=Math.max(1,Number(batchSize)||512);
  const chunks=[];
  for(let index=0;index<list.length;index+=size){
    chunks.push(list.slice(index,index+size));
  }
  const processed=await mapConcurrent(chunks,Math.max(1,Number(workers)||4),(chunk)=>
    processChunk(chunk,code,{command,engineVersion,timeoutMs,spawnProcess})
  );
  return processed.flat();
}
