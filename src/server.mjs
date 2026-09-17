import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findRhymes, getStats, getWord, openRhymeDb, searchWords } from './local-engine.mjs';
import { DEFAULT_WRITER_DB_PATH, openWriterDb } from './experimental-writer-db.mjs';
import { findWriterRhymes } from './writer-search.mjs';
import { loadBenchmarkState, saveBenchmarkReview } from './benchmark-store.mjs';

const host = process.env.RHYMELAB_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.RHYMELAB_PORT || '3030', 10);
const legacyDbPath = resolve(process.env.RHYMELAB_LEGACY_DB || process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');
const writerDbPath = resolve(process.env.RHYMELAB_WRITER_DB || DEFAULT_WRITER_DB_PATH);
const uiDir = resolve('src/ui');
const benchmarkUiDir = resolve('src/benchmark-ui');

let legacyDb;
let writerDb;
try {
  legacyDb = openRhymeDb(legacyDbPath);
  writerDb = openWriterDb(writerDbPath);
} catch (error) {
  try { legacyDb?.close(); } catch {}
  try { writerDb?.close(); } catch {}
  console.error('Cannot open local RhymeLab runtime databases.');
  console.error(`Legacy/control DB: ${legacyDbPath}`);
  console.error(`Writer DB: ${writerDbPath}`);
  console.error('The normal Writer UI requires the accepted materialized v5 database.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const benchmarkHtml = readFileSync(resolve(benchmarkUiDir, 'index.html'));
const assets = {
  '/': { type: 'text/html; charset=utf-8', body: readFileSync(resolve(uiDir, 'index.html')) },
  '/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(uiDir, 'styles.css')) },
  '/assets/mobile.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(uiDir, 'mobile.css')) },
  '/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'app.js')) },
  '/benchmark': { type: 'text/html; charset=utf-8', body: benchmarkHtml },
  '/benchmark/': { type: 'text/html; charset=utf-8', body: benchmarkHtml },
  '/benchmark/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(benchmarkUiDir, 'styles.css')) },
  '/benchmark/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(benchmarkUiDir, 'app.js')) },
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
        writer_database: writerDbPath,
        legacy_database: legacyDbPath,
        writer_runtime: 'materialized-writer-v5-v1',
      });
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
      const useLegacyRanking = url.searchParams.get('ranking') === 'legacy';
      const result = useLegacyRanking
        ? findRhymes(legacyDb, word, options)
        : findWriterRhymes(writerDb, word, options);
      return result ? json(res, result) : json(res, { error: 'Word not found' }, 404);
    }

    return json(res, { error: 'Not found' }, 404);
  } catch (error) {
    return json(res, { error: error instanceof Error ? error.message : String(error) }, 500, req.method === 'GET' && !String(req.url || '').startsWith('/api/benchmark/'));
  }
});

server.listen(port, host, () => {
  console.log(`RhymeLab local: http://${host}:${port}`);
  console.log(`RhymeLab benchmark review: http://${host}:${port}/benchmark`);
  console.log(`Writer SQLite: ${writerDbPath}`);
  console.log(`Legacy/control SQLite: ${legacyDbPath}`);
});

function shutdown() {
  server.close(() => {
    try { writerDb.close(); } catch {}
    try { legacyDb.close(); } catch {}
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
