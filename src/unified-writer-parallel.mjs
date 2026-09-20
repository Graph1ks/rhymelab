import {performance} from 'node:perf_hooks';
import {Worker} from 'node:worker_threads';
import {
  normalizeUnifiedResultLanguage,
  normalizeUnifiedResultScope,
} from './unified-writer-search.mjs';
import {consolidateUnifiedSurfaceResults} from './unified-surface-results.mjs';

export const PARALLEL_WRITER_EXECUTION='persistent-worker-threads-v1';
export const PARALLEL_WRITER_CHANNELS=Object.freeze([
  'words_de',
  'words_en',
  'phrases_de',
  'entities_de',
  'entities_en',
]);

function resultLanguages(options={}){
  const language=normalizeUnifiedResultLanguage(
    options.resultLanguage,
    options.language||'de',
  );
  return language==='both'?['de','en']:[language];
}

export function parallelWriterTaskSpecs(options={}){
  const scope=normalizeUnifiedResultScope(options.scope);
  const languages=resultLanguages(options);
  const tasks=[];
  const includeWords=scope==='all'||scope==='words';
  const includePhrases=scope==='all'||scope==='phrases';
  const includeEntities=scope==='all'||scope==='entities';

  if(includeWords&&languages.includes('de')){
    tasks.push({
      channel:'words_de',
      options:{...options,scope:'words',resultLanguage:'de'},
    });
  }
  if(includeWords&&languages.includes('en')){
    tasks.push({
      channel:'words_en',
      options:{...options,scope:'words',resultLanguage:'en'},
    });
  }
  if(includePhrases){
    tasks.push({
      channel:'phrases_de',
      options:{
        ...options,
        scope:'phrases',
        resultLanguage:normalizeUnifiedResultLanguage(
          options.resultLanguage,
          options.language||'de',
        ),
      },
    });
  }
  if(includeEntities&&languages.includes('de')){
    tasks.push({
      channel:'entities_de',
      options:{...options,scope:'entities',resultLanguage:'de'},
    });
  }
  if(includeEntities&&languages.includes('en')){
    tasks.push({
      channel:'entities_en',
      options:{...options,scope:'entities',resultLanguage:'en'},
    });
  }
  return tasks;
}

function mergeWarnings(responses){
  const out=[];
  const seen=new Set();
  for(const response of Object.values(responses)){
    for(const warning of response?.warnings||[]){
      const key=JSON.stringify([
        warning?.code||null,
        warning?.language||null,
        warning?.message||null,
      ]);
      if(seen.has(key))continue;
      seen.add(key);
      out.push(warning);
    }
  }
  return out;
}

function defaultWordLanguageChannel({
  language,
  includeWords,
  targeted,
  capability,
  queries,
}){
  const isDe=language==='de';
  const supportedQuery=isDe
    ?Boolean(queries?.de?.preferredIpa||queries?.en?.preferredIpa)
    :Boolean(queries?.en||queries?.de?.preferredIpa);
  return {
    available:Boolean(targeted&&capability?.wordWriter),
    reason:!includeWords
      ?'scope_excludes_words'
      :!targeted
        ?(isDe?'result_language_excludes_german':'result_language_excludes_english')
        :supportedQuery
          ?null
          :'query_not_found',
    results:[],
  };
}

function defaultEntityLanguageChannel(language,includeEntities){
  return {
    available:false,
    reason:includeEntities
      ?(language==='de'
          ?'german_entity_runtime_unavailable'
          :'english_entity_runtime_unavailable')
      :'scope_excludes_entities',
    language,
    results:[],
  };
}

function wordComparator(a,b){
  return Number(a.channelRank||0)-Number(b.channelRank||0)
    ||(a.language===b.language?0:a.language==='de'?-1:1)
    ||String(a.normalized||'').localeCompare(String(b.normalized||''),'en');
}

function entityComparator(a,b){
  return Number(a.channelRank||0)-Number(b.channelRank||0)
    ||(a.language===b.language?0:a.language==='de'?-1:1)
    ||String(a.normalized||'').localeCompare(String(b.normalized||''),'en');
}

