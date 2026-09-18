export const QLEVER_ENTITY_SOURCE_SCHEMA = 'rhymelab-qlever-entity-source-v1';
export const QLEVER_ENTITY_SOURCE_POLICY = 'wikidata-qlever-selective-all-statements-v1';
export const DEFAULT_QLEVER_ENDPOINT = 'https://qlever.dev/api/wikidata';

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX schema: <http://schema.org/>
PREFIX wikibase: <http://wikiba.se/ontology#>
`;

function safeVarPart(value) {
  return String(value).replace(/[^A-Za-z0-9_]/gu, '_');
}

function taxonomyRules(taxonomy) {
  const rows = [];
  for (const category of taxonomy?.categories || []) {
    for (const rule of category.match_any || []) {
      for (const qid of rule.qids || []) {
        if (!/^P\d+$/u.test(String(rule.property))) {
          throw new Error(`Unsupported taxonomy property: ${rule.property}`);
        }
        if (!/^Q\d+$/u.test(String(qid))) {
          throw new Error(`Unsupported taxonomy QID: ${qid}`);
        }
        rows.push({
          category: String(category.category),
          property: String(rule.property),
          qid: String(qid),
        });
      }
    }
  }
  return rows;
}

function candidateBranch(rule, { bindCategory = false } = {}) {
  const suffix = safeVarPart(`${rule.property}_${rule.qid}`);
  const bindings = bindCategory
    ? ` BIND("${rule.category}" AS ?category) BIND("${rule.property}" AS ?matchProperty) BIND("${rule.qid}" AS ?matchTargetQid)`
    : '';
  return `{ ?item p:${rule.property} ?statement_${suffix} . ?statement_${suffix} ps:${rule.property} wd:${rule.qid} .${bindings} }`;
}

export function buildAllRankCandidateUnion(taxonomy, options = {}) {
  const rules = taxonomyRules(taxonomy);
  if (!rules.length) throw new Error('Entity taxonomy has no candidate rules.');
  return rules.map((rule) => candidateBranch(rule, options)).join('\nUNION\n');
}

export function buildQLeverEntityQueries(taxonomy) {
  const candidateUnion = buildAllRankCandidateUnion(taxonomy);
  const membershipUnion = buildAllRankCandidateUnion(taxonomy, { bindCategory: true });
  const candidateGroup = `{\n${candidateUnion}\n}`;

  const externalBranches = Object.keys(taxonomy?.external_id_whitelist || {})
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((propertyId) => {
      if (!/^P\d+$/u.test(propertyId)) {
        throw new Error(`Unsupported external-ID property: ${propertyId}`);
      }
      const suffix = safeVarPart(propertyId);
      return `{ ?item p:${propertyId} ?external_${suffix} . ?external_${suffix} ps:${propertyId} ?value . BIND("${propertyId}" AS ?propertyId) }`;
    })
    .join('\nUNION\n');
  const externalGroup = `{\n${externalBranches}\n}`;

  return [
    {
      id: 'membership',
      filename: 'membership.tsv.gz',
      columns: ['item', 'category', 'matchProperty', 'matchTargetQid'],
      query: PREFIXES + `
SELECT DISTINCT ?item ?category ?matchProperty ?matchTargetQid WHERE {
  ${membershipUnion}
}
`,
    },
    {
      id: 'core',
      filename: 'core.tsv.gz',
      columns: ['item', 'labelDe', 'labelEn', 'descriptionDe', 'descriptionEn', 'statementCount'],
      query: PREFIXES + `
SELECT DISTINCT ?item ?labelDe ?labelEn ?descriptionDe ?descriptionEn ?statementCount WHERE {
  ${candidateGroup}
  OPTIONAL { ?item rdfs:label ?labelDe . FILTER(LANG(?labelDe) = "de") }
  OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }
  OPTIONAL { ?item schema:description ?descriptionDe . FILTER(LANG(?descriptionDe) = "de") }
  OPTIONAL { ?item schema:description ?descriptionEn . FILTER(LANG(?descriptionEn) = "en") }
  OPTIONAL { ?item wikibase:statements ?statementCount }
}
`,
    },
    {
      id: 'aliases',
      filename: 'aliases.tsv.gz',
      columns: ['item', 'language', 'alias'],
      query: PREFIXES + `
