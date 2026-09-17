import { createHash } from 'node:crypto';

const GRAMMAR_TAGS = new Set([
  'singular','plural','nominative','accusative','dative','genitive',
  'present','past','preterite','perfect','pluperfect','future',
  'indicative','subjunctive','imperative','infinitive','participle',
  'first-person','second-person','third-person','person',
  'masculine','feminine','neuter','common-gender',
  'comparative','superlative','positive','strong','weak','mixed',
  'attributive','predicative','adverbial','reflexive','separable','inseparable'
]);

const STYLE_TAGS = new Set([
  'slang','colloquial','informal','vulgar','offensive','derogatory',
  'archaic','obsolete','dated','rare','regional','dialectal','poetic'
]);

const HISTORICAL_TAGS = new Set(['archaic','obsolete','dated']);

export function normalizeGerman(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE');
}

export function cleanIpa(value) {
  let ipa = String(value ?? '').normalize('NFC').trim();
  if ((ipa.startsWith('[') && ipa.endsWith(']')) || (ipa.startsWith('/') && ipa.endsWith('/'))) {
    ipa = ipa.slice(1, -1).trim();
  }
  return ipa;
}

export function canonicalPos(entry) {
  const raw = String(entry?.pos ?? '').trim().toLowerCase();
  if (raw) return raw.replaceAll(' ', '_');
  const title = String(entry?.pos_title ?? '').trim().toLowerCase();
  if (!title) return 'unknown';
  return `wiktionary:${title.replace(/\s+/g, '_')}`;
}

function allTags(...sources) {
  return [...new Set(sources.flatMap((source) => Array.isArray(source) ? source : []).map((x) => String(x).trim()).filter(Boolean))];
}

function styleTagsFrom(...sources) {
  return allTags(...sources).filter((tag) => STYLE_TAGS.has(tag));
}

function hasHistoricalTag(tags) {
  return tags.some((tag) => HISTORICAL_TAGS.has(tag));
}

function stableRecordKey(entry) {
  const payload = JSON.stringify({
    word: entry?.word ?? null,
    pos: entry?.pos ?? null,
    pos_title: entry?.pos_title ?? null,
    etymology_number: entry?.etymology_number ?? entry?.etymology_index ?? null,
    senses: (entry?.senses ?? []).map((sense) => ({
      glosses: sense?.glosses ?? [],
      form_of: sense?.form_of ?? [],
      tags: sense?.tags ?? [],
    })),
  });
  return `dewiktionary:${createHash('sha256').update(payload).digest('hex').slice(0, 24)}`;
}

