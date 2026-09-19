import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';

const DEFAULT_WORKER_URL=new URL('./pronunciation-ipa-analyzer-worker.mjs',import.meta.url);

export class PronunciationIpaAnalyzerPool{
  constructor({workers=4,WorkerClass=Worker,workerUrl=DEFAULT_WORKER_URL}={}){
    this.workerCount=Math.max(1,Number(workers)||4);
    this.WorkerClass=WorkerClass;
    this.workerUrl=workerUrl;
    this.closed=false;
    this.nextTaskId=1;
    this.queue=[];
    this.slots=new Array(this.workerCount);
    this.metrics={
      submitted:0,
      completed:0,
      failed:0,
      worker_restarts:0,
      analyzer_elapsed_ms:0,
      queue_elapsed_ms:0,
    };
    for(let index=0;index<this.workerCount;index+=1){
      this.spawnSlot(index,false);
    }
  }

  spawnSlot(index,restart){
    if(this.closed)return;
    const worker=new this.WorkerClass(this.workerUrl,{
      name:'rhymelab-ipa-analyzer-'+String(index+1),
    });
    const slot={index,worker,task:null};
    this.slots[index]=slot;
    if(restart)this.metrics.worker_restarts+=1;

    worker.on('message',(message)=>this.handleMessage(slot,worker,message));
    worker.on('error',(error)=>this.handleFailure(slot,worker,error));
    worker.on('exit',(code)=>{
      if(this.closed)return;
      if(this.slots[index]?.worker!==worker)return;
      this.handleFailure(
        slot,
        worker,
        new Error('IPA analyzer worker exited unexpectedly with code '+String(code)),
      );
    });
    this.dispatch();
  }

  handleMessage(slot,worker,message){
    if(this.slots[slot.index]?.worker!==worker)return;
    const task=slot.task;
    if(!task)return;
    if(Number(message?.id)!==task.id){
      this.handleFailure(
        slot,
        worker,
        new Error(
          'IPA analyzer worker task mismatch: expected '+task.id
          +', got '+String(message?.id),
        ),
      );
      return;
    }

    slot.task=null;
    const completedAt=performance.now();
    const analyzerElapsed=Number(message?.elapsed_ms)||0;
    const queueElapsed=Math.max(0,task.startedAt-task.queuedAt);
    this.metrics.analyzer_elapsed_ms+=analyzerElapsed;
    this.metrics.queue_elapsed_ms+=queueElapsed;

    if(message?.ok){
      this.metrics.completed+=1;
      task.resolve({
        inspection:message.inspection,
        analyzer_elapsed_ms:analyzerElapsed,
        analyzer_queue_ms:queueElapsed,
        analyzer_roundtrip_ms:completedAt-task.startedAt,
        worker_index:slot.index,
      });
    }else{
      this.metrics.failed+=1;
      task.reject(new Error(String(message?.error||'IPA analyzer worker failed.')));
    }
    this.dispatch();
  }

  handleFailure(slot,worker,error){
    if(this.slots[slot.index]?.worker!==worker)return;
    const task=slot.task;
    slot.task=null;
    this.slots[slot.index]={index:slot.index,worker:null,task:null};
    if(task){
      this.metrics.failed+=1;
      task.reject(error instanceof Error?error:new Error(String(error)));
    }
    if(!this.closed)this.spawnSlot(slot.index,true);
  }

  dispatch(){
    if(this.closed)return;
    for(const slot of this.slots){
      if(!slot?.worker||slot.task||!this.queue.length)continue;
      const task=this.queue.shift();
      task.startedAt=performance.now();
      slot.task=task;
      try{
        slot.worker.postMessage({id:task.id,payload:task.payload});
      }catch(error){
        this.handleFailure(slot,slot.worker,error);
      }
    }
  }

  analyze(payload){
    if(this.closed)return Promise.reject(new Error('IPA analyzer pool is closed.'));
    const id=this.nextTaskId++;
    this.metrics.submitted+=1;
    return new Promise((resolve,reject)=>{
      this.queue.push({
        id,
        payload,
        resolve,
        reject,
        queuedAt:performance.now(),
        startedAt:0,
      });
      this.dispatch();
    });
  }

  stats(){
    const active=this.slots.reduce((count,slot)=>count+(slot?.task?1:0),0);
    return {
      workers:this.workerCount,
      queued:this.queue.length,
      active,
      ...this.metrics,
    };
  }

  async close(){
    if(this.closed)return;
    this.closed=true;
    const error=new Error('IPA analyzer pool closed.');
    for(const task of this.queue.splice(0)){
      task.reject(error);
    }
    const terminations=[];
    for(const slot of this.slots){
      if(slot?.task){
        this.metrics.failed+=1;
        slot.task.reject(error);
        slot.task=null;
      }
      if(slot?.worker){
        terminations.push(Promise.resolve(slot.worker.terminate()).catch(()=>null));
      }
    }
    await Promise.all(terminations);
  }
}
