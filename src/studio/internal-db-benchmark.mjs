export const INTERNAL_DB_BENCHMARK_SCHEMA='rhymelab-internal-db-benchmark-v1';

export const INTERNAL_DB_BENCHMARK_SUITE=Object.freeze([
  Object.freeze({id:'de-arbeitsweise',query:'Arbeitsweise',queryBasis:'de',resultLanguage:'de'}),
  Object.freeze({id:'de-weihnachten',query:'Weihnachten',queryBasis:'de',resultLanguage:'de'}),
  Object.freeze({id:'de-reise',query:'Reise',queryBasis:'de',resultLanguage:'de'}),
  Object.freeze({id:'de-maschine',query:'Maschine',queryBasis:'de',resultLanguage:'de'}),
  Object.freeze({id:'de-geschichte',query:'Geschichte',queryBasis:'de',resultLanguage:'de'}),
  Object.freeze({id:'de-liebe',query:'Liebe',queryBasis:'de',resultLanguage:'de'}),
  Object.freeze({id:'en-crisis',query:'crisis',queryBasis:'en',resultLanguage:'en'}),
  Object.freeze({id:'en-inflection',query:'inflection',queryBasis:'en',resultLanguage:'en'}),
  Object.freeze({id:'en-motion',query:'motion',queryBasis:'en',resultLanguage:'en'}),
  Object.freeze({id:'en-generation',query:'generation',queryBasis:'en',resultLanguage:'en'}),
  Object.freeze({id:'en-fire',query:'fire',queryBasis:'en',resultLanguage:'en'}),
  Object.freeze({id:'en-time',query:'time',queryBasis:'en',resultLanguage:'en'}),
]);

function number(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

function quantile(values,q){
  const rows=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!rows.length)return null;
  if(rows.length===1)return rows[0];
  const position=(rows.length-1)*q;
  const lower=Math.floor(position),upper=Math.ceil(position);
  if(lower===upper)return rows[lower];
  const weight=position-lower;
  return rows[lower]*(1-weight)+rows[upper]*weight;
}

export function benchmarkDistribution(values){
  const rows=values.map(Number).filter(Number.isFinite);
  return {
    n:rows.length,
    min:rows.length?Math.min(...rows):null,
    p50:quantile(rows,.5),
    p95:quantile(rows,.95),
    max:rows.length?Math.max(...rows):null,
    mean:rows.length?rows.reduce((sum,value)=>sum+value,0)/rows.length:null,
  };
}

function resultIdentity(row,index){
  const raw=row?.raw||row||{};
  return [
    row?.kind||raw.resultKind||'word',
    row?.lang||raw.language||'',
    row?.id||raw.resultId||raw.windowId||raw.phraseId||raw.entityQid||raw.normalized||row?.word||index,
    row?.word||raw.word||raw.surface||'',
  ].join('|');
}

function fnv1a32(value){
  let hash=0x811c9dc5;
  for(let index=0;index<value.length;index++){
    hash^=value.charCodeAt(index);
    hash=Math.imul(hash,0x01000193)>>>0;
  }
  return hash.toString(16).padStart(8,'0');
}

export function writerResultQuality(rows,{top=50}={}){
  const list=Array.isArray(rows)?rows:[];
  const identities=list.map(resultIdentity);
  const kinds={word:0,phrase:0,entity:0,other:0};
  const languages={de:0,en:0,other:0};
  for(const row of list){
    const kind=String(row?.kind||row?.raw?.resultKind||'other');
    if(Object.hasOwn(kinds,kind))kinds[kind]++;
    else kinds.other++;
    const language=String(row?.lang||row?.raw?.language||'other').toLowerCase();
    if(Object.hasOwn(languages,language))languages[language]++;
    else languages.other++;
  }
  return {
    count:list.length,
    kinds,
    languages,
    fingerprint:'fnv1a32:'+fnv1a32(identities.join('\n')),
    topIdentities:identities.slice(0,Math.max(1,Math.trunc(top))),
  };
}

