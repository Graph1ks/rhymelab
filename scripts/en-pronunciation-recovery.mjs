const MORPHOLOGY_BLOCK_TAGS = new Set([
  'abbreviation','initialism','acronym','letter','number','symbol',
  'contraction','misspelling',
]);

const SIBILANTS = new Set(['s','z','ʃ','ʒ','tʃ','dʒ']);
const VOICELESS_PLURAL = new Set(['p','t','k','f','θ']);
const VOICELESS_PAST = new Set(['p','k','f','θ','s','ʃ','tʃ','h']);

function normalizedTagSet(values){
  return new Set((values||[]).map((value)=>String(value).toLocaleLowerCase('en-US')));
}

export function regularEnglishInflectionShape(surfaceValue,lemmaValue){
  const surface=String(surfaceValue||'').toLocaleLowerCase('en-US');
  const lemma=String(lemmaValue||'').toLocaleLowerCase('en-US');
  if(!surface||!lemma||surface===lemma) return null;

  if(surface===`${lemma}s`) return 's_suffix';
  if(surface===`${lemma}es`) return 'es_suffix';
  if(lemma.endsWith('y')&&lemma.length>1&&surface===`${lemma.slice(0,-1)}ies`) return 'y_to_ies';

  if(surface===`${lemma}ed`) return 'ed_suffix';
  if(lemma.endsWith('e')&&surface===`${lemma}d`) return 'e_to_ed';
  if(lemma.endsWith('y')&&lemma.length>1&&surface===`${lemma.slice(0,-1)}ied`) return 'y_to_ied';

  if(surface===`${lemma}ing`) return 'ing_suffix';
  if(lemma.endsWith('e')&&!lemma.endsWith('ee')&&surface===`${lemma.slice(0,-1)}ing`) return 'drop_e_ing';
  if(lemma.endsWith('ie')&&surface===`${lemma.slice(0,-2)}ying`) return 'ie_to_ying';

  return null;
}

export function isStrictEnglishInflectionRecovery({surface,lemma,tags=[]}={}){
  const tagSet=normalizedTagSet(tags);
  for(const tag of MORPHOLOGY_BLOCK_TAGS) if(tagSet.has(tag)) return false;
  const shape=regularEnglishInflectionShape(surface,lemma);
  if(!shape) return false;

  if(['s_suffix','es_suffix','y_to_ies'].includes(shape)){
    return tagSet.has('plural')
      || (tagSet.has('third-person')&&tagSet.has('singular')&&tagSet.has('present'));
  }
  if(['ed_suffix','e_to_ed','y_to_ied'].includes(shape)){
    return tagSet.has('past')||tagSet.has('participle');
  }
  if(['ing_suffix','drop_e_ing','ie_to_ying'].includes(shape)){
    return tagSet.has('gerund')||tagSet.has('participle');
  }
  return false;
}

export function punctuationOnlyAliasTargets(evidence){
  const relationKinds=new Set(evidence?.relation_kinds||[]);
  if(!relationKinds.has('alt_of')) return [];
  const normalized=String(evidence?.normalized||'');
  const key=normalized.replace(/[-']/gu,'');
  return [...new Set(evidence?.lemma_candidates||[])]
    .filter((lemma)=>String(lemma).replace(/[-']/gu,'')===key)
    .sort((a,b)=>String(a).localeCompare(String(b),'en'));
}

export function englishPossessiveBase(surfaceValue){
  const surface=String(surfaceValue||'');
  if(surface.endsWith("'s")&&surface.length>2) return surface.slice(0,-2);
  if(surface.endsWith("s'")&&surface.length>2) return surface.slice(0,-1);
  return null;
}

function stressMark(level){
  if(Number(level)===2) return 'ˈ';
  if(Number(level)===1) return 'ˌ';
  return '';
}

export function englishAnalysisToCanonicalIpa(analysis){
  if(!analysis?.syllables?.length) throw new Error('English analysis requires syllables for composition.');
  return analysis.syllables.map((syllable)=>{
    const body=[...(syllable.onset||[]),syllable.nucleus,...(syllable.coda||[])].join('');
    return `${stressMark(syllable.stressLevel)}${body}`;
  }).join('.');
}

function finalPhoneme(analysis){
  const phones=analysis?.phonemes||[];
  return phones.at(-1)||null;
}

export function englishInflectionSuffix(analysis,shape){
  const last=finalPhoneme(analysis);
  if(!last) throw new Error('Cannot compose English inflection without a final base phoneme.');

  if(['s_suffix','es_suffix','y_to_ies'].includes(shape)){
    if(SIBILANTS.has(last)) return {ipa:'ɪz',syllabic:true,rule:'plural_sibilant_iz'};
    if(VOICELESS_PLURAL.has(last)) return {ipa:'s',syllabic:false,rule:'plural_voiceless_s'};
    return {ipa:'z',syllabic:false,rule:'plural_voiced_z'};
  }

  if(['ed_suffix','e_to_ed','y_to_ied'].includes(shape)){
    if(last==='t'||last==='d') return {ipa:'ɪd',syllabic:true,rule:'past_alveolar_id'};
    if(VOICELESS_PAST.has(last)) return {ipa:'t',syllabic:false,rule:'past_voiceless_t'};
    return {ipa:'d',syllabic:false,rule:'past_voiced_d'};
  }

  if(['ing_suffix','drop_e_ing','ie_to_ying'].includes(shape)){
    return {ipa:'ɪŋ',syllabic:true,rule:'progressive_ing'};
  }

  throw new Error(`Unsupported English inflection shape: ${shape}`);
}

export function composeEnglishInflectionIpa(analysis,shape){
  const base=englishAnalysisToCanonicalIpa(analysis);
  const suffix=englishInflectionSuffix(analysis,shape);
  return {
    raw:suffix.syllabic?`/${base}.${suffix.ipa}/`:`/${base}${suffix.ipa}/`,
    suffix_rule:suffix.rule,
    suffix_ipa:suffix.ipa,
  };
}

export const ENGLISH_MORPHOLOGY_BLOCK_TAGS=[...MORPHOLOGY_BLOCK_TAGS].sort();
