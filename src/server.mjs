import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { findRhymes, getStats, getWord, openRhymeDb, searchWords } from './local-engine.mjs';
import { DEFAULT_WRITER_DB_PATH, openWriterDb } from './experimental-writer-db.mjs';
import { WRITER_RUNTIME_ID, selectRhymeRuntimeDatabases } from './runtime-db-routing.mjs';
import { findWriterRhymes } from './writer-search.mjs';
import { loadBenchmarkState, saveBenchmarkReview } from './benchmark-store.mjs';
import { getPhraseBrowserStats, getPhraseDetail, openPhraseBrowserDb, searchPhrases } from './phrase-browser-store.mjs';
import { searchUnifiedWriter, unifiedWriterCapabilities } from './unified-writer-search.mjs';
import { materializeRhymePadV14 } from './rhymepad-v14.mjs';
import { DEFAULT_ENTITY_DB_PATH, openEntityWriterDb } from './entity-writer-runtime.mjs';
import {
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  getEnglishWord,
  openEnglishWriterDb,
  readEnglishProductAcceptanceMarker,
} from './english-writer-runtime.mjs';

const host = process.env.RHYMELAB_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.RHYMELAB_PORT || '3030', 10);
const legacyDbPath = resolve(process.env.RHYMELAB_LEGACY_DB || process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');
const writerDbPath = resolve(process.env.RHYMELAB_WRITER_DB || DEFAULT_WRITER_DB_PATH);
const phraseDbPath = resolve(process.env.RHYMELAB_PHRASE_DB || 'data/local/rhymelab-phrases-v1.sqlite');
const entityDbPath = resolve(process.env.RHYMELAB_ENTITY_DB || DEFAULT_ENTITY_DB_PATH);
const englishDbPath = resolve(process.env.RHYMELAB_ENGLISH_DB || DEFAULT_ENGLISH_WRITER_DB_PATH);
const englishMarkerPath = resolve(
  process.env.RHYMELAB_ENGLISH_ACCEPTANCE_MARKER || DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
);
const uiDir = resolve('src/ui');
const padUiDir = resolve('src/pad');
const benchmarkUiDir = resolve('src/benchmark-ui');
const queryPronunciationTestDir = resolve('src/query-pronunciation-test');

let writerDb;
try {
  writerDb = openWriterDb(writerDbPath);
} catch (error) {
  console.error(`Cannot open promoted Writer v5 database at ${writerDbPath}`);
  console.error('Build it with: npm run writer:v5:rebuild');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

let legacyDb = null;
let legacyDbError = null;
try {
  legacyDb = openRhymeDb(legacyDbPath);
} catch (error) {
  legacyDbError = error instanceof Error ? error.message : String(error);
  console.warn(`Legacy/control DB unavailable at ${legacyDbPath}`);
  console.warn('Normal Writer v5 runtime remains available; only ?ranking=legacy is disabled.');
}

let phraseDb = null;
let phraseDbError = null;
try {
  phraseDb = openPhraseBrowserDb(phraseDbPath);
} catch (error) {
  phraseDbError = error instanceof Error ? error.message : String(error);
  console.warn(`Phrase/Mosaic DB unavailable at ${phraseDbPath}`);
  console.warn('Normal Writer runtime remains available; only the Phrase/Mosaic channel is unavailable.');
}

let englishDb = null;
let englishDbError = null;
const englishMarker = readEnglishProductAcceptanceMarker(englishMarkerPath);
if (englishMarker.accepted) {
  try {
    englishDb = openEnglishWriterDb(englishDbPath, {
      requireProductAcceptance: true,
      markerPath: englishMarkerPath,
    });
  } catch (error) {
    englishDbError = error instanceof Error ? error.message : String(error);
    console.warn(`English Writer DB unavailable at ${englishDbPath}`);
    console.warn(englishDbError);
  }
} else {
  englishDbError = englishMarker.reason;
}

let entityDb = null;
let entityDbError = null;
try {
  entityDb = openEntityWriterDb(entityDbPath);
} catch (error) {
  entityDbError = error instanceof Error ? error.message : String(error);
  console.warn(`Entity DB unavailable at ${entityDbPath}`);
  console.warn('Normal Writer runtime remains available; only the Entity rhyme channel is unavailable.');
}

function databaseRevisionPart(db,path){
  if(!db) return null;
  let meta=[];
  try{
    meta=db.prepare('SELECT key,value FROM meta ORDER BY key').all()
      .map((row)=>[String(row.key),String(row.value)]);
  }catch{}
  let file=null;
  try{
    const stat=statSync(path,{bigint:true});
    file={
      size:String(stat.size),
      mtimeNs:String(stat.mtimeNs),
    };
  }catch{}
  return {file,meta};
}

const queryPronunciationRevision=createHash('sha256')
  .update(JSON.stringify({
    writer:databaseRevisionPart(writerDb,writerDbPath),
    english:databaseRevisionPart(englishDb,englishDbPath),
    phrase:databaseRevisionPart(phraseDb,phraseDbPath),
    entity:databaseRevisionPart(entityDb,entityDbPath),
  }))
  .digest('hex');

const writerHtml = readFileSync(resolve(uiDir, 'index.html'));
const padHtml = Buffer.from(materializeRhymePadV14().html);
const benchmarkHtml = readFileSync(resolve(benchmarkUiDir, 'index.html'));
const queryPronunciationTestHtml = readFileSync(resolve(queryPronunciationTestDir, 'index.html'));
const assets = {
  '/': { type: 'text/html; charset=utf-8', body: writerHtml },
  '/pad': { type: 'text/html; charset=utf-8', body: padHtml },
  '/pad/': { type: 'text/html; charset=utf-8', body: padHtml },
  '/pad/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(padUiDir, 'styles.css')) },
  '/pad/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(padUiDir, 'app.js')) },
  '/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(uiDir, 'styles.css')) },
  '/assets/mobile.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(uiDir, 'mobile.css')) },
  '/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'app.js')) },
  '/assets/query-pronunciation-client.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'query-pronunciation-client.mjs')) },
  '/assets/query-pronunciation-cache.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'query-pronunciation-cache.mjs')) },
  '/benchmark': { type: 'text/html; charset=utf-8', body: benchmarkHtml },
  '/benchmark/': { type: 'text/html; charset=utf-8', body: benchmarkHtml },
  '/benchmark/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(benchmarkUiDir, 'styles.css')) },
  '/benchmark/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(benchmarkUiDir, 'app.js')) },
  '/query-pronunciation-test': { type: 'text/html; charset=utf-8', body: queryPronunciationTestHtml },
  '/query-pronunciation-test/': { type: 'text/html; charset=utf-8', body: queryPronunciationTestHtml },
  '/query-pronunciation-test/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(queryPronunciationTestDir, 'app.js')) },
  '/query-pronunciation-test/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(queryPronunciationTestDir, 'styles.css')) },
};

function json(res, data, status = 200, allowCors = true) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  };
  if (allowCors) headers['access-control-allow-origin'] = '*';
  res.writeHead(status, headers);
  res.end(JSON.stringify(data, null, 2));
}