export function compareWriterQuality(reference,candidate){
  const a=reference?.topIdentities||[];
  const b=candidate?.topIdentities||[];
  const aSet=new Set(a),bSet=new Set(b);
  let intersection=0;
  for(const id of aSet)if(bSet.has(id))intersection++;
  const union=new Set([...aSet,...bSet]).size;
  let prefix=0;
  while(prefix<Math.min(a.length,b.length)&&a[prefix]===b[prefix])prefix++;
  return {
    sameFingerprint:Boolean(reference?.fingerprint&&reference.fingerprint===candidate?.fingerprint),
    resultCountDelta:Number(candidate?.count||0)-Number(reference?.count||0),
    topOverlapCount:intersection,
    topJaccard:union?intersection/union:1,
    exactOrderedPrefix:prefix,
    referenceTopCount:a.length,
    candidateTopCount:b.length,
  };
}

function sampleFromResult({database,caseId,run,warmup,result}){
  const client=result?.clientTiming||{};
  const server=result?.serverTransport||{};
  return {
    database,
    caseId,
    run,
    warmup,
    ok:true,
    resultCount:Number(result?.rows?.length||0),
    quality:writerResultQuality(result?.rows||[]),
    request:result?.effectiveRequest||null,
    timings:{
      serverSearchMs:number(result?.runtimeTiming?.searchMs),
      serverProfileMs:number(result?.raw?.performanceProfile?.total_ms),
      serverSerializeMs:number(server.serializeMs),
      serverBeforeSerializeMs:number(server.beforeSerializeMs),
      clientHeadersMs:number(client.headersMs),
      clientBodyReadMs:number(client.bodyReadMs),
      clientParseMs:number(client.parseMs),
      clientMapMs:number(client.mapMs),
      clientTotalMs:number(client.totalMs??client.roundTripMs),
    },
    bytes:{
      response:number(client.responseBytes??server.responseBytes),
      transfer:number(client.resource?.transferSize),
      encoded:number(client.resource?.encodedBodySize),
      decoded:number(client.resource?.decodedBodySize),
    },
    resource:client.resource||null,
    runtimeExecution:result?.runtimeExecution||null,
  };
}

function aggregateDatabaseSamples(samples,qualityComparisons){
  const measured=samples.filter((row)=>!row.warmup&&row.ok);
  const pick=(path)=>measured.map((row)=>{
    let value=row;
    for(const key of path)value=value?.[key];
    return value;
  });
  const counts=measured.map((row)=>row.resultCount);
  const byCase=new Map();
  for(const row of measured){
    const list=byCase.get(row.caseId)||[];
    list.push(row);
    byCase.set(row.caseId,list);
  }
  const nondeterministicCases=[...byCase.entries()].filter(([,rows])=>
    new Set(rows.map((row)=>row.quality?.fingerprint).filter(Boolean)).size>1
  ).map(([caseId])=>caseId);
  return {
    measuredRuns:measured.length,
    deterministic:nondeterministicCases.length===0,
    nondeterministicCases:nondeterministicCases.length,
    nondeterministicCaseIds:nondeterministicCases,
    serverSearchMs:benchmarkDistribution(pick(['timings','serverSearchMs'])),
    serverSerializeMs:benchmarkDistribution(pick(['timings','serverSerializeMs'])),
    clientTotalMs:benchmarkDistribution(pick(['timings','clientTotalMs'])),
    clientParseMs:benchmarkDistribution(pick(['timings','clientParseMs'])),
    clientMapMs:benchmarkDistribution(pick(['timings','clientMapMs'])),
    responseBytes:benchmarkDistribution(pick(['bytes','response'])),
    resultCount:benchmarkDistribution(counts),
    qualityVsMaster:{
      comparisons:qualityComparisons.length,
      meanTopJaccard:qualityComparisons.length
        ?qualityComparisons.reduce((sum,row)=>sum+Number(row.topJaccard||0),0)/qualityComparisons.length
        :null,
      exactFingerprintMatches:qualityComparisons.filter((row)=>row.sameFingerprint).length,
      meanOrderedPrefix:qualityComparisons.length
        ?qualityComparisons.reduce((sum,row)=>sum+Number(row.exactOrderedPrefix||0),0)/qualityComparisons.length
        :null,
    },
  };
}

