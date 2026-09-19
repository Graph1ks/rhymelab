import { createHash } from 'node:crypto';
import { englishConsonantFeatures } from './english-rhyme-features.mjs';

export const ENGLISH_WRITER_DB_SCHEMA='rhymelab-en-writer-db-v1-candidate';
export const ENGLISH_WRITER_RETRIEVAL_POLICY='en-indexed-rhyme-retrieval-v1-candidate';

function placeClass(place){
  if(['bilabial','labiodental','labiovelar'].includes(place)) return 'LAB';
  if(['dental','alveolar','postalveolar'].includes(place)) return 'COR';
  if(['palatal','velar'].includes(place)) return 'DOR';
  if(place==='glottal') return 'GLO';
  return String(place||'UNK').toUpperCase();
}
function mannerClass(manner){
  if(manner==='stop') return 'STOP';
  if(manner==='affricate') return 'AFF';
  if(manner==='fricative') return 'FRIC';
  if(manner==='nasal') return 'NAS';
  if(['lateral','rhotic','approximant'].includes(manner)) return 'SON';
  return String(manner||'UNK').toUpperCase();
}

export function englishCoarseCodaClass(codaKey){
  const symbols=String(codaKey||'').trim().split(/\s+/u).filter(Boolean);
  if(!symbols.length) return 'OPEN';
  return symbols.map((symbol)=>{
    const f=englishConsonantFeatures(symbol);
    if(!f.known) return `?${symbol}`;
    return `${placeClass(f.place)}-${mannerClass(f.manner)}`;
  }).join('+');
}

