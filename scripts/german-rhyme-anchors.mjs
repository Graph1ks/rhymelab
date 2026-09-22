import {
  coarseCodaClass,
  germanRhymeMatchUpperBound,
  prepareGermanRhymeAnalysis,
  scoreGermanRhymeAnalyses,
  scorePreparedGermanRhymeAnalyses,
} from './german-rhyme-features.mjs';
import { germanVowelFamilyKey } from './german-ipa.mjs';

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function tailTokensFromSyllables(syllables, startIndex) {
  const tail = syllables.slice(startIndex);
  return tail.flatMap((syllable, index) => [
    ...(index === 0 ? [] : syllable.onset),
    syllable.nucleus,
    ...syllable.coda,
    ...(index < tail.length - 1 ? ['.'] : []),
  ]).filter(Boolean);
}

export function eligibleGermanRhymeAnchorPositions(analysis) {
  const syllables = Array.isArray(analysis?.syllables) ? analysis.syllables : [];
  if (!syllables.length) return [];

  const primaryIndex = Math.max(0, Math.min(
    syllables.length - 1,
    Number(analysis.primaryStressSyllable || 1) - 1,
  ));

  const positions = [primaryIndex + 1];
  for (let index = primaryIndex + 1; index < syllables.length; index += 1) {
    if (Number(syllables[index]?.stressLevel || 0) > 0) positions.push(index + 1);
  }

  return uniqueSorted(positions);
}

export function germanAnalysisAtRhymeAnchor(analysis, anchorPosition, options = {}) {
  const syllables = Array.isArray(analysis?.syllables) ? analysis.syllables : [];
  if (!syllables.length) return analysis;
  const startIndex = Math.max(0, Math.min(syllables.length - 1, Number(anchorPosition || 1) - 1));
  const requestedLimit = Number.parseInt(String(options.tailSyllableLimit ?? ''), 10);
  const tailLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? requestedLimit
    : null;
  const endIndex = tailLimit
    ? Math.min(syllables.length, startIndex + tailLimit)
    : syllables.length;
  const workingSyllables = endIndex < syllables.length
    ? syllables.slice(0, endIndex)
    : syllables;
  const tail = workingSyllables.slice(startIndex);
  const tailTokens = tailTokensFromSyllables(workingSyllables, startIndex);
  const vowelSequence = tail.map((syllable) => syllable.nucleus).join(' ');
  const consonantSequence = tail
    .flatMap((syllable, index) => [...(index === 0 ? [] : syllable.onset), ...syllable.coda])
    .join(' ');
  const onsetSequence = tail
    .flatMap((syllable, index) => index === 0 ? [] : syllable.onset)
    .join(' ');
  const final = workingSyllables.at(-1);
  const codaKey = (final?.coda || []).join(' ');
  const finalTail = [final?.nucleus, ...(final?.coda || [])].filter(Boolean).join(' ');

  return {
    ...analysis,
    syllables: workingSyllables,
    syllableCount: workingSyllables.length,
    stressPattern: workingSyllables.map((syllable) => Number(syllable?.stressLevel || 0)).join(''),
    primaryStressSyllable: startIndex + 1,
    stressedTail: tailTokens.join(' '),
    finalTail,
    exactTailKey: tailTokens.join('').replaceAll(' ', ''),
    multisyllableKey: tail.length >= 2 ? tailTokens.join('').replaceAll(' ', '') : null,
    vowelSequence,
    consonantSequence,
    onsetSequence,
    vowelKey: vowelSequence.replaceAll(' ', '-'),
    vowelFamilyKey: germanVowelFamilyKey(tail.map((syllable) => syllable.nucleus)),
    codaKey,
    codaClassKey: coarseCodaClass(final?.coda || []),
    onsetKey: (final?.onset || []).join(' '),
    stressedSyllableCount: tail.length,
  };
}

export function germanRightEdgeVowelSuffixKeys(analysis) {
  const syllables = Array.isArray(analysis?.syllables) ? analysis.syllables : [];
  const anchors = eligibleGermanRhymeAnchorPositions(analysis);
  if (!syllables.length || anchors.length <= 1) return [];

  const primary = Math.max(0, Number(analysis.primaryStressSyllable || 1) - 1);
  const keys = [];
  for (const position of anchors) {
    const anchor = position - 1;
    if (anchor <= primary) continue;

    const anchorTail = syllables.slice(anchor).map((syllable) => syllable.nucleus).filter(Boolean);
    if (anchorTail.length >= 2) {
      keys.push({
        kind: 'secondary_anchor',
        anchorPosition: position,
        nuclei: anchorTail.length,
        key: anchorTail.join('-'),
      });
    }

    // Include one preceding nucleus as context. This is much more selective than the
    // bare two-nucleus suffix and is the channel that captures pairs such as
    // Arbeitsweise -> Hochzeitsreise without requiring equal primary-stress vowels.
    const contextStart = Math.max(primary, anchor - 1);
    const contextTail = syllables.slice(contextStart).map((syllable) => syllable.nucleus).filter(Boolean);
    if (contextTail.length >= 3) {
      keys.push({
        kind: 'secondary_anchor_context',
        anchorPosition: position,
        nuclei: contextTail.length,
        key: contextTail.join('-'),
      });
    }
  }

  const seen = new Set();
  return keys
    .sort((a, b) => b.nuclei - a.nuclei || a.anchorPosition - b.anchorPosition)
    .filter((entry) => {
      if (seen.has(entry.key)) return false;
      seen.add(entry.key);
      return true;
    });
}

const SCORE_TIER=Object.freeze({
  multisyllabic_perfect:0,
  perfect:0,
  multisyllabic_slant:1,
  family:2,
  slant:3,
  weak:9,
});

