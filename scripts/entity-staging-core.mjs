import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { basename, resolve } from 'node:path';
import { availableParallelism } from 'node:os';
import { classifyEntity, normalizeEntityName } from './entity-lexicon-core.mjs';

export const ENTITY_STAGE_SCHEMA = 'rhymelab-entity-stage-v1';
export const ENTITY_STAGE_POLICY = 'wikidata-cultural-stage-v1';
export const QRANK_STAGE_SCHEMA = 'rhymelab-qrank-stage-v1';
export const ENTITY_CUT_DIAGNOSTIC_POLICY = 'qrank-category-relative-cut-v1';

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function rawClaimValues(item, propertyId) {
  const rows = Array.isArray(item?.claims?.[propertyId]) ? item.claims[propertyId] : [];
  return rows.map((row) => {
    if (typeof row === 'string' || typeof row === 'number') return String(row);
    const value = row?.mainsnak?.datavalue?.value;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (value && typeof value === 'object') {
      if (typeof value.id === 'string') return value.id;
      if (typeof value.text === 'string') return value.text;
    }
    return '';
  }).filter(Boolean);
}

function wikipediaSitelinkCount(item) {
  return Object.keys(item?.sitelinks || {}).filter((key) =>
    /^[a-z0-9_-]+wiki$/iu.test(key) && !/^(?:commonswiki|specieswiki)$/iu.test(key)
  ).length;
}

function selectedNames(item, taxonomy) {
  const languages = taxonomy.retained_name_languages || ['de', 'en'];
  const seen = new Set();
  const rows = [];

  const add = (surface, language, kind, preferred) => {
    const clean = cleanText(surface);
    if (!clean) return;
    const normalized = normalizeEntityName(clean);
    const key = `${language}\u001f${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      surface: clean,
      normalized,
      language,
      nameKind: kind,
      preferred: preferred ? 1 : 0,
    });
  };

  for (const language of languages) {
    const label = item?.labels?.[language]?.value;
    if (label) add(label, language, 'label', true);
    for (const alias of item?.aliases?.[language] || []) add(alias?.value, language, 'alias', false);
  }

  return rows.sort((a, b) =>
    b.preferred - a.preferred
    || a.language.localeCompare(b.language, 'en')
    || a.normalized.localeCompare(b.normalized, 'en')
    || a.surface.localeCompare(b.surface, 'en')
  );
}

function selectedExternalIds(item, taxonomy) {
  const rows = [];
  const seen = new Set();
  for (const [propertyId, system] of Object.entries(taxonomy.external_id_whitelist || {})) {
    for (const value of rawClaimValues(item, propertyId)) {
      if (!value || /^Q\d+$/u.test(value)) continue;
      const clean = cleanText(value);
      if (!clean) continue;
      const key = `${system}\u001f${clean}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ propertyId, system, value: clean });
    }
  }
  return rows.sort((a, b) =>
    a.system.localeCompare(b.system, 'en') || a.value.localeCompare(b.value, 'en')
  );
}

export function extractStageEntity(item, taxonomy) {
  if (!item || item.type && item.type !== 'item') return null;
  if (!/^Q\d+$/u.test(String(item.id || ''))) return null;

  const categories = classifyEntity(item, taxonomy);
  if (!categories.length) return null;

  const names = selectedNames(item, taxonomy);
  if (!names.length) return null;

  const externalIds = selectedExternalIds(item, taxonomy);
  const claims = Object.values(item.claims || {});
  const statementCount = claims.reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0,
  );

  return {
    qid: String(item.id),
    primaryCategory: categories[0].category,
    descriptionDe: cleanText(item?.descriptions?.de?.value) || null,
    descriptionEn: cleanText(item?.descriptions?.en?.value) || null,
    sitelinkCount: wikipediaSitelinkCount(item),
    hasDewiki: Object.hasOwn(item.sitelinks || {}, 'dewiki') ? 1 : 0,
    hasEnwiki: Object.hasOwn(item.sitelinks || {}, 'enwiki') ? 1 : 0,
    statementCount,
    externalIdCount: externalIds.length,
    categories,
    names,
    externalIds,
  };
}

