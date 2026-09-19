import { analyzeEnglishArpabet, analyzeEnglishIpa } from './english-phonology.mjs';
import {
  classifyWiktionaryIpaLocale,
  isExplicitProperNameRecord,
  normalizeEnglishSurface,
} from './en-writer-source-core.mjs';

export const ENTITY_PRONUNCIATION_SOURCE_EXPANSION_POLICY=
  'entity-pronunciation-source-expansion-v1';

const ROMAN_CARDINALS=new Map([
  ['i','one'],['ii','two'],['iii','three'],['iv','four'],['v','five'],
  ['vi','six'],['vii','seven'],['viii','eight'],['ix','nine'],['x','ten'],
  ['xi','eleven'],['xii','twelve'],['xiii','thirteen'],['xiv','fourteen'],
  ['xv','fifteen'],['xvi','sixteen'],['xvii','seventeen'],
  ['xviii','eighteen'],['xix','nineteen'],['xx','twenty'],
]);

const SMALL_CARDINALS=new Map([
  ['0','zero'],['1','one'],['2','two'],['3','three'],['4','four'],
  ['5','five'],['6','six'],['7','seven'],['8','eight'],['9','nine'],
  ['10','ten'],['11','eleven'],['12','twelve'],['13','thirteen'],
  ['14','fourteen'],['15','fifteen'],['16','sixteen'],['17','seventeen'],
  ['18','eighteen'],['19','nineteen'],['20','twenty'],
]);

function compactAnalysis(analysis){
  return {
    phonemes:analysis.canonicalPhonemes,
    syllable_count:Number(analysis.syllableCount||0),
    stress:analysis.stressPattern||null,
    primary_stress:Number(analysis.primaryStressSyllable||0)||null,
    rhyme_tail:analysis.stressedTail||null,
    exact_key:analysis.exactTailKey||null,
  };
}