function mergedPerformanceProfile(responses,totalMs){
  const stages={};
  const counters={};
  for(const response of Object.values(responses)){
    const profile=response?.performanceProfile;
    if(!profile)continue;
    for(const [name,raw] of Object.entries(profile.stages_ms||{})){
      const value=Number(raw);
      if(!Number.isFinite(value))continue;
      stages[name]=Object.hasOwn(stages,name)
        ?Math.max(Number(stages[name]),value)
        :value;
    }
    for(const [name,raw] of Object.entries(profile.counters||{})){
      const value=Number(raw);
      if(!Number.isFinite(value))continue;
      counters[name]=Object.hasOwn(counters,name)
        ?Math.max(Number(counters[name]),value)
        :value;
    }
  }
  return {
    stages_ms:stages,
    counters,
    total_ms:Number(Number(totalMs||0).toFixed(3)),
    execution:PARALLEL_WRITER_EXECUTION,
  };
}

function patchEarlyResponse(base,responses,input,options,generatedOverlay,totalMs){
  const languageBasis=base.languageBasis;
  const resultLanguageBasis=normalizeUnifiedResultLanguage(
    options.resultLanguage,
    languageBasis,
  );
  const scope=normalizeUnifiedResultScope(options.scope);
  const languages=resultLanguageBasis==='both'?['de','en']:[resultLanguageBasis];
  const capabilities=base.capabilities;
  const activeResultLanguages=languages.filter(
    (language)=>capabilities?.languages?.[language]?.available,
  );
  const unavailableResultLanguages=languages.filter(
    (language)=>!capabilities?.languages?.[language]?.available,
  );
  return {
    ...base,
    input:String(input||''),
    resultLanguageBasis,
    scope,
    resultLanguages:languages,
    activeResultLanguages,
    unavailableResultLanguages,
    warnings:mergeWarnings(responses),
    ...(options.profileStages===true
      ?{performanceProfile:mergedPerformanceProfile(responses,totalMs)}
      :{}),
  };
}

