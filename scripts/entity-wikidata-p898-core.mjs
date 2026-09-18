import { buildAllRankCandidateUnion } from './qlever-entity-source-core.mjs';
import { normalizeEntityName } from './entity-lexicon-core.mjs';

export const WIKIDATA_P898_SOURCE_SCHEMA = 'rhymelab-wikidata-p898-source-v1';
export const WIKIDATA_P898_SOURCE_POLICY = 'wikidata-p898-qualified-selective-v1';
export const WIKIDATA_P898_SOURCE_KIND = 'wikidata_p898';
export const WIKIDATA_P898_REVIEW_STATE = 'source_attested_unprofiled';

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
`;

export function buildWikidataP898Query(taxonomy) {
  const candidateUnion = buildAllRankCandidateUnion(taxonomy);
  return PREFIXES + `
SELECT DISTINCT
  ?item ?statement ?ipa ?language ?variety ?appliesName ?appliesNameLanguage
WHERE {
  {
${candidateUnion}
  }
  ?item p:P898 ?statement .
  ?statement ps:P898 ?ipa .
  OPTIONAL { ?statement pq:P407 ?language . }
  OPTIONAL { ?statement pq:P5237 ?variety . }
  OPTIONAL {
    ?statement pq:P5168 ?appliesNameRaw .
    BIND(STR(?appliesNameRaw) AS ?appliesName)
    BIND(LANG(?appliesNameRaw) AS ?appliesNameLanguage)
  }
}
`;
}

export function p898LocaleFromLanguageQid(qid) {
  if (qid === 'Q188') return 'de';
  if (qid === 'Q1860') return 'en';
  return null;
}

export function selectP898TargetName(names, {
  appliesName = null,
  appliesNameLanguage = null,
  languageQid = null,
} = {}) {
  const list = Array.isArray(names) ? names : [];
  const cleanApplies = String(appliesName || '').normalize('NFKC').trim();
  if (cleanApplies) {
    const normalized = normalizeEntityName(cleanApplies);
    const exact = list.filter((row) => row.normalized === normalized);
    if (exact.length) {
      const byLanguage = appliesNameLanguage
        ? exact.find((row) => row.language === appliesNameLanguage)
        : null;
      const selected = byLanguage
        || exact.find((row) => Number(row.preferred) === 1)
        || exact[0];
      return { name: selected, strategy: 'applies_name_exact' };
    }
  }

  const localeLanguage = p898LocaleFromLanguageQid(languageQid);
  if (localeLanguage) {
    const selected = list.find(
      (row) => row.language === localeLanguage && Number(row.preferred) === 1,
    ) || list.find((row) => row.language === localeLanguage);
    if (selected) return { name: selected, strategy: 'language_preferred_label' };
  }

  return { name: null, strategy: 'unmapped' };
}

export function normalizeP898Ipa(value) {
  const raw = String(value || '').normalize('NFKC').trim();
  if (!raw) return '';
  if (
    (raw.startsWith('/') && raw.endsWith('/'))
    || (raw.startsWith('[') && raw.endsWith(']'))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}
