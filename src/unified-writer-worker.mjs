import {parentPort,workerData} from 'node:worker_threads';
import {
  installServingV1CompatibilityViews,
  openServingV1ProductDb,
} from './serving-v1-product-runtime.mjs';
import {searchUnifiedWriter} from './unified-writer-search.mjs';

if(!parentPort)throw new Error('Unified Writer worker requires parentPort.');

const channel=String(workerData?.channel||'unknown');
const servingPath=String(workerData?.servingPath||'');
let mode='core';
const db=openServingV1ProductDb(servingPath,{mode});

function databases(){
  return {
    writerDb:db,
    englishDb:db,
    phraseDb:db,
    entityDb:db,
    generatedOverlay:mode==='all',
  };
}

function selectMode(generatedOverlay){
  const next=generatedOverlay===true?'all':'core';
  if(next===mode)return;
  installServingV1CompatibilityViews(db,{mode:next});
  mode=next;
}

parentPort.on('message',(message)=>{
  const id=Number(message?.id);
  try{
    selectMode(message?.generatedOverlay===true);
    const result=searchUnifiedWriter(
      databases(),
      message?.input||'',
      message?.options||{},
    );
    parentPort.postMessage({id,result});
  }catch(error){
    parentPort.postMessage({
      id,
      error:{
        message:error instanceof Error?error.message:String(error),
        stack:error instanceof Error?error.stack:null,
        channel,
      },
    });
  }
});

parentPort.postMessage({type:'ready',channel});
