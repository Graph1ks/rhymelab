import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  inspectEspeakIpaOutput,
  inspectEspeakQueryPronunciation,
  inspectEspeakQueryPronunciationAsync,
} from './query-pronunciation-espeak-adapter.mjs';
import { mapConcurrent } from './pronunciation-espeak-parallel.mjs';

export const ESPEAK_BATCH_BOUNDARY_SURFACE='rhymelabxqzboundaryxqz';

const boundaryRawCache=new Map();

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

function rawLine(value){
  return String(value??'').normalize('NFC').trim();
}

function shouldFrame(row){
  const shape=String(row?.shape||'').trim();
  return Boolean(shape)&&!['clean_single','joined_lexeme'].includes(shape);
}

function resolveBoundaryRawIpa(command,language,explicit=null){
  if(explicit)return rawLine(explicit);
  const code=normalizeLanguage(language);
  const key=String(command||'auto')+'\u0000'+code;
  if(boundaryRawCache.has(key))return boundaryRawCache.get(key);
  const inspected=inspectEspeakQueryPronunciation(
    ESPEAK_BATCH_BOUNDARY_SURFACE,
    code,
    {command},
  );
  if(inspected.status!=='accepted'){
    throw new Error('Unable to resolve eSpeak batch boundary pronunciation for '+code+'.');
  }
  const lines=parseEspeakBatchOutput(inspected.rawIpa);
  if(lines.length!==1||!rawLine(lines[0])){
    throw new Error('eSpeak batch boundary must produce exactly one IPA output line.');
  }
  const value=rawLine(lines[0]);
  boundaryRawCache.set(key,value);
  return value;
}

export function parseEspeakBatchOutput(stdout){
  const lines=String(stdout??'').replace(/\r/gu,'').split('\n');
  while(lines.length&&lines.at(-1)==='')lines.pop();
  return lines;
}

export function splitFramedEspeakOutput(stdout,boundary){
  const marker=rawLine(boundary);
  if(!marker)throw new Error('Empty eSpeak batch boundary IPA.');
  const groups=[];
  let current=[];
  for(const line of parseEspeakBatchOutput(stdout)){
    if(rawLine(line)===marker){
      groups.push(current);
      current=[];
    }else{
      current.push(line);
    }
  }
  const trailing=current.some((line)=>rawLine(line).length>0)?current:[];
  return {groups,trailing};
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

function processFailureRows(rows,processResult,mode){
  const message=processResult.error
    ?String(processResult.error.message||processResult.error)
    :'eSpeak batch exited with status '+String(processResult.status);
  return rows.map((row)=>({
    row,
    inspected:null,
    error:new Error(message),
    elapsed:processResult.elapsed_ms/Math.max(1,rows.length),
    mode,
    batch_size:rows.length,
    batch_elapsed_ms:processResult.elapsed_ms,
    stderr:String(processResult.stderr||'').trim()||null,
  }));
}

async function processFramedChunk(rows,language,{
  command,
  engineVersion=null,
  timeoutMs=60000,
  spawnProcess=spawn,
  fallbackSingle=true,
  boundaryIpa=null,
  mode='framed_batch_process',
}={}){
  const code=normalizeLanguage(language);
  const voice=code==='de'?'de':'en-us';
  const markerIpa=resolveBoundaryRawIpa(command,code,boundaryIpa);
  const input=[];
  for(const row of rows){
    const surface=inputLine(row.surface);
    if(surface===ESPEAK_BATCH_BOUNDARY_SURFACE){
      throw new Error('Work item collides with reserved eSpeak batch boundary surface.');
    }
    input.push(surface,ESPEAK_BATCH_BOUNDARY_SURFACE);
  }

  const processResult=await executeBatchProcess(
    command,
    ['-q','--ipa=3','-v',voice],
    input.join('\n')+'\n',
    {timeoutMs,spawnProcess},
  );
  if(processResult.error||processResult.status!==0){
    return processFailureRows(rows,processResult,'framed_batch_process_error');
  }

  const framed=splitFramedEspeakOutput(processResult.stdout,markerIpa);
  if(framed.groups.length===rows.length&&framed.trailing.length===0){
    return rows.map((row,index)=>{
      const rawIpa=framed.groups[index].join('\n');
      return {
        row,
        inspected:inspectEspeakIpaOutput(row.surface,code,rawIpa,{
          engineCommand:command,
          engineVersion,
        }),
        error:null,
        elapsed:processResult.elapsed_ms/Math.max(1,rows.length),
        mode,
        batch_size:rows.length,
        batch_elapsed_ms:processResult.elapsed_ms,
        stderr:String(processResult.stderr||'').trim()||null,
        framed_output_lines:framed.groups[index].length,
      };
    });
  }

  if(rows.length>1){
    const midpoint=Math.ceil(rows.length/2);
    const left=await processFramedChunk(rows.slice(0,midpoint),code,{
      command,engineVersion,timeoutMs,spawnProcess,fallbackSingle,
      boundaryIpa:markerIpa,mode:'framed_batch_split',
    });
    const right=await processFramedChunk(rows.slice(midpoint),code,{
      command,engineVersion,timeoutMs,spawnProcess,fallbackSingle,
      boundaryIpa:markerIpa,mode:'framed_batch_split',
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
          actual:framed.groups.length,
          trailing_lines:framed.trailing.length,
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
          actual:framed.groups.length,
          trailing_lines:framed.trailing.length,
        },
      }];
    }
  }

  return [{
    row:rows[0],
    inspected:null,
    error:new Error(
      'eSpeak framed batch output mismatch: expected 1 boundary group, got '
      +framed.groups.length+' with '+framed.trailing.length+' trailing lines'
    ),
    elapsed:processResult.elapsed_ms,
    mode:'framed_batch_cardinality_mismatch',
    batch_size:1,
    batch_elapsed_ms:processResult.elapsed_ms,
    stderr:String(processResult.stderr||'').trim()||null,
  }];
}

