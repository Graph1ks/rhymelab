export const MARKOV_LYRIC_PROFILE_POLICY='rhymelab-lyric-shape-v1';

export const MARKOV_LYRIC_PROFILE=Object.freeze({
  policy:MARKOV_LYRIC_PROFILE_POLICY,
  defaultTargetTokens:6,
  compactLineTokens:3,
  commonLineTokens:9,
  longLineTokens:12,
  stanzaLinesMedian:4,
  repetition:{
    first:1,
    second:0.25,
    thirdAndLater:0.1,
  },
  rhymeDistanceWeights:Object.freeze({
    1:0.48,
    2:0.34,
    3:0.12,
    4:0.06,
  }),
});

/*
 * Product-safe aggregate calibration only.
 *
 * These constants were calibrated from owner-provided private lyric material.
 * No lyric text, title, URL, identifier, token sequence, n-gram, transition,
 * or other reconstructable source evidence is embedded here.
 */
export function lyricTargetBounds(
  target=MARKOV_LYRIC_PROFILE.defaultTargetTokens,
  {weirdness=0}={},
){
  const requested=Math.max(
    MARKOV_LYRIC_PROFILE.compactLineTokens,
    Math.min(28,Number(target)||MARKOV_LYRIC_PROFILE.defaultTargetTokens),
  );
  const weird=Math.max(0,Math.min(1,Number(weirdness)||0));
  const tolerance=Math.max(1,Math.round(requested*(0.10+weird*0.08)));
  return Object.freeze({
    target:requested,
    tolerance,
    min:Math.max(MARKOV_LYRIC_PROFILE.compactLineTokens,requested-tolerance),
    max:Math.min(28,requested+tolerance),
  });
}

export function lyricLengthFit(actual,target=MARKOV_LYRIC_PROFILE.defaultTargetTokens){
  const observed=Math.max(0,Number(actual)||0);
  const requested=Math.max(
    MARKOV_LYRIC_PROFILE.compactLineTokens,
    Math.min(28,Number(target)||MARKOV_LYRIC_PROFILE.defaultTargetTokens),
  );
  const distance=Math.abs(observed-requested);
  const requestScale=Math.max(1.5,requested*0.28);
  const requestedFit=Math.exp(-distance/requestScale);

  // The learned lyric profile is a default prior, not a hidden clamp. If the
  // user explicitly asks for a 16-token line, 16 must score as the target.
  const requestedEnvelope=Math.max(MARKOV_LYRIC_PROFILE.longLineTokens,requested);
  let shapeFit=1;
  if(observed<MARKOV_LYRIC_PROFILE.compactLineTokens){
    shapeFit=Math.max(0,observed/MARKOV_LYRIC_PROFILE.compactLineTokens);
  }else if(observed>requestedEnvelope){
    shapeFit=Math.exp(-(observed-requestedEnvelope)/4);
  }else if(
    requested<=MARKOV_LYRIC_PROFILE.commonLineTokens
    &&observed>MARKOV_LYRIC_PROFILE.commonLineTokens
  ){
    shapeFit=0.92;
  }

  return Math.max(0,Math.min(1,requestedFit*0.9+shapeFit*0.1));
}