export function createTaxonomyRawPrefilter(taxonomy) {
  const qids = [...new Set(
    (taxonomy?.categories || [])
      .flatMap((category) => category.match_any || [])
      .flatMap((rule) => rule.qids || [])
      .map((qid) => String(qid))
      .filter((qid) => /^Q\d+$/u.test(qid)),
  )].sort((a, b) => a.localeCompare(b, 'en'));

  if (!qids.length) {
    return { qids, test: () => true };
  }

  const regex = new RegExp('"(?:' + qids.join('|') + ')"', 'u');
  return {
    qids,
    test: (line) => regex.test(String(line ?? '')),
  };
}

export function parseWikidataDumpLine(line) {
  let raw = String(line ?? '').trim();
  if (!raw || raw === '[' || raw === ']') return null;
  if (raw.endsWith(',')) raw = raw.slice(0, -1).trimEnd();
  if (!raw) return null;
  return JSON.parse(raw);
}

function commandExists(command) {
  if (existsSync(command)) return true;
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [command], { stdio: 'ignore' })
    : spawnSync('sh', ['-lc', `command -v "${command}" >/dev/null 2>&1`], { stdio: 'ignore' });
  return probe.status === 0;
}

function windows7ZipCandidates() {
  const values = [
    process.env.ProgramFiles && resolve(process.env.ProgramFiles, '7-Zip', '7z.exe'),
    process.env['ProgramFiles(x86)'] && resolve(process.env['ProgramFiles(x86)'], '7-Zip', '7z.exe'),
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ];
  return [...new Set(values.filter(Boolean))];
}

function is7ZipCommand(command) {
  return /^(?:7z|7zz)(?:\.exe)?$/iu.test(basename(String(command)));
}

function wslLbzip2Command(path) {
  if (process.platform !== 'win32' || !commandExists('wsl.exe')) return null;

  const probe = spawnSync(
    'wsl.exe',
    ['--exec', 'sh', '-lc', 'command -v lbzip2 >/dev/null 2>&1'],
    { stdio: 'ignore', windowsHide: true },
  );
  if (probe.status !== 0) return null;

  const pathProbe = spawnSync(
    'wsl.exe',
    ['--exec', 'wslpath', '-a', path],
    { encoding: 'utf8', windowsHide: true },
  );
  if (pathProbe.status !== 0) return null;

  const wslPath = String(pathProbe.stdout || '').trim();
  if (!wslPath) return null;

  const configuredThreads = Number.parseInt(
    process.env.RHYMELAB_LBZIP2_THREADS || '',
    10,
  );
  const defaultThreads = Math.max(2, Math.min(8, availableParallelism()));
  const threads = Math.max(
    2,
    Math.min(32, Number.isFinite(configuredThreads) && configuredThreads > 0
      ? configuredThreads
      : defaultThreads),
  );

  return {
    command: 'wsl.exe',
    args: ['--exec', 'lbzip2', '-dc', '-n', String(threads), wslPath],
    label: `wsl:lbzip2:${threads}t`,
  };
}

function bz2Command(path) {
  const explicit = String(process.env.RHYMELAB_BZIP2_CMD || '').trim();
  if (explicit) {
    if (!commandExists(explicit)) {
      throw new Error(`RHYMELAB_BZIP2_CMD does not exist or is not executable: ${explicit}`);
    }
    if (is7ZipCommand(explicit)) return { command: explicit, args: ['x', '-so', '-mmt=on', '-bsp2', '-bb0', path] };
    return { command: explicit, args: ['-dc', path] };
  }

  const candidates = process.platform === 'win32'
    ? [
      wslLbzip2Command(path),
      { command: '7z', args: ['x', '-so', '-mmt=on', '-bsp2', '-bb0', path] },
      { command: '7z.exe', args: ['x', '-so', '-mmt=on', '-bsp2', '-bb0', path] },
      { command: '7zz', args: ['x', '-so', '-mmt=on', '-bsp2', '-bb0', path] },
      { command: 'bzip2', args: ['-dc', path] },
      ...windows7ZipCandidates().map((command) => ({ command, args: ['x', '-so', '-mmt=on', '-bsp2', '-bb0', path] })),
    ]
    : [
      { command: 'lbzip2', args: ['-dc', path] },
      { command: 'bzip2', args: ['-dc', path] },
      { command: '7zz', args: ['x', '-so', '-mmt=on', '-bsp2', '-bb0', path] },
      { command: '7z', args: ['x', '-so', '-mmt=on', '-bsp2', '-bb0', path] },
    ];

  return candidates.find((candidate) => candidate && commandExists(candidate.command)) || null;
}

