export const MARKOV_LYRIC_STRUCTURE_POLICY='rhymelab-lyric-structure-v2';

const freeze=(value)=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value))freeze(child);
  }
  return value;
};

export const MARKOV_LYRIC_STRUCTURE_PROFILE=freeze({
  policy:MARKOV_LYRIC_STRUCTURE_POLICY,
  calibration:{
    privacy:'aggregate-only',
    rawText:false,
    titles:false,
    urls:false,
    identifiers:false,
    ngrams:false,
    transitionText:false,
    de:{sourceFiles:2,songsTotal:210,songsStructured:202,lyricLines:12018},
    en:{sourceFiles:1,songsTotal:131,songsStructured:128,lyricLines:10507},
  },
  de:{
    songSections:{median:5,p25:4,p75:7},
    lineTokens:{median:8,p25:6,p75:10,p90:12,p95:13},
    sections:{
      intro:{medianLines:3,p25Lines:2,p75Lines:5.5,medianTokens:6,p25Tokens:3,p75Tokens:9},
      verse:{medianLines:16,p25Lines:13,p75Lines:18,medianTokens:9,p25Tokens:7,p75Tokens:10},
      pre_hook:{medianLines:8,p25Lines:6.25,p75Lines:8,medianTokens:8,p25Tokens:6,p75Tokens:9},
      hook:{medianLines:8,p25Lines:6,p75Lines:8,medianTokens:6,p25Tokens:4,p75Tokens:8},
      post_hook:{medianLines:6,p25Lines:5,p75Lines:7,medianTokens:6,p25Tokens:4,p75Tokens:8},
      bridge:{medianLines:5.5,p25Lines:4,p75Lines:8,medianTokens:6,p25Tokens:4,p75Tokens:9},
      interlude:{medianLines:3,p25Lines:2,p75Lines:6.5,medianTokens:6,p25Tokens:3,p75Tokens:9},
      outro:{medianLines:5,p25Lines:3,p75Lines:8,medianTokens:6,p25Tokens:4,p75Tokens:8},
    },
    repetition:{
      repeatedLineRate:0.1712,
      hookOccurrencesMedian:2,
      hookOccurrencesP75:3,
      repeatedHookSongShare:0.4455,
    },
    startSectionWeights:{intro:0.4653,verse:0.3762,hook:0.1436,interlude:0.0149},
    endSectionWeights:{hook:0.4257,outro:0.3515,verse:0.2079,interlude:0.0149},
    sectionTransitions:{
      intro:{verse:0.8211,hook:0.1368,interlude:0.0211,bridge:0.0105,intro:0.0105},
      verse:{hook:0.7542,verse:0.1349,outro:0.0602,interlude:0.0217,bridge:0.0217,pre_hook:0.0072},
      hook:{verse:0.7812,outro:0.1319,bridge:0.0312,interlude:0.0208,hook:0.0208,post_hook:0.0069},
      bridge:{verse:0.4,hook:0.35,interlude:0.1,outro:0.05,pre_hook:0.05,other:0.05},
      interlude:{verse:0.6842,outro:0.2105,hook:0.0526,bridge:0.0526},
      pre_hook:{hook:1},
      post_hook:{outro:1},
    },
    rhymeDistanceWeights:{1:0.5009,2:0.2195,3:0.1652,4:0.1144},
  },
  en:{
    songSections:{median:7,p25:5,p75:8},
    lineTokens:{median:9,p25:7,p75:11,p90:13,p95:14},
    sections:{
      intro:{medianLines:5,p25Lines:4,p75Lines:8,medianTokens:6,p25Tokens:4,p75Tokens:9},
      verse:{medianLines:20,p25Lines:16,p75Lines:27,medianTokens:9,p25Tokens:8,p75Tokens:11},
      pre_hook:{medianLines:4,p25Lines:4,p75Lines:5,medianTokens:8,p25Tokens:6,p75Tokens:10},
      hook:{medianLines:8,p25Lines:4,p75Lines:8,medianTokens:8,p25Tokens:6,p75Tokens:10},
      post_hook:{medianLines:4,p25Lines:4,p75Lines:4,medianTokens:8,p25Tokens:6,p75Tokens:10},
      bridge:{medianLines:4,p25Lines:4,p75Lines:7.25,medianTokens:8,p25Tokens:6,p75Tokens:10},
      interlude:{medianLines:7,p25Lines:4,p75Lines:13,medianTokens:7,p25Tokens:5,p75Tokens:10},
      outro:{medianLines:4,p25Lines:2,p75Lines:8,medianTokens:6,p25Tokens:4,p75Tokens:9},
    },
    repetition:{
      repeatedLineRate:0.1367,
      hookOccurrencesMedian:3,
      hookOccurrencesP75:3,
      repeatedHookSongShare:0.4062,
    },
    startSectionWeights:{intro:0.6719,interlude:0.1172,verse:0.1016,hook:0.0625,other:0.0469},
    endSectionWeights:{outro:0.4062,hook:0.3125,interlude:0.1094,verse:0.1016,other:0.0469,post_hook:0.0156,intro:0.0078},
    sectionTransitions:{
      intro:{verse:0.7701,hook:0.2299},
      verse:{hook:0.8265,verse:0.0578,pre_hook:0.0476,outro:0.0442,interlude:0.0238},
      hook:{verse:0.7063,outro:0.1508,post_hook:0.0635,bridge:0.0397,hook:0.0238,interlude:0.0159},
      bridge:{verse:0.8,hook:0.1,interlude:0.1},
      interlude:{verse:0.8667,interlude:0.0667,intro:0.0667},
      pre_hook:{hook:1},
      post_hook:{verse:0.7857,outro:0.1429,interlude:0.0714},
    },
    rhymeDistanceWeights:{1:0.481,2:0.2524,3:0.1622,4:0.1044},
  },
});

/*
 * Aggregate-only structure calibration.
 *
 * The source material is used only to derive non-reconstructable distributions:
 * section types, section order, line/section lengths, repetition rates, and
 * rhyme-distance priors. No lyric text, title, URL, identifier, line sequence,
 * n-gram, transition text, or source filename is embedded in this module.
 *
 * Rhyme-distance values are coarse structural priors. RhymeLab Writer remains
 * authoritative for phonetic rhyme truth.
 */

export function lyricStructureFor(language='de'){
  return MARKOV_LYRIC_STRUCTURE_PROFILE[language==='en'?'en':'de'];
}

export function lyricSectionDefaults(language='de',section='verse'){
  const profile=lyricStructureFor(language);
  const type=String(section||'verse').toLocaleLowerCase('en-US');
  const sectionProfile=profile.sections[type]||profile.sections.verse;
  return Object.freeze({
    section:type,
    lines:Math.max(1,Math.round(sectionProfile.medianLines||profile.songSections.median||4)),
    targetTokens:Math.max(3,Math.round(sectionProfile.medianTokens||profile.lineTokens.median||6)),
    p25Lines:sectionProfile.p25Lines??null,
    p75Lines:sectionProfile.p75Lines??null,
    p25Tokens:sectionProfile.p25Tokens??null,
    p75Tokens:sectionProfile.p75Tokens??null,
  });
}

export function lyricRhymeDistanceWeights(language='de'){
  return lyricStructureFor(language).rhymeDistanceWeights;
}
