#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getWord } from '../src/local-engine.mjs';
import { DEFAULT_WRITER_DB_PATH, openWriterDb } from '../src/experimental-writer-db.mjs';
import {
  ENTITY_PHONETIC_RUNTIME,
  ENTITY_PRONUNCIATION_POLICY,
  ENTITY_RUNTIME_ANALYZER,
  analyzeEntityPronunciation,
  composeEntityNamePronunciation,
  entityPronunciationRuntimeEligible,
  entityRetrievalAnchors,
} from './entity-pronunciation-core.mjs';

const args = process.argv.slice(2);
let entityDbPath = 'data/local/rhymelab-entities-v1.sqlite';
let writerDbPath = DEFAULT_WRITER_DB_PATH;
let reportPath = 'data/local/entity-pronunciation-v1-report.json';
let includeAliases = true;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--entities') entityDbPath = args[++i] || entityDbPath;
  else if (arg === '--writer') writerDbPath = args[++i] || writerDbPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--preferred-only') includeAliases = false;
}

entityDbPath = resolve(entityDbPath);
writerDbPath = resolve(writerDbPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

function ensureRuntimeStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_rhyme_anchor(
      analyzer_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      anchor_key TEXT NOT NULL,
      pronunciation_id INTEGER NOT NULL REFERENCES entity_pronunciation(pronunciation_id),
      PRIMARY KEY(analyzer_id,channel,anchor_key,pronunciation_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_entity_rhyme_anchor_pronunciation
      ON entity_rhyme_anchor(pronunciation_id,analyzer_id,channel);
  `);
}

function upsertMeta(db, key, value) {
  db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, String(value));
}

function runtimeFingerprint(db) {
  const hash = createHash('sha256');
  const feeds = [
    db.prepare(`
      SELECT n.entity_id,n.name_id,n.surface,n.language,
        p.pronunciation_id,p.locale,p.pronunciation_role,p.ipa,p.preferred,
        p.source_kind,p.source_record,p.generated,p.model_id,p.review_state
      FROM entity_pronunciation p
      JOIN entity_name n USING(name_id)
      WHERE p.review_state IN ('accepted','reviewed','accepted_source_composition')
      ORDER BY n.entity_id,n.name_id,p.pronunciation_id
    `).all(),
    db.prepare(`
      SELECT pronunciation_id,analyzer_id,phonemes,syllables,syllable_count,
        primary_stress,secondary_stress,stress_pattern,vowel_sequence,
        consonant_sequence,rhyme_tail,rhyme_signature
      FROM entity_phonetic_analysis
      WHERE analyzer_id=?
      ORDER BY pronunciation_id
    `).all(ENTITY_RUNTIME_ANALYZER),
    db.prepare(`
      SELECT analyzer_id,channel,anchor_key,pronunciation_id
      FROM entity_rhyme_anchor
      WHERE analyzer_id=?
      ORDER BY channel,anchor_key,pronunciation_id
    `).all(ENTITY_RUNTIME_ANALYZER),
  ];
  for (const rows of feeds) hash.update(JSON.stringify(rows));
  return hash.digest('hex');
}

const entityDb = new DatabaseSync(entityDbPath);
const writerDb = openWriterDb(writerDbPath);
const tokenCache = new Map();

try {
  entityDb.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  const schema = entityDb.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  if (schema !== 'rhymelab-entity-catalog-v1') {
    throw new Error(`Unexpected entity database schema: ${schema || 'missing'}`);
  }
  ensureRuntimeStorage(entityDb);

  const resolveToken = (surface) => {
    const key = String(surface || '').normalize('NFKC').toLocaleLowerCase('de-DE');
    if (tokenCache.has(key)) return tokenCache.get(key);
    const detail = getWord(writerDb, surface);
    tokenCache.set(key, detail || null);
    return detail;
  };

  const nameRows = entityDb.prepare(`
    SELECT n.name_id,n.entity_id,n.surface,n.language,n.name_kind,n.preferred
    FROM entity_name n
    WHERE n.searchable=1
      AND n.language='de'
      ${includeAliases ? '' : 'AND n.preferred=1'}
    ORDER BY n.name_id
  `).all();

  const eligibleExisting = entityDb.prepare(`
    SELECT pronunciation_id,locale,review_state
    FROM entity_pronunciation
    WHERE name_id=?
      AND locale='de-DE'
      AND review_state IN ('accepted','reviewed','accepted_source_composition')
    ORDER BY preferred DESC,pronunciation_id
    LIMIT 1
  `);
  const anyPreferred = entityDb.prepare(`
    SELECT 1 AS yes FROM entity_pronunciation
    WHERE name_id=? AND locale='de-DE' AND preferred=1
    LIMIT 1
  `);
  const insertPronunciation = entityDb.prepare(`
    INSERT INTO entity_pronunciation(
      name_id,locale,pronunciation_role,ipa,preferred,source_kind,source_record,
      generated,model_id,confidence,review_state
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `);

  let composed = 0;
  let existing = 0;
  let unresolved = 0;
  const unresolvedTokenCounts = new Map();

  entityDb.exec('BEGIN');
  try {
    for (const name of nameRows) {
      if (eligibleExisting.get(name.name_id)) {
        existing += 1;
        continue;
      }
      const result = composeEntityNamePronunciation(name.surface, resolveToken);
      if (result.status !== 'resolved') {
        unresolved += 1;
        for (const token of result.unresolvedTokens || []) {
          const key = String(token).normalize('NFKC').toLocaleLowerCase('de-DE');
          unresolvedTokenCounts.set(key, (unresolvedTokenCounts.get(key) || 0) + 1);
        }
        continue;
      }
      insertPronunciation.run(
        name.name_id,
        'de-DE',
        'de-DE',
        result.ipa,
        anyPreferred.get(name.name_id) ? 0 : 1,
        'writer_v5_exact_token_composition',
        JSON.stringify({
          policy: ENTITY_PRONUNCIATION_POLICY,
          tokens: result.tokens.map((token) => ({
            surface: token.surface,
            resolved_surface: token.resolvedSurface,
            pronunciation_id: token.pronunciationId,
          })),
        }),
        0,
        null,
        1,
        'accepted_source_composition',
      );
      composed += 1;
    }
    entityDb.exec('COMMIT');
  } catch (error) {
    entityDb.exec('ROLLBACK');
    throw error;
  }

  entityDb.exec('BEGIN');
  try {
    entityDb.prepare('DELETE FROM entity_rhyme_anchor WHERE analyzer_id=?')
      .run(ENTITY_RUNTIME_ANALYZER);
    entityDb.prepare('DELETE FROM entity_phonetic_analysis WHERE analyzer_id=?')
      .run(ENTITY_RUNTIME_ANALYZER);

    const insertAnalysis = entityDb.prepare(`
      INSERT INTO entity_phonetic_analysis(
        pronunciation_id,analyzer_id,phonemes,syllables,syllable_count,
        primary_stress,secondary_stress,stress_pattern,vowel_sequence,
        consonant_sequence,rhyme_tail,rhyme_signature
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const insertAnchor = entityDb.prepare(`
      INSERT OR IGNORE INTO entity_rhyme_anchor(
        analyzer_id,channel,anchor_key,pronunciation_id
      ) VALUES(?,?,?,?)
    `);

    const pronunciations = entityDb.prepare(`
      SELECT pronunciation_id,name_id,locale,review_state,ipa
      FROM entity_pronunciation
      ORDER BY pronunciation_id
    `).all();

    let analyses = 0;
    let rejectedAnalyses = 0;
    let anchors = 0;
    for (const pronunciation of pronunciations) {
      if (!entityPronunciationRuntimeEligible(pronunciation)) continue;
      try {
        const analyzed = analyzeEntityPronunciation(pronunciation.ipa, 'de');
        const row = analyzed.row;
        insertAnalysis.run(
          pronunciation.pronunciation_id,
          analyzed.analyzerId,
          row.phonemes,
          row.syllables,
          row.syllableCount,
          row.primaryStress,
          row.secondaryStress,
          row.stressPattern,
          row.vowelSequence,
          row.consonantSequence,
          row.rhymeTail,
          row.rhymeSignature,
        );
        analyses += 1;
        for (const anchor of entityRetrievalAnchors(analyzed.analysis, 'de')) {
          const info = insertAnchor.run(
            analyzed.analyzerId,
            anchor.channel,
            anchor.key,
            pronunciation.pronunciation_id,
          );
          anchors += Number(info.changes || 0);
        }
      } catch {
        rejectedAnalyses += 1;
      }
    }

    upsertMeta(entityDb, 'entity_pronunciation_policy', ENTITY_PRONUNCIATION_POLICY);
    upsertMeta(entityDb, 'entity_phonetic_runtime', ENTITY_PHONETIC_RUNTIME);
    upsertMeta(entityDb, 'entity_phonetic_analyzer', ENTITY_RUNTIME_ANALYZER);
    upsertMeta(entityDb, 'entity_pronunciation_names_considered', nameRows.length);
    upsertMeta(entityDb, 'entity_pronunciation_composed', composed);
    upsertMeta(entityDb, 'entity_phonetic_analyses', analyses);
    upsertMeta(entityDb, 'entity_rhyme_anchors', anchors);
    entityDb.exec('COMMIT');

    const fingerprint = runtimeFingerprint(entityDb);
    upsertMeta(entityDb, 'entity_phonetic_runtime_fingerprint', fingerprint);
    entityDb.exec('ANALYZE; PRAGMA optimize;');

    const topUnresolvedTokens = [...unresolvedTokenCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
      .slice(0, 100)
      .map(([token, count]) => ({ token, count }));

    const report = {
      schema: 'rhymelab-entity-pronunciation-report-v1',
      status: 'ok',
      pronunciation_policy: ENTITY_PRONUNCIATION_POLICY,
      phonetic_runtime: ENTITY_PHONETIC_RUNTIME,
      analyzer: ENTITY_RUNTIME_ANALYZER,
      entity_database: entityDbPath,
      writer_database: writerDbPath,
      database_bytes: (await stat(entityDbPath)).size,
      names_considered: nameRows.length,
      aliases_included: includeAliases,
      existing_eligible_pronunciations: existing,
      composed_from_writer_v5: composed,
      unresolved_names: unresolved,
      resolved_name_pct: nameRows.length
        ? Math.round((existing + composed) * 10000 / nameRows.length) / 100
        : 0,
      phonetic_analyses: analyses,
      rejected_analyses: rejectedAnalyses,
      rhyme_anchors: anchors,
      top_unresolved_tokens: topUnresolvedTokens,
      semantic_fingerprint: fingerprint,
      generated_g2p_used: false,
      runtime_network_dependency: false,
    };

    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    try { entityDb.exec('ROLLBACK'); } catch {}
    throw error;
  }
} finally {
  writerDb.close();
  entityDb.close();
}
