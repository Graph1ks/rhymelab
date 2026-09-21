import {parentPort,workerData} from 'node:worker_threads';
import {
  installServingV1CompatibilityViews,
  openServingV1ProductDb,
  servingV1DistributionCapabilities,
} from './serving-v1-product-runtime.mjs';
import {searchUnifiedWriter} from './unified-writer-search.mjs';

if(!parentPort)throw new Error('Unified Writer worker requires parentPort.');

const channel=String(workerData?.channel||'unknown');
const servingPath=String(workerData?.servingPath||'');
let mode='core';
const db=openServingV1ProductDb(servingPath,{mode});
const capabilities=servingV1DistributionCapabilities(db);

function databases(){
  return {
    writerDb:capabilities.words_de?db:null,
    englishDb:capabilities.words_en?db:null,
    phraseDb:capabilities.phrases?db:null,
    entityDb:capabilities.entities?db:null,
    generatedOverlay:mode==='all'&&capabilities.generated,
  };
}

function selectMode(generatedOverlay){
  const next=generatedOverlay===true&&capabilities.generated?'all':'core';
  if(next===mode)return;
  db.exec('PRAGMA query_only=OFF;');
  try{
    installServingV1CompatibilityViews(db,{mode:next});
    mode=next;
  }finally{
    db.exec('PRAGMA query_only=ON;');
  }
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
