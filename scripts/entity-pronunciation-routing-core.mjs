export const ENTITY_DERIVED_PRONUNCIATION_SOURCES=Object.freeze([
  'espeak_ng_generated_secondary',
  'writer_v5_exact_token_composition',
  'serving_core_absorbed',
]);

export function entityPronunciationSourceNeedsLocaleEvidence(sourceKind){
  return ENTITY_DERIVED_PRONUNCIATION_SOURCES.includes(String(sourceKind||''));
}

export function entityPronunciationOccurrenceEligible({
  sourceKind,
  hasCrossLocaleDuplicate=false,
}={}){
  return !(
    hasCrossLocaleDuplicate
    &&entityPronunciationSourceNeedsLocaleEvidence(sourceKind)
  );
}

function sqlString(value){
  return "'" + String(value).replaceAll("'","''") + "'";
}

/**
 * Entity label language is a search/display locale, not pronunciation-language
 * evidence. If the same normalized name exists for the same entity in both DE
 * and EN label locales, derived pronunciation sources are ambiguous and must
 * not be routed into either phonology solely from the label locale.
 *
 * Direct/source-backed pronunciation rows remain eligible.
 */
export function entityPronunciationRoutingSql({
  pronunciationAlias='p',
  nameAlias='n',
  nameTable='entity_name',
  ambiguousNameTable=null,
}={}){
  const weak=ENTITY_DERIVED_PRONUNCIATION_SOURCES.map(sqlString).join(',');
  const ambiguity=ambiguousNameTable
    ?`EXISTS(
      SELECT 1 FROM ${ambiguousNameTable} ambiguous
      WHERE ambiguous.name_id=${nameAlias}.name_id
    )`
    :`EXISTS(
      SELECT 1
      FROM ${nameTable} sibling
      WHERE sibling.entity_id=${nameAlias}.entity_id
        AND sibling.normalized=${nameAlias}.normalized
        AND sibling.searchable=1
        AND sibling.language=CASE ${nameAlias}.language
          WHEN 'de' THEN 'en'
          WHEN 'en' THEN 'de'
          ELSE ''
        END
    )`;
  return `NOT (
    ${pronunciationAlias}.source_kind IN (${weak})
    AND ${ambiguity}
  )`;
}

export function entityCrossLocaleDuplicateSql({
  nameAlias='n',
  nameTable='entity_name',
}={}){
  return `EXISTS(
    SELECT 1
    FROM ${nameTable} sibling
    WHERE sibling.entity_id=${nameAlias}.entity_id
      AND sibling.normalized=${nameAlias}.normalized
      AND sibling.searchable=1
      AND sibling.language=CASE ${nameAlias}.language
        WHEN 'de' THEN 'en'
        WHEN 'en' THEN 'de'
        ELSE ''
      END
  )`;
}
