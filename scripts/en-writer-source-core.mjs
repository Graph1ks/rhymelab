import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';

export function normalizeEnglishSurface(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[’ʻʼ]/gu, "'")
    .trim()
    .toLocaleLowerCase('en-US');
}

export function isSingleTokenSurface(value) {
  const normalized = normalizeEnglishSurface(value);
  return Boolean(normalized) && !/\s/u.test(normalized);
}

export function isWriterCandidateSurface(value) {
  const normalized = normalizeEnglishSurface(value);
  return isSingleTokenSurface(normalized)
    && /\p{L}/u.test(normalized)
    && [...normalized].length <= 96;
}

function normalizedTags(values) {
  return [...new Set((values || [])
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim().toLocaleLowerCase('en-US'))
    .filter(Boolean))];
}

export function collectWiktionaryTags(record) {
  const values = [];
  values.push(record?.tags || [], record?.raw_tags || []);
  for (const sense of record?.senses || []) {
    values.push(sense?.tags || [], sense?.raw_tags || []);
  }
  return normalizedTags(values);
}

export function classifyWiktionaryHistory(tags) {
  const normalized = normalizedTags(tags);
  const has = (needle) => normalized.some((tag) => tag === needle || tag.includes(needle));
  return {
    archaic: has('archaic'),
    obsolete: has('obsolete'),
    historical: has('historical') || has('historic'),
    dated: has('dated'),
  };
}

export function classifyWiktionaryRecordHistory(record) {
  const recordTags = normalizedTags([record?.tags || [], record?.raw_tags || []]);
  const recordHistory = classifyWiktionaryHistory(recordTags);
  const senses = Array.isArray(record?.senses) ? record.senses : [];
  const senseHistories = senses.map((sense) => {
    const tags = normalizedTags([sense?.tags || [], sense?.raw_tags || []]);
    return classifyWiktionaryHistory(tags);
  });

  const recordWideHistorical = Boolean(
    recordHistory.archaic || recordHistory.obsolete || recordHistory.historical || recordHistory.dated
  );
  let historicalSenseCount = 0;
  let currentSenseCount = 0;
  for (const history of senseHistories) {
    const historical = Boolean(history.archaic || history.obsolete || history.historical || history.dated);
    if (recordWideHistorical || historical) historicalSenseCount += 1;
    else currentSenseCount += 1;
  }

  const historicalOnly = recordWideHistorical
    || (senses.length > 0 && currentSenseCount === 0 && historicalSenseCount > 0);

  return {
    archaic: recordHistory.archaic || senseHistories.some((history) => history.archaic),
    obsolete: recordHistory.obsolete || senseHistories.some((history) => history.obsolete),
    historical: recordHistory.historical || senseHistories.some((history) => history.historical),
    dated: recordHistory.dated || senseHistories.some((history) => history.dated),
    historical_only: historicalOnly,
    current_sense_count: currentSenseCount,
    historical_sense_count: historicalSenseCount,
  };
}

const US_PATTERNS = [
  /^us$/u, /^u\.s\.?$/u, /^usa$/u, /united states/u,
  /general[ -]american/u, /^genam$/u, /^ga$/u, /american[ -]english/u,
];
const UK_PATTERNS = [
  /^uk$/u, /^u\.k\.?$/u, /united kingdom/u, /british/u,
  /received[ -]pronunciation/u, /^rp$/u, /england/u,
];
const REGION_PATTERNS = [
  ...US_PATTERNS, ...UK_PATTERNS, /canad/u, /austral/u, /new zealand/u,
  /ireland/u, /irish/u, /scotland/u, /scottish/u, /wales/u, /welsh/u,
  /south africa/u, /india/u, /singapore/u, /philipp/u, /caribbean/u,
  /rhotic/u, /non-rhotic/u,
];

function matchesAny(tag, patterns) {
  return patterns.some((pattern) => pattern.test(tag));
}

export function classifyWiktionaryIpaLocale(sound) {
  const tags = normalizedTags([sound?.tags || [], sound?.raw_tags || []]);
  const us = tags.some((tag) => matchesAny(tag, US_PATTERNS));
  const uk = tags.some((tag) => matchesAny(tag, UK_PATTERNS));
  const hasRegionalQualifier = tags.some((tag) => matchesAny(tag, REGION_PATTERNS));
  const otherProfiled = hasRegionalQualifier && !us && !uk;
  return {
    us,
    uk,
    unqualified: !hasRegionalQualifier,
    has_regional_qualifier: hasRegionalQualifier,
    other_profiled: otherProfiled,
    tags,
  };
}

export function isExplicitProperNameRecord(record) {
  const pos = String(record?.pos || '').toLocaleLowerCase('en-US').replace(/[_-]+/gu, ' ');
  if (/(?:^|\s)(?:proper noun|name)(?:$|\s)/u.test(pos)) return true;
  const recordTags = normalizedTags([record?.tags || [], record?.raw_tags || []]);
  return recordTags.some((tag) => /proper(?: |-)?(?:noun|name)/u.test(tag));
}

