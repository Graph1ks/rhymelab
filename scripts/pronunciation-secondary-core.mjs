import { createHash } from 'node:crypto';
import { coarseCodaClass } from './german-rhyme-features.mjs';
import { englishCoarseCodaClass } from './en-writer-db-core.mjs';

export const PRONUNCIATION_SECONDARY_SCHEMA='rhymelab-pronunciation-secondary-v1';
export const PRONUNCIATION_SECONDARY_POLICY='opt-in-generated-pronunciation-secondary-v1';
export const PRONUNCIATION_SECONDARY_DEFERRED_POLICY='client-and-unresolved-deferred-v1';

const json=(value)=>JSON.stringify(value??[]);
const bit=(value)=>value?1:0;
const uniq=(values)=>[...new Set((values||[]).map((value)=>String(value)).filter(Boolean))];

export function isActiveSecondaryGeneratedRow(row){
  return row?.final_status==='resolved'
    && row?.final_method==='espeak_ng'
    && (row?.quality_tier==='A'||row?.quality_tier==='B');
}

export function deferredGeneratedBucket(row){
  if(row?.final_status==='unresolved'||row?.quality_tier==='U')return 'U_unresolved';
  if(row?.final_method==='espeak_ng')return null;
  if(row?.quality_tier==='B')return 'client_B_source_backed';
  if(row?.quality_tier==='C')return 'client_C_rules';
  if(row?.quality_tier==='D')return 'client_D_grapheme';
  return 'other_non_espeak';
}

function relationWords(values){
  return uniq((values||[]).map((value)=>typeof value==='string'?value:value?.word));
}

export function stableKaikkiRecordKey(entry,language=''){
  const payload={
    language:String(language||entry?.lang_code||''),
    word:entry?.word??null,
    pos:entry?.pos??null,
    pos_title:entry?.pos_title??null,
    etymology_number:entry?.etymology_number??entry?.etymology_index??null,
    senses:(entry?.senses??[]).map((sense)=>({
      glosses:sense?.glosses??[],
      form_of:relationWords(sense?.form_of),
      alt_of:relationWords(sense?.alt_of),
      tags:sense?.tags??[],
    })),
  };
  return 'kaikki:'+createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,32);
}

export function compactKaikkiSourceRecord(entry,language,sourceRecordKey=null){
  const senses=(entry?.senses??[]).map((sense)=>({
    glosses:uniq(sense?.glosses),
    raw_glosses:uniq(sense?.raw_glosses),
    tags:uniq([...(sense?.tags??[]),...(sense?.raw_tags??[])]),
    form_of:relationWords(sense?.form_of),
    alt_of:relationWords(sense?.alt_of),
    synonyms:uniq((sense?.synonyms??[]).map((row)=>typeof row==='string'?row:row?.word)),
    antonyms:uniq((sense?.antonyms??[]).map((row)=>typeof row==='string'?row:row?.word)),
  })).filter((sense)=>
    sense.glosses.length||sense.raw_glosses.length||sense.tags.length
    ||sense.form_of.length||sense.alt_of.length||sense.synonyms.length||sense.antonyms.length
  );
  return {
    source_record_key:sourceRecordKey||stableKaikkiRecordKey(entry,language),
    language:String(language||entry?.lang_code||''),
    headword:String(entry?.word||''),
    pos:String(entry?.pos||'unknown'),
    etymology_number:Number(entry?.etymology_number??entry?.etymology_index??1)||1,
    etymology_text:entry?.etymology_text?String(entry.etymology_text):null,
    tags_json:json(uniq([...(entry?.tags??[]),...(entry?.raw_tags??[])])),
    senses_json:JSON.stringify(senses),
  };
}

