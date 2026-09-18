import { tokenizePhrase } from './phrase-catalog-core.mjs';

export function normalizeCmudictToken(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replaceAll('’', "'");
}

export function parseCmudictLexicon(text) {
  const entries = new Map();
  let pronunciations = 0;

  for (const rawLine of String(text || '').split(/\r?\n/u)) {
    const line = rawLine.replace(/\s+#.*$/u, '').trim();
    if (!line || line.startsWith(';;;')) continue;
    const firstSpace = line.search(/\s/u);
    if (firstSpace <= 0) continue;
    const rawWord = line.slice(0, firstSpace);
    const arpabet = line.slice(firstSpace).trim();
    if (!arpabet) continue;

    const base = rawWord.replace(/\(\d+\)$/u, '');
    const key = normalizeCmudictToken(base);
    if (!key) continue;
    const rows = entries.get(key) || [];
    rows.push({ rawWord, arpabet });
    entries.set(key, rows);
    pronunciations += 1;
  }

  return {
    entries,
    uniqueTokens: entries.size,
    pronunciations,
  };
}

export function cmudictCoverageForSurface(surface, lexicon) {
  const tokens = tokenizePhrase(surface);
  if (!tokens.length) {
    return {
      status: 'empty',
      tokenCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      matchedTokens: [],
      unmatchedTokens: [],
    };
  }

  const matchedTokens = [];
  const unmatchedTokens = [];
  for (const token of tokens) {
    const key = normalizeCmudictToken(token.surface);
    if (lexicon.has(key)) matchedTokens.push(token.surface);
    else unmatchedTokens.push(token.surface);
  }

  const matchedCount = matchedTokens.length;
  const unmatchedCount = unmatchedTokens.length;
  return {
    status: unmatchedCount === 0
      ? 'full'
      : matchedCount === 0
        ? 'none'
        : 'partial',
    tokenCount: tokens.length,
    matchedCount,
    unmatchedCount,
    matchedTokens,
    unmatchedTokens,
  };
}
