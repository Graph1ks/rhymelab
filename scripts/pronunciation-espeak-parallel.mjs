export async function mapConcurrent(items,concurrency,worker){
  const list=Array.from(items||[]);
  const limit=Math.max(1,Math.min(Number(concurrency)||1,list.length||1));
  const results=new Array(list.length);
  let nextIndex=0;

  async function run(){
    while(true){
      const index=nextIndex;
      nextIndex+=1;
      if(index>=list.length)return;
      results[index]=await worker(list[index],index);
    }
  }

  await Promise.all(Array.from({length:limit},()=>run()));
  return results;
}
