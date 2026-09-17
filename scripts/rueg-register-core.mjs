import { createHash } from 'node:crypto';

export const RUEG_REGISTER_SCHEMA = 'rhymelab-rueg-register-units-v1';
export const RUEG_DIPL_MATCH_POLICY = 'rueg-dakoda-dipl-exact-token-sequence-v1';
export const RUEG_NORM_MATCH_POLICY = 'rueg-dakoda-norm-exact-token-sequence-v1';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function attrs(value) {
  const out = {};
  for (const match of String(value ?? '').matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gsu)) {
    out[match[1]] = decodeXml(match[3]);
  }
  return out;
}

function cleanEventText(value) {
  return decodeXml(String(value ?? '').replace(/<[^>]+>/gu, ' '))
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tierRole(attributes) {
  const category = String(attributes.category || '').trim().toLocaleLowerCase('en-US');
  const display = String(attributes['display-name'] || attributes.id || '').trim().toLocaleLowerCase('en-US');
  if (category === 'dipl' || /\[dipl\]|\bdipl\b/u.test(display)) return 'dipl';
  if (category === 'norm' || /\[norm\]|\bnorm\b/u.test(display)) return 'norm';
  if (category === 'language' || /\[language\]|\blanguage\b/u.test(display)) return 'language';
  if (category === 'cu' || /\[cu\]|\bcu\b/u.test(display)) return 'cu';
  return null;
}

function parseEvents(body, timeline) {
  const events = [];
  for (const match of String(body ?? '').matchAll(/<event\b([^>]*)>([\s\S]*?)<\/event>/giu)) {
    const attributes = attrs(match[1]);
    if (!attributes.start || !attributes.end) continue;
    const start = timeline.get(attributes.start);
    const end = timeline.get(attributes.end);
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    events.push({
      startId: attributes.start,
      endId: attributes.end,
      start,
      end,
      text: cleanEventText(match[2]),
    });
  }
  return events.sort((a, b) => a.start - b.start || a.end - b.end);
}

function eventsInSpan(events, span) {
  return events.filter((event) => event.start < span.end && event.end > span.start);
}

function joinEvents(events) {
  return events.map((event) => event.text).filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();
}

function normalizedLanguage(value) {
  const raw = String(value || '').trim().toLocaleLowerCase('en-US');
  if (!raw) return [];
  return raw.split(/[\s,;+|/]+/u).map((item) => item.trim()).filter(Boolean);
}

function languageSummary(languageEvents) {
  const values = [];
  let german = 0;
  let labelled = 0;
  for (const event of languageEvents) {
    const eventValues = normalizedLanguage(event.text);
    if (!eventValues.length) continue;
    labelled += 1;
    for (const value of eventValues) values.push(value);
    if (eventValues.some((value) => ['deu', 'ger', 'de', 'deutsch'].includes(value))) german += 1;
  }
  return {
    values: [...new Set(values)].sort(),
    germanTokenRatio: labelled ? german / labelled : null,
    labelledTokens: labelled,
  };
}

export function inferRuegRegisterFromId(value) {
  const id = String(value || '');
  const match = id.match(/_(fs|fw|is|iw)[A-Za-z]?\b/iu);
  if (!match) return { formality: null, mode: null, registerCode: null };
  const code = match[1].toLocaleLowerCase('en-US');
  return {
    formality: code[0] === 'i' ? 'informal' : 'formal',
    mode: code[1] === 's' ? 'spoken' : 'written',
    registerCode: code,
  };
}

export function parseRuegExb(xml, { sourceRecordId = 'unknown' } = {}) {
  const timeline = new Map();
  let order = 0;
  for (const match of String(xml ?? '').matchAll(/<tli\b([^>]*)\/?\s*>/giu)) {
    const attributes = attrs(match[1]);
    if (!attributes.id || timeline.has(attributes.id)) continue;
    timeline.set(attributes.id, order++);
  }
  if (!timeline.size) throw new Error(`RUEG EXB ${sourceRecordId} has no common-timeline`);

  const tiers = new Map();
  for (const match of String(xml ?? '').matchAll(/<tier\b([^>]*)>([\s\S]*?)<\/tier>/giu)) {
    const attributes = attrs(match[1]);
    const role = tierRole(attributes);
    if (!role || tiers.has(role)) continue;
    tiers.set(role, { attributes, events: parseEvents(match[2], timeline) });
  }
  const dipl = tiers.get('dipl')?.events || [];
  const norm = tiers.get('norm')?.events || [];
  const language = tiers.get('language')?.events || [];
  const cu = tiers.get('cu')?.events || [];
  if (!dipl.length) throw new Error(`RUEG EXB ${sourceRecordId} has no dipl tier`);

  const spans = cu.length
    ? cu.map((event, index) => ({ start: event.start, end: event.end, index, fallback: false }))
    : [{ start: Math.min(...dipl.map((event) => event.start)), end: Math.max(...dipl.map((event) => event.end)), index: 0, fallback: true }];

  const inferred = inferRuegRegisterFromId(sourceRecordId);
  return spans.map((span) => {
    const diplEvents = eventsInSpan(dipl, span);
    const normEvents = eventsInSpan(norm, span);
    const languageEvents = eventsInSpan(language, span);
    const languages = languageSummary(languageEvents);
    return {
      unitIndex: span.index,
      diplText: joinEvents(diplEvents),
      normText: joinEvents(normEvents),
      languageValues: languages.values,
      germanTokenRatio: languages.germanTokenRatio,
      labelledLanguageTokens: languages.labelledTokens,
      formality: inferred.formality,
      mode: inferred.mode,
      registerCode: inferred.registerCode,
      cuFallback: span.fallback,
      timelineStart: span.start,
      timelineEnd: span.end,
    };
  }).filter((unit) => unit.diplText || unit.normText);
}

export function createRuegRegisterStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS phrase_register_unit(
      unit_id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES phrase_snapshot(snapshot_id),
      source_record_id TEXT NOT NULL,
      subcorpus TEXT NOT NULL,
      unit_index INTEGER NOT NULL,
      mode TEXT,
      formality TEXT,
      age_group TEXT,
      speaker_profile TEXT,
      dipl_text TEXT NOT NULL,
      norm_text TEXT NOT NULL,
      language_values_json TEXT NOT NULL DEFAULT '[]',
      german_token_ratio REAL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(snapshot_id, source_record_id, unit_index)
    );
    CREATE INDEX IF NOT EXISTS idx_phrase_register_unit_source
      ON phrase_register_unit(snapshot_id,subcorpus,formality,mode);
    CREATE INDEX IF NOT EXISTS idx_phrase_register_unit_dipl
      ON phrase_register_unit(dipl_text);
    CREATE INDEX IF NOT EXISTS idx_phrase_register_unit_norm
      ON phrase_register_unit(norm_text);

    CREATE TABLE IF NOT EXISTS phrase_register_unit_match(
      phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id),
      unit_id TEXT NOT NULL REFERENCES phrase_register_unit(unit_id) ON DELETE CASCADE,
      policy TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL,
      PRIMARY KEY(phrase_id,unit_id,policy)
    );
    CREATE INDEX IF NOT EXISTS idx_phrase_register_unit_match_phrase
      ON phrase_register_unit_match(phrase_id,policy);
  `);
}

export function registerUnitId({ snapshotId, sourceRecordId, unitIndex }) {
  return `register-unit:${sha256(JSON.stringify([snapshotId, sourceRecordId, unitIndex])).slice(0, 24)}`;
}

export function insertRuegRegisterUnit(db, {
  snapshotId,
  sourceRecordId,
  subcorpus,
  unit,
  metadata = {},
  speakerProfile = null,
}) {
  const unitId = registerUnitId({ snapshotId, sourceRecordId, unitIndex: unit.unitIndex });
  db.prepare(`
    INSERT INTO phrase_register_unit(
      unit_id,snapshot_id,source_record_id,subcorpus,unit_index,mode,formality,age_group,
      speaker_profile,dipl_text,norm_text,language_values_json,german_token_ratio,metadata_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(unit_id) DO UPDATE SET
      mode=excluded.mode,formality=excluded.formality,age_group=excluded.age_group,
      speaker_profile=excluded.speaker_profile,dipl_text=excluded.dipl_text,norm_text=excluded.norm_text,
      language_values_json=excluded.language_values_json,german_token_ratio=excluded.german_token_ratio,
      metadata_json=excluded.metadata_json
  `).run(
    unitId,
    snapshotId,
    sourceRecordId,
    subcorpus,
    unit.unitIndex,
    metadata.mode || unit.mode || null,
    metadata.formality || unit.formality || null,
    metadata.age_group || metadata.ageGroup || metadata['speaker-age-group'] || null,
    speakerProfile,
    unit.diplText || '',
    unit.normText || '',
    JSON.stringify(unit.languageValues || []),
    unit.germanTokenRatio,
    JSON.stringify({ ...metadata, register_code: unit.registerCode, cu_fallback: unit.cuFallback }),
  );
  return unitId;
}

export function writeUnitPhraseMatches(db, { unitId, policy, counts }) {
  const insert = db.prepare(`
    INSERT INTO phrase_register_unit_match(phrase_id,unit_id,policy,occurrence_count)
    VALUES(?,?,?,?)
    ON CONFLICT(phrase_id,unit_id,policy) DO UPDATE SET occurrence_count=excluded.occurrence_count
  `);
  let rows = 0;
  for (const [phraseId, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (Number(count) <= 0) continue;
    insert.run(phraseId, unitId, policy, Number(count));
    rows += 1;
  }
  return rows;
}

export function computeRuegUnitFingerprint(db) {
  const units = db.prepare(`
    SELECT unit_id,snapshot_id,source_record_id,subcorpus,unit_index,mode,formality,age_group,
      speaker_profile,dipl_text,norm_text,language_values_json,german_token_ratio,metadata_json
    FROM phrase_register_unit ORDER BY unit_id
  `).all();
  const matches = db.prepare(`
    SELECT phrase_id,unit_id,policy,occurrence_count
    FROM phrase_register_unit_match ORDER BY phrase_id,unit_id,policy
  `).all();
  return sha256(JSON.stringify({ units, matches }));
}
