import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateRedundancy,
  commonnessUtility,
  diversifyRanked,
  guardViolations,
  lexicalSimilarity,
  pageMetrics,
  qualityEvidence,
  rankQualityRows,
} from '../scripts/en-writer-ranking-v2-core.mjs';

function referenceDiversifyRanked(rows,{weight=0.12,limit=20}={}){
  const remaining=[...rows];
  const selected=[];
  while(remaining.length&&selected.length<limit){
    const base=remaining[0];
    let bestIndex=0;
    let bestScore=-Infinity;
    for(let i=0;i<remaining.length;i+=1){
      const row=remaining[i];
      if(row.tier!==base.tier||row.quality_band!==base.quality_band)break;
      const maxRedundancy=selected.length
        ?Math.max(...selected.map((picked)=>candidateRedundancy(row,picked)))
        :0;
      const diversifiedScore=row.evidence.utility-Number(weight||0)*maxRedundancy;
      if(
        diversifiedScore>bestScore
        ||(diversifiedScore===bestScore&&(
          Number(remaining[bestIndex].evidence.utility)-Number(row.evidence.utility)
          ||Number(remaining[bestIndex].evidence.phonetic)-Number(row.evidence.phonetic)
          ||Number(Boolean(remaining[bestIndex].evidence.usage_known))-Number(Boolean(row.evidence.usage_known))
          ||Number(row.wordfreq_rank??Number.MAX_SAFE_INTEGER)-Number(remaining[bestIndex].wordfreq_rank??Number.MAX_SAFE_INTEGER)
          ||Number(row.pronunciation_id??Number.MAX_SAFE_INTEGER)-Number(remaining[bestIndex].pronunciation_id??Number.MAX_SAFE_INTEGER)
          ||String(row.normalized).localeCompare(String(remaining[bestIndex].normalized),'en')
        )<0)
      ){
        bestScore=diversifiedScore;
        bestIndex=i;
      }
    }
    const [picked]=remaining.splice(bestIndex,1);
    const maxRedundancy=selected.length
      ?Math.max(...selected.map((row)=>candidateRedundancy(picked,row)))
      :0;
    selected.push({
      ...picked,
      max_redundancy:Number(maxRedundancy.toFixed(6)),
      diversified_score:Number(
        (picked.evidence.utility-Number(weight||0)*maxRedundancy).toFixed(8)
      ),
    });
  }
  return selected;
}

function deterministicRankingRows(count=180){
  const stems=['time','rhyme','chime','prime','lime','climb','shine','line','mine','sign'];
  return Array.from({length:count},(_,index)=>{
    const stem=stems[index%stems.length];
    const suffix=Math.floor(index/stems.length);
    return {
      normalized:stem+(suffix||''),
      tier:index<120?0:1,
      quality_band:index<60?0:index<120?1:2,
      pronunciation_id:index+1,
      lemmas:JSON.stringify([stem,index%7===0?'shared-'+(index%5):'lemma-'+index]),
      wordfreq_rank:index%11===0?null:index+10,
      evidence:{
        utility:Number((0.99-(index%60)*0.0015).toFixed(8)),
        phonetic:Number((0.98-(index%60)*0.001).toFixed(8)),
        commonness:0.5,
        usage_known:index%11!==0,
        lexical_overlap:0,
      },
    };
  });
}

test('English Writer v2 commonness remains bounded and unknown usage stays explicit',()=>{
  assert.ok(commonnessUtility(6,100)>commonnessUtility(3,50000));
  assert.ok(commonnessUtility(null,null)>=0&&commonnessUtility(null,null)<=1);
  const config={phonetic:0.80,syllable:0.14,commonness:0.06,unknown_usage_penalty:0.015,near_tie_band:0.03};
  const known=qualityEvidence({normalized:'known',score:{overall:1,syllable:1},wordfreq_rank:100,wordfreq_zipf:6},'query',config);
  const unknown=qualityEvidence({normalized:'unknown',score:{overall:1,syllable:1},wordfreq_rank:null,wordfreq_zipf:null},'query',config);
  assert.equal(known.usage_known,true);
  assert.equal(unknown.usage_known,false);
  assert.equal(unknown.usage_uncertainty_penalty,0.015);
});

test('English Writer v2 anchored bands block non-transitive near-tie chains',()=>{
  const config={phonetic:0.80,syllable:0.14,commonness:0.06,unknown_usage_penalty:0.015,near_tie_band:0.03};
  const rows=[
    {normalized:'a',tier:0,pronunciation_id:1,wordfreq_rank:50000,wordfreq_zipf:2.5,score:{overall:0.95,syllable:1}},
    {normalized:'b',tier:0,pronunciation_id:2,wordfreq_rank:10,wordfreq_zipf:6.5,score:{overall:0.93,syllable:1}},
    {normalized:'c',tier:0,pronunciation_id:3,wordfreq_rank:1,wordfreq_zipf:7.5,score:{overall:0.91,syllable:1}},
  ].map((row)=>({...row,evidence:qualityEvidence(row,'query',config)}));
  const ranked=rankQualityRows(rows,config);
  assert.equal(ranked[0].quality_band,ranked[1].quality_band);
  assert.notEqual(ranked[1].quality_band,ranked[2].quality_band);
  assert.equal(ranked[2].normalized,'c');
  assert.equal(guardViolations(ranked,{nearTieBand:0.03}).length,0);
});