export function phoneticParityFields(analysis,language){
  if(!analysis)throw new TypeError('phoneticParityFields requires analysis.');
  const code=String(language||'').toLowerCase();
  const codaClass=code==='de'
    ?coarseCodaClass(analysis.finalCoda||analysis.syllables?.at?.(-1)?.coda||[])
    :englishCoarseCodaClass(analysis.codaKey||'');
  return {
    ipa:String(analysis.ipa||''),
    phonemes:Array.isArray(analysis.canonicalPhonemes)
      ?analysis.canonicalPhonemes.join(' ')
      :String(analysis.canonicalPhonemes||''),
    syllable_count:Number(analysis.syllableCount||0),
    stress:String(analysis.stressPattern||''),
    primary_stress:Number(analysis.primaryStressSyllable??0),
    rhyme_tail:String(analysis.stressedTail||''),
    final_tail:String(analysis.finalTail||''),
    vowels:Array.isArray(analysis.vowelSequence)?analysis.vowelSequence.join(' '):String(analysis.vowelSequence||''),
    consonants:Array.isArray(analysis.consonantSequence)?analysis.consonantSequence.join(' '):String(analysis.consonantSequence||''),
    exact_key:String(analysis.exactTailKey||''),
    multisyllable_key:analysis.multisyllableKey?String(analysis.multisyllableKey):null,
    vowel_key:String(analysis.vowelKey||''),
    vowel_family:String(analysis.vowelFamilyKey||''),
    coda_key:String(analysis.codaKey||''),
    coda_class:String(codaClass||''),
    rhyme_syllables:Number(analysis.stressedSyllableCount||0),
    rhotic:code==='en'?bit(analysis.rhotic):null,
  };
}