async function processChunk(rows,language,{
  command,
  engineVersion=null,
  timeoutMs=60000,
  spawnProcess=spawn,
  fallbackSingle=true,
  boundaryIpa=null,
  forceFramed=false,
}={}){
  const code=normalizeLanguage(language);
  if(forceFramed){
    return await processFramedChunk(rows,code,{
      command,engineVersion,timeoutMs,spawnProcess,fallbackSingle,boundaryIpa,
    });
  }

  const voice=code==='de'?'de':'en-us';
  const lines=rows.map((row)=>inputLine(row.surface));
  const processResult=await executeBatchProcess(
    command,
    ['-q','--ipa=3','-v',voice],
    lines.join('\n')+'\n',
    {timeoutMs,spawnProcess},
  );

  if(processResult.error||processResult.status!==0){
    return processFailureRows(rows,processResult,'batch_process_error');
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

  // Do not recursively split an ordinary line batch. Complex eSpeak output can
  // legitimately contain multiple IPA lines for one input line; the previous
  // binary split path degraded into thousands of per-row process launches.
  return await processFramedChunk(rows,code,{
    command,engineVersion,timeoutMs,spawnProcess,fallbackSingle,boundaryIpa,
    mode:'framed_batch_after_cardinality_mismatch',
  });
}

function buildChunks(list,size){
  const chunks=[];
  let current=[];
  let framed=null;
  for(const row of list){
    const rowFramed=shouldFrame(row);
    if(current.length&&(current.length>=size||rowFramed!==framed)){
      chunks.push({rows:current,framed});
      current=[];
    }
    if(!current.length)framed=rowFramed;
    current.push(row);
  }
  if(current.length)chunks.push({rows:current,framed});
  return chunks;
}

export async function mapEspeakBatchWorkers(rows,language,{
  command,
  engineVersion=null,
  workers=4,
  batchSize=512,
  timeoutMs=60000,
  spawnProcess=spawn,
  boundaryRawIpa=null,
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
  const markerIpa=resolveBoundaryRawIpa(command,code,boundaryRawIpa);
  const chunks=buildChunks(list,size);
  const processed=await mapConcurrent(
    chunks,
    Math.max(1,Number(workers)||4),
    ({rows:chunk,framed})=>processChunk(chunk,code,{
      command,engineVersion,timeoutMs,spawnProcess,
      fallbackSingle:true,boundaryIpa:markerIpa,forceFramed:framed,
    }),
  );
  return processed.flat();
}