test('raw English query spelling overlap is diagnostic only in Writer v2 utility',()=>{
  const config={phonetic:0.80,syllable:0.14,commonness:0.06,unknown_usage_penalty:0.015,near_tie_band:0.03};
  const base={tier:0,wordfreq_rank:1000,wordfreq_zipf:5,score:{overall:1,syllable:1}};
  const crime=qualityEvidence({...base,normalized:'crime'},'time',config);
  const rhyme=qualityEvidence({...base,normalized:'rhyme'},'time',config);
  assert.notEqual(crime.lexical_overlap,rhyme.lexical_overlap);
  assert.equal(crime.utility,rhyme.utility);
});

test('English Writer v2 diversity stays inside tier and anchored quality band',()=>{
  const base=[
    {normalized:'alpha',tier:0,pronunciation_id:1,lemmas:'["root"]',evidence:{utility:0.90,phonetic:0.95,commonness:0.5,usage_known:true,lexical_overlap:0}},
    {normalized:'alphas',tier:0,pronunciation_id:2,lemmas:'["root"]',evidence:{utility:0.89,phonetic:0.95,commonness:0.5,usage_known:true,lexical_overlap:0}},
    {normalized:'beta',tier:0,pronunciation_id:3,lemmas:'["beta"]',evidence:{utility:0.88,phonetic:0.94,commonness:0.5,usage_known:true,lexical_overlap:0}},
    {normalized:'gamma',tier:1,pronunciation_id:4,lemmas:'["gamma"]',evidence:{utility:0.99,phonetic:0.99,commonness:0.8,usage_known:true,lexical_overlap:0}},
  ];
  assert.ok(candidateRedundancy(base[0],base[1])>=0.95);
  const ranked=rankQualityRows(base,{near_tie_band:0.03});
  const diversified=diversifyRanked(ranked,{weight:0.12,limit:4});
  assert.equal(diversified[0].normalized,'alpha');
  assert.equal(diversified[1].normalized,'beta');
  assert.equal(diversified[3].normalized,'gamma');
  assert.equal(guardViolations(diversified,{nearTieBand:0.03,limit:4}).length,0);
  assert.equal(pageMetrics(diversified,4).rows,4);
});

test('lexical similarity remains available for diversity diagnostics',()=>{
  assert.equal(lexicalSimilarity('time','time'),1);
  assert.ok(lexicalSimilarity('nation','station')>0);
});

test('incremental English diversity is byte-for-byte equivalent to the reference greedy policy',()=>{
  const rows=deterministicRankingRows(240);
  for(const weight of [0,0.08,0.12,0.20]){
    for(const limit of [1,20,100,250]){
      const expected=referenceDiversifyRanked(rows,{weight,limit});
      const actual=diversifyRanked(rows,{weight,limit});
      assert.deepEqual(actual,expected);
    }
  }
});

test('English diversity remains equivalent across deterministic irregular lemma/bigram cases',()=>{
  let state=0x6d2b79f5;
  const random=()=>{
    state=(Math.imul(state^state>>>15,1|state)+0x6d2b79f5)|0;
    state^=state+Math.imul(state^state>>>7,61|state);
    return ((state^state>>>14)>>>0)/4294967296;
  };
  const alphabet='abcdefghijklmnopqrstuvwy';
  for(let round=0;round<24;round++){
    const rows=Array.from({length:40+Math.floor(random()*80)},(_,index)=>{
      const length=3+Math.floor(random()*8);
      let normalized='';
      for(let i=0;i<length;i++)normalized+=alphabet[Math.floor(random()*alphabet.length)];
      const lemmaA='l'+Math.floor(random()*18);
      const lemmaB=random()<0.35?'l'+Math.floor(random()*18):'u'+round+'-'+index;
      return {
        normalized,
        tier:Math.floor(random()*3),
        quality_band:Math.floor(random()*4),
        pronunciation_id:index+1,
        lemmas:JSON.stringify([lemmaA,lemmaB]),
        wordfreq_rank:random()<0.15?null:1+Math.floor(random()*100000),
        evidence:{
          utility:Number(random().toFixed(8)),
          phonetic:Number(random().toFixed(8)),
          commonness:Number(random().toFixed(8)),
          usage_known:random()>=0.15,
          lexical_overlap:0,
        },
      };
    }).sort((a,b)=>a.tier-b.tier||a.quality_band-b.quality_band||a.pronunciation_id-b.pronunciation_id);
    assert.deepEqual(
      diversifyRanked(rows,{weight:0.12,limit:Math.min(50,rows.length)}),
      referenceDiversifyRanked(rows,{weight:0.12,limit:Math.min(50,rows.length)}),
    );
  }
});
