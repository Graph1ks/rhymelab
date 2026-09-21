const SONG_HEADER=/^---\s+.+\s+---\s*$/u;
const SECTION=/^\[([^\]]+)\]\s*$/u;
const URL=/(?:https?:\/\/|www\.)/iu;
const META=/^(?:Collected:|Songtext zu\b|Lyrics to\b)/iu;
const TOKEN=/[\p{L}\p{M}\p{N}]+(?:[’'\-][\p{L}\p{M}\p{N}]+)*/gu;
const VOWEL=/[aeiouyäöüáàâéèêíìîóòôúùûæœ]/u;

export const LYRIC_STRUCTURE_ANALYSIS_SCHEMA='rhymelab-lyric-structure-analysis-v2';

export const SECTION_TYPES=Object.freeze([
  'intro','verse','pre_hook','hook','post_hook','bridge','interlude','outro','other',
]);

export function normalizeSectionType(value){
  const label=String(value??'').normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if(!label)return 'other';
  if(label.startsWith('songtext zu')||label.startsWith('lyrics to'))return 'metadata';
  const base=label.split(':',1)[0].trim().replace(/\s+\d+$/u,'');
  if(/pre[- ]?(?:chorus|hook)/u.test(base))return 'pre_hook';
  if(/post[- ]?(?:chorus|hook)/u.test(base))return 'post_hook';
  if(/\b(?:chorus|hook|refrain)\b/u.test(base))return 'hook';
  if(/\b(?:verse|part|strophe)\b/u.test(base))return 'verse';
  if(/\bintro\b/u.test(base))return 'intro';
  if(/\boutro\b/u.test(base))return 'outro';
  if(/\bbridge\b/u.test(base))return 'bridge';
  if(/\b(?:interlude|skit|spoken|drop)\b/u.test(base))return 'interlude';
  return 'other';
}

export function normalizeLyricLine(value,language='de'){
  const locale=language==='en'?'en-US':'de-DE';
  return String(value??'')
    .normalize('NFKC')
    .toLocaleLowerCase(locale)
    .replace(/[^\p{L}\p{M}\p{N}]+/gu,' ')
    .replace(/\s+/gu,' ')
    .trim();
}

export function lyricTokens(value){
  return String(value??'').normalize('NFKC').match(TOKEN)||[];
}

function cleanLine(value,language){
  const text=String(value??'').trim();
  if(!text||URL.test(text)||META.test(text))return null;
  if(/^[#\-=*_~. ]+$/u.test(text))return null;
  const tokens=lyricTokens(text);
  if(!tokens.length)return null;
  return {
    normalized:normalizeLyricLine(text,language),
    tokens,
    lastWord:String(tokens.at(-1)||'').toLocaleLowerCase(language==='en'?'en-US':'de-DE'),
  };
}

export function parseStructuredLyricText(text,{language='de'}={}){
  const songs=[];
  let song=null;
  let section=null;

  const startSong=()=>{
    if(song)songs.push(song);
    song={sections:[],unsectionedLines:0};
    section=null;
  };

  for(const raw of String(text??'').split(/\r?\n/u)){
    const line=raw.trim();
    if(SONG_HEADER.test(line)){
      startSong();
      continue;
    }
    if(!song)continue;
    if(!line||URL.test(line)||META.test(line))continue;

    const sectionMatch=SECTION.exec(line);
    if(sectionMatch){
      const type=normalizeSectionType(sectionMatch[1]);
      if(type==='metadata'){
        section=null;
        continue;
      }
      section={type,lines:[]};
      song.sections.push(section);
      continue;
    }

    const clean=cleanLine(line,language);
    if(!clean)continue;
    if(section)section.lines.push(clean);
    else song.unsectionedLines+=1;
  }
  if(song)songs.push(song);

  for(const current of songs){
    current.sections=current.sections.filter((row)=>row.lines.length);
  }

  return {
    songs,
    songsTotal:songs.length,
    songsStructured:songs.filter((row)=>row.sections.length>0).length,
  };
}

function mean(values){
  return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
}

function quantile(values,q){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const pos=(sorted.length-1)*q;
  const low=Math.floor(pos);
  const high=Math.min(sorted.length-1,low+1);
  const fraction=pos-low;
  return sorted[low]*(1-fraction)+sorted[high]*fraction;
}

function distribution(values){
  return {
    n:values.length,
    mean:Number(mean(values).toFixed(3)),
    p25:Number(quantile(values,.25).toFixed(3)),
    median:Number(quantile(values,.5).toFixed(3)),
    p75:Number(quantile(values,.75).toFixed(3)),
    p90:Number(quantile(values,.9).toFixed(3)),
    p95:Number(quantile(values,.95).toFixed(3)),
  };
}

function normalizeCounts(counts){
  const total=[...counts.values()].reduce((sum,value)=>sum+value,0);
  return Object.fromEntries(
    [...counts.entries()]
      .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
      .map(([key,value])=>[key,total?Number((value/total).toFixed(4)):0]),
  );
}

function rhymeProxy(word){
  const clean=String(word||'')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}]/gu,'')
    .toLocaleLowerCase('de-DE');
  if(!clean)return '';
  let index=-1;
  for(let i=0;i<clean.length;i+=1){
    if(VOWEL.test(clean[i]))index=i;
  }
  if(index<0)return clean.slice(-3);
  while(index>0&&VOWEL.test(clean[index-1]))index-=1;
  return clean.slice(index);
}

export function aggregateLyricStructure(corpora=[]){
  const languages={};

  for(const corpus of corpora){
    const language=corpus.language==='en'?'en':'de';
    const parsed=parseStructuredLyricText(corpus.text,{language});
    const state=languages[language]||{
      sourceFiles:0,
      songsTotal:0,
      songsStructured:0,
      songs:[],
    };
    state.sourceFiles+=1;
    state.songsTotal+=parsed.songsTotal;
    state.songsStructured+=parsed.songsStructured;
    state.songs.push(...parsed.songs.filter((row)=>row.sections.length));
    languages[language]=state;
  }

  const output={};
  for(const [language,state] of Object.entries(languages)){
    const sections=state.songs.flatMap((song)=>song.sections);
    const lines=sections.flatMap((section)=>section.lines);
    const sectionCounts=new Map();
    const sectionLengths=new Map();
    const lineLengthsBySection=new Map();
    const starts=new Map();
    const endings=new Map();
    const transitions=new Map();
    const rhymeDistances=new Map([[1,0],[2,0],[3,0],[4,0]]);
    const rhymePairs=new Map([[1,0],[2,0],[3,0],[4,0]]);
    const songSectionCounts=[];
    const hookOccurrences=[];
    let repeatedLineInstances=0;
    let repeatedHookSongs=0;

    for(const song of state.songs){
      const types=song.sections.map((section)=>section.type);
      songSectionCounts.push(types.length);
      if(types.length){
        starts.set(types[0],(starts.get(types[0])||0)+1);
        endings.set(types.at(-1),(endings.get(types.at(-1))||0)+1);
      }
      for(let i=0;i<types.length-1;i+=1){
        const key=types[i]+'>'+types[i+1];
        transitions.set(key,(transitions.get(key)||0)+1);
      }

      const normalizedLines=song.sections.flatMap((section)=>section.lines.map((line)=>line.normalized));
      repeatedLineInstances+=Math.max(0,normalizedLines.length-new Set(normalizedLines).size);

      const hooks=song.sections
        .filter((section)=>section.type==='hook')
        .map((section)=>section.lines.map((line)=>line.normalized).join('\u0001'));
      hookOccurrences.push(hooks.length);
      if(hooks.length>=2&&new Set(hooks).size<hooks.length)repeatedHookSongs+=1;
    }

    for(const section of sections){
      sectionCounts.set(section.type,(sectionCounts.get(section.type)||0)+1);
      if(!sectionLengths.has(section.type))sectionLengths.set(section.type,[]);
      sectionLengths.get(section.type).push(section.lines.length);
      if(!lineLengthsBySection.has(section.type))lineLengthsBySection.set(section.type,[]);
      const lineLengths=lineLengthsBySection.get(section.type);
      for(const line of section.lines)lineLengths.push(line.tokens.length);

      if(!['verse','hook','pre_hook','post_hook','bridge'].includes(section.type))continue;
      const endingsHere=section.lines.map((line)=>({
        word:line.lastWord,
        proxy:rhymeProxy(line.lastWord),
      }));
      for(let index=0;index<endingsHere.length;index+=1){
        for(let distance=1;distance<=4;distance+=1){
          const other=endingsHere[index+distance];
          if(!other)break;
          const current=endingsHere[index];
          if(!current.word||!other.word||current.word===other.word)continue;
          rhymePairs.set(distance,(rhymePairs.get(distance)||0)+1);
          if(current.proxy.length>=2&&current.proxy===other.proxy){
            rhymeDistances.set(distance,(rhymeDistances.get(distance)||0)+1);
          }
        }
      }
    }

    const transitionByFrom={};
    for(const [key,count] of transitions){
      const [from,to]=key.split('>');
      transitionByFrom[from]??=new Map();
      transitionByFrom[from].set(to,(transitionByFrom[from].get(to)||0)+count);
    }
    const transitionProbabilities=Object.fromEntries(
      Object.entries(transitionByFrom).map(([from,counts])=>[from,normalizeCounts(counts)]),
    );

    const rhymeMatchTotal=[...rhymeDistances.values()].reduce((sum,value)=>sum+value,0);
    const lineLengths=lines.map((line)=>line.tokens.length);

    output[language]={
      source_files:state.sourceFiles,
      songs_total:state.songsTotal,
      songs_structured:state.songsStructured,
      sections:sections.length,
      lyric_lines:lines.length,
      section_counts:Object.fromEntries(
        [...sectionCounts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),
      ),
      song_section_count:distribution(songSectionCounts),
      line_tokens:distribution(lineLengths),
      section_lines:Object.fromEntries(
        [...sectionLengths.entries()]
          .sort((a,b)=>a[0].localeCompare(b[0]))
          .map(([type,values])=>[type,distribution(values)]),
      ),
      line_tokens_by_section:Object.fromEntries(
        [...lineLengthsBySection.entries()]
          .sort((a,b)=>a[0].localeCompare(b[0]))
          .map(([type,values])=>[type,distribution(values)]),
      ),
      start_section_probabilities:normalizeCounts(starts),
      end_section_probabilities:normalizeCounts(endings),
      section_transition_probabilities:transitionProbabilities,
      repetition:{
        repeated_line_rate:lines.length?Number((repeatedLineInstances/lines.length).toFixed(4)):0,
        hook_occurrences:distribution(hookOccurrences),
        songs_with_exact_repeated_hook_share:state.songs.length
          ?Number((repeatedHookSongs/state.songs.length).toFixed(4))
          :0,
      },
      rhyme_distance_proxy:{
        method:'orthographic-final-vowel-tail-exact-match',
        caveat:'structure prior only; Writer phonetics remain authoritative rhyme truth',
        matched_pairs:rhymeMatchTotal,
        normalized_matches:Object.fromEntries(
          [1,2,3,4].map((distance)=>[
            distance,
            rhymeMatchTotal
              ?Number(((rhymeDistances.get(distance)||0)/rhymeMatchTotal).toFixed(4))
              :0,
          ]),
        ),
        match_rates:Object.fromEntries(
          [1,2,3,4].map((distance)=>[
            distance,
            rhymePairs.get(distance)
              ?Number(((rhymeDistances.get(distance)||0)/rhymePairs.get(distance)).toFixed(4))
              :0,
          ]),
        ),
      },
    };
  }

  return {
    schema:LYRIC_STRUCTURE_ANALYSIS_SCHEMA,
    privacy:{
      raw_text_emitted:false,
      titles_emitted:false,
      urls_emitted:false,
      identifiers_emitted:false,
      ngrams_emitted:false,
      transition_text_emitted:false,
      source_filenames_emitted:false,
    },
    languages:output,
  };
}