export function parseCmudictSurface(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith(';;;')) return null;
  const match = trimmed.match(/^(\S+)\s{1,}(.+)$/u);
  if (!match) return null;
  const surface = match[1].replace(/\(\d+\)$/u, '');
  return normalizeEnglishSurface(surface);
}

const ESDB_VARIANT_LEVEL = new Map([
  ['.', 1], ['=', 2], ['?', 3], ['v', 4], ['~', 5], ['V', 6], ['@', 7], ['-', 8], ['x', 9],
]);

function splitTopLevel(value, separator) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '(') depth += 1;
    else if (ch === ')' && depth > 0) depth -= 1;
    else if (ch === separator && depth === 0) {
      out.push(value.slice(start, i));
      start = i + 1;
    }
  }
  out.push(value.slice(start));
  return out;
}

function parseVariantInfo(value) {
  const tokens = String(value || '').trim().split(/\s+/u).filter(Boolean);
  const variants = [];
  for (const token of tokens) {
    if (/^\{\d+\}$/u.test(token)) continue;
    if (token === '+') {
      variants.push({ spelling: '+', marker: null, level: 0 });
      continue;
    }
    const match = token.match(/^([ABZCD_])([.=?v~V@\-x]?)$/u);
    if (!match) return null;
    variants.push({
      spelling: match[1],
      marker: match[2] || null,
      level: match[2] ? ESDB_VARIANT_LEVEL.get(match[2]) : 0,
    });
  }
  return variants.length ? variants : null;
}

function stripWordAnnotations(value) {
  let word = String(value || '').trim();
  word = word.replace(/^[\-@!](?=\p{L})/u, '');
  word = word.replace(/[\*\-@~!†]+$/u, '');
  return word.trim();
}

function extractLemmaInfo(value) {
  let text = String(value || '').trim();
  const posMatch = text.match(/\s+<([^>]+)>/u);
  const pos = posMatch ? posMatch[1] : null;
  const posClass = pos?.includes('/') ? pos.split('/').slice(1).join('/') : null;
  if (posMatch) text = text.slice(0, posMatch.index).trim();
  else {
    text = text.replace(/\s+\{[^}]*\}\s*(?:\([^)]*\))?$/u, '');
    text = text.replace(/\s+\([^)]*\)$/u, '');
  }
  return { word: stripWordAnnotations(text), pos, posClass };
}

function parseDerivedEntry(entry) {
  const trimmed = String(entry || '').trim();
  if (!trimmed || trimmed === '-') return [];
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1);
    return splitTopLevel(inner, '|').flatMap((part) => {
      let value = part.trim();
      const colon = value.indexOf(': ');
      if (colon >= 0 && parseVariantInfo(value.slice(0, colon))) value = value.slice(colon + 2);
      const word = stripWordAnnotations(value);
      return word && word !== '-' ? [word] : [];
    });
  }
  const word = stripWordAnnotations(trimmed);
  return word && word !== '-' ? [word] : [];
}