export function mergeParallelUnifiedWriterResponses(
  responses,
  input,
  options={},
  {
    generatedOverlay=false,
    totalMs=0,
  }={},
){
  const values=Object.values(responses).filter(Boolean);
  if(!values.length)throw new Error('Parallel Writer produced no channel responses.');
  const base=values[0];

  if(base.status==='language_unavailable'||base.status==='query_not_found'){
    return patchEarlyResponse(
      base,responses,input,options,generatedOverlay,totalMs,
    );
  }

  const languageBasis=base.languageBasis;
  const resultLanguageBasis=normalizeUnifiedResultLanguage(
    options.resultLanguage,
    languageBasis,
  );
  const scope=normalizeUnifiedResultScope(options.scope);
  const requestedLanguages=base.requestedLanguages||[];
  const languages=resultLanguageBasis==='both'?['de','en']:[resultLanguageBasis];
  const capabilities=base.capabilities;
  const includeWords=scope==='all'||scope==='words';
  const includePhrases=scope==='all'||scope==='phrases';
  const includeEntities=scope==='all'||scope==='entities';
  const targetDe=languages.includes('de');
  const targetEn=languages.includes('en');

  const deWord=responses.words_de?.channels?.words?.byLanguage?.de
    ||defaultWordLanguageChannel({
      language:'de',
      includeWords,
      targeted:targetDe,
      capability:capabilities?.languages?.de,
      queries:base.queries,
    });
  const enWord=responses.words_en?.channels?.words?.byLanguage?.en
    ||defaultWordLanguageChannel({
      language:'en',
      includeWords,
      targeted:targetEn,
      capability:capabilities?.languages?.en,
      queries:base.queries,
    });
  const wordResults=[
    ...(deWord.results||[]),
    ...(enWord.results||[]),
  ].sort(wordComparator);
  const wordChannel={
    available:Boolean(deWord.available||enWord.available),
    reason:wordResults.length
      ?null
      :deWord.reason===enWord.reason
        ?deWord.reason
        :'no_word_results_for_resolved_language_queries',
    rankingPolicy:resultLanguageBasis==='both'
      ?'language_channel_rank_interleave_no_cross_language_score_calibration'
      :resultLanguageBasis==='en'
        ?enWord.rankingPolicy
        :deWord.rankingPolicy,
    byLanguage:{de:deWord,en:enWord},
    results:wordResults,
  };

  const phraseChannel=includePhrases
    ?responses.phrases_de?.channels?.phrases||{
        available:false,
        reason:'phrase_runtime_unavailable',
        results:[],
      }
    :{
        available:false,
        reason:'scope_excludes_phrases',
        results:[],
      };

  const deEntity=responses.entities_de?.channels?.entities?.byLanguage?.de
    ||defaultEntityLanguageChannel('de',includeEntities);
  const enEntity=responses.entities_en?.channels?.entities?.byLanguage?.en
    ||defaultEntityLanguageChannel('en',includeEntities);
  const entityResults=[
    ...(deEntity.results||[]),
    ...(enEntity.results||[]),
  ].sort(entityComparator);
  const entityChannel={
    available:Boolean(deEntity.available||enEntity.available),
    reason:entityResults.length
      ?null
      :deEntity.reason===enEntity.reason
        ?deEntity.reason
        :'no_entity_results_for_resolved_language_queries',
    policy:'language_local_entity_channels_no_cross_language_score_calibration',
    byLanguage:{de:deEntity,en:enEntity},
    results:entityResults,
  };

  const phraseResults=phraseChannel.results||[];
  const surfaceConsolidation=consolidateUnifiedSurfaceResults({
    wordResults,
    entityResults,
  });
  const visibleWordResults=surfaceConsolidation.wordResults;
  const visibleEntityResults=surfaceConsolidation.entityResults;
  const visibleDeWords=visibleWordResults.filter((row)=>row.language==='de');
  const visibleEnWords=visibleWordResults.filter((row)=>row.language==='en');
  const visibleDeEntities=visibleEntityResults.filter((row)=>row.language==='de');
  const visibleEnEntities=visibleEntityResults.filter((row)=>row.language==='en');
  const visibleWordChannel={
    ...wordChannel,
    byLanguage:{
      de:{...deWord,results:visibleDeWords},
      en:{...enWord,results:visibleEnWords},
    },
    results:visibleWordResults,
  };
  const visibleEntityChannel={
    ...entityChannel,
    byLanguage:{
      de:{...deEntity,results:visibleDeEntities},
      en:{...enEntity,results:visibleEnEntities},
    },
    results:visibleEntityResults,
  };
  const results=[...visibleWordResults,...phraseResults,...visibleEntityResults];
  const activeResultLanguages=languages.filter(
    (language)=>capabilities?.languages?.[language]?.available,
  );
  const unavailableResultLanguages=languages.filter(
    (language)=>!capabilities?.languages?.[language]?.available,
  );
  const generatedOnly=options.generatedOnly===true&&generatedOverlay===true;

  return {
    schema:base.schema,
    policy:base.policy,
    status:base.status,
    input:String(input||''),
    languageBasis,
    resultLanguageBasis,
    scope,
    generatedOnly,
    capabilities,
    requestedLanguages,
    resultLanguages:languages,
    activeLanguages:base.activeLanguages||[],
    activeResultLanguages,
    unavailableLanguages:base.unavailableLanguages||[],
    unavailableResultLanguages,
    resolvedLanguages:base.resolvedLanguages||[],
    warnings:mergeWarnings(responses),
    query:base.query,
    queries:base.queries,
    ordering:{
      crossChannelCalibration:false,
      crossLanguageCalibration:false,
      default:languageBasis==='both'
        ?'word results interleave deterministic per-language channel ranks; German Phrase/Mosaic and Entity channels remain separate; no DE/EN numeric score comparison'
        :'channel-preserving deterministic language-local Writer order; Phrase/Mosaic and Entity channels are not numerically cross-calibrated',
      phraseQuota:false,
    },
    channels:{
      words:visibleWordChannel,
      phrases:phraseChannel,
      entities:visibleEntityChannel,
    },
    ...(options.profileStages===true
      ?{performanceProfile:mergedPerformanceProfile(responses,totalMs)}
      :{}),
    counts:{
      words:visibleWordResults.length,
      germanWords:visibleDeWords.length,
      englishWords:visibleEnWords.length,
      phrases:phraseResults.length,
      entities:visibleEntityResults.length,
      germanEntities:visibleDeEntities.length,
      englishEntities:visibleEnEntities.length,
      total:results.length,
      surfaceAggregation:surfaceConsolidation.diagnostics,
      searchPool:{
        germanWords:Number(deWord.writerRetrieval?.mergedCandidates||deWord.results?.length||0),
        englishWords:Number(enWord.writerRetrieval?.normalizedCandidates||enWord.results?.length||0),
        phrases:Number(phraseChannel.candidateCount||phraseResults.length||0),
        germanEntities:Number(deEntity.scoredCandidateCount||deEntity.results?.length||0),
        englishEntities:Number(enEntity.scoredCandidateCount||enEntity.results?.length||0),
      },
    },
    results,
  };
}

