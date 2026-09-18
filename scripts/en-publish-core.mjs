import {
  classifyWiktionaryRecordHistory,
  classifyWiktionaryIpaLocale,
  collectWiktionaryTags,
  isExplicitProperNameRecord,
  normalizeEnglishSurface,
} from './en-writer-source-core.mjs';

export const EN_PUBLISH_SCHEMA = 'rhymelab-en-publish-v1';
export const EN_PUBLISH_POLICY = 'en-source-backed-publish-v4-tier-a-candidate';

export function isEnglishPublishSurface(value) {
  const normalized = normalizeEnglishSurface(value);
  return [...normalized].length <= 96
    && /^\p{L}+(?:[-']\p{L}+)*$/u.test(normalized);
}

export function parseCmudictPronunciationLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith(';;;')) return null;
  const match = trimmed.match(/^(\S+)\s+(.+)$/u);
  if (!match) return null;
  const sourceSurface = match[1];
  const normalized = normalizeEnglishSurface(sourceSurface.replace(/\(\d+\)$/u, ''));
  const phones = match[2].trim().replace(/\s+/gu, ' ');
  if (!normalized || !phones) return null;
  return {
    normalized,
    source_surface: sourceSurface,
    phones,
    alternate_index: Number.parseInt(sourceSurface.match(/\((\d+)\)$/u)?.[1] || '1', 10),
  };
}