function asset(res, entry) {
  res.writeHead(200, {
    'content-type': entry.type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(entry.body);
}

function clientQueryPronunciation(url, language) {
  const ipa = String(url.searchParams.get(`query_ipa_${language}`) || '').trim();
  if (!ipa) return null;
  let components = null;
  const rawComponents = url.searchParams.get(`query_components_${language}`);
  if (rawComponents) {
    try {
      const parsed = JSON.parse(rawComponents);
      if (Array.isArray(parsed)) components = parsed.slice(0, 64).map(String);
    } catch {}
  }
  return {
    ipa: ipa.slice(0, 4096),
    method: String(url.searchParams.get(`query_method_${language}`) || 'client_unknown').slice(0, 80),
    sourceBacked: url.searchParams.get(`query_source_backed_${language}`) === '1',
    components,
  };
}

async function readJsonBody(req, maxBytes = 32 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw new Error('Request body is required');
  return JSON.parse(raw);
}

function isAllowedLocalWriteOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const localHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
    return localHost && (!parsed.port || parsed.port === String(port));
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === 'GET' && assets[url.pathname]) return asset(res, assets[url.pathname]);

    if (url.pathname === '/api/benchmark/review') {
      if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405, false);
      if (!isAllowedLocalWriteOrigin(req)) return json(res, { error: 'Benchmark writes are localhost-only' }, 403, false);
      const body = await readJsonBody(req);
      const saved = await saveBenchmarkReview(body);
      const state = await loadBenchmarkState();
      return json(res, { saved, summary: state.summary, next_task: state.next_task }, 200, false);
    }

    if (req.method !== 'GET') return json(res, { error: 'Method not allowed' }, 405);

    if (url.pathname === '/api/benchmark/state') {
      try {
        return json(res, await loadBenchmarkState(), 200, false);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const missing = message.includes('ENOENT');
        return json(res, {
          error: missing ? 'Benchmark queue not prepared. Run: npm run benchmark:prepare' : message,
        }, missing ? 404 : 500, false);
      }
    }

    if (url.pathname === '/api/health') {
      return json(res, {
        status: 'ok',
        mode: 'local',
        package_runtime: 'writer-v5-default',
        writer_database: writerDbPath,
        writer_runtime: WRITER_RUNTIME_ID,
        legacy_database: legacyDb ? legacyDbPath : null,
        legacy_available: Boolean(legacyDb),
        legacy_error: legacyDb ? null : legacyDbError,
        phrase_database: phraseDb ? phraseDbPath : null,
        phrase_available: Boolean(phraseDb),
        phrase_error: phraseDb ? null : phraseDbError,
        entity_database: entityDb ? entityDbPath : null,
        entity_available: Boolean(entityDb),
        entity_error: entityDb ? null : entityDbError,
        english_database: englishDb ? englishDbPath : null,
        english_available: Boolean(englishDb),
        english_error: englishDb ? null : englishDbError,
        english_acceptance_marker: englishMarker.accepted ? englishMarkerPath : null,
        query_pronunciation_revision: queryPronunciationRevision,
        query_pronunciation_cache: {
          schema: 'rhymelab-query-pronunciation-cache-v1',
          revision: queryPronunciationRevision,
          revalidation: 'health_revision_once_per_app_session',
        },
        unified_writer: unifiedWriterCapabilities({
          writerDb,
          englishDb,
          phraseDb,
          entityDb,
        }),
      });
    }

    if (url.pathname === '/api/writer') {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return json(res, { error: 'q is required' }, 400);
      const result = searchUnifiedWriter(
        { writerDb, englishDb, phraseDb, entityDb },
        q,
        {
          language: url.searchParams.get('language') || 'de',
          resultLanguage: url.searchParams.get('result_language') || url.searchParams.get('results_language') || null,
          scope: url.searchParams.get('scope') || 'all',
          type: url.searchParams.get('type') || 'all',
          includeVariants: url.searchParams.get('variants') === 'all',
          includeHistorical: url.searchParams.get('historical') === 'all',
          wordLimit: url.searchParams.get('word_limit') || url.searchParams.get('limit'),
          wordPoolLimit: url.searchParams.get('word_pool') || url.searchParams.get('pool'),
          phraseLimit: url.searchParams.get('phrase_limit') || url.searchParams.get('limit'),
          phrasePoolLimit: url.searchParams.get('phrase_pool'),
          phrasePerChannelLimit: url.searchParams.get('phrase_per_channel'),
          entityLimit: url.searchParams.get('entity_limit') || url.searchParams.get('limit'),
          entityPoolLimit: url.searchParams.get('entity_pool'),
          entityCategory: url.searchParams.get('entity_category') || 'all',
          queryPronunciations: {
            de: clientQueryPronunciation(url, 'de'),
            en: clientQueryPronunciation(url, 'en'),
          },
        },
      );
      const status = result.status === 'language_unavailable'
        ? 503
        : result.status === 'query_not_found'
          ? 404
          : 200;
      return json(res, result, status);
    }

    if (url.pathname === '/api/phrases/stats') {
      if (!phraseDb) return json(res, { error: 'Phrase database unavailable. Run: npm run phrase:catalog:bootstrap' }, 503);
      return json(res, getPhraseBrowserStats(phraseDb));
    }

    if (url.pathname === '/api/phrases/search') {
      if (!phraseDb) return json(res, { error: 'Phrase database unavailable. Run: npm run phrase:catalog:bootstrap' }, 503);
      return json(res, {
        results: searchPhrases(phraseDb, {
          q: url.searchParams.get('q') || '',
          type: url.searchParams.get('type') || 'all',
          historical: url.searchParams.get('historical') === 'all',
          evidence: url.searchParams.get('evidence') || 'all',
          limit: url.searchParams.get('limit'),
        }),
      });
    }

    if (url.pathname === '/api/phrases/detail') {
      if (!phraseDb) return json(res, { error: 'Phrase database unavailable. Run: npm run phrase:catalog:bootstrap' }, 503);
      const result = getPhraseDetail(phraseDb, url.searchParams.get('id') || '');
      return result ? json(res, result) : json(res, { error: 'Phrase not found' }, 404);
    }

    if (url.pathname === '/api/stats') return json(res, getStats(writerDb));

    if (url.pathname === '/api/search') {
      return json(res, {
        results: searchWords(
          writerDb,
          url.searchParams.get('q') || '',
          url.searchParams.get('limit'),
          { includeHistorical: url.searchParams.get('historical') === 'all' },
        ),
      });
    }

    if (url.pathname.startsWith('/api/word/')) {
      const word = decodeURIComponent(url.pathname.slice('/api/word/'.length));
      const language = String(url.searchParams.get('language') || 'de')
        .trim().toLocaleLowerCase('en-US');
      if (language === 'en') {
        if (!englishDb) {
          return json(res, {
            error: 'English Writer runtime is not accepted/enabled locally.',
            reason: englishDbError,
          }, 503);
        }
        const result = getEnglishWord(englishDb, word);
        return result ? json(res, result) : json(res, { error: 'Word not found' }, 404);
      }
      const result = getWord(writerDb, word);
      return result ? json(res, result) : json(res, { error: 'Word not found' }, 404);
    }

    if (url.pathname.startsWith('/api/rhymes/')) {
      const word = decodeURIComponent(url.pathname.slice('/api/rhymes/'.length));
      const options = {
        limit: url.searchParams.get('limit'),
        poolLimit: url.searchParams.get('pool'),
        includeVariants: url.searchParams.get('variants') === 'all',
        includeHistorical: url.searchParams.get('historical') === 'all',
        type: url.searchParams.get('type') || 'all',
        ensureTypeCoverage: url.searchParams.get('coverage') === 'balanced',
        coverageFloor: url.searchParams.get('coverage_floor'),
      };
      const runtime = selectRhymeRuntimeDatabases({ writerDb, legacyDb }, url.searchParams);
      const result = runtime.mode === 'legacy'
        ? findRhymes(runtime.database, word, options)
        : findWriterRhymes(runtime.database, word, options);
      return result ? json(res, result) : json(res, { error: 'Word not found' }, 404);
    }

    return json(res, { error: 'Not found' }, 404);
  } catch (error) {
    return json(res, { error: error instanceof Error ? error.message : String(error) }, 500, req.method === 'GET' && !String(req.url || '').startsWith('/api/benchmark/'));
  }
});