export function openTextLines(path) {
  if (path === '-') {
    return {
      lines: readline.createInterface({ input: process.stdin, crlfDelay: Infinity }),
      done: Promise.resolve(),
      decompressor: 'stdin',
    };
  }

  if (path.endsWith('.gz')) {
    const input = createReadStream(path).pipe(createGunzip());
    return {
      lines: readline.createInterface({ input, crlfDelay: Infinity }),
      done: Promise.resolve(),
      decompressor: 'node:gzip',
    };
  }

  if (path.endsWith('.bz2')) {
    const selected = bz2Command(path);
    if (!selected) {
      throw new Error(
        'Cannot stream .bz2: install 7-Zip (winget install --id 7zip.7zip -e), '
        + 'bzip2/lbzip2 or set RHYMELAB_BZIP2_CMD to the executable path. '
        + 'The importer deliberately does not require an uncompressed Wikidata copy.',
      );
    }
    const child = spawn(selected.command, selected.args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true,
    });
    const done = new Promise((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0) resolvePromise();
        else reject(new Error(
          `Wikidata decompressor failed: ${selected.command} exit=${code} signal=${signal || ''}`,
        ));
      });
    });
    return {
      lines: readline.createInterface({ input: child.stdout, crlfDelay: Infinity }),
      done,
      decompressor: selected.label || selected.command,
    };
  }

  return {
    lines: readline.createInterface({ input: createReadStream(path), crlfDelay: Infinity }),
    done: Promise.resolve(),
    decompressor: 'none',
  };
}

export const CREATE_ENTITY_STAGE_SQL = `
CREATE TABLE meta(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE entity_stage(
  qid TEXT PRIMARY KEY,
  primary_category TEXT NOT NULL,
  description_de TEXT,
  description_en TEXT,
  wikipedia_sitelink_count INTEGER NOT NULL,
  has_dewiki INTEGER NOT NULL CHECK(has_dewiki IN (0,1)),
  has_enwiki INTEGER NOT NULL CHECK(has_enwiki IN (0,1)),
  statement_count INTEGER NOT NULL,
  external_id_count INTEGER NOT NULL,
  qrank INTEGER,
  source_ordinal INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE entity_stage_category(
  qid TEXT NOT NULL REFERENCES entity_stage(qid),
  category TEXT NOT NULL,
  priority INTEGER NOT NULL,
  retention_percentile_floor REAL NOT NULL,
  PRIMARY KEY(qid, category)
) WITHOUT ROWID;

CREATE TABLE entity_stage_name(
  qid TEXT NOT NULL REFERENCES entity_stage(qid),
  language TEXT NOT NULL,
  surface TEXT NOT NULL,
  normalized TEXT NOT NULL,
  name_kind TEXT NOT NULL,
  preferred INTEGER NOT NULL CHECK(preferred IN (0,1)),
  PRIMARY KEY(qid, language, normalized)
) WITHOUT ROWID;

CREATE TABLE entity_stage_external_id(
  qid TEXT NOT NULL REFERENCES entity_stage(qid),
  property_id TEXT NOT NULL,
  system TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY(qid, system, value)
) WITHOUT ROWID;

`;

export function createEntityStageStorage(db) {
  db.exec(CREATE_ENTITY_STAGE_SQL);
}

