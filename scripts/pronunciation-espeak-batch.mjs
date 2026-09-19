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

async function inspectBatchRows(
  rows,
  rawIpas,
  language,
  processResult,
  {
    command,
    engineVersion=null,
    analyzerPool=null,
    mode,
    outputLineCounts=null,
  }={},
){
  const perRowBatchElapsed=processResult.elapsed_ms/Math.max(1,rows.length);
  return await Promise.all(rows.map(async(row,index)=>{
    const started=performance.now();
    try{
      let inspected;
      let analyzerElapsed=0;
      let analyzerQueue=0;
      let analyzerRoundtrip=0;
      let analyzerWorker=null;
      let analyzerMode='main_thread';

      if(analyzerPool){
        const analyzed=await analyzerPool.analyze({
          surface:row.surface,
          language,
          rawIpa:rawIpas[index],
          engineCommand:command,
          engineVersion,
        });
        inspected=analyzed.inspection;
        analyzerElapsed=Number(analyzed.analyzer_elapsed_ms)||0;
        analyzerQueue=Number(analyzed.analyzer_queue_ms)||0;
        analyzerRoundtrip=Number(analyzed.analyzer_roundtrip_ms)||0;
        analyzerWorker=Number.isInteger(analyzed.worker_index)?analyzed.worker_index:null;
        analyzerMode='worker_thread';
      }else{
        inspected=inspectEspeakIpaOutput(row.surface,language,rawIpas[index],{
          engineCommand:command,
          engineVersion,
        });
        analyzerElapsed=performance.now()-started;
        analyzerRoundtrip=analyzerElapsed;
      }

      return {
        row,
        inspected,
        error:null,
        elapsed:perRowBatchElapsed+analyzerElapsed,
        mode,
        batch_size:rows.length,
        batch_elapsed_ms:processResult.elapsed_ms,
        stderr:String(processResult.stderr||'').trim()||null,
        analyzer_mode:analyzerMode,
        analyzer_elapsed_ms:analyzerElapsed,
        analyzer_queue_ms:analyzerQueue,
        analyzer_roundtrip_ms:analyzerRoundtrip,
        analyzer_worker:analyzerWorker,
        framed_output_lines:Array.isArray(outputLineCounts)?outputLineCounts[index]:undefined,
      };
    }catch(error){
      return {
        row,
        inspected:null,
        error,
        elapsed:perRowBatchElapsed+(performance.now()-started),
        mode:mode+'_analyzer_error',
        batch_size:rows.length,
        batch_elapsed_ms:processResult.elapsed_ms,
        stderr:String(processResult.stderr||'').trim()||null,
        analyzer_mode:analyzerPool?'worker_thread':'main_thread',
      };
    }
  }));
}