export function createEnglishWriterDbStorage(db){
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE en_form(
      id INTEGER PRIMARY KEY,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL UNIQUE,
      surface_variants TEXT NOT NULL,
      poses TEXT NOT NULL,
      lemmas TEXT NOT NULL,
      relation_kinds TEXT NOT NULL,
      lexical_tags TEXT NOT NULL,
      evidence_kinds TEXT NOT NULL,
      current_evidence_count INTEGER NOT NULL,
      historical_evidence_count INTEGER NOT NULL,
      proper_name_evidence_count INTEGER NOT NULL,
      common_lexical_evidence_count INTEGER NOT NULL,
      historical_only INTEGER NOT NULL CHECK(historical_only IN (0,1)),
      proper_name_only INTEGER NOT NULL CHECK(proper_name_only IN (0,1)),
      analyzed_en_us INTEGER NOT NULL CHECK(analyzed_en_us IN (0,1)),
      default_eligible INTEGER NOT NULL CHECK(default_eligible IN (0,1)),
      exclusion_reasons TEXT NOT NULL,
      esdb_min_size INTEGER,
      esdb_regions TEXT NOT NULL,
      esdb_pos_classes TEXT NOT NULL,
      esdb_archaic INTEGER NOT NULL CHECK(esdb_archaic IN (0,1)),
      esdb_uncommon INTEGER NOT NULL CHECK(esdb_uncommon IN (0,1)),
      esdb_invalid INTEGER NOT NULL CHECK(esdb_invalid IN (0,1)),
      wordfreq_rank INTEGER,
      wordfreq_zipf REAL
    );
    CREATE TABLE en_pronunciation(
      id INTEGER PRIMARY KEY,
      form_id INTEGER NOT NULL REFERENCES en_form(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      notation TEXT NOT NULL,
      raw TEXT NOT NULL,
      locales TEXT NOT NULL,
      locale_us INTEGER NOT NULL CHECK(locale_us IN (0,1)),
      locale_gb INTEGER NOT NULL CHECK(locale_gb IN (0,1)),
      source_attested_unprofiled INTEGER NOT NULL CHECK(source_attested_unprofiled IN (0,1)),
      tags TEXT NOT NULL,
      evidence_count INTEGER NOT NULL,
      analysis_status TEXT NOT NULL,
      phonemes TEXT,
      syllable_count INTEGER,
      stress TEXT,
      primary_stress INTEGER,
      rhyme_tail TEXT,
      final_tail TEXT,
      exact_key TEXT,
      multisyllable_key TEXT,
      vowel_key TEXT,
      vowel_family TEXT,
      coda_key TEXT,
      coda_class TEXT,
      rhyme_syllables INTEGER,
      rhotic INTEGER CHECK(rhotic IS NULL OR rhotic IN (0,1)),
      default_profile_eligible INTEGER NOT NULL CHECK(default_profile_eligible IN (0,1)),
      UNIQUE(form_id,source,notation,raw)
    );

    CREATE INDEX idx_en_form_default_usage
      ON en_form(default_eligible,wordfreq_rank,normalized);
    CREATE INDEX idx_en_form_wordfreq
      ON en_form(wordfreq_rank)
      WHERE wordfreq_rank IS NOT NULL;

    CREATE INDEX idx_en_pron_form
      ON en_pronunciation(form_id,default_profile_eligible,id);
    CREATE INDEX idx_en_pron_exact
      ON en_pronunciation(exact_key,default_profile_eligible,syllable_count,form_id)
      WHERE exact_key IS NOT NULL;
    CREATE INDEX idx_en_pron_multi
      ON en_pronunciation(multisyllable_key,default_profile_eligible,syllable_count,form_id)
      WHERE multisyllable_key IS NOT NULL;
    CREATE INDEX idx_en_pron_vowel
      ON en_pronunciation(vowel_key,default_profile_eligible,syllable_count,form_id)
      WHERE vowel_key IS NOT NULL;
    CREATE INDEX idx_en_pron_family_coda
      ON en_pronunciation(vowel_family,coda_class,default_profile_eligible,syllable_count,form_id)
      WHERE vowel_family IS NOT NULL AND coda_class IS NOT NULL;
    CREATE INDEX idx_en_pron_coda
      ON en_pronunciation(coda_key,default_profile_eligible,syllable_count,form_id)
      WHERE coda_key IS NOT NULL;
  `);
}

export function prepareEnglishWriterDbInserts(db){
  return {
    form:db.prepare(`
      INSERT INTO en_form(
        id,surface,normalized,surface_variants,poses,lemmas,relation_kinds,lexical_tags,evidence_kinds,
        current_evidence_count,historical_evidence_count,proper_name_evidence_count,common_lexical_evidence_count,
        historical_only,proper_name_only,analyzed_en_us,default_eligible,exclusion_reasons,
        esdb_min_size,esdb_regions,esdb_pos_classes,esdb_archaic,esdb_uncommon,esdb_invalid,
        wordfreq_rank,wordfreq_zipf
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `),
    pronunciation:db.prepare(`
      INSERT INTO en_pronunciation(
        form_id,source,notation,raw,locales,locale_us,locale_gb,source_attested_unprofiled,tags,evidence_count,
        analysis_status,phonemes,syllable_count,stress,primary_stress,rhyme_tail,final_tail,exact_key,
        multisyllable_key,vowel_key,vowel_family,coda_key,coda_class,rhyme_syllables,rhotic,default_profile_eligible
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `),
  };
}

const json=(value)=>JSON.stringify(value??[]);
const bit=(value)=>value?1:0;

export function insertEnglishPublishRow(statements,row){
  const eligibility=row?.eligibility||{};
  const lexical=row?.lexical||{};
  const esdb=row?.esdb||{};
  const usage=row?.usage||{};
  const id=Number(row.publish_order);
  if(!Number.isInteger(id)||id<1) throw new Error('English publish row requires positive publish_order.');

  statements.form.run(
    id,
    row.surface,
    row.normalized,
    json(row.surface_variants),
    json(lexical.poses),
    json(lexical.lemmas),
    json(lexical.relation_kinds),
    json(lexical.tags),
    json(lexical.evidence_kinds),
    Number(lexical.current_evidence_count||0),
    Number(lexical.historical_evidence_count||0),
    Number(lexical.proper_name_evidence_count||0),
    Number(lexical.common_lexical_evidence_count||0),
    bit(eligibility.historical_only),
    bit(eligibility.proper_name_only),
    bit(eligibility.analyzed_en_us),
    bit(eligibility.default_eligible),
    json(eligibility.exclusion_reasons),
    Number.isInteger(esdb.min_size)?esdb.min_size:null,
    json(esdb.regions),
    json(esdb.pos_classes),
    bit(esdb.archaic),
    bit(esdb.uncommon),
    bit(esdb.invalid),
    Number.isInteger(usage.rank)?usage.rank:null,
    Number.isFinite(usage.zipf)?usage.zipf:null,
  );

  let pronunciations=0;
  let indexed=0;
  let defaultProfile=0;
  for(const p of row.pronunciations||[]){
    const locales=Array.isArray(p.locales)?p.locales:[];
    const a=p.analysis||null;
    const analyzed=p.analysis_status==='ok'&&a;
    const defaultProfileEligible=Boolean(
      eligibility.default_eligible
      && analyzed
      && locales.includes('en-US')
    );
    const codaClass=analyzed?englishCoarseCodaClass(a.ck):null;
    statements.pronunciation.run(
      id,
      p.source,
      p.notation,
      p.raw,
      json(locales),
      bit(locales.includes('en-US')),
      bit(locales.includes('en-GB')),
      bit(!locales.length),
      json(p.tags),
      Number(p.evidence_count||0),
      p.analysis_status||'unresolved',
      analyzed?a.ph:null,
      analyzed?Number(a.sc):null,
      analyzed?a.st:null,
      analyzed?Number(a.ps):null,
      analyzed?a.rt:null,
      analyzed?a.ft:null,
      analyzed?a.e:null,
      analyzed?(a.m||null):null,
      analyzed?a.vk:null,
      analyzed?a.vf:null,
      analyzed?(a.ck??''):null,
      codaClass,
      analyzed?Number(a.rs):null,
      analyzed?bit(a.rh):null,
      bit(defaultProfileEligible),
    );
    pronunciations+=1;
    if(analyzed) indexed+=1;
    if(defaultProfileEligible) defaultProfile+=1;
  }
  return {pronunciations,indexed,defaultProfile};
}

export function fingerprintEnglishWriterDb(db){
  const hash=createHash('sha256');
  const formStmt=db.prepare(`
    SELECT id,surface,normalized,surface_variants,poses,lemmas,relation_kinds,lexical_tags,evidence_kinds,
           current_evidence_count,historical_evidence_count,proper_name_evidence_count,common_lexical_evidence_count,
           historical_only,proper_name_only,analyzed_en_us,default_eligible,exclusion_reasons,
           esdb_min_size,esdb_regions,esdb_pos_classes,esdb_archaic,esdb_uncommon,esdb_invalid,
           wordfreq_rank,wordfreq_zipf
    FROM en_form ORDER BY id
  `);
  for(const row of formStmt.iterate()) hash.update(JSON.stringify(row)).update('\n');

  const pronStmt=db.prepare(`
    SELECT id,form_id,source,notation,raw,locales,locale_us,locale_gb,source_attested_unprofiled,tags,evidence_count,
           analysis_status,phonemes,syllable_count,stress,primary_stress,rhyme_tail,final_tail,exact_key,
           multisyllable_key,vowel_key,vowel_family,coda_key,coda_class,rhyme_syllables,rhotic,default_profile_eligible
    FROM en_pronunciation ORDER BY id
  `);
  for(const row of pronStmt.iterate()) hash.update(JSON.stringify(row)).update('\n');
  return hash.digest('hex');
}

export function englishRetrievalQueryPlans(db){
  const sample=db.prepare(`
    SELECT exact_key,vowel_key,vowel_family,coda_class,coda_key
    FROM en_pronunciation
    WHERE default_profile_eligible=1 AND exact_key IS NOT NULL
    ORDER BY id LIMIT 1
  `).get();
  if(!sample) return {};
  const multiSample=db.prepare(`
    SELECT multisyllable_key
    FROM en_pronunciation
    WHERE default_profile_eligible=1 AND multisyllable_key IS NOT NULL
    ORDER BY id LIMIT 1
  `).get();
  const plan=(sql,...args)=>db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map((row)=>String(row.detail||''));
  return {
    exact:plan('SELECT id FROM en_pronunciation WHERE exact_key=? AND default_profile_eligible=1',sample.exact_key),
    multi:multiSample?plan('SELECT id FROM en_pronunciation WHERE multisyllable_key=? AND default_profile_eligible=1',multiSample.multisyllable_key):[],
    vowel:plan('SELECT id FROM en_pronunciation WHERE vowel_key=? AND default_profile_eligible=1',sample.vowel_key),
    family_coda:plan('SELECT id FROM en_pronunciation WHERE vowel_family=? AND coda_class=? AND default_profile_eligible=1',sample.vowel_family,sample.coda_class),
    coda:plan('SELECT id FROM en_pronunciation WHERE coda_key=? AND default_profile_eligible=1',sample.coda_key),
  };
}
