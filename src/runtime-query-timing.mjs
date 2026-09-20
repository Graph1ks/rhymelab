export function createRollingQueryTiming(windowSize=100){
  const limit=Math.max(1,Math.trunc(Number(windowSize)||100));
  const samples=[];
  let sum=0;

  const snapshot=(latest=null)=>({
    schema:'rhymelab-runtime-query-timing-v1',
    searchMs:latest==null?null:Number(latest.toFixed(1)),
    averageLast100Ms:samples.length?Number((sum/samples.length).toFixed(1)):null,
    sampleCount:samples.length,
    windowSize:limit,
  });

  return {
    record(value){
      const ms=Number(value);
      if(!Number.isFinite(ms)||ms<0)throw new Error('Query timing sample must be a finite non-negative number.');
      samples.push(ms);
      sum+=ms;
      if(samples.length>limit)sum-=samples.shift();
      return snapshot(ms);
    },
    snapshot(){
      return snapshot(samples.at(-1)??null);
    },
  };
}