export function createPronunciationSecondaryStorage(db){
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS secondary_form(
      item_id INTEGER PRIMARY KEY,
      language TEXT NOT NULL CHECK(language IN ('de','en')),
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      quality_tier TEXT NOT NULL CHECK(quality_tier IN ('A','B')),
      quality_reason TEXT NOT NULL,
      final_method TEXT NOT NULL CHECK(final_method='espeak_ng'),
      source_ref_count INTEGER NOT NULL,
      second_class INTEGER NOT NULL DEFAULT 1 CHECK(second_class=1),
      default_search_eligible INTEGER NOT NULL DEFAULT 0 CHECK(default_search_eligible=0),
      user_opt_in_eligible INTEGER NOT NULL DEFAULT 1 CHECK(user_opt_in_eligible=1),
      usage_rank INTEGER,
      usage_score REAL,
      usage_count INTEGER,
      usage_source_count INTEGER,
      wordfreq_rank INTEGER,
      wordfreq_zipf REAL,
      esdb_json TEXT,
      preferred_lemma TEXT,
      preferred_pos TEXT,
      preferred_gender TEXT,
      historical_only INTEGER NOT NULL DEFAULT 0 CHECK(historical_only IN (0,1)),
      lexical_tags TEXT NOT NULL DEFAULT '[]',
      metadata_status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE(language,normalized)
    );
    CREATE TABLE IF NOT EXISTS secondary_pronunciation(
      item_id INTEGER PRIMARY KEY REFERENCES secondary_form(item_id) ON DELETE CASCADE,
      raw_ipa TEXT,
      ipa TEXT NOT NULL,
      phonemes TEXT NOT NULL,
      syllable_count INTEGER NOT NULL,
      stress TEXT NOT NULL,
      primary_stress INTEGER NOT NULL,
      rhyme_tail TEXT NOT NULL,
      final_tail TEXT NOT NULL,
      vowels TEXT NOT NULL,
      consonants TEXT NOT NULL,
      exact_key TEXT NOT NULL,
      multisyllable_key TEXT,
      vowel_key TEXT NOT NULL,
      vowel_family TEXT NOT NULL,
      coda_key TEXT NOT NULL,
      coda_class TEXT NOT NULL,
      rhyme_syllables INTEGER NOT NULL,
      rhotic INTEGER CHECK(rhotic IS NULL OR rhotic IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS secondary_source_ref(
      source_ref_id INTEGER PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES secondary_form(item_id) ON DELETE CASCADE,
      scope TEXT NOT NULL,
      source_db TEXT NOT NULL,
      source_table TEXT NOT NULL,
      source_key TEXT NOT NULL,
      source_surface TEXT NOT NULL,
      context_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS secondary_source_record(
      source_record_key TEXT PRIMARY KEY,
      language TEXT NOT NULL,
      headword TEXT NOT NULL,
      pos TEXT NOT NULL,
      etymology_number INTEGER NOT NULL,
      etymology_text TEXT,
      tags_json TEXT NOT NULL,
      senses_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS secondary_form_source_record(
      item_id INTEGER NOT NULL REFERENCES secondary_form(item_id) ON DELETE CASCADE,
      source_record_key TEXT NOT NULL REFERENCES secondary_source_record(source_record_key) ON DELETE CASCADE,
      match_kind TEXT NOT NULL,
      PRIMARY KEY(item_id,source_record_key,match_kind)
    );
    CREATE TABLE IF NOT EXISTS secondary_lexical_analysis(
      item_id INTEGER NOT NULL REFERENCES secondary_form(item_id) ON DELETE CASCADE,
      analysis_key TEXT NOT NULL,
      source_record_key TEXT,
      lemma TEXT NOT NULL,
      normalized_lemma TEXT NOT NULL,
      pos TEXT NOT NULL,
      homograph_no INTEGER,
      confidence REAL,
      gender TEXT,
      is_proper INTEGER NOT NULL DEFAULT 0 CHECK(is_proper IN (0,1)),
      is_obsolete INTEGER NOT NULL DEFAULT 0 CHECK(is_obsolete IN (0,1)),
      historical_only INTEGER NOT NULL DEFAULT 0 CHECK(historical_only IN (0,1)),
      style_tags TEXT NOT NULL DEFAULT '[]',
      form_features TEXT NOT NULL DEFAULT '[]',
      match_kinds TEXT NOT NULL DEFAULT '[]',
      relation_kinds TEXT NOT NULL DEFAULT '[]',
      evidence_kind TEXT,
      PRIMARY KEY(item_id,analysis_key,source_record_key)
    );
    CREATE TABLE IF NOT EXISTS deferred_generated_result(
      item_id INTEGER PRIMARY KEY,
      language TEXT NOT NULL,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      final_status TEXT NOT NULL,
      quality_tier TEXT,
      final_method TEXT,
      client_status TEXT,
      bucket TEXT NOT NULL,
      last_error TEXT,
      note TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_secondary_form_optin
      ON secondary_form(language,user_opt_in_eligible,normalized);
    CREATE INDEX IF NOT EXISTS idx_secondary_pron_exact
      ON secondary_pronunciation(exact_key,syllable_count,item_id);
    CREATE INDEX IF NOT EXISTS idx_secondary_pron_multi
      ON secondary_pronunciation(multisyllable_key,syllable_count,item_id)
      WHERE multisyllable_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_secondary_pron_vowel
      ON secondary_pronunciation(vowel_key,syllable_count,item_id);
    CREATE INDEX IF NOT EXISTS idx_secondary_pron_family_coda
      ON secondary_pronunciation(vowel_family,coda_class,syllable_count,item_id);
    CREATE INDEX IF NOT EXISTS idx_secondary_pron_coda
      ON secondary_pronunciation(coda_key,syllable_count,item_id);
    CREATE INDEX IF NOT EXISTS idx_secondary_lexical_item
      ON secondary_lexical_analysis(item_id,confidence DESC,analysis_key);
    CREATE INDEX IF NOT EXISTS idx_secondary_source_ref_item
      ON secondary_source_ref(item_id,scope);
  `);
}

export function lexicalAggregate(rows){
  const list=Array.from(rows||[]);
  if(!list.length)return {
    preferred_lemma:null,preferred_pos:null,preferred_gender:null,
    historical_only:0,lexical_tags:'[]',
  };
  const ranked=[...list].sort((a,b)=>
    Number(b.confidence??-1)-Number(a.confidence??-1)
    ||String(a.analysis_key).localeCompare(String(b.analysis_key))
  );
  const preferred=ranked[0];
  const tags=uniq(list.flatMap((row)=>{
    try{return JSON.parse(row.style_tags||'[]')}catch{return []}
  })).sort();
  return {
    preferred_lemma:preferred.lemma||null,
    preferred_pos:preferred.pos||null,
    preferred_gender:preferred.gender||null,
    historical_only:list.every((row)=>Boolean(row.historical_only))?1:0,
    lexical_tags:JSON.stringify(tags),
  };
}