export function parseEsdbLine(line) {
  const raw = String(line || '').trim();
  if (!raw || raw.startsWith('#')) return null;
  const firstColon = raw.indexOf(': ');
  if (firstColon < 0) return null;
  const scowlInfo = raw.slice(0, firstColon).trim();
  const infoTokens = scowlInfo.split(/\s+/u).filter(Boolean);
  const size = Number.parseInt(infoTokens[0], 10);
  if (!Number.isInteger(size)) return null;
  const region = infoTokens.find((token) => ['US', 'GB', 'CA', 'AU'].includes(token)) || null;
  let rest = raw.slice(firstColon + 2);
  const comment = rest.search(/\s+#(?:!|[^:])/u);
  if (comment >= 0) rest = rest.slice(0, comment).trim();

  let variants = [];
  const secondColon = rest.indexOf(': ');
  if (secondColon >= 0) {
    const candidate = parseVariantInfo(rest.slice(0, secondColon));
    if (candidate) {
      variants = candidate;
      rest = rest.slice(secondColon + 2);
    }
  }

  const derivedColon = rest.indexOf(': ');
  const lemmaText = derivedColon >= 0 ? rest.slice(0, derivedColon) : rest;
  const derivedText = derivedColon >= 0 ? rest.slice(derivedColon + 2) : '';
  const lemmaAnnotatedArchaic = /^@(?=\p{L})/u.test(lemmaText.trim()) || /@(?:\s+<|\s+\{|\s+\(|$)/u.test(lemmaText);
  const lemmaAnnotatedUncommon = /^-(?=\p{L})/u.test(lemmaText.trim()) || /-(?:\s+<|\s+\{|\s+\(|$)/u.test(lemmaText);
  const lemma = extractLemmaInfo(lemmaText);
  if (!lemma.word || lemma.word === '-') return null;
  const derived = derivedText
    ? splitTopLevel(derivedText, ',').flatMap(parseDerivedEntry)
    : [];
  return {
    size,
    region,
    variants,
    lemma: lemma.word,
    pos: lemma.pos,
    posClass: lemma.posClass,
    forms: [lemma.word, ...derived],
    archaic: variants.some((variant) => variant.level === 7) || lemmaAnnotatedArchaic,
    uncommon: variants.some((variant) => variant.level === 8) || lemmaAnnotatedUncommon,
    invalid: variants.some((variant) => variant.level === 9),
  };
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

export async function gitBlobSha1File(path) {
  const { size } = await import('node:fs/promises').then(({ stat }) => stat(path));
  const hash = createHash('sha1');
  hash.update(`blob ${size}\0`);
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

class MsgpackDecoder {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  take(length) {
    const start = this.offset;
    this.offset += length;
    if (this.offset > this.buffer.length) throw new Error('Unexpected end of MessagePack data.');
    return this.buffer.subarray(start, this.offset);
  }

  uint8() { return this.take(1).readUInt8(0); }
  uint16() { return this.take(2).readUInt16BE(0); }
  uint32() { return this.take(4).readUInt32BE(0); }
  int8() { return this.take(1).readInt8(0); }
  int16() { return this.take(2).readInt16BE(0); }
  int32() { return this.take(4).readInt32BE(0); }

  decode() {
    const prefix = this.uint8();
    if (prefix <= 0x7f) return prefix;
    if (prefix >= 0xe0) return prefix - 256;
    if ((prefix & 0xe0) === 0xa0) return this.take(prefix & 0x1f).toString('utf8');
    if ((prefix & 0xf0) === 0x90) return this.array(prefix & 0x0f);
    if ((prefix & 0xf0) === 0x80) return this.map(prefix & 0x0f);
    switch (prefix) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return this.take(this.uint8());
      case 0xc5: return this.take(this.uint16());
      case 0xc6: return this.take(this.uint32());
      case 0xca: return this.take(4).readFloatBE(0);
      case 0xcb: return this.take(8).readDoubleBE(0);
      case 0xcc: return this.uint8();
      case 0xcd: return this.uint16();
      case 0xce: return this.uint32();
      case 0xcf: {
        const value = this.take(8).readBigUInt64BE(0);
        return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
      }
      case 0xd0: return this.int8();
      case 0xd1: return this.int16();
      case 0xd2: return this.int32();
      case 0xd3: {
        const value = this.take(8).readBigInt64BE(0);
        return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(value) : value;
      }
      case 0xd9: return this.take(this.uint8()).toString('utf8');
      case 0xda: return this.take(this.uint16()).toString('utf8');
      case 0xdb: return this.take(this.uint32()).toString('utf8');
      case 0xdc: return this.array(this.uint16());
      case 0xdd: return this.array(this.uint32());
      case 0xde: return this.map(this.uint16());
      case 0xdf: return this.map(this.uint32());
      default: throw new Error(`Unsupported MessagePack prefix 0x${prefix.toString(16)}.`);
    }
  }

  array(length) {
    const values = new Array(length);
    for (let i = 0; i < length; i += 1) values[i] = this.decode();
    return values;
  }

  map(length) {
    const value = {};
    for (let i = 0; i < length; i += 1) {
      const key = this.decode();
      value[String(key)] = this.decode();
    }
    return value;
  }
}

export function decodeMsgpack(buffer) {
  const decoder = new MsgpackDecoder(buffer);
  const value = decoder.decode();
  if (decoder.offset !== buffer.length) {
    throw new Error(`Trailing MessagePack bytes: ${buffer.length - decoder.offset}`);
  }
  return value;
}

export function parseWordfreqCBpack(decoded) {
  if (!Array.isArray(decoded) || !decoded.length) throw new Error('wordfreq cBpack must be a non-empty array.');
  const header = decoded[0];
  if (!header || header.format !== 'cB' || header.version !== 1) {
    throw new Error(`Unexpected wordfreq cBpack header: ${JSON.stringify(header)}`);
  }
  const rows = [];
  for (let bucketIndex = 0; bucketIndex < decoded.length - 1; bucketIndex += 1) {
    const bucket = decoded[bucketIndex + 1];
    if (!Array.isArray(bucket)) throw new Error(`wordfreq bucket ${bucketIndex} is not an array.`);
    const zipf = Number(((900 - bucketIndex) / 100).toFixed(2));
    for (const word of bucket) rows.push({ word: String(word), bucketIndex, zipf });
  }
  return rows;
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function pct(numerator, denominator) {
  return denominator > 0 ? Number((Number(numerator) * 100 / Number(denominator)).toFixed(2)) : 0;
}