function scoreTier(score){
  return SCORE_TIER[score?.type]??9;
}

export function prepareGermanRhymeAnchorAnalysis(analysis, options = {}){
  const primaryPosition=Number(analysis?.primaryStressSyllable||1);
  const positions=eligibleGermanRhymeAnchorPositions(analysis);
  const anchors=positions.map((position)=>{
    const anchored=germanAnalysisAtRhymeAnchor(analysis,position);
    return {
      position,
      tailSyllables:Math.max(
        0,
        Number(analysis?.syllables?.length||0)-position+1,
      ),
      kind:position===primaryPosition?'primary':'secondary',
      prepared:prepareGermanRhymeAnalysis(anchored),
    };
  });
  const requestedLimit=Number.parseInt(String(options.maxTailSyllables??''),10);
  const maxTailSyllables=Number.isFinite(requestedLimit)&&requestedLimit>0
    ?requestedLimit
    :null;
  const rightmostPosition=positions.at(-1);
  if(maxTailSyllables&&rightmostPosition){
    const fullTail=Math.max(
      0,
      Number(analysis?.syllables?.length||0)-rightmostPosition+1,
    );
    if(fullTail>maxTailSyllables){
      const anchored=germanAnalysisAtRhymeAnchor(
        analysis,
        rightmostPosition,
        {tailSyllableLimit:maxTailSyllables},
      );
      anchors.push({
        position:rightmostPosition,
        tailSyllables:maxTailSyllables,
        kind:rightmostPosition===primaryPosition?'primary_clipped':'secondary_clipped',
        clipped:true,
        originalTailSyllables:fullTail,
        prepared:prepareGermanRhymeAnalysis(anchored),
      });
    }
  }
  const primaryPrepared=anchors.find((anchor)=>anchor.position===primaryPosition&&!anchor.clipped)?.prepared;
  return {
    analysis,
    primaryPosition,
    anchors,
    // The primary anchor is the same stressed-rhyme domain as the original
    // analysis. Reuse it instead of preparing the same feature vector twice.
    fallback:primaryPrepared||prepareGermanRhymeAnalysis(analysis),
  };
}

export function germanWriterRhymeMatchUpperBound(preparedQuery,candidateAnalysis){
  const candidateSyllables=Array.isArray(candidateAnalysis?.syllables)
    ?candidateAnalysis.syllables
    :[];
  const candidatePositions=eligibleGermanRhymeAnchorPositions(candidateAnalysis);
  let comparablePairs=0;
  let bestUpperBound=0;

  for(const leftAnchor of preparedQuery?.anchors||[]){
    for(const position of candidatePositions){
      const tailSyllables=Math.max(
        0,
        candidateSyllables.length-position+1,
      );
      if(Math.abs(leftAnchor.tailSyllables-tailSyllables)>1)continue;
      comparablePairs+=1;
      const anchored=germanAnalysisAtRhymeAnchor(candidateAnalysis,position);
      const bound=germanRhymeMatchUpperBound(
        leftAnchor.prepared.analysis,
        anchored,
      );
      bestUpperBound=Math.max(
        bestUpperBound,
        Number(bound.overallUpperBound||0),
      );
      if(bound.possible){
        return {
          possible:true,
          comparablePairs,
          bestUpperBound,
          fallback:false,
        };
      }
    }
  }

  if(comparablePairs===0){
    const fallback=germanRhymeMatchUpperBound(
      preparedQuery?.fallback?.analysis||preparedQuery?.analysis,
      candidateAnalysis,
    );
    return {
      possible:fallback.possible,
      comparablePairs:0,
      bestUpperBound:Number(fallback.overallUpperBound||0),
      fallback:true,
    };
  }

  return {
    possible:false,
    comparablePairs,
    bestUpperBound,
    fallback:false,
  };
}

export function scorePreparedGermanRhymeAnalysesWithAnchors(preparedA,preparedB) {
  const candidates=[];

  for(const leftAnchor of preparedA.anchors){
    for(const rightAnchor of preparedB.anchors){
      if(Math.abs(leftAnchor.tailSyllables-rightAnchor.tailSyllables)>1)continue;
      const score=scorePreparedGermanRhymeAnalyses(
        leftAnchor.prepared,
        rightAnchor.prepared,
      );
      candidates.push({
        score,
        anchor:{
          queryPosition:leftAnchor.position,
          candidatePosition:rightAnchor.position,
          queryTailSyllables:leftAnchor.tailSyllables,
          candidateTailSyllables:rightAnchor.tailSyllables,
          queryAnchorKind:leftAnchor.kind,
          candidateAnchorKind:rightAnchor.kind,
        },
      });
    }
  }

  candidates.sort((x,y)=>
    scoreTier(x.score)-scoreTier(y.score)
    ||Number(y.score?.overall||0)-Number(x.score?.overall||0)
    ||Number(x.anchor.queryPosition!==preparedA.primaryPosition)
      -Number(y.anchor.queryPosition!==preparedA.primaryPosition)
  );

  const bestEntry=candidates[0]||null;
  const best=bestEntry
    ?{...bestEntry.score,anchor:bestEntry.anchor}
    :scorePreparedGermanRhymeAnalyses(preparedA.fallback,preparedB.fallback);
  return {
    ...best,
    anchorCandidates:candidates.map((candidate)=>({
      type:candidate.score.type,
      overall:Number(candidate.score.overall.toFixed(4)),
      anchor:candidate.anchor,
    })),
  };
}

export function scoreGermanRhymeAnalysesWithAnchors(a,b) {
  return scorePreparedGermanRhymeAnalysesWithAnchors(
    prepareGermanRhymeAnchorAnalysis(a),
    prepareGermanRhymeAnchorAnalysis(b),
  );
}

