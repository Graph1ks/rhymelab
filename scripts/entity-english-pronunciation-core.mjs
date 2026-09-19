import { tokenizePhrase } from './phrase-catalog-core.mjs';
import { normalizeEnglishSurface } from './en-writer-source-core.mjs';

export const ENTITY_ENGLISH_EVIDENCE_POLICY='entity-en-source-backed-evidence-v1';
export const DEFAULT_ENTITY_ENGLISH_MAX_TOKENS=6;

function pct(numerator,denominator){
  return denominator?Math.round(numerator*10000/denominator)/100:0;
}

function increment(map,key,amount=1){
  map.set(key,(map.get(key)||0)+amount);
}

function sortedObject(map){
  return Object.fromEntries(
    [...map.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'en'))
  );
}

export function prepareEntityEnglishEvidenceStatements(enDb){
  return {
    pronunciation:enDb.prepare(`
      SELECT
        f.id AS form_id,
        f.surface,
        f.normalized,
        f.wordfreq_rank,
        f.wordfreq_zipf,
        p.id AS pronunciation_id,
        p.source,
        p.notation,
        p.raw,
        p.phonemes,
        p.syllable_count,
        p.stress,
        p.primary_stress
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
  };
}

function compactPronunciation(row){
  if(!row) return null;
  return {
    form_id:Number(row.form_id),
    surface:row.surface,
    normalized:row.normalized,
    pronunciation_id:Number(row.pronunciation_id),
    source:row.source,
    notation:row.notation,
    raw:row.raw,
    phonemes:row.phonemes,
    syllable_count:Number(row.syllable_count||0),
    stress:row.stress||null,
    primary_stress:Number(row.primary_stress||0)||null,
    wordfreq_rank:row.wordfreq_rank==null?null:Number(row.wordfreq_rank),
    wordfreq_zipf:row.wordfreq_zipf==null?null:Number(row.wordfreq_zipf),
  };
}

export function resolveEnglishEntityNameCandidate(
  surface,
  {
    statements,
    tokenCache=new Map(),
    maxTokens=DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
  }={},
){
  if(!statements?.pronunciation){
    throw new TypeError('resolveEnglishEntityNameCandidate requires prepared statements');
  }

  const normalized=normalizeEnglishSurface(surface);
  if(!normalized){
    return {
      status:'unresolved_empty_surface',
      surface:String(surface||''),
      normalized,
      token_count:0,
      tokens:[],
      unresolved_tokens:[],
      pronunciation:null,
    };
  }

  const exact=compactPronunciation(statements.pronunciation.get(normalized));
  if(exact){
    return {
      status:'exact_source_backed',
      surface:String(surface||''),
      normalized,
      token_count:1,
      tokens:[],
      unresolved_tokens:[],
      pronunciation:exact,
    };
  }

  const tokens=tokenizePhrase(surface);
  if(!tokens.length){
    return {
      status:'unresolved_empty_surface',
      surface:String(surface||''),
      normalized,
      token_count:0,
      tokens:[],
      unresolved_tokens:[],
      pronunciation:null,
    };
  }
  if(tokens.length>maxTokens){
    return {
      status:'unresolved_too_many_tokens',
      surface:String(surface||''),
      normalized,
      token_count:tokens.length,
      tokens:[],
      unresolved_tokens:tokens.map((token)=>token.surface),
      pronunciation:null,
    };
  }

  const resolved=[];
  const unresolved=[];
  for(const token of tokens){
    const key=normalizeEnglishSurface(token.surface);
    let pronunciation;
    if(tokenCache.has(key)){
      pronunciation=tokenCache.get(key);
    }else{
      pronunciation=compactPronunciation(statements.pronunciation.get(key));
      tokenCache.set(key,pronunciation);
    }
    if(!pronunciation){
      unresolved.push(token.surface);
      continue;
    }
    resolved.push({
      surface:token.surface,
      normalized:key,
      pronunciation,
    });
  }

  if(unresolved.length){
    return {
      status:'unresolved_token',
      surface:String(surface||''),
      normalized,
      token_count:tokens.length,
      tokens:resolved,
      unresolved_tokens:unresolved,
      pronunciation:null,
    };
  }

  return {
    status:'bounded_token_composition',
    surface:String(surface||''),
    normalized,
    token_count:tokens.length,
    tokens:resolved,
    unresolved_tokens:[],
    pronunciation:{
      source:'accepted_en_token_composition',
      notation:'composed',
      raw:resolved.map((row)=>row.pronunciation.raw).join(' | '),
      phonemes:resolved.map((row)=>row.pronunciation.phonemes).join(' | '),
      syllable_count:resolved.reduce(
        (sum,row)=>sum+Number(row.pronunciation.syllable_count||0),
        0,
      ),
      component_sources:[...new Set(resolved.map((row)=>row.pronunciation.source))].sort(),
    },
  };
}

export function auditEntityEnglishPronunciationEvidence(
  entityDb,
  enDb,
  {
    maxTokens=DEFAULT_ENTITY_ENGLISH_MAX_TOKENS,
    priorityLimit=20,
  }={},
){
  const statements=prepareEntityEnglishEvidenceStatements(enDb);
  const tokenCache=new Map();

  const counts={
    names:0,
    preferred_names:0,
    exact_source_backed:0,
    bounded_token_composition:0,
    unresolved:0,
    preferred_exact_source_backed:0,
    preferred_bounded_token_composition:0,
    preferred_unresolved:0,
  };
  const statusCounts=new Map();
  const exactSourceCounts=new Map();
  const compositionSourceCounts=new Map();
  const tokenCountDistribution=new Map();
  const unresolvedTokenCounts=new Map();
  const unresolvedReasonCounts=new Map();
  const priorityUnresolved=[];

  const names=entityDb.prepare(`
    SELECT
      n.name_id,
      n.entity_id,
      n.surface,
      n.normalized,
      n.preferred,
      n.name_kind,
      e.qid,
      e.primary_category,
      e.popularity_score,
      e.popularity_percentile,
      e.popularity_tier
    FROM entity_name n
    JOIN entity e USING(entity_id)
    WHERE n.searchable=1
      AND n.language='en'
    ORDER BY
      n.preferred DESC,
      e.popularity_percentile DESC,
      e.popularity_score DESC,
      e.qid,
      n.name_id
  `).iterate();

  for(const name of names){
    counts.names+=1;
    const preferred=Boolean(name.preferred);
    if(preferred) counts.preferred_names+=1;

    const resolved=resolveEnglishEntityNameCandidate(name.surface,{
      statements,
      tokenCache,
      maxTokens,
    });
    increment(statusCounts,resolved.status);
    increment(tokenCountDistribution,String(resolved.token_count||0));

    if(resolved.status==='exact_source_backed'){
      counts.exact_source_backed+=1;
      if(preferred) counts.preferred_exact_source_backed+=1;
      increment(exactSourceCounts,resolved.pronunciation?.source||'unknown');
      continue;
    }

    if(resolved.status==='bounded_token_composition'){
      counts.bounded_token_composition+=1;
      if(preferred) counts.preferred_bounded_token_composition+=1;
      for(const source of resolved.pronunciation?.component_sources||[]){
        increment(compositionSourceCounts,source);
      }
      continue;
    }

    counts.unresolved+=1;
    if(preferred) counts.preferred_unresolved+=1;
    increment(unresolvedReasonCounts,resolved.status);
    for(const token of resolved.unresolved_tokens||[]){
      increment(unresolvedTokenCounts,normalizeEnglishSurface(token)||String(token||''));
    }
    if(
      preferred
      &&priorityUnresolved.length<priorityLimit
    ){
      priorityUnresolved.push({
        qid:name.qid,
        surface:name.surface,
        normalized:name.normalized,
        primary_category:name.primary_category,
        popularity_tier:name.popularity_tier,
        popularity_percentile:Number(name.popularity_percentile||0),
        status:resolved.status,
        unresolved_tokens:resolved.unresolved_tokens||[],
      });
    }
  }

  const ready=counts.exact_source_backed+counts.bounded_token_composition;
  const preferredReady=
    counts.preferred_exact_source_backed+counts.preferred_bounded_token_composition;

  return {
    policy:ENTITY_ENGLISH_EVIDENCE_POLICY,
    max_tokens:maxTokens,
    counts:{
      ...counts,
      source_backed_ready:ready,
      source_backed_ready_pct:pct(ready,counts.names),
      preferred_source_backed_ready:preferredReady,
      preferred_source_backed_ready_pct:pct(preferredReady,counts.preferred_names),
    },
    status_counts:sortedObject(statusCounts),
    exact_source_counts:sortedObject(exactSourceCounts),
    composition_component_source_counts:sortedObject(compositionSourceCounts),
    token_count_distribution:sortedObject(tokenCountDistribution),
    unresolved_reason_counts:sortedObject(unresolvedReasonCounts),
    top_unresolved_tokens:Object.entries(sortedObject(unresolvedTokenCounts))
      .slice(0,50)
      .map(([token,count])=>({token,count})),
    priority_unresolved_preferred_names:priorityUnresolved,
    token_cache_entries:tokenCache.size,
    generated_g2p_used:false,
    database_mutated:false,
  };
}