function normalizeStringList(values) {
  return [...new Set((values || [])
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

function relationTargets(senses, key) {
  const values = [];
  for (const sense of senses || []) {
    for (const item of sense?.[key] || []) {
      const value = typeof item === 'string' ? item : item?.word;
      if (value) values.push(normalizeEnglishSurface(value));
    }
  }
  return normalizeStringList(values).filter(isEnglishPublishSurface);
}

export function lexicalEvidenceForHeadword(record) {
  const normalized = normalizeEnglishSurface(record?.word);
  if (!isEnglishPublishSurface(normalized)) return null;
  const tags = collectWiktionaryTags(record);
  const history = classifyWiktionaryRecordHistory(record);
  const formOf = relationTargets(record?.senses, 'form_of');
  const altOf = relationTargets(record?.senses, 'alt_of');
  const lemmaCandidates = [...new Set([...formOf, ...altOf])];
  return {
    surface: String(record.word).normalize('NFKC').trim(),
    normalized,
    pos: String(record?.pos || 'unknown'),
    tags,
    history,
    proper_name: isExplicitProperNameRecord(record),
    lemma_candidates: lemmaCandidates,
    relation_kinds: [
      ...(formOf.length ? ['form_of'] : []),
      ...(altOf.length ? ['alt_of'] : []),
    ],
    evidence_kind: 'wiktionary_headword',
  };
}

const NON_LEXICAL_FORM_TAGS = new Set([
  'canonical', 'romanization', 'table-tags', 'class', 'inflection-template',
]);

export function lexicalEvidenceForListedForms(record) {
  const parent = lexicalEvidenceForHeadword(record);
  if (!parent) return [];
  const rows = [];
  for (const form of record?.forms || []) {
    const normalized = normalizeEnglishSurface(form?.form);
    if (!isEnglishPublishSurface(normalized) || normalized === parent.normalized) continue;
    const tags = normalizeStringList([form?.tags || [], form?.raw_tags || []])
      .map((value) => value.toLocaleLowerCase('en-US'));
    if (tags.some((tag) => NON_LEXICAL_FORM_TAGS.has(tag))) continue;
    rows.push({
      surface: String(form.form).normalize('NFKC').trim(),
      normalized,
      pos: parent.pos,
      tags: [...new Set([...parent.tags, ...tags])],
      history: parent.history,
      proper_name: parent.proper_name,
      lemma_candidates: [parent.normalized],
      relation_kinds: ['listed_form_of'],
      evidence_kind: 'wiktionary_listed_form',
    });
  }
  return rows;
}

export function wiktionaryPronunciationEvidence(sound) {
  if (!sound?.ipa) return null;
  const locale = classifyWiktionaryIpaLocale(sound);
  const locales = [];
  if (locale.us) locales.push('en-US');
  if (locale.uk) locales.push('en-GB');
  return {
    source: 'wiktionary',
    notation: 'ipa',
    raw: String(sound.ipa).trim(),
    locales,
    locale_status: locales.length
      ? 'qualified'
      : locale.other_profiled
        ? 'source_attested_other_profiled'
        : locale.tagged_unmapped
          ? 'source_attested_tagged_unmapped'
          : 'source_attested_unprofiled',
    tags: locale.tags,
  };
}

export function cmudictPronunciationEvidence(parsed) {
  if (!parsed?.phones) return null;
  return {
    source: 'cmudict',
    notation: 'arpabet',
    raw: parsed.phones,
    locales: ['en-US'],
    locale_status: 'qualified',
    tags: [],
    alternate_index: parsed.alternate_index,
  };
}

export function compactEnglishAnalysis(analysis) {
  return {
    ph: analysis.canonicalPhonemes,
    sc: analysis.syllableCount,
    st: analysis.stressPattern,
    ps: analysis.primaryStressSyllable,
    rt: analysis.stressedTail,
    ft: analysis.finalTail,
    e: analysis.exactTailKey,
    m: analysis.multisyllableKey,
    vk: analysis.vowelKey,
    vf: analysis.vowelFamilyKey,
    ck: analysis.codaKey,
    rs: analysis.stressedSyllableCount,
    rh: analysis.rhotic ? 1 : 0,
  };
}

export function mergeEsdbEvidence(current, parsed) {
  const next = current || {
    min_size: null,
    regions: new Set(),
    pos_classes: new Set(),
    archaic: false,
    uncommon: false,
    invalid: false,
  };
  if (Number.isInteger(parsed?.size)) next.min_size = next.min_size === null ? parsed.size : Math.min(next.min_size, parsed.size);
  if (parsed?.region) next.regions.add(parsed.region);
  if (parsed?.posClass) next.pos_classes.add(parsed.posClass);
  next.archaic ||= Boolean(parsed?.archaic);
  next.uncommon ||= Boolean(parsed?.uncommon);
  next.invalid ||= Boolean(parsed?.invalid);
  return next;
}

export function finalizeEsdbEvidence(value) {
  if (!value) return null;
  return {
    min_size: value.min_size,
    regions: [...value.regions].sort(),
    pos_classes: [...value.pos_classes].sort(),
    archaic: value.archaic,
    uncommon: value.uncommon,
    invalid: value.invalid,
  };
}

export function determineEnglishPublishEligibility(record) {
  const pronunciations = record?.pronunciations || [];
  const hasAnalyzedEnUs = pronunciations.some((item) =>
    item.analysis && Array.isArray(item.locales) && item.locales.includes('en-US'));
  const historicalOnly = Number(record?.lexical_current_evidence || 0) === 0
    && Number(record?.lexical_historical_evidence || 0) > 0;
  const properNameEvidence = Number(record?.proper_name_evidence || 0);
  const commonLexicalEvidence = Number(record?.common_lexical_evidence || 0);
  const properNameOnly = properNameEvidence > 0 && commonLexicalEvidence === 0;
  const esdbInvalid = Boolean(record?.esdb?.invalid);
  const defaultEligible = hasAnalyzedEnUs && !historicalOnly && !properNameOnly && !esdbInvalid;
  const reasons = [];
  if (!hasAnalyzedEnUs) reasons.push('no_analyzed_en_us_pronunciation');
  if (historicalOnly) reasons.push('historical_only');
  if (properNameOnly) reasons.push('explicit_proper_name_only');
  if (esdbInvalid) reasons.push('esdb_invalid_variant');
  return {
    source_backed_publishable: pronunciations.length > 0,
    analyzed_en_us: hasAnalyzedEnUs,
    historical_only: historicalOnly,
    proper_name_only: properNameOnly,
    default_eligible: defaultEligible,
    exclusion_reasons: reasons,
  };
}
