import { tokenizePhrase } from './phrase-catalog-core.mjs';
import {
  analyzeEnglishPronunciation,
  analyzeEnglishIpa,
} from './english-phonology.mjs';
import { englishAnalysisToIpa } from './entity-ai-pronunciation-core.mjs';
import {
  entityPronunciationLookupUnits,
} from './entity-pronunciation-source-expansion-core.mjs';
import { normalizeEnglishSurface } from './en-writer-source-core.mjs';

export const ENTITY_EN_SOURCE_RUNTIME_POLICY='entity-en-source-backed-runtime-v1';
export const ENTITY_EN_RUNTIME_ANALYZER='en-pron-v1-candidate';
export const ENTITY_EN_PHONETIC_RUNTIME='entity-phonetic-runtime-en-v1';
export const ENTITY_EN_BASELINE_MAX_TOKENS=6;
export const ENTITY_EN_EXPANDED_MAX_TOKENS=8;

function sourceAnalysis(row){
  if(!row) return null;
  const notation=String(row.notation||'').toLocaleLowerCase('en-US');
  if(!['ipa','arpabet','cmudict'].includes(notation)) return null;
  try{
    return analyzeEnglishPronunciation(row.raw,{
      notation,
      locale:'en-US',
      source:row.source||row.source_kind||'entity_source',
    });
  }catch{
    return null;
  }
}

function compactSource(row,kind){
  const analysis=sourceAnalysis(row);
  if(!analysis) return null;
  return {
    kind,
    normalized:row.normalized,
    surface:row.surface,
    source_kind:row.source||row.source_kind||kind,
    source_pronunciation_id:row.pronunciation_id??row.id??row.evidence_id??null,
    notation:row.notation,
    raw:row.raw,
    ipa:englishAnalysisToIpa(analysis),
    analysis,
  };
}

export function prepareEnglishEntityRuntimeStatements(englishDb,sourceDb){
  return {
    accepted:englishDb.prepare(`
      SELECT
        f.id AS form_id,f.surface,f.normalized,
        p.id AS pronunciation_id,p.source,p.notation,p.raw
      FROM en_form f
      JOIN en_pronunciation p ON p.form_id=f.id
      WHERE f.normalized=?
        AND f.default_eligible=1
        AND p.default_profile_eligible=1
      ORDER BY
        CASE p.source
          WHEN 'cmudict' THEN 0
          WHEN 'wiktionary' THEN 1
          WHEN 'derived_inflection' THEN 2
          WHEN 'derived_punctuation_alias' THEN 3
          ELSE 9
        END,
        p.id
      LIMIT 1
    `),
    expanded:sourceDb.prepare(`
      SELECT evidence_id,normalized,surface,source_kind,locale,notation,raw
      FROM pronunciation_evidence
      WHERE normalized=?
        AND runtime_profile_eligible=1
        AND analysis_status='ok'
      ORDER BY
        CASE source_kind
          WHEN 'cmudict_raw_entity' THEN 0
          WHEN 'wiktionary_kaikki_proper_name' THEN 1
          ELSE 9
        END,
        evidence_id
      LIMIT 1
    `),
  };
}

function acceptedExact(statements,normalized){
  return compactSource(statements.accepted.get(normalized),'accepted_en_writer');
}
function expandedExact(statements,normalized){
  return compactSource(statements.expanded.get(normalized),'expanded_entity_source');
}

function composedResult(surface,components,status,sourceKind){
  const ipa=components.map((item)=>item.ipa).join(' ');
  let analysis;
  try{
    analysis=analyzeEnglishIpa(ipa,{
      locale:'en-US',
      source:sourceKind,
    });
  }catch{
    return {
      status:'unresolved_composed_analysis',
      surface:String(surface||''),
      pronunciation:null,
      unresolved_units:[],
    };
  }
  return {
    status,
    surface:String(surface||''),
    pronunciation:{
      locale:'en-US',
      ipa,
      analysis,
      source_kind:sourceKind,
      source_record:{
        policy:ENTITY_EN_SOURCE_RUNTIME_POLICY,
        components:components.map((item)=>({
          surface:item.surface,
          normalized:item.normalized,
          source_kind:item.source_kind,
          source_pronunciation_id:item.source_pronunciation_id,
          notation:item.notation,
          raw:item.raw,
        })),
      },
      review_state:'accepted_source_composition',
      generated:false,
    },
    unresolved_units:[],
  };
}

function directResult(surface,item,status){
  return {
    status,
    surface:String(surface||''),
    pronunciation:{
      locale:'en-US',
      ipa:item.ipa,
      analysis:item.analysis,
      source_kind:item.source_kind,
      source_record:{
        policy:ENTITY_EN_SOURCE_RUNTIME_POLICY,
        source_pronunciation_id:item.source_pronunciation_id,
        notation:item.notation,
        raw:item.raw,
      },
      review_state:'accepted_source_backed',
      generated:false,
    },
    unresolved_units:[],
  };
}

export function resolveEnglishEntitySourceRuntime(
  surface,
  statements,
  {
    baselineMaxTokens=ENTITY_EN_BASELINE_MAX_TOKENS,
    expandedMaxTokens=ENTITY_EN_EXPANDED_MAX_TOKENS,
  }={},
){
  if(!statements?.accepted||!statements?.expanded){
    throw new TypeError('resolveEnglishEntitySourceRuntime requires prepared statements');
  }
  const text=String(surface??'').normalize('NFKC').trim();
  const normalized=normalizeEnglishSurface(text);
  if(!normalized){
    return {
      status:'unresolved_empty_surface',
      surface:text,
      pronunciation:null,
      unresolved_units:[],
    };
  }

  const directAccepted=acceptedExact(statements,normalized);
  if(directAccepted) return directResult(text,directAccepted,'exact_accepted_source');

  const baselineTokens=tokenizePhrase(text);
  if(baselineTokens.length>0&&baselineTokens.length<=baselineMaxTokens){
    const components=[];
    const unresolved=[];
    for(const token of baselineTokens){
      const key=normalizeEnglishSurface(token.surface);
      const item=acceptedExact(statements,key);
      if(!item) unresolved.push(key||token.surface);
      else components.push(item);
    }
    if(!unresolved.length){
      return composedResult(
        text,
        components,
        'bounded_accepted_token_composition',
        'accepted_en_token_composition',
      );
    }
  }

  const directExpanded=expandedExact(statements,normalized);
  if(directExpanded) return directResult(text,directExpanded,'exact_expanded_source');

  const units=entityPronunciationLookupUnits(text);
  if(!units.length){
    return {
      status:'unresolved_empty_units',
      surface:text,
      pronunciation:null,
      unresolved_units:[],
    };
  }
  if(units.length>expandedMaxTokens){
    return {
      status:'unresolved_too_many_units',
      surface:text,
      pronunciation:null,
      unresolved_units:units.map((unit)=>unit.normalized),
    };
  }

  const components=[];
  const unresolved=[];
  for(const unit of units){
    const item=
      acceptedExact(statements,unit.normalized)
      ||expandedExact(statements,unit.normalized);
    if(!item) unresolved.push(unit.normalized);
    else components.push({
      ...item,
      surface:unit.source||item.surface,
    });
  }
  if(unresolved.length){
    return {
      status:'unresolved_source_units',
      surface:text,
      pronunciation:null,
      unresolved_units:unresolved,
    };
  }

  return composedResult(
    text,
    components,
    'expanded_token_composition',
    'entity_source_union_composition',
  );
}
