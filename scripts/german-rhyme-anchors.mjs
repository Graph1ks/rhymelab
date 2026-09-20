import {
  prepareGermanRhymeAnalysis,
  scoreGermanRhymeAnalyses,
  scorePreparedGermanRhymeAnalyses,
} from './german-rhyme-features.mjs';

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

export function germanAnalysisAtRhymeAnchor(analysis, anchorPosition) {
  const syllables = Array.isArray(analysis?.syllables) ? analysis.syllables : [];
  if (!syllables.length) return analysis;
  const startIndex = Math.max(0, Math.min(syllables.length - 1, Number(anchorPosition || 1) - 1));
  const tail = syllables.slice(startIndex);
  const tailTokens = tailTokensFromSyllables(syllables, startIndex);
  const vowelSequence = tail.map((syllable) => syllable.nucleus).join(' ');
  const consonantSequence = tail
    .flatMap((syllable, index) => [...(index === 0 ? [] : syllable.onset), ...syllable.coda])
    .join(' ');
  const onsetSequence = tail
    .flatMap((syllable, index) => index === 0 ? [] : syllable.onset)
    .join(' ');

  return {
    ...analysis,
    primaryStressSyllable: startIndex + 1,
    stressedTail: tailTokens.join(' '),
    exactTailKey: tailTokens.join('').replaceAll(' ', ''),
    multisyllableKey: tail.length >= 2 ? tailTokens.join('').replaceAll(' ', '') : null,
    vowelSequence,
    consonantSequence,
    onsetSequence,
    vowelKey: vowelSequence.replaceAll(' ', '-'),
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

function scorePriority(score) {
  const tier = new Map([
    ['multisyllabic_perfect', 0],
    ['perfect', 0],
    ['multisyllabic_slant', 1],
    ['family', 2],
    ['slant', 3],
    ['weak', 9],
  ]).get(score?.type) ?? 9;
  return { tier, overall: Number(score?.overall || 0) };
}

export function prepareGermanRhymeAnchorAnalysis(analysis){
  const primaryPosition=Number(analysis?.primaryStressSyllable||1);
  const anchors=eligibleGermanRhymeAnchorPositions(analysis).map((position)=>{
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
  return {
    analysis,
    primaryPosition,
    anchors,
    fallback:prepareGermanRhymeAnalysis(analysis),
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
        ...score,
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

  candidates.sort((x,y)=>{
    const aPriority=scorePriority(x);
    const bPriority=scorePriority(y);
    return aPriority.tier-bPriority.tier
      ||bPriority.overall-aPriority.overall
      ||Number(x.anchor.queryPosition!==preparedA.primaryPosition)
        -Number(y.anchor.queryPosition!==preparedA.primaryPosition);
  });

  const best=candidates[0]||scorePreparedGermanRhymeAnalyses(
    preparedA.fallback,
    preparedB.fallback,
  );
  return {
    ...best,
    anchorCandidates:candidates.map((candidate)=>({
      type:candidate.type,
      overall:Number(candidate.overall.toFixed(4)),
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

