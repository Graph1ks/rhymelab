import { createHash } from 'node:crypto';
import { tokenizePhrase } from './phrase-catalog-core.mjs';

export const RUEG_REGISTER_SCHEMA = 'rhymelab-rueg-register-v1';
export const RUEG_REGISTER_POLICY = 'rueg-dakoda-exb-source-surface-register-v2';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, '&')
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function stripXml(value) {
  return decodeXml(String(value ?? '').replace(/<[^>]+>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim();
}

function attributes(value) {
  const out = {};
  const input = String(value ?? '');
  const regex = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  for (const match of input.matchAll(regex)) {
    out[match[1]] = decodeXml(match[2] ?? match[3] ?? '');
  }
  return out;
}

function normalizeMetaKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[_\s]+/gu, '-');
}

function normalizeMetaValue(value) {
  return decodeXml(String(value ?? '')).replace(/\s+/gu, ' ').trim();
}

export function parseRuegMeta(text) {
  const raw = String(text ?? '');
  const values = new Map();

  const put = (key, value) => {
    const normalizedKey = normalizeMetaKey(key);
    if (!normalizedKey || value == null) return;
    const flattenedValue = Array.isArray(value)
      ? value.filter((item) => item != null && typeof item !== 'object').join(';')
      : value;
    if (flattenedValue != null && typeof flattenedValue !== 'object') {
      const normalizedValue = normalizeMetaValue(flattenedValue);
      if (normalizedValue && !values.has(normalizedKey)) values.set(normalizedKey, normalizedValue);
    }
  };

  const flattenJson = (value, path = '') => {
    if (value == null) return;
    if (Array.isArray(value)) {
      if (value.every((item) => item == null || typeof item !== 'object')) {
        put(path, value);
      } else {
        for (const item of value) flattenJson(item, path);
      }
      return;
    }
    if (typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        flattenJson(child, path ? path + '.' + key : key);
      }
      return;
    }
    put(path, value);
  };

  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try { flattenJson(JSON.parse(trimmed)); } catch {}
  }

  for (const match of raw.matchAll(/<(?:meta-value|meta|entry|property)\b([^>]*)>([\s\S]*?)<\/(?:meta-value|meta|entry|property)>/giu)) {
    const attrs = attributes(match[1]);
    const key = attrs.key || attrs.name || attrs['attribute-name'] || attrs.id;
    if (key) put(key, stripXml(match[2]));
  }

  for (const match of raw.matchAll(/<ud-information\b([^>]*)>([\s\S]*?)<\/ud-information>/giu)) {
    const attrs = attributes(match[1]);
    const key = attrs['attribute-name'] || attrs.name || attrs.key;
    if (key) put(key, stripXml(match[2]));
  }

  const keyValueXml = /<key>\s*([^<]+?)\s*<\/key>\s*<value>\s*([\s\S]*?)\s*<\/value>/giu;
  for (const match of raw.matchAll(keyValueXml)) put(match[1], stripXml(match[2]));

  for (const line of raw.split(/\r?\n/gu)) {
    const cleaned = line.trim();
    if (!cleaned || cleaned.startsWith('<') || cleaned.startsWith('#')) continue;
    const match = cleaned.match(/^([^=\t:]{2,80})\s*(?:=|\t|:\s)\s*(.+)$/u);
    if (match) put(match[1], match[2]);
  }

  const get = (...keys) => {
    for (const key of keys) {
      const value = values.get(normalizeMetaKey(key));
      if (value && value !== 'notAvailable' && value !== 'notApplicable') return value;
    }
    return null;
  };

  return {
    speakerId: get(
      'speaker-id',
      'learner.learner_id_orig',
      'learner.learner_id',
    ),
    formality: get(
      'formality',
      'task.interaction.task_interaction_formality',
    ),
    mode: get(
      'mode',
      'task.interaction.task_interaction_mode',
    ),
    speakerBilingual: get('speaker-bilingual'),
    ageGroup: get('speaker-age-group'),
    speakerAge: get(
      'speaker-age',
      'learner.sociodemographic.learner_socio_ageProduction',
    ),
    elicitationLanguage: get(
      'elicitation-language',
      'text.text_language.iso_code_639_3',
      'corpus.subcorpus.corpus_subcorpus_targetLanguage',
    ),
    elicitationCountry: get('elicitation-country'),
    elicitationDate: get(
      'elicitation-date',
      'text.text_timeOfCreation',
    ),
    raw: Object.fromEntries([...values.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

function parseTierEvents(body) {
  const events = [];
  const paired = /<event\b([^>]*?)(?<!\/)>([\s\S]*?)<\/event>/giu;
  for (const match of body.matchAll(paired)) {
    const attrs = attributes(match[1]);
    if (!attrs.start || !attrs.end) continue;
    events.push({ start: attrs.start, end: attrs.end, text: stripXml(match[2]) });
  }

  const selfClosing = /<event\b([^>]*?)\/>/giu;
  for (const match of body.matchAll(selfClosing)) {
    const attrs = attributes(match[1]);
    if (!attrs.start || !attrs.end) continue;
    events.push({ start: attrs.start, end: attrs.end, text: '' });
  }

  events.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return events;
}

function tierCategory(attrs) {
  return String(
    attrs.category
    || attrs['display-name']
    || attrs.type
    || attrs.id
    || '',
  ).trim().toLocaleLowerCase('en-US');
}

function joinTokens(values) {
  let out = '';
  for (const raw of values) {
    const token = String(raw ?? '').trim();
    if (!token) continue;
    if (!out) {
      out = token;
      continue;
    }
    if (/^[,.;:!?%)\]}]+$/u.test(token) || /^[\u2019'][\p{L}\p{N}]/u.test(token)) {
      out += token;
    } else if (/[(\[{\/-]$/u.test(out)) {
      out += token;
    } else {
      out += ' ' + token;
    }
  }
  return out.replace(/\s+/gu, ' ').trim();
}

function overlapsContained(event, startIndex, endIndex, timelineIndex) {
  const start = timelineIndex.get(event.start);
  const end = timelineIndex.get(event.end);
  return Number.isInteger(start)
    && Number.isInteger(end)
    && start >= startIndex
    && end <= endIndex;
}

function collectText(tiers, category, startIndex, endIndex, timelineIndex) {
  const tierList = tiers.get(category) || [];
  const events = [];
  for (const tier of tierList) {
    for (const event of tier.events) {
      if (overlapsContained(event, startIndex, endIndex, timelineIndex)) {
        const index = timelineIndex.get(event.start);
        events.push({ ...event, index });
      }
    }
  }
  events.sort((a, b) => a.index - b.index || a.end.localeCompare(b.end));
  return joinTokens(events.map((event) => event.text));
}

function collectLanguages(tiers, startIndex, endIndex, timelineIndex) {
  const values = [];
  for (const category of ['language', 'lang']) {
    for (const tier of tiers.get(category) || []) {
      for (const event of tier.events) {
        if (overlapsContained(event, startIndex, endIndex, timelineIndex) && event.text) {
          values.push(event.text.toLocaleLowerCase('en-US'));
        }
      }
    }
  }
  return [...new Set(values)].sort();
}

export function parseRuegExb(xml) {
  const input = String(xml ?? '');
  const timeline = [];
  for (const match of input.matchAll(/<tli\b([^>]*?)\/?>/giu)) {
    const attrs = attributes(match[1]);
    if (attrs.id) timeline.push(attrs.id);
  }
  const timelineIndex = new Map(timeline.map((id, index) => [id, index]));

  const tiers = new Map();
  const tierRegex = /<tier\b([^>]*?)(?:\/>|>([\s\S]*?)<\/tier>)/giu;
  for (const match of input.matchAll(tierRegex)) {
    const attrs = attributes(match[1]);
    const category = tierCategory(attrs);
    if (!category) continue;
    const record = { attrs, events: parseTierEvents(match[2] || '') };
    const list = tiers.get(category) || [];
    list.push(record);
    tiers.set(category, list);
  }

  const categoryEvents = (category) => {
    const events = [];
    for (const tier of tiers.get(category) || []) events.push(...tier.events);
    events.sort((a, b) => {
      const ai = timelineIndex.get(a.start) ?? Number.MAX_SAFE_INTEGER;
      const bi = timelineIndex.get(b.start) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi || a.end.localeCompare(b.end);
    });
    return events;
  };

  const chooseBoundaries = () => {
    for (const category of ['cu', 'message', 'line']) {
      const events = categoryEvents(category);
      if (events.length) return { type: category, sourceCategory: category, events };
    }

    // DAKODA's real RUEG EXB export stores sentence/clause spans as empty
    // events on this tier and lexical surface tokens on category="text".
    const dakodaClauses = categoryEvents('spacy_mixtral_th1_merged');
    if (dakodaClauses.length) {
      return {
        type: 'dakoda_clause',
        sourceCategory: 'spacy_mixtral_th1_merged',
        events: dakodaClauses,
      };
    }

    if (timeline.length >= 2) {
      return {
        type: 'document_fallback',
        sourceCategory: null,
        events: [{ start: timeline[0], end: timeline[timeline.length - 1], text: '' }],
      };
    }
    return { type: 'none', sourceCategory: null, events: [] };
  };

  const hasDipl = (tiers.get('dipl') || []).some((tier) => tier.events.length);
  const hasNorm = (tiers.get('norm') || []).some((tier) => tier.events.length);
  const hasDakodaText = (tiers.get('text') || []).some((tier) => tier.events.length);
  const diplCategory = hasDipl ? 'dipl' : (hasDakodaText ? 'text' : null);
  const normCategory = hasNorm ? 'norm' : null;

  const boundary = chooseBoundaries();
  const units = [];
  let unitIndex = 0;
  for (const event of boundary.events) {
    const startIndex = timelineIndex.get(event.start);
    const endIndex = timelineIndex.get(event.end);
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || endIndex <= startIndex) continue;

    // DAKODA EXB "text" is the attested participant/source surface. It is
    // deliberately mapped to our existing dipl slot. We do not duplicate it
    // into norm because the supplied DAKODA EXB archives contain no separate
    // norm tier.
    const dipl = diplCategory
      ? collectText(tiers, diplCategory, startIndex, endIndex, timelineIndex)
      : '';
    const norm = normCategory
      ? collectText(tiers, normCategory, startIndex, endIndex, timelineIndex)
      : '';
    if (!dipl && !norm) continue;

    const languages = collectLanguages(tiers, startIndex, endIndex, timelineIndex);
    units.push({
      index: unitIndex,
      unitType: boundary.type,
      start: event.start,
      end: event.end,
      dipl,
      norm,
      languages,
      diplTokenCount: tokenizePhrase(dipl).length,
      normTokenCount: tokenizePhrase(norm).length,
    });
    unitIndex += 1;
  }

  return {
    timelinePoints: timeline.length,
    tierCategories: [...tiers.keys()].sort(),
    unitType: boundary.type,
    boundarySourceCategory: boundary.sourceCategory,
    surfaceSourceCategory: diplCategory,
    normSourceCategory: normCategory,
    normAvailable: Boolean(normCategory),
    units,
  };
}

export const CREATE_RUEG_REGISTER_SQL = `
CREATE TABLE IF NOT EXISTS register_document(
  document_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES phrase_source(source_id),
  subcorpus TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  speaker_id TEXT,
  formality TEXT,
  mode TEXT,
  age_group TEXT,
  speaker_age TEXT,
  speaker_bilingual TEXT,
  elicitation_language TEXT,
  elicitation_country TEXT,
  elicitation_date TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(source_id, subcorpus, source_record_id)
);

CREATE TABLE IF NOT EXISTS register_unit(
  unit_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES register_document(document_id) ON DELETE CASCADE,
  unit_index INTEGER NOT NULL,
  unit_type TEXT NOT NULL,
  dipl_text TEXT,
  norm_text TEXT,
  languages_json TEXT NOT NULL DEFAULT '[]',
  dipl_token_count INTEGER NOT NULL DEFAULT 0,
  norm_token_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(document_id, unit_index)
);

CREATE TABLE IF NOT EXISTS phrase_register_occurrence(
  phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id),
  unit_id TEXT NOT NULL REFERENCES register_unit(unit_id) ON DELETE CASCADE,
  layer TEXT NOT NULL CHECK(layer IN ('dipl','norm')),
  occurrence_count INTEGER NOT NULL,
  PRIMARY KEY(phrase_id, unit_id, layer)
);

CREATE INDEX IF NOT EXISTS idx_register_document_filters
  ON register_document(source_id,subcorpus,formality,mode,age_group);
CREATE INDEX IF NOT EXISTS idx_register_unit_document
  ON register_unit(document_id,unit_index);
CREATE INDEX IF NOT EXISTS idx_register_unit_dipl
  ON register_unit(dipl_text);
CREATE INDEX IF NOT EXISTS idx_register_unit_norm
  ON register_unit(norm_text);
CREATE INDEX IF NOT EXISTS idx_phrase_register_occurrence_phrase
  ON phrase_register_occurrence(phrase_id,layer);
`;

export function ensureRuegRegisterStorage(db) {
  db.exec(CREATE_RUEG_REGISTER_SQL);
}

export function documentIdFor({ sourceId, subcorpus, sourceRecordId }) {
  return `register-document:${sha256(JSON.stringify([sourceId, subcorpus, sourceRecordId])).slice(0, 24)}`;
}

export function unitIdFor(documentId, unitIndex) {
  return `register-unit:${sha256(JSON.stringify([documentId, Number(unitIndex)])).slice(0, 24)}`;
}

export function computeRuegDetailFingerprint(db) {
  const documents = db.prepare(`
    SELECT document_id,source_id,subcorpus,source_record_id,speaker_id,formality,mode,
      age_group,speaker_age,speaker_bilingual,elicitation_language,elicitation_country,
      elicitation_date,metadata_json
    FROM register_document
    ORDER BY document_id
  `).all();
  const units = db.prepare(`
    SELECT unit_id,document_id,unit_index,unit_type,dipl_text,norm_text,languages_json,
      dipl_token_count,norm_token_count
    FROM register_unit
    ORDER BY unit_id
  `).all();
  const occurrences = db.prepare(`
    SELECT phrase_id,unit_id,layer,occurrence_count
    FROM phrase_register_occurrence
    ORDER BY phrase_id,unit_id,layer
  `).all();
  return sha256(JSON.stringify({ documents, units, occurrences }));
}
