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

const CHECKPOINT_EVERY = 10000;
const PROGRESS_EVERY = 5000;
const PHONETIC_BUILD_REVISION = 'entity-phonetic-runtime-de-v1-checkpointed-v1';

function metaValue(db, key) {
  return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value ?? null;
}

function progressLine(phase, current, total, startedAt, details = []) {
  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const rate = current / (elapsedMs / 1000);
  const pct = total ? current * 100 / total : 100;
  const etaSeconds = rate > 0 && current < total ? Math.round((total - current) / rate) : 0;
  const eta = etaSeconds >= 3600
    ? `${Math.floor(etaSeconds / 3600)}h ${Math.floor((etaSeconds % 3600) / 60)}m`
    : etaSeconds >= 60
      ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s`
      : `${etaSeconds}s`;
  console.error(
    `[${phase}] ${current.toLocaleString()} / ${total.toLocaleString()} (${pct.toFixed(1)}%)`
    + ` · ${Math.round(rate).toLocaleString()}/s`
    + (etaSeconds ? ` · ETA ~${eta}` : '')
    + (details.length ? ` · ${details.join(' · ')}` : ''),
  );
}

async function yieldToSignals() {
  await new Promise((resolveImmediate) => setImmediate(resolveImmediate));
}

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

async function runtimeFingerprint(db) {
  const hash = createHash('sha256');
  const feeds = [
    {
      label: 'pronunciations',
      count: Number(db.prepare(`
        SELECT COUNT(*) AS c
        FROM entity_pronunciation p
        JOIN entity_name n USING(name_id)
        WHERE p.review_state IN ('accepted','reviewed','accepted_source_composition')
      `).get().c || 0),
      statement: db.prepare(`
        SELECT n.entity_id,n.name_id,n.surface,n.language,
          p.pronunciation_id,p.locale,p.pronunciation_role,p.ipa,p.preferred,
          p.source_kind,p.source_record,p.generated,p.model_id,p.review_state
        FROM entity_pronunciation p
        JOIN entity_name n USING(name_id)
        WHERE p.review_state IN ('accepted','reviewed','accepted_source_composition')
        ORDER BY n.entity_id,n.name_id,p.pronunciation_id
      `),
      args: [],
    },
    {
      label: 'analyses',
      count: Number(db.prepare(`
        SELECT COUNT(*) AS c FROM entity_phonetic_analysis WHERE analyzer_id=?
      `).get(ENTITY_RUNTIME_ANALYZER).c || 0),
      statement: db.prepare(`
        SELECT pronunciation_id,analyzer_id,phonemes,syllables,syllable_count,
          primary_stress,secondary_stress,stress_pattern,vowel_sequence,
          consonant_sequence,rhyme_tail,rhyme_signature
        FROM entity_phonetic_analysis
        WHERE analyzer_id=?
        ORDER BY pronunciation_id
      `),
      args: [ENTITY_RUNTIME_ANALYZER],
    },
    {
      label: 'anchors',
      count: Number(db.prepare(`
        SELECT COUNT(*) AS c FROM entity_rhyme_anchor WHERE analyzer_id=?
      `).get(ENTITY_RUNTIME_ANALYZER).c || 0),
      statement: db.prepare(`
        SELECT analyzer_id,channel,anchor_key,pronunciation_id
        FROM entity_rhyme_anchor
        WHERE analyzer_id=?
        ORDER BY channel,anchor_key,pronunciation_id
      `),
      args: [ENTITY_RUNTIME_ANALYZER],
    },
  ];

  for (const feed of feeds) {
    const startedAt = Date.now();
    let current = 0;
    let first = true;
    hash.update('[');
    for (const row of feed.statement.iterate(...feed.args)) {
      if (!first) hash.update(',');
      hash.update(JSON.stringify(row));
      first = false;
      current += 1;
      if (current % 100000 === 0) {
        progressLine(`fingerprint:${feed.label}`, current, feed.count, startedAt);
        await yieldToSignals();
      }
    }
    hash.update(']');
    if (feed.count) {
      progressLine(`fingerprint:${feed.label}`, current, feed.count, startedAt, ['done']);
    }
  }
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
  const nameStartedAt = Date.now();

  async function checkpointNames(processed) {
    if (processed % PROGRESS_EVERY === 0 || processed === nameRows.length) {
      progressLine('pronunciation:names', processed, nameRows.length, nameStartedAt, [
        `existing ${existing.toLocaleString()}`,
        `new ${composed.toLocaleString()}`,
        `unresolved ${unresolved.toLocaleString()}`,
        `token-cache ${tokenCache.size.toLocaleString()}`,
      ]);
    }
    if (processed % CHECKPOINT_EVERY === 0 && processed < nameRows.length) {
      upsertMeta(entityDb, 'entity_pronunciation_build_state', 'names_in_progress');
      upsertMeta(entityDb, 'entity_pronunciation_name_checkpoint', processed);
      entityDb.exec('COMMIT');
      await yieldToSignals();
      entityDb.exec('BEGIN');
    } else if (processed % PROGRESS_EVERY === 0) {
      await yieldToSignals();
    }
  }

  console.error(
    `[entity-pronunciation] phase 1/3 · ${nameRows.length.toLocaleString()} DE names`
    + ` · checkpoint every ${CHECKPOINT_EVERY.toLocaleString()}`,
  );
  entityDb.exec('BEGIN');
  try {
    for (const name of nameRows) {
      if (eligibleExisting.get(name.name_id)) {
        existing += 1;
        await checkpointNames(existing + composed + unresolved);
        continue;
      }
      const result = composeEntityNamePronunciation(name.surface, resolveToken);
      if (result.status !== 'resolved') {
        unresolved += 1;
        for (const token of result.unresolvedTokens || []) {
          const key = String(token).normalize('NFKC').toLocaleLowerCase('de-DE');
          unresolvedTokenCounts.set(key, (unresolvedTokenCounts.get(key) || 0) + 1);
        }
        await checkpointNames(existing + composed + unresolved);
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
      await checkpointNames(existing + composed + unresolved);
    }
    upsertMeta(entityDb, 'entity_pronunciation_build_state', 'names_complete');
    upsertMeta(entityDb, 'entity_pronunciation_name_checkpoint', nameRows.length);
    entityDb.exec('COMMIT');
  } catch (error) {
    entityDb.exec('ROLLBACK');
    throw error;
  }

  const eligibleNamesFinal = Number(entityDb.prepare(`
    SELECT COUNT(DISTINCT n.name_id) AS c
    FROM entity_name n
    JOIN entity_pronunciation p USING(name_id)
    WHERE n.searchable=1
      AND n.language='de'
      ${includeAliases ? '' : 'AND n.preferred=1'}
      AND p.locale='de-DE'
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition')
  `).get().c || 0);
  const composedTotal = Number(entityDb.prepare(`
    SELECT COUNT(DISTINCT n.name_id) AS c
    FROM entity_name n
    JOIN entity_pronunciation p USING(name_id)
    WHERE n.searchable=1
      AND n.language='de'
      ${includeAliases ? '' : 'AND n.preferred=1'}
      AND p.locale='de-DE'
      AND p.review_state='accepted_source_composition'
      AND p.source_kind='writer_v5_exact_token_composition'
  `).get().c || 0);
  const sourceBackedTotal = Number(entityDb.prepare(`
    SELECT COUNT(DISTINCT n.name_id) AS c
    FROM entity_name n
    JOIN entity_pronunciation p USING(name_id)
    WHERE n.searchable=1
      AND n.language='de'
      ${includeAliases ? '' : 'AND n.preferred=1'}
      AND p.locale='de-DE'
      AND p.review_state IN ('accepted','reviewed')
      AND p.source_kind<>'writer_v5_exact_token_composition'
  `).get().c || 0);
  const unresolvedFinal = Math.max(0, nameRows.length - eligibleNamesFinal);

  const previousRevision = metaValue(entityDb, 'entity_phonetic_build_revision');
  if (previousRevision !== PHONETIC_BUILD_REVISION) {
    console.error('[entity-pronunciation] phase 2/3 · starting fresh analyzer index');
    entityDb.exec('BEGIN');
    try {
      entityDb.prepare('DELETE FROM entity_rhyme_anchor WHERE analyzer_id=?')
        .run(ENTITY_RUNTIME_ANALYZER);
      entityDb.prepare('DELETE FROM entity_phonetic_analysis WHERE analyzer_id=?')
        .run(ENTITY_RUNTIME_ANALYZER);
      upsertMeta(entityDb, 'entity_phonetic_build_revision', PHONETIC_BUILD_REVISION);
      upsertMeta(entityDb, 'entity_phonetic_analysis_checkpoint', 0);
      entityDb.exec('COMMIT');
    } catch (error) {
      entityDb.exec('ROLLBACK');
      throw error;
    }
  } else {
    console.error('[entity-pronunciation] phase 2/3 · compatible partial analyzer index found; resuming');
  }

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
  const hasAnalysis = entityDb.prepare(`
    SELECT 1 AS yes
    FROM entity_phonetic_analysis
    WHERE pronunciation_id=? AND analyzer_id=?
    LIMIT 1
  `);

  const pronunciations = entityDb.prepare(`
    SELECT pronunciation_id,name_id,locale,review_state,ipa
    FROM entity_pronunciation
    ORDER BY pronunciation_id
  `).all();
  const eligiblePronunciationCount = pronunciations
    .reduce((sum, row) => sum + (entityPronunciationRuntimeEligible(row) ? 1 : 0), 0);

  let analyses = 0;
  let analysesResumed = 0;
  let rejectedAnalyses = 0;
  let anchorsAddedThisRun = 0;
  let processedPronunciations = 0;
  const analysisStartedAt = Date.now();

  console.error(
    `[entity-pronunciation] phase 2/3 · ${eligiblePronunciationCount.toLocaleString()} eligible pronunciations`
    + ` · checkpoint every ${CHECKPOINT_EVERY.toLocaleString()}`,
  );

  entityDb.exec('BEGIN');
  try {
    for (const pronunciation of pronunciations) {
      if (!entityPronunciationRuntimeEligible(pronunciation)) continue;
      processedPronunciations += 1;

      if (hasAnalysis.get(pronunciation.pronunciation_id, ENTITY_RUNTIME_ANALYZER)) {
        analyses += 1;
        analysesResumed += 1;
      } else {
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
            anchorsAddedThisRun += Number(info.changes || 0);
          }
        } catch {
          rejectedAnalyses += 1;
        }
      }

      if (
        processedPronunciations % PROGRESS_EVERY === 0
        || processedPronunciations === eligiblePronunciationCount
      ) {
        progressLine(
          'pronunciation:phonetics',
          processedPronunciations,
          eligiblePronunciationCount,
          analysisStartedAt,
          [
            `analyses ${analyses.toLocaleString()}`,
            `resumed ${analysesResumed.toLocaleString()}`,
            `rejected ${rejectedAnalyses.toLocaleString()}`,
            `new anchors ${anchorsAddedThisRun.toLocaleString()}`,
          ],
        );
      }

      if (
        processedPronunciations % CHECKPOINT_EVERY === 0
        && processedPronunciations < eligiblePronunciationCount
      ) {
        upsertMeta(entityDb, 'entity_pronunciation_build_state', 'analysis_in_progress');
        upsertMeta(entityDb, 'entity_phonetic_analysis_checkpoint', processedPronunciations);
        entityDb.exec('COMMIT');
        await yieldToSignals();
        entityDb.exec('BEGIN');
      } else if (processedPronunciations % PROGRESS_EVERY === 0) {
        await yieldToSignals();
      }
    }

    upsertMeta(entityDb, 'entity_phonetic_analysis_checkpoint', processedPronunciations);
    entityDb.exec('COMMIT');
  } catch (error) {
    try { entityDb.exec('ROLLBACK'); } catch {}
    throw error;
  }

  const totalAnalyses = Number(entityDb.prepare(`
    SELECT COUNT(*) AS c FROM entity_phonetic_analysis WHERE analyzer_id=?
  `).get(ENTITY_RUNTIME_ANALYZER).c || 0);
  const anchors = Number(entityDb.prepare(`
    SELECT COUNT(*) AS c FROM entity_rhyme_anchor WHERE analyzer_id=?
  `).get(ENTITY_RUNTIME_ANALYZER).c || 0);

  upsertMeta(entityDb, 'entity_pronunciation_policy', ENTITY_PRONUNCIATION_POLICY);
  upsertMeta(entityDb, 'entity_phonetic_runtime', ENTITY_PHONETIC_RUNTIME);
  upsertMeta(entityDb, 'entity_phonetic_analyzer', ENTITY_RUNTIME_ANALYZER);
  upsertMeta(entityDb, 'entity_pronunciation_names_considered', nameRows.length);
  upsertMeta(entityDb, 'entity_pronunciation_composed', composedTotal);
  upsertMeta(entityDb, 'entity_phonetic_analyses', totalAnalyses);
  upsertMeta(entityDb, 'entity_rhyme_anchors', anchors);
  upsertMeta(entityDb, 'entity_pronunciation_build_state', 'fingerprint_in_progress');

  console.error('[entity-pronunciation] phase 3/3 · computing deterministic runtime fingerprint');
  const fingerprint = await runtimeFingerprint(entityDb);
    upsertMeta(entityDb, 'entity_phonetic_runtime_fingerprint', fingerprint);
    upsertMeta(entityDb, 'entity_pronunciation_build_state', 'complete');
    entityDb.exec('ANALYZE; PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE);');

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
      eligible_names_final: eligibleNamesFinal,
      existing_eligible_pronunciations: sourceBackedTotal,
      composed_from_writer_v5: composedTotal,
      composed_this_run: composed,
      unresolved_names: unresolvedFinal,
      resolved_name_pct: nameRows.length
        ? Math.round(eligibleNamesFinal * 10000 / nameRows.length) / 100
        : 0,
      eligible_pronunciations: eligiblePronunciationCount,
      phonetic_analyses: totalAnalyses,
      analyses_resumed: analysesResumed,
      rejected_analyses: rejectedAnalyses,
      rhyme_anchors: anchors,
      anchors_added_this_run: anchorsAddedThisRun,
      checkpoint_every: CHECKPOINT_EVERY,
      progress_every: PROGRESS_EVERY,
      resumable_checkpoints: true,
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
