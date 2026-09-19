#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const GENERATED_PRONUNCIATION_SCHEMA='rhymelab-generated-pronunciation-staging-v1';
export const GENERATED_PRONUNCIATION_POLICY='generated-pronunciation-opt-in-staging-v1';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}
const reportPath=resolve(argValue('--report','data/local/query-pronunciation-espeak-oov-report-v1.json'));
const outPath=resolve(argValue('--out','data/local/rhymelab-generated-pronunciations-v1.sqlite'));
const replace=args.includes('--replace');

if(existsSync(outPath)){
  if(!replace) throw new Error(`Generated pronunciation staging DB already exists: ${outPath}; pass --replace to rebuild.`);
  await rm(outPath,{force:true});
}

const report=JSON.parse(await readFile(reportPath,'utf8'));
if(report.schema!=='rhymelab-query-pronunciation-espeak-oov-report-v1'){
  throw new Error(`Unexpected report schema: ${report.schema||'missing'}`);
}

const db=new DatabaseSync(outPath);
try{
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    CREATE TABLE meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE generated_pronunciation(
      generated_id INTEGER PRIMARY KEY,
      case_id TEXT NOT NULL,
      source_stratum TEXT NOT NULL,
      language TEXT NOT NULL CHECK(language IN ('de','en')),
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      ipa TEXT NOT NULL,
      syllable_count INTEGER NOT NULL,
      primary_stress INTEGER,
      stress_pattern TEXT,
      exact_tail_key TEXT,
      vowel_key TEXT,
      coda_key TEXT,
      canonical_phonemes TEXT,
      engine TEXT NOT NULL,
      engine_version TEXT,
      source_report_fingerprint TEXT NOT NULL,
      generated INTEGER NOT NULL DEFAULT 1 CHECK(generated=1),
      review_state TEXT NOT NULL DEFAULT 'generated_unreviewed',
      consumer_policy TEXT NOT NULL DEFAULT 'opt_in_only',
      opt_in_eligible INTEGER NOT NULL DEFAULT 1 CHECK(opt_in_eligible IN (0,1)),
      canonical_lexical_fact INTEGER NOT NULL DEFAULT 0 CHECK(canonical_lexical_fact=0),
      UNIQUE(language,normalized,engine,source_report_fingerprint)
    );
    CREATE INDEX generated_pronunciation_language_normalized
      ON generated_pronunciation(language,normalized);
    CREATE INDEX generated_pronunciation_opt_in
      ON generated_pronunciation(language,opt_in_eligible,review_state);
  `);

  const insert=db.prepare(`
    INSERT OR IGNORE INTO generated_pronunciation(
      case_id,source_stratum,language,surface,normalized,ipa,syllable_count,
      primary_stress,stress_pattern,exact_tail_key,vowel_key,coda_key,canonical_phonemes,
      engine,engine_version,source_report_fingerprint
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  db.exec('BEGIN');
  try{
    for(const row of report.predictions||[]){
      if(row.sentinel) continue;
      insert.run(
        row.case_id,
        row.source_stratum,
        row.language,
        row.surface,
        row.normalized,
        row.ipa,
        Number(row.syllable_count||0),
        row.primary_stress??null,
        row.stress_pattern??null,
        row.exact_tail_key??null,
        row.vowel_key??null,
        row.coda_key??null,
        row.canonical_phonemes??null,
        row.engine||'espeak-ng',
        row.engine_version??null,
        report.semantic_fingerprint,
      );
    }
    db.exec('COMMIT');
  }catch(error){
    try{db.exec('ROLLBACK');}catch{}
    throw error;
  }

  const count=Number(db.prepare('SELECT COUNT(*) AS c FROM generated_pronunciation').get().c||0);
  const fingerprint=createHash('sha256');
  for(const row of db.prepare(`
    SELECT case_id,source_stratum,language,surface,normalized,ipa,syllable_count,
      primary_stress,stress_pattern,exact_tail_key,vowel_key,coda_key,canonical_phonemes,
      engine,engine_version,review_state,consumer_policy,opt_in_eligible,canonical_lexical_fact
    FROM generated_pronunciation
    ORDER BY language,normalized,generated_id
  `).iterate()){
    fingerprint.update(JSON.stringify(row));
    fingerprint.update('\n');
  }
  const semanticFingerprint=fingerprint.digest('hex');
  const meta=db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  const values={
    schema:GENERATED_PRONUNCIATION_SCHEMA,
    policy:GENERATED_PRONUNCIATION_POLICY,
    source_report_schema:report.schema,
    source_report_fingerprint:report.semantic_fingerprint,
    rows:count,
    semantic_fingerprint:semanticFingerprint,
    canonical_runtime_promoted:'false',
    consumer_policy:'opt_in_only',
  };
  for(const [key,value] of Object.entries(values)) meta.run(key,String(value));

  db.exec('ANALYZE; PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE);');
  console.log(JSON.stringify({
    schema:GENERATED_PRONUNCIATION_SCHEMA,
    policy:GENERATED_PRONUNCIATION_POLICY,
    rows:count,
    semantic_fingerprint:semanticFingerprint,
    source_report_fingerprint:report.semantic_fingerprint,
    canonical_runtime_promoted:false,
    consumer_policy:'opt_in_only',
    database:outPath,
  },null,2));
}finally{
  db.close();
}