server.listen(port, host, () => {
  console.log(`RhymeLab local: http://${host}:${port}`);
  console.log(`RhymePad workspace: http://${host}:${port}/pad`);
  console.log(`RhymeLab benchmark review: http://${host}:${port}/benchmark`);
  console.log(`Writer v5 SQLite: ${writerDbPath}`);
  console.log(`Writer runtime: ${WRITER_RUNTIME_ID}`);
  console.log(`Legacy/control SQLite: ${legacyDb ? legacyDbPath : 'unavailable'}`);
  console.log(`Unified Writer: http://${host}:${port}`);
  console.log(`Phrase/Mosaic SQLite: ${phraseDb ? phraseDbPath : 'unavailable'}`);
  console.log(`Entity SQLite: ${entityDb ? entityDbPath : 'unavailable'}`);
  console.log(`English Writer SQLite: ${englishDb ? englishDbPath : 'gated/unavailable'}`);
  console.log(`English product acceptance: ${englishMarker.accepted ? 'accepted' : englishDbError}`);
});

function shutdown() {
  server.close(() => {
    try { writerDb.close(); } catch {}
    try { legacyDb?.close(); } catch {}
    try { phraseDb?.close(); } catch {}
    try { entityDb?.close(); } catch {}
    try { englishDb?.close(); } catch {}
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
