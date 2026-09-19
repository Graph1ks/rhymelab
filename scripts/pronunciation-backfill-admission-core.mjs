import { classifySurface } from './pronunciation-backfill-audit-core.mjs';

export const PRONUNCIATION_ADMISSION_POLICY='source-aware-pronunciation-admission-v1';

const WORD_SCOPES=new Set([
  'de_usage_source_minus_accepted',
  'de_wiktionary_headword_source_minus_accepted',
  'de_listed_form_source_minus_accepted',
  'en_wiktionary_lexical_source_minus_accepted',
]);
const PHRASE_SURFACE_SCOPE='phrase_surface_unresolved';
const PHRASE_TOKEN_SCOPE='phrase_unresolved_token';
const ENTITY_SCOPES=new Set([
  'entity_de_no_source_pronunciation',
  'entity_en_no_source_pronunciation',
]);

function explicitArtifact(surface){
  const text=String(surface||'').normalize('NFKC').trim();
  if(!text)return 'empty_surface';
  if(/^\[\d+\]\s*/u.test(text))return 'wiktionary_numbered_display';
  if(/(?:\.\.\.|…)/u.test(text))return 'ellipsis_placeholder';
  if(/\{\{|\}\}|<[^>]+>/u.test(text))return 'markup_fragment';
  if(/\b(?:er|sie|es)(?:\/(?:er|sie|es)){1,2}\b/iu.test(text))return 'pronoun_template';
  return null;
}

function scopeDecision(scope,shape,artifact){
  if(ENTITY_SCOPES.has(scope)){
    if(artifact)return {decision:'review',reason:'entity_'+artifact};
    if(['clean_single','joined_lexeme','multiword','other_punctuation'].includes(shape)){
      return {decision:'admit',reason:'entity_name_surface'};
    }
    return {decision:'review',reason:'entity_'+shape};
  }

  if(scope===PHRASE_SURFACE_SCOPE){
    if(artifact)return {decision:'review',reason:'phrase_'+artifact};
    if(['clean_single','joined_lexeme','multiword','other_punctuation'].includes(shape)){
      return {decision:'admit',reason:'phrase_surface'};
    }
    return {decision:'review',reason:'phrase_'+shape};
  }

  if(scope===PHRASE_TOKEN_SCOPE){
    if(artifact)return {decision:'reject_noise',reason:'phrase_token_'+artifact};
    if(['clean_single','joined_lexeme'].includes(shape)){
      return {decision:'admit',reason:'phrase_token_lexical'};
    }
    if(['numeric','nonlexical','single_character'].includes(shape)){
      return {decision:'reject_noise',reason:'phrase_token_'+shape};
    }
    return {decision:'review',reason:'phrase_token_'+shape};
  }

  if(WORD_SCOPES.has(scope)){
    if(artifact)return {decision:'reject_noise',reason:'word_source_'+artifact};
    if(['clean_single','joined_lexeme'].includes(shape)){
      return {decision:'admit',reason:'word_target_lexical_surface'};
    }
    if(['multiword','other_punctuation','mixed_alnum','non_latin_letters'].includes(shape)){
      return {decision:'review',reason:'word_target_'+shape};
    }
    return {decision:'reject_noise',reason:'word_target_'+shape};
  }

  return {decision:'review',reason:'unknown_scope'};
}

export function evaluatePronunciationAdmission({surface,tokenCount=1,scopes=[]}){
  const cls=classifySurface(surface,tokenCount);
  const artifact=explicitArtifact(surface);
  const uniqueScopes=[...new Set((scopes||[]).map(String).filter(Boolean))].sort();
  if(!uniqueScopes.length){
    return {
      policy:PRONUNCIATION_ADMISSION_POLICY,
      decision:'review',
      reason:'no_source_scope',
      shape:cls.shape,
      scopes:uniqueScopes,
      artifact,
    };
  }

  const perScope=uniqueScopes.map((scope)=>({scope,...scopeDecision(scope,cls.shape,artifact)}));
  const admitted=perScope.find((row)=>row.decision==='admit');
  if(admitted){
    return {
      policy:PRONUNCIATION_ADMISSION_POLICY,
      decision:'admit',
      reason:admitted.reason,
      shape:cls.shape,
      scopes:uniqueScopes,
      artifact,
      per_scope:perScope,
    };
  }
  const review=perScope.find((row)=>row.decision==='review');
  if(review){
    return {
      policy:PRONUNCIATION_ADMISSION_POLICY,
      decision:'review',
      reason:review.reason,
      shape:cls.shape,
      scopes:uniqueScopes,
      artifact,
      per_scope:perScope,
    };
  }
  return {
    policy:PRONUNCIATION_ADMISSION_POLICY,
    decision:'reject_noise',
    reason:perScope[0]?.reason||'rejected',
    shape:cls.shape,
    scopes:uniqueScopes,
    artifact,
    per_scope:perScope,
  };
}
