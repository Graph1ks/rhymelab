export const WRITER_MORPHOLOGY_POLICY = 'de-attested-right-head-v1';

const MIN_LEFT_LENGTH = 3;
const MIN_RIGHT_LENGTH = 5;
const LOOKUP_BATCH_SIZE = 350;

function normalizeSurface(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE');
}

function lexicalShape(value) {
  return /^[\p{L}ßäöü]+$/u.test(value);
}

export function leftLexemeVariants(leftRaw) {
  const left = normalizeSurface(leftRaw);
  if (!left) return [];
  const variants = [];
  const seen = new Set();
  const add = (normalized, transformation, linker = null, cost = 0) => {
    const key = normalizeSurface(normalized);
    if (!key || key.length < MIN_LEFT_LENGTH || seen.has(key)) return;
    seen.add(key);
    variants.push({ normalized: key, transformation, linker, cost });
  };

  add(left, 'exact', null, 0);

  const linkerRules = [
    ['es', 'es'],
    ['en', 'en'],
    ['er', 'er'],
    ['s', 's'],
    ['n', 'n'],
    ['e', 'e'],
  ];
  for (const [ending, linker] of linkerRules) {
    if (!left.endsWith(ending) || left.length - ending.length < MIN_LEFT_LENGTH) continue;
    const stem = left.slice(0, -ending.length);
    add(stem, `strip_${linker}`, linker, 1);
    add(`${stem}e`, `strip_${linker}_restore_e`, linker, 2);
  }

  return variants;
}

export function rightHeadSplitCandidates(value) {
  const normalized = normalizeSurface(value);
  if (!normalized || !lexicalShape(normalized)) return [];
  const candidates = [];
  for (let splitIndex = MIN_LEFT_LENGTH; splitIndex <= normalized.length - MIN_RIGHT_LENGTH; splitIndex += 1) {
    const leftRaw = normalized.slice(0, splitIndex);
    const right = normalized.slice(splitIndex);
    if (!lexicalShape(leftRaw) || !lexicalShape(right)) continue;
    candidates.push({
      normalized,
      splitIndex,
      leftRaw,
      right,
      leftVariants: leftLexemeVariants(leftRaw),
    });
  }
  return candidates;
}

function attestedRow(attested, normalized) {
  return attested instanceof Map ? attested.get(normalized) || null : null;
}

export function chooseAttestedRightHead(value, attested) {
  const normalized = normalizeSurface(value);
  const candidates = rightHeadSplitCandidates(normalized);
  const valid = [];

  for (const candidate of candidates) {
    const rightEvidence = attestedRow(attested, candidate.right);
    if (!rightEvidence) continue;
    const leftEvidence = candidate.leftVariants
      .map((variant) => ({ variant, row: attestedRow(attested, variant.normalized) }))
      .filter((entry) => entry.row)
      .sort((a, b) => a.variant.cost - b.variant.cost
        || Number(a.row?.usage_rank ?? Number.MAX_SAFE_INTEGER) - Number(b.row?.usage_rank ?? Number.MAX_SAFE_INTEGER))[0];
    if (!leftEvidence) continue;
    valid.push({ candidate, rightEvidence, leftEvidence });
  }

  // The writer family wants the rightmost lexical head, not the longest nested compound.
  // Prefer the shortest independently attested terminal lexeme once both sides of the split
  // have lexical evidence. This makes Rohstoff|preise win over Roh|stoffpreise while
  // rejecting false inner substrings such as Sonderp|reise.
  valid.sort((a, b) => a.candidate.right.length - b.candidate.right.length
    || a.leftEvidence.variant.cost - b.leftEvidence.variant.cost
    || b.candidate.splitIndex - a.candidate.splitIndex
    || Number(a.rightEvidence?.usage_rank ?? Number.MAX_SAFE_INTEGER) - Number(b.rightEvidence?.usage_rank ?? Number.MAX_SAFE_INTEGER));

  const best = valid[0];
  if (!best) {
    return {
      policy: WRITER_MORPHOLOGY_POLICY,
      status: 'unresolved',
      inferred: true,
      familyKey: null,
      source: 'local_hot_exact_surface_evidence',
    };
  }

  const { candidate, rightEvidence, leftEvidence } = best;
  return {
    policy: WRITER_MORPHOLOGY_POLICY,
    status: 'attested_right_head_candidate',
    inferred: true,
    familyKey: `right:${candidate.right}`,
    source: 'local_hot_exact_surface_evidence',
    split: {
      index: candidate.splitIndex,
      leftRaw: candidate.leftRaw,
      right: candidate.right,
    },
    leftEvidence: {
      normalized: leftEvidence.variant.normalized,
      surface: leftEvidence.row.surface,
      lemma: leftEvidence.row.lemma || null,
      partOfSpeech: leftEvidence.row.pos || null,
      usageRank: leftEvidence.row.usage_rank ?? null,
      transformation: leftEvidence.variant.transformation,
      linker: leftEvidence.variant.linker,
    },
    rightHead: {
      normalized: candidate.right,
      surface: rightEvidence.surface,
      lemma: rightEvidence.lemma || null,
      partOfSpeech: rightEvidence.pos || null,
      usageRank: rightEvidence.usage_rank ?? null,
    },
  };
}

function collectLookupForms(rows) {
  const forms = new Set();
  const candidatesByWord = new Map();
  for (const row of rows) {
    const normalized = normalizeSurface(row?.normalized || row?.surface || row?.word);
    if (!normalized || candidatesByWord.has(normalized)) continue;
    const candidates = rightHeadSplitCandidates(normalized);
    candidatesByWord.set(normalized, candidates);
    for (const candidate of candidates) {
      forms.add(candidate.right);
      for (const left of candidate.leftVariants) forms.add(left.normalized);
    }
  }
  return { forms: [...forms], candidatesByWord };
}

function lookupAttestedForms(db, forms) {
  const attested = new Map();
  for (let start = 0; start < forms.length; start += LOOKUP_BATCH_SIZE) {
    const batch = forms.slice(start, start + LOOKUP_BATCH_SIZE);
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT normalized, surface, lemma, pos, usage_rank
      FROM hot
      WHERE normalized IN (${placeholders})
        AND pronunciation_preferred=1
        AND historical=0
      ORDER BY normalized, usage_rank IS NULL, usage_rank, id
    `).all(...batch);
    for (const row of rows) {
      if (!attested.has(row.normalized)) attested.set(row.normalized, row);
    }
  }
  return attested;
}

export function resolveWriterMorphologyBatch(db, rows, language = 'de') {
  const result = new Map();
  if (language !== 'de') return result;
  const uniqueRows = [];
  const seen = new Set();
  for (const row of rows || []) {
    const normalized = normalizeSurface(row?.normalized || row?.surface || row?.word);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueRows.push({ ...row, normalized });
  }

  const { forms } = collectLookupForms(uniqueRows);
  const attested = lookupAttestedForms(db, forms);
  for (const row of uniqueRows) {
    result.set(row.normalized, chooseAttestedRightHead(row.normalized, attested));
  }
  return result;
}