function cleanUnit(value){
  return normalizeEnglishSurface(
    String(value??'')
      .replace(/^[\s"'“”‘’()[\]{}:;,.!?]+|[\s"'“”‘’()[\]{}:;,.!?]+$/gu,'')
  );
}

export function entityPronunciationLookupUnits(surface){
  const raw=String(surface??'').normalize('NFKC').trim();
  if(!raw) return [];

  const pieces=raw
    .replace(/&/gu,' and ')
    .replace(/[/:+]/gu,' ')
    .split(/\s+/u)
    .filter(Boolean);

  const units=[];
  for(const piece of pieces){
    const normalized=cleanUnit(piece);
    if(!normalized) continue;

    const roman=ROMAN_CARDINALS.get(normalized);
    if(roman){
      units.push({
        source:piece,
        normalized:roman,
        strategy:'roman_numeral_cardinal',
      });
      continue;
    }

    const cardinal=SMALL_CARDINALS.get(normalized);
    if(cardinal){
      units.push({
        source:piece,
        normalized:cardinal,
        strategy:'small_integer_cardinal',
      });
      continue;
    }

    const hyphenParts=normalized.split(/[‐‑‒–—-]+/u).filter(Boolean);
    if(hyphenParts.length>1){
      for(const part of hyphenParts){
        units.push({
          source:piece,
          normalized:part,
          strategy:'hyphen_component',
        });
      }
      continue;
    }

    units.push({
      source:piece,
      normalized,
      strategy:'surface_token',
    });
  }
  return units;
}

export function collectEntityPronunciationTargets(rows){
  const names=new Set();
  const units=new Set();
  let englishNames=0;
  for(const row of rows){
    const normalized=normalizeEnglishSurface(row?.surface);
    if(!normalized) continue;
    englishNames+=1;
    names.add(normalized);
    for(const unit of entityPronunciationLookupUnits(row.surface)){
      if(unit.normalized) units.add(unit.normalized);
    }
  }
  const allTargets=new Set(names);
  for(const unit of units) allTargets.add(unit);
  return {
    english_names:englishNames,
    distinct_names:names,
    distinct_units:units,
    all_targets:allTargets,
  };
}

export function classifyKaikkiProperNamePronunciations(record){
  if(record?.lang_code!=='en'||!isExplicitProperNameRecord(record)) return [];
  const normalized=normalizeEnglishSurface(record.word);
  if(!normalized) return [];

  const out=[];
  for(const sound of record.sounds||[]){
    const raw=String(sound?.ipa||'').trim();
    if(!raw) continue;
    const locale=classifyWiktionaryIpaLocale(sound);
    const localeId=locale.us?'en-US':locale.uk?'en-GB':locale.unqualified?'en':'en-profiled-other';
    let analysis=null;
    let analysisStatus='unsupported';
    try{
      analysis=compactAnalysis(analyzeEnglishIpa(raw,{
        locale:localeId==='en' ? null : localeId,
        source:'wiktionary_kaikki_proper_name',
      }));
      analysisStatus='ok';
    }catch{
      analysis=null;
    }
    out.push({
      surface:String(record.word||''),
      normalized,
      source_kind:'wiktionary_kaikki_proper_name',
      locale:localeId,
      notation:'ipa',
      raw,
      tags:locale.tags||[],
      analysis_status:analysisStatus,
      analysis,
      proper_name:true,
      runtime_profile_eligible:localeId==='en-US'&&analysisStatus==='ok',
    });
  }
  return out;
}

export function cmudictEntityPronunciation(entry){
  if(!entry?.normalized||!entry?.pronunciation) return null;
  try{
    const analysis=compactAnalysis(analyzeEnglishArpabet(entry.pronunciation,{
      locale:'en-US',
      source:'cmudict_raw_entity',
    }));
    return {
      surface:entry.surface,
      normalized:entry.normalized,
      source_kind:'cmudict_raw_entity',
      locale:'en-US',
      notation:'arpabet',
      raw:entry.pronunciation,
      tags:[],
      analysis_status:'ok',
      analysis,
      proper_name:null,
      runtime_profile_eligible:true,
    };
  }catch{
    return {
      surface:entry.surface,
      normalized:entry.normalized,
      source_kind:'cmudict_raw_entity',
      locale:'en-US',
      notation:'arpabet',
      raw:entry.pronunciation,
      tags:[],
      analysis_status:'unsupported',
      analysis:null,
      proper_name:null,
      runtime_profile_eligible:false,
    };
  }
}

export function parseMobyPronunciationLine(line){
  const raw=String(line??'').replace(/\r$/u,'').trim();
  if(!raw||raw.startsWith('#')) return null;
  const split=raw.search(/\s/u);
  if(split<1) return null;
  const vocab=raw.slice(0,split).trim();
  const pronunciation=raw.slice(split).trim();
  if(!pronunciation) return null;
  const slash=vocab.lastIndexOf('/');
  const bare=slash>0?vocab.slice(0,slash):vocab;
  const surface=bare.replaceAll('_',' ');
  return {
    surface,
    normalized:normalizeEnglishSurface(surface),
    pronunciation,
  };
}

export function mobyEntityPronunciation(entry){
  if(!entry?.normalized||!entry?.pronunciation) return null;
  return {
    surface:entry.surface,
    normalized:entry.normalized,
    source_kind:'moby_pronunciator_ii',
    locale:'en',
    notation:'moby_ascii',
    raw:entry.pronunciation,
    tags:[],
    analysis_status:'raw_only',
    analysis:null,
    proper_name:null,
    runtime_profile_eligible:false,
  };
}

export function createEntityPronunciationSourceStorage(db){
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;

    CREATE TABLE IF NOT EXISTS meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pronunciation_evidence(
      evidence_id INTEGER PRIMARY KEY,
      normalized TEXT NOT NULL,
      surface TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      locale TEXT NOT NULL,
      notation TEXT NOT NULL,
      raw TEXT NOT NULL,
      tags TEXT NOT NULL,
      analysis_status TEXT NOT NULL,
      phonemes TEXT,
      syllable_count INTEGER,
      stress TEXT,
      primary_stress INTEGER,
      rhyme_tail TEXT,
      exact_key TEXT,
      proper_name INTEGER,
      runtime_profile_eligible INTEGER NOT NULL CHECK(runtime_profile_eligible IN (0,1)),
      UNIQUE(normalized,source_kind,locale,notation,raw)
    );

    CREATE INDEX IF NOT EXISTS idx_entity_source_pron_normalized
      ON pronunciation_evidence(normalized,runtime_profile_eligible,source_kind,evidence_id);
    CREATE INDEX IF NOT EXISTS idx_entity_source_pron_source
      ON pronunciation_evidence(source_kind,normalized);
  `);
}

export function prepareEntityPronunciationSourceInsert(db){
  return db.prepare(`
    INSERT OR IGNORE INTO pronunciation_evidence(
      normalized,surface,source_kind,locale,notation,raw,tags,
      analysis_status,phonemes,syllable_count,stress,primary_stress,
      rhyme_tail,exact_key,proper_name,runtime_profile_eligible
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
}

export function insertEntityPronunciationEvidence(statement,row){
  const a=row?.analysis||null;
  const result=statement.run(
    row.normalized,
    row.surface,
    row.source_kind,
    row.locale,
    row.notation,
    row.raw,
    JSON.stringify(row.tags||[]),
    row.analysis_status,
    a?.phonemes??null,
    a?.syllable_count??null,
    a?.stress??null,
    a?.primary_stress??null,
    a?.rhyme_tail??null,
    a?.exact_key??null,
    row.proper_name==null?null:(row.proper_name?1:0),
    row.runtime_profile_eligible?1:0,
  );
  return Number(result.changes||0);
}

export function prepareExpandedSourceLookup(db){
  return {
    runtime:db.prepare(`
      SELECT *
      FROM pronunciation_evidence
      WHERE normalized=? AND runtime_profile_eligible=1
      ORDER BY
        CASE source_kind
          WHEN 'cmudict_raw_entity' THEN 0
          WHEN 'wiktionary_kaikki_proper_name' THEN 1
          ELSE 9
        END,
        evidence_id
      LIMIT 1
    `),
    any:db.prepare(`
      SELECT *
      FROM pronunciation_evidence
      WHERE normalized=?
      ORDER BY runtime_profile_eligible DESC,source_kind,evidence_id
      LIMIT 1
    `),
  };
}

export function compactExpandedEvidenceRow(row){
  if(!row) return null;
  return {
    normalized:row.normalized,
    surface:row.surface,
    source_kind:row.source_kind,
    locale:row.locale,
    notation:row.notation,
    raw:row.raw,
    analysis_status:row.analysis_status,
    phonemes:row.phonemes,
    syllable_count:Number(row.syllable_count||0),
    stress:row.stress||null,
    primary_stress:Number(row.primary_stress||0)||null,
    runtime_profile_eligible:Boolean(row.runtime_profile_eligible),
  };
}