export function finalizeEntityStageStorage(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_entity_stage_category_category
      ON entity_stage_category(category, qid);
    CREATE INDEX IF NOT EXISTS idx_entity_stage_name_normalized
      ON entity_stage_name(normalized, language, qid);
    ANALYZE;
  `);
}

const stageWriterCache = new WeakMap();

export function createStageEntityWriter(db) {
  const insertEntity = db.prepare(`
    INSERT INTO entity_stage(
      qid,primary_category,description_de,description_en,wikipedia_sitelink_count,
      has_dewiki,has_enwiki,statement_count,external_id_count,qrank,source_ordinal
    ) VALUES(?,?,?,?,?,?,?,?,?,NULL,?)
  `);
  const insertCategory = db.prepare(`
    INSERT INTO entity_stage_category(
      qid,category,priority,retention_percentile_floor
    ) VALUES(?,?,?,?)
  `);
  const insertName = db.prepare(`
    INSERT INTO entity_stage_name(
      qid,language,surface,normalized,name_kind,preferred
    ) VALUES(?,?,?,?,?,?)
  `);
  const insertExternal = db.prepare(`
    INSERT INTO entity_stage_external_id(qid,property_id,system,value)
    VALUES(?,?,?,?)
  `);

  return (record, sourceOrdinal) => {
    insertEntity.run(
      record.qid,
      record.primaryCategory,
      record.descriptionDe,
      record.descriptionEn,
      record.sitelinkCount,
      record.hasDewiki,
      record.hasEnwiki,
      record.statementCount,
      record.externalIdCount,
      sourceOrdinal,
    );

    for (const category of record.categories) {
      insertCategory.run(
        record.qid,
        category.category,
        category.priority,
        category.retentionPercentileFloor,
      );
    }

    for (const name of record.names) {
      insertName.run(
        record.qid,
        name.language,
        name.surface,
        name.normalized,
        name.nameKind,
        name.preferred,
      );
    }

    for (const external of record.externalIds) {
      insertExternal.run(record.qid, external.propertyId, external.system, external.value);
    }
  };
}

export function writeStageEntity(db, record, sourceOrdinal) {
  let writer = stageWriterCache.get(db);
  if (!writer) {
    writer = createStageEntityWriter(db);
    stageWriterCache.set(db, writer);
  }
  writer(record, sourceOrdinal);
}

export function parseQRankLine(line, lineNumber = 0) {
  const raw = String(line ?? '').trim();
  if (!raw) return null;
  if (lineNumber === 1 && /^Entity\s*,\s*QRank$/iu.test(raw)) return null;
  const comma = raw.indexOf(',');
  if (comma <= 0) return null;
  const qid = raw.slice(0, comma).trim();
  const qrank = Number.parseInt(raw.slice(comma + 1).trim(), 10);
  if (!/^Q\d+$/u.test(qid) || !Number.isSafeInteger(qrank) || qrank < 0) return null;
  return { qid, qrank };
}

export const CREATE_QRANK_STAGE_SQL = `
CREATE TABLE meta(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE qrank_stage(
  qid TEXT NOT NULL,
  qrank INTEGER NOT NULL
);
`;

export function createQRankStageStorage(db) {
  db.exec(CREATE_QRANK_STAGE_SQL);
}

export function finalizeQRankStage(db) {
  db.exec(`
    CREATE UNIQUE INDEX idx_qrank_stage_qid ON qrank_stage(qid);
    CREATE INDEX idx_qrank_stage_rank ON qrank_stage(qrank DESC, qid);
    ANALYZE;
  `);
}

export function qrankStageStats(db) {
  const row = db.prepare(`
    SELECT COUNT(*) AS rows, MAX(qrank) AS max_qrank, MIN(qrank) AS min_qrank
    FROM qrank_stage
  `).get();
  return {
    rows: Number(row.rows || 0),
    maxQRank: row.max_qrank == null ? null : Number(row.max_qrank),
    minQRank: row.min_qrank == null ? null : Number(row.min_qrank),
  };
}

export function attachAndJoinQRank(entityDb, qrankDbPath) {
  const escaped = String(qrankDbPath).replaceAll("'", "''");
  entityDb.exec(`ATTACH DATABASE '${escaped}' AS qrank_db;`);
  try {
    entityDb.exec(`
      UPDATE entity_stage
      SET qrank=(
        SELECT q.qrank
        FROM qrank_db.qrank_stage q
        WHERE q.qid=entity_stage.qid
      )
      WHERE EXISTS (
        SELECT 1
        FROM qrank_db.qrank_stage q
        WHERE q.qid=entity_stage.qid
      );
    `);
  } finally {
    entityDb.exec('DETACH DATABASE qrank_db;');
  }
}

export function stageStats(db) {
  const one = (sql) => Number(Object.values(db.prepare(sql).get())[0]);
  return {
    entities: one('SELECT COUNT(*) AS c FROM entity_stage'),
    categories: one('SELECT COUNT(*) AS c FROM entity_stage_category'),
    names: one('SELECT COUNT(*) AS c FROM entity_stage_name'),
    externalIds: one('SELECT COUNT(*) AS c FROM entity_stage_external_id'),
    withQRank: one('SELECT COUNT(*) AS c FROM entity_stage WHERE qrank IS NOT NULL'),
    withDewiki: one('SELECT COUNT(*) AS c FROM entity_stage WHERE has_dewiki=1'),
    withEnwiki: one('SELECT COUNT(*) AS c FROM entity_stage WHERE has_enwiki=1'),
  };
}

function protectedQids(taxonomy) {
  return new Set((taxonomy.protected_sentinels || []).map((row) => row.qid));
}

export function categoryCutDiagnostics(db, taxonomy) {
  const sentinels = protectedQids(taxonomy);
  const categories = db.prepare(`
    SELECT DISTINCT category
    FROM entity_stage_category
    ORDER BY category
  `).all().map((row) => row.category);

  const output = [];
  for (const category of categories) {
    const rows = db.prepare(`
      SELECT
        e.qid,
        e.qrank,
        e.wikipedia_sitelink_count,
        e.has_dewiki,
        e.has_enwiki,
        e.external_id_count,
        e.statement_count,
        c.retention_percentile_floor
      FROM entity_stage_category c
      JOIN entity_stage e USING(qid)
      WHERE c.category=?
      ORDER BY
        CASE WHEN e.qrank IS NULL THEN 1 ELSE 0 END,
        e.qrank DESC,
        e.wikipedia_sitelink_count DESC,
        (e.has_dewiki + e.has_enwiki) DESC,
        e.external_id_count DESC,
        e.statement_count DESC,
        e.qid
    `).all(category);

    const size = rows.length;
    let kept = 0;
    let tierA = 0;
    let tierB = 0;
    let tierC = 0;
    let qrankCoverage = 0;

    const ranked = rows.map((row, index) => {
      if (row.qrank != null) qrankCoverage += 1;
      const percentile = size <= 1 ? 1 : 1 - index / (size - 1);
      const tier = percentile >= 0.80 ? 'A' : percentile >= 0.35 ? 'B' : 'C';
      const keep = percentile >= Number(row.retention_percentile_floor) || sentinels.has(row.qid);
      if (keep) {
        kept += 1;
        if (tier === 'A') tierA += 1;
        else if (tier === 'B') tierB += 1;
        else tierC += 1;
      }
      return {
        qid: row.qid,
        qrank: row.qrank == null ? null : Number(row.qrank),
        percentile: Math.round(percentile * 1_000_000) / 1_000_000,
        tier,
        keep,
      };
    });

    output.push({
      category,
      candidates: size,
      qrankCoverage,
      qrankCoveragePct: size ? Math.round(qrankCoverage * 10000 / size) / 100 : 0,
      retentionPercentileFloor: size ? Number(rows[0].retention_percentile_floor) : null,
      kept,
      rejected: size - kept,
      keptTierA: tierA,
      keptTierB: tierB,
      keptTierC: tierC,
      top: ranked.slice(0, 5),
      tail: ranked.slice(-5),
    });
  }
  return output;
}

export function sentinelCutChecks(db, taxonomy) {
  const checks = [];
  for (const sentinel of taxonomy.protected_sentinels || []) {
    const entity = db.prepare('SELECT * FROM entity_stage WHERE qid=?').get(sentinel.qid);
    const category = entity
      ? db.prepare('SELECT * FROM entity_stage_category WHERE qid=? AND category=?')
        .get(sentinel.qid, sentinel.required_category)
      : null;
    checks.push({
      qid: sentinel.qid,
      name: sentinel.name,
      structuralCandidate: Boolean(entity),
      requiredCategory: sentinel.required_category,
      categoryPresent: Boolean(category),
      qrank: entity?.qrank == null ? null : Number(entity.qrank),
      pass: Boolean(entity && category),
    });
  }
  return checks;
}