async function processSparseFramedChunk(rows,language,{
  command,
  engineVersion=null,
  timeoutMs=60000,
  spawnProcess=spawn,
  boundaryIpa=null,
  analyzerPool=null,
  frameGroupSize=16,
  mode='sparse_framed_batch',
}={}){
  const code=normalizeLanguage(language);
  const voice=code==='de'?'de-us':'en-us';
  const markerIpa=resolveBoundaryRawIpa(command,code,boundaryIpa);
  const groupSize=Math.max(1,Math.min(Number(frameGroupSize)||16,rows.length));
  const groups=[];
  for(let index=0;index<rows.length;index+=groupSize){
    groups.push(rows.slice(index,index+groupSize));
  }

  const input=[];
  for(const group of groups){
    for(const row of group){
      const surface=inputLine(row.surface);
      if(surface===ESPEAK_BATCH_BOUNDARY_SURFACE){
        throw new Error('Work item collides with reserved eSpeak batch boundary surface.');
      }
      input.push(surface);
    }
    input.push(ESPEAK_BATCH_BOUNDARY_SURFACE);
  }

  const processResult=await executeBatchProcess(
    command,
    ['-q','--ipa=3','-v',code==='de'?'de':'en-us'],
    input.join('\n')+'\n',
    {timeoutMs,spawnProcess},
  );
  if(processResult.error||processResult.status!==0){
    return processFailureRows(rows,processResult,mode+'_process_error');
  }

  const framed=splitFramedEspeakOutput(processResult.stdout,markerIpa);
  if(framed.groups.length!==groups.length||framed.trailing.length!==0){
    if(rows.length>1){
      const midpoint=Math.ceil(rows.length/2);
      const nextGroupSize=Math.max(1,Math.min(groupSize,Math.ceil(rows.length/4)));
      const left=await processSparseFramedChunk(rows.slice(0,midpoint),code,{
        command,engineVersion,timeoutMs,spawnProcess,boundaryIpa:markerIpa,
        analyzerPool,frameGroupSize:nextGroupSize,mode:'sparse_framed_recovery',
      });
      const right=await processSparseFramedChunk(rows.slice(midpoint),code,{
        command,engineVersion,timeoutMs,spawnProcess,boundaryIpa:markerIpa,
        analyzerPool,frameGroupSize:nextGroupSize,mode:'sparse_framed_recovery',
      });
      return [...left,...right];
    }

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
        sparse_frame_group_size:groupSize,
        cardinality_mismatch:{
          expected_groups:1,
          actual_groups:framed.groups.length,
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
        sparse_frame_group_size:groupSize,
      }];
    }
  }

  const outcomes=[];
  for(let groupIndex=0;groupIndex<groups.length;groupIndex+=1){
    const groupRows=groups[groupIndex];
    const outputLines=framed.groups[groupIndex];

    // Every admitted row is lexical/non-empty. If the bounded group has exactly
    // one output line per row, the line mapping is already unambiguous and no
    // further marker synthesis is required.
    if(outputLines.length===groupRows.length){
      const inspected=await inspectBatchRows(
        groupRows,
        outputLines,
        code,
        processResult,
        {
          command,
          engineVersion,
          analyzerPool,
          mode,
        },
      );
      for(const result of inspected){
        result.sparse_frame_group_size=groupSize;
        result.sparse_frame_output_lines=outputLines.length;
      }
      outcomes.push(...inspected);
      continue;
    }

    // A single-row sparse frame owns every IPA line before its boundary marker,
    // so multiline eSpeak output can be joined without another process launch.
    if(groupRows.length===1){
      const inspected=await inspectBatchRows(
        groupRows,
        [outputLines.join('\n')],
        code,
        processResult,
        {
          command,
          engineVersion,
          analyzerPool,
          mode:'sparse_framed_single',
          outputLineCounts:[outputLines.length],
        },
      );
      inspected[0].sparse_frame_group_size=1;
      inspected[0].sparse_frame_output_lines=outputLines.length;
      outcomes.push(...inspected);
      continue;
    }

    // Only the ambiguous subgroup is synthesized again. This keeps the common
    // path at one boundary marker per N rows while preserving exact ownership
    // for genuinely multiline rows.
    const refined=await processSparseFramedChunk(groupRows,code,{
      command,
      engineVersion,
      timeoutMs,
      spawnProcess,
      boundaryIpa:markerIpa,
      analyzerPool,
      frameGroupSize:Math.max(1,Math.ceil(groupRows.length/2)),
      mode:'sparse_framed_refine',
    });
    outcomes.push(...refined);
  }
  return outcomes;
}

async function processChunk(rows,language,{
  command,
  engineVersion=null,
  timeoutMs=60000,
  spawnProcess=spawn,
  boundaryIpa=null,
  analyzerPool=null,
  frameGroupSize=16,
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
    return processFailureRows(rows,processResult,'batch_process_error');
  }

  const outputLines=parseEspeakBatchOutput(processResult.stdout);
  if(outputLines.length===rows.length){
    return await inspectBatchRows(
      rows,
      outputLines,
      code,
      processResult,
      {
        command,
        engineVersion,
        analyzerPool,
        mode:'batch_process',
      },
    );
  }

  // Framing V2: a cardinality mismatch no longer adds one spoken marker per
  // row. Re-run the ambiguous batch with sparse marker groups and recursively
  // refine only the groups whose output cardinality is still ambiguous.
  return await processSparseFramedChunk(rows,code,{
    command,
    engineVersion,
    timeoutMs,
    spawnProcess,
    boundaryIpa,
    analyzerPool,
    frameGroupSize,
    mode:'sparse_framed_batch',
  });
}

function buildChunks(list,size){
  const chunks=[];
  for(let index=0;index<list.length;index+=size){
    chunks.push(list.slice(index,index+size));
  }
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
  analyzerPool=null,
  frameGroupSize=16,
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
    (chunk)=>processChunk(chunk,code,{
      command,
      engineVersion,
      timeoutMs,
      spawnProcess,
      boundaryIpa:markerIpa,
      analyzerPool,
      frameGroupSize:Math.max(1,Number(frameGroupSize)||16),
    }),
  );
  return processed.flat();
}