class PersistentChannelWorker{
  constructor(channel,servingPath){
    this.channel=channel;
    this.nextId=1;
    this.pending=new Map();
    this.readyState=false;
    this.worker=new Worker(
      new URL('./unified-writer-worker.mjs',import.meta.url),
      {workerData:{channel,servingPath}},
    );
    this.ready=new Promise((resolve,reject)=>{
      this.readyResolve=resolve;
      this.readyReject=reject;
    });
    this.worker.on('message',(message)=>this.onMessage(message));
    this.worker.on('error',(error)=>this.onFailure(error));
    this.worker.on('exit',(code)=>{
      if(code!==0)this.onFailure(
        new Error('Writer worker '+channel+' exited with code '+code),
      );
      else if(!this.readyState)this.onFailure(
        new Error('Writer worker '+channel+' exited before ready'),
      );
    });
  }

  onMessage(message){
    if(message?.type==='ready'){
      this.readyState=true;
      this.readyResolve?.();
      return;
    }
    const id=Number(message?.id);
    const pending=this.pending.get(id);
    if(!pending)return;
    this.pending.delete(id);
    if(message?.error){
      const error=new Error(message.error.message||String(message.error));
      if(message.error.stack)error.stack=message.error.stack;
      pending.reject(error);
    }else{
      pending.resolve(message.result);
    }
  }

  onFailure(error){
    if(!this.readyState)this.readyReject?.(error);
    for(const pending of this.pending.values())pending.reject(error);
    this.pending.clear();
  }

  async request(payload){
    await this.ready;
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject});
      this.worker.postMessage({id,...payload});
    });
  }

  async close(){
    for(const pending of this.pending.values()){
      pending.reject(new Error('Writer worker closed.'));
    }
    this.pending.clear();
    try{await this.worker.terminate();}catch{}
  }
}

export class ServingV1ParallelWriterRuntime{
  constructor(servingPath){
    this.servingPath=String(servingPath);
    this.workers=new Map(
      PARALLEL_WRITER_CHANNELS.map((channel)=>[
        channel,
        new PersistentChannelWorker(channel,this.servingPath),
      ]),
    );
  }

  async ready(){
    await Promise.all(
      [...this.workers.values()].map((worker)=>worker.ready),
    );
    return this;
  }

  async search(input,options={},{
    generatedOverlay=false,
  }={}){
    const tasks=parallelWriterTaskSpecs(options);
    const started=performance.now();
    const pairs=await Promise.all(tasks.map(async(spec)=>[
      spec.channel,
      await this.workers.get(spec.channel).request({
        input:String(input||''),
        options:spec.options,
        generatedOverlay:generatedOverlay===true,
      }),
    ]));
    return mergeParallelUnifiedWriterResponses(
      Object.fromEntries(pairs),
      input,
      options,
      {
        generatedOverlay,
        totalMs:performance.now()-started,
      },
    );
  }

  health(){
    return {
      schema:'rhymelab-parallel-writer-runtime-v1',
      execution:PARALLEL_WRITER_EXECUTION,
      workers:this.workers.size,
      channels:[...this.workers.keys()],
      serving:this.servingPath,
      caching:false,
    };
  }

  async close(){
    await Promise.all(
      [...this.workers.values()].map((worker)=>worker.close()),
    );
  }
}

export function createServingV1ParallelWriterRuntime(servingPath){
  return new ServingV1ParallelWriterRuntime(servingPath);
}