function homographNo(entry) {
  const raw = Number(entry?.etymology_number ?? entry?.etymology_index ?? 1);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

function genderFrom(tags) {
  if (tags.includes('masculine')) return 'm';
  if (tags.includes('feminine')) return 'f';
  if (tags.includes('neuter')) return 'n';
  return null;
}

function ipasFromSounds(sounds) {
  const values = [];
  for (const sound of Array.isArray(sounds) ? sounds : []) {
    const ipa = cleanIpa(sound?.ipa);
    if (ipa && !values.includes(ipa)) values.push(ipa);
  }
  return values;
}

function makeOption({ entry, lemma, matchKind, featureTags = [], candidateIpas = [], lexicalTags = [], historicalOnly = null }) {
  const entryTags = allTags(entry?.tags);
  const styleTags = styleTagsFrom(entryTags, lexicalTags);
  const pos = canonicalPos(entry);
  const normalizedLemma = normalizeGerman(lemma);
  const h = homographNo(entry);
  const historical = historicalOnly === null ? hasHistoricalTag(styleTags) : Boolean(historicalOnly);
  return {
    lemma: String(lemma), normalizedLemma, pos, homographNo: h,
    resolutionKey: createHash('sha256').update(JSON.stringify([normalizedLemma, pos, h])).digest('hex').slice(0, 24),
    matchKind,
    confidence: matchKind === 'headword' ? 0.98 : matchKind === 'form_of' ? 0.96 : 0.94,
    sourceRecordKey: stableRecordKey(entry),
    gender: genderFrom(entryTags),
    isProper: pos === 'name' || pos === 'proper_noun' || entryTags.includes('proper-noun'),
    isObsolete: styleTags.includes('obsolete') || styleTags.includes('archaic'),
    historicalOnly: historical,
    styleTags,
    formFeatures: [...new Set(featureTags.filter((tag) => GRAMMAR_TAGS.has(tag)))],
    candidateIpas: [...new Set(candidateIpas.map(cleanIpa).filter(Boolean))],
  };
}

export function optionsForHeadword(entry) {
  if (entry?.lang_code !== 'de' || !entry?.word) return [];
  const senses = Array.isArray(entry.senses) ? entry.senses : [];
  const formOfOptions = [];
  const directSenses = [];
  const entryStyleTags = styleTagsFrom(entry?.tags);
  const entryHistorical = hasHistoricalTag(entryStyleTags);

  for (const sense of senses) {
    const forms = Array.isArray(sense?.form_of) ? sense.form_of : [];
    if (forms.length) {
      const senseTags = allTags(sense?.tags, sense?.raw_tags);
      const senseStyleTags = styleTagsFrom(senseTags);
      const senseHistorical = entryHistorical || hasHistoricalTag(senseStyleTags);
      for (const relation of forms) {
        if (!relation?.word) continue;
        formOfOptions.push(makeOption({
          entry, lemma: relation.word, matchKind: 'form_of',
          featureTags: senseTags.filter((tag) => tag !== 'form-of'),
          candidateIpas: ipasFromSounds(entry.sounds), lexicalTags: senseStyleTags,
          historicalOnly: senseHistorical,
        }));
      }
    } else if (!(sense?.tags ?? []).includes('form-of')) {
      directSenses.push(sense);
    }
  }

  const hasDirectSense = senses.length === 0 || directSenses.length > 0;
  const directSenseStyles = directSenses.map((sense) => styleTagsFrom(sense?.tags, sense?.raw_tags));
  const directHistoricalOnly = entryHistorical || (directSenses.length > 0 && directSenseStyles.every((tags) => hasHistoricalTag(tags)));
  const direct = hasDirectSense ? [makeOption({
    entry, lemma: entry.word, matchKind: 'headword', candidateIpas: ipasFromSounds(entry.sounds),
    lexicalTags: directSenseStyles.flat(), historicalOnly: directHistoricalOnly,
  })] : [];
  return [...direct, ...formOfOptions];
}

export function optionsForListedForms(entry, targetNormalizedSet = null) {
  if (entry?.lang_code !== 'de' || !entry?.word) return [];
  if (targetNormalizedSet !== null && !(targetNormalizedSet instanceof Set)) return [];
  const out = [];
  const entryStyleTags = styleTagsFrom(entry?.tags);
  const entryHistorical = hasHistoricalTag(entryStyleTags);
  const directSenses = (Array.isArray(entry.senses) ? entry.senses : []).filter((sense) => {
    const forms = Array.isArray(sense?.form_of) ? sense.form_of : [];
    return forms.length === 0 && !(sense?.tags ?? []).includes('form-of');
  });
  const directSenseStyleTags = directSenses.flatMap((sense) => styleTagsFrom(sense?.tags, sense?.raw_tags));
  const entryHistoricalOnly = entryHistorical || (
    directSenses.length > 0 && directSenses.every((sense) => hasHistoricalTag(styleTagsFrom(sense?.tags, sense?.raw_tags)))
  );
  for (const form of Array.isArray(entry.forms) ? entry.forms : []) {
    const surface = String(form?.form ?? '').normalize('NFKC').trim();
    if (!surface) continue;
    const normalized = normalizeGerman(surface);
    if (targetNormalizedSet instanceof Set && !targetNormalizedSet.has(normalized)) continue;
    const formIpas = [];
    if (form?.ipa) formIpas.push(form.ipa);
    const formTags = allTags(form?.tags, form?.raw_tags);
    const formStyleTags = styleTagsFrom(formTags);
    out.push({
      candidateSurface: surface,
      candidateNormalized: normalized,
      option: makeOption({
        entry, lemma: entry.word, matchKind: 'lemma_form', featureTags: formTags,
        candidateIpas: formIpas, lexicalTags: [...directSenseStyleTags, ...formStyleTags],
        historicalOnly: entryHistoricalOnly || hasHistoricalTag(formStyleTags),
      }),
    });
  }
  return out;
}

export function mergeOptions(options) {
  const byKey = new Map();
  for (const option of options) {
    const current = byKey.get(option.resolutionKey);
    if (!current) {
      byKey.set(option.resolutionKey, { ...option, matchKinds: [option.matchKind], sourceRecordKeys: [option.sourceRecordKey] });
      continue;
    }
    current.confidence = Math.max(current.confidence, option.confidence);
    current.gender ||= option.gender;
    current.isProper ||= option.isProper;
    current.isObsolete ||= option.isObsolete;
    current.historicalOnly = Boolean(current.historicalOnly && option.historicalOnly);
    current.styleTags = [...new Set([...current.styleTags, ...option.styleTags])];
    current.formFeatures = [...new Set([...current.formFeatures, ...option.formFeatures])];
    current.candidateIpas = [...new Set([...current.candidateIpas, ...option.candidateIpas])];
    current.matchKinds = [...new Set([...current.matchKinds, option.matchKind])];
    current.sourceRecordKeys = [...new Set([...current.sourceRecordKeys, option.sourceRecordKey])];
  }
  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence || a.resolutionKey.localeCompare(b.resolutionKey, 'de'));
}

export function classifyCandidate(candidate, rawOptions) {
  const options = mergeOptions(rawOptions);
  const status = options.length === 0 ? 'pending' : options.length === 1 ? 'resolved' : 'ambiguous';
  return { ...candidate, status, options, selected: status === 'resolved' ? options[0] : null };
}
