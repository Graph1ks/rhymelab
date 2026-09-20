import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import { prepareGermanRhymeAnalysis } from '../scripts/german-rhyme-features.mjs';
import {
  eligibleGermanRhymeAnchorPositions,
  germanRightEdgeVowelSuffixKeys,
  germanWriterRhymeMatchUpperBound,
  prepareGermanRhymeAnchorAnalysis,
  scoreGermanRhymeAnalysesWithAnchors,
  scorePreparedGermanRhymeAnalysesWithAnchors,
} from '../scripts/german-rhyme-anchors.mjs';

test('German compounds expose explicit secondary-stress right-edge anchors', () => {
  const analysis = analyzeGermanIpa('ˈaʁbaɪ̯t͡sˌvaɪ̯zə');
  assert.deepEqual(eligibleGermanRhymeAnchorPositions(analysis), [1, 3]);
  const keys = germanRightEdgeVowelSuffixKeys(analysis).map((entry) => entry.key);
  assert.ok(keys.includes('aɪ-aɪ-ə'));
  assert.ok(keys.includes('aɪ-ə'));
});

test('Arbeitsweise and Hochzeitsreise become a strong right-edge anchor match', () => {
  const query = analyzeGermanIpa('ˈaʁbaɪ̯t͡sˌvaɪ̯zə');
  const candidate = analyzeGermanIpa('ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə');
  const score = scoreGermanRhymeAnalysesWithAnchors(query, candidate);

  assert.equal(score.anchor.queryPosition, 3);
  assert.equal(score.anchor.candidatePosition, 3);
  assert.equal(score.type, 'multisyllabic_perfect');
  assert.equal(score.overall, 1);
});

test('primary-stress-only words keep the existing scorer behavior', () => {
  const query = analyzeGermanIpa('ˈliːbə');
  const candidate = analyzeGermanIpa('ˈtriːbə');
  const score = scoreGermanRhymeAnalysesWithAnchors(query, candidate);
  assert.equal(score.anchor.queryPosition, 1);
  assert.equal(score.anchor.candidatePosition, 1);
});


test('prepared German anchor scorer preserves exact Writer scoring semantics',()=>{
  const analyses=[
    analyzeGermanIpa('ˈaʁbaɪ̯t͡sˌvaɪ̯zə'),
    analyzeGermanIpa('ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə'),
    analyzeGermanIpa('ˈliːbə'),
    analyzeGermanIpa('ˈtriːbə'),
    analyzeGermanIpa('naxt'),
  ];
  const prepared=analyses.map(prepareGermanRhymeAnchorAnalysis);
  for(let i=0;i<analyses.length;i++){
    for(let j=0;j<analyses.length;j++){
      assert.deepEqual(
        scorePreparedGermanRhymeAnalysesWithAnchors(prepared[i],prepared[j]),
        scoreGermanRhymeAnalysesWithAnchors(analyses[i],analyses[j]),
      );
    }
  }
});


test('primary anchor preparation is reused as an exact fallback',()=>{
  for(const ipa of [
    'ˈliːbə',
    'ˈaʁbaɪ̯t͡sˌvaɪ̯zə',
    'ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə',
    'naxt',
  ]){
    const analysis=analyzeGermanIpa(ipa);
    const prepared=prepareGermanRhymeAnchorAnalysis(analysis);
    const primary=prepared.anchors.find(
      (anchor)=>anchor.position===prepared.primaryPosition
    );
    assert.ok(primary);
    assert.strictEqual(prepared.fallback,primary.prepared);
    assert.deepEqual(prepared.fallback,prepareGermanRhymeAnalysis(analysis));
  }
});


test('safe Writer anchor prefilter never rejects an accepted full Writer score',()=>{
  const ipas=[
    'ˈaʁbaɪ̯t͡sˌvaɪ̯zə',
    'ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə',
    'ˈliːbə','ˈtriːbə','ˈmiːtə','naxt','maxt','zuːxt',
    'ˈhɪt͡səˌfʁaɪ̯','ˈɪnˌhaːbɐ','ˈspɔtɪfaɪ̯','ˈnɔɪ̯ə',
  ];
  const analyses=ipas.map(analyzeGermanIpa);
  const prepared=analyses.map(prepareGermanRhymeAnchorAnalysis);
  let rejected=0;
  for(let i=0;i<analyses.length;i++){
    for(let j=0;j<analyses.length;j++){
      const full=scorePreparedGermanRhymeAnalysesWithAnchors(
        prepared[i],
        prepared[j],
      );
      const bound=germanWriterRhymeMatchUpperBound(
        prepared[i],
        analyses[j],
      );
      const accepted=full.type!=='weak'||(full.relationTypes||[]).length>0;
      if(accepted){
        assert.equal(
          bound.possible,
          true,
          `false Writer rejection: ${ipas[i]} -> ${ipas[j]} (${full.type}; ${full.relationTypes})`,
        );
      }
      if(!bound.possible)rejected+=1;
    }
  }
  assert.ok(rejected>0,'Writer prefilter fixture must exercise actual safe rejections');
});