SELECT DISTINCT ?item ?language ?alias WHERE {
  ${candidateGroup}
  ?item skos:altLabel ?alias .
  FILTER(LANG(?alias) IN ("de", "en"))
  BIND(LANG(?alias) AS ?language)
}
`,
    },
    {
      id: 'external_ids',
      filename: 'external_ids.tsv.gz',
      columns: ['item', 'propertyId', 'value'],
      query: PREFIXES + `
SELECT DISTINCT ?item ?propertyId ?value WHERE {
  ${candidateGroup}
  ${externalGroup}
}
`,
    },
    {
      id: 'wikipedia_sitelinks',
      filename: 'wikipedia_sitelinks.tsv.gz',
      columns: ['item', 'site'],
      query: PREFIXES + `
SELECT DISTINCT ?item ?site WHERE {
  ${candidateGroup}
  ?article schema:about ?item ;
           schema:isPartOf ?site .
  ?site wikibase:wikiGroup "wikipedia" .
}
`,
    },
  ];
}

function decodeEscapeSequence(text, index) {
  if (index + 1 >= text.length) {
    return { value: '\\', consumed: 1 };
  }

  const code = text[index + 1];
  const simple = {
    t: '\t',
    b: '\b',
    n: '\n',
    r: '\r',
    f: '\f',
    '"': '"',
    "'": "'",
    '\\': '\\',
  };
  if (Object.hasOwn(simple, code)) return { value: simple[code], consumed: 2 };

  if (code === 'u') {
    const hex = text.slice(index + 2, index + 6);
    if (/^[0-9A-Fa-f]{4}$/u.test(hex)) {
      return { value: String.fromCodePoint(Number.parseInt(hex, 16)), consumed: 6 };
    }
  }
  if (code === 'U') {
    const hex = text.slice(index + 2, index + 10);
    if (/^[0-9A-Fa-f]{8}$/u.test(hex)) {
      return { value: String.fromCodePoint(Number.parseInt(hex, 16)), consumed: 10 };
    }
  }
  return { value: code, consumed: 2 };
}

function quotedLiteralClosingQuote(raw) {
  for (let index = raw.length - 1; index > 0; index -= 1) {
    if (raw[index] !== '"') continue;
    const suffix = raw.slice(index + 1);
    if (
      suffix === ''
      || /^@[A-Za-z0-9-]+$/u.test(suffix)
      || /^\^\^<[^>]+>$/u.test(suffix)
    ) {
      return index;
    }
  }
  return -1;
}

function decodeQuotedLexical(raw) {
  const closingQuote = quotedLiteralClosingQuote(raw);
  if (closingQuote < 1) {
    throw new Error(`Unterminated SPARQL TSV literal: ${raw.slice(0, 120)}`);
  }

  const lexical = raw.slice(1, closingQuote);
  let out = '';
  for (let i = 0; i < lexical.length; i += 1) {
    const char = lexical[i];
    if (char !== '\\') {
      out += char;
      continue;
    }
    const decoded = decodeEscapeSequence(lexical, i);
    out += decoded.value;
    i += decoded.consumed - 1;
  }
  return out;
}

export function decodeSparqlTsvTerm(rawValue) {
  const raw = String(rawValue ?? '');
  if (!raw) return null;
  if (raw.startsWith('<') && raw.endsWith('>')) return raw.slice(1, -1);
  if (raw.startsWith('"')) return decodeQuotedLexical(raw);
  return raw;
}

export function parseSparqlTsvLine(line) {
  return String(line ?? '').replace(/\r$/u, '').split('\t').map(decodeSparqlTsvTerm);
}

export function qidFromEntityTerm(term) {
  const value = String(term ?? '');
  const match = value.match(/(?:^|\/)(Q\d+)$/u);
  return match ? match[1] : null;
}

export function normalizeQLeverSite(term) {
  const value = String(term ?? '').trim();
  return value.endsWith('/') ? value : `${value}/`;
}