export function summarizeInternalDbBenchmark(samples,cases,databases){
  const measured=samples.filter((row)=>!row.warmup&&row.ok);
  const quality=[];
  for(const testCase of cases){
    const reference=measured.find((row)=>row.caseId===testCase.id&&row.database==='master');
    if(!reference)continue;
    for(const database of databases){
      const candidate=measured.find((row)=>row.caseId===testCase.id&&row.database===database);
      if(!candidate)continue;
      quality.push({
        caseId:testCase.id,
        database,
        ...compareWriterQuality(reference.quality,candidate.quality),
      });
    }
  }

  return {
    databases:Object.fromEntries(databases.map((database)=>[
      database,
      aggregateDatabaseSamples(
        samples.filter((row)=>row.database===database),
        quality.filter((row)=>row.database===database),
      ),
    ])),
    quality,
  };
}

export async function runInternalDbBenchmark({
  search,
  databases=['master','lite','standard','full'],
  cases,
  baseOptions={},
  warmups=1,
  runs=3,
  onProgress=null,
  signal=null,
}={}){
  if(typeof search!=='function')throw new TypeError('search is required');
  const normalizedCases=(cases||[]).map((row,index)=>({
    id:String(row?.id||'case-'+(index+1)),
    query:String(row?.query||'').trim(),
    queryBasis:row?.queryBasis||baseOptions.queryBasis||'de',
    resultLanguage:row?.resultLanguage||baseOptions.resultLanguage||'de',
    overrides:row?.overrides||{},
  })).filter((row)=>row.query);
  const dbs=databases.map((value)=>String(value)).filter(Boolean);
  const safeWarmups=Math.max(0,Math.min(3,Math.trunc(Number(warmups)||0)));
  const safeRuns=Math.max(1,Math.min(10,Math.trunc(Number(runs)||1)));
  const samples=[];
  const total=normalizedCases.length*dbs.length*(safeWarmups+safeRuns);
  let current=0;

  for(const testCase of normalizedCases){
    for(const database of dbs){
      for(let index=0;index<safeWarmups+safeRuns;index++){
        if(signal?.aborted){
          const error=new Error('Benchmark aborted');
          error.name='AbortError';
          throw error;
        }
        const warmup=index<safeWarmups;
        const run=warmup?index+1:index-safeWarmups+1;
        current++;
        onProgress?.({
          status:'start',current,total,database,caseId:testCase.id,
          query:testCase.query,warmup,run,
        });
        try{
          const result=await search({
            ...baseOptions,
            ...testCase.overrides,
            query:testCase.query,
            queryBasis:testCase.queryBasis,
            resultLanguage:testCase.resultLanguage,
            runtimeDb:database,
            internalProfile:true,
          });
          const sample=sampleFromResult({
            database,caseId:testCase.id,run,warmup,result,
          });
          samples.push(sample);
          onProgress?.({status:'complete',current,total,...sample});
        }catch(error){
          const sample={
            database,caseId:testCase.id,run,warmup,ok:false,
            error:error instanceof Error?error.message:String(error),
          };
          samples.push(sample);
          onProgress?.({status:'error',current,total,...sample});
        }
      }
    }
  }

  const report={
    schema:INTERNAL_DB_BENCHMARK_SCHEMA,
    createdAt:new Date().toISOString(),
    internalOnly:true,
    shipping:false,
    config:{
      databases:dbs,
      warmups:safeWarmups,
      runs:safeRuns,
      cases:normalizedCases,
      baseOptions,
    },
    samples,
    summary:summarizeInternalDbBenchmark(samples,normalizedCases,dbs),
  };
  return report;
}
