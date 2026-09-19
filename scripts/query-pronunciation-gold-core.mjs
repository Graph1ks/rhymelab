import { createHash } from 'node:crypto';

export const QUERY_PRONUNCIATION_GOLD_SAMPLE_SCHEMA='rhymelab-query-pronunciation-gold-sample-v1';
export const QUERY_PRONUNCIATION_GOLD_REPORT_SCHEMA='rhymelab-query-pronunciation-espeak-gold-report-v1';
export const QUERY_PRONUNCIATION_GOLD_POLICY='source-backed-lexical-controls-v1';
export const QUERY_PRONUNCIATION_GOLD_BUCKETS=Object.freeze(['1','2','3','4+']);

export function deterministicScore(seed,key){
  return createHash('sha256')
    .update(`${String(seed)}\u0000${String(key)}`)
    .digest('hex');
}

export function deterministicTake(rows,limit,seed,keyFn){
  const selected=[];
  for(const row of rows){
    const rank=deterministicScore(seed,keyFn(row));
    if(selected.length<limit){
      selected.push({rank,row});
      if(selected.length===limit) selected.sort((a,b)=>b.rank.localeCompare(a.rank));
      continue;
    }
    if(rank>=selected[0].rank) continue;
    selected[0]={rank,row};
    selected.sort((a,b)=>b.rank.localeCompare(a.rank));
  }
  return selected
    .sort((a,b)=>a.rank.localeCompare(b.rank))
    .map(({row})=>row);
}

export function syllableBucket(value){
  const n=Number(value||0);
  if(n<=1) return '1';
  if(n===2) return '2';
  if(n===3) return '3';
  return '4+';
}

export function pct(n,d){
  return d?Number((Number(n)*100/Number(d)).toFixed(2)):0;
}

export function evaluateAgainstReferences(predicted,references,scoreAnalyses){
  if(!predicted) throw new TypeError('Predicted analysis is required.');
  if(!Array.isArray(references)||!references.length){
    throw new TypeError('At least one reference analysis is required.');
  }
  if(typeof scoreAnalyses!=='function') throw new TypeError('scoreAnalyses must be a function.');

  const phoneKey=(analysis)=>String(analysis.canonicalPhonemes||'');
  let best=null;
  for(const reference of references){
    const score=scoreAnalyses(reference,predicted);
    const row={
      reference,
      score,
      exactPhones:phoneKey(reference)===phoneKey(predicted),
      exactTail:String(reference.exactTailKey||'')===String(predicted.exactTailKey||''),
      syllable:Number(reference.syllableCount||0)===Number(predicted.syllableCount||0),
      stress:String(reference.stressPattern||'')===String(predicted.stressPattern||''),
      primaryStress:
        Number(reference.primaryStressSyllable||0)===Number(predicted.primaryStressSyllable||0),
    };
    if(
      !best
      ||Number(row.score?.overall||0)>Number(best.score?.overall||0)
      ||(
        Number(row.score?.overall||0)===Number(best.score?.overall||0)
        &&Number(row.exactTail)>Number(best.exactTail)
      )
      ||(
        Number(row.score?.overall||0)===Number(best.score?.overall||0)
        &&Number(row.exactTail)===Number(best.exactTail)
        &&Number(row.exactPhones)>Number(best.exactPhones)
      )
    ) best=row;
  }
  return best;
}
