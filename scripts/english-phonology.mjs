const STRESS_PRIMARY = 'ˈ';
const STRESS_SECONDARY = 'ˌ';
const IPA_BOUNDARIES = new Set([' ', '-', '.', '‿']);

const ARPABET_VOWELS = new Set([
  'AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW',
  'AX','AXR','IX','UX',
]);

const ARPABET_MAP = new Map([
  ['AA','ɑ'], ['AE','æ'], ['AO','ɔ'], ['AW','aʊ'], ['AY','aɪ'], ['EH','ɛ'], ['EY','eɪ'],
  ['IH','ɪ'], ['IY','i'], ['OW','oʊ'], ['OY','ɔɪ'], ['UH','ʊ'], ['UW','u'], ['AX','ə'], ['IX','ɪ'], ['UX','ʊ'],
  ['B','b'], ['CH','tʃ'], ['D','d'], ['DH','ð'], ['F','f'], ['G','g'], ['HH','h'], ['JH','dʒ'],
  ['K','k'], ['L','l'], ['M','m'], ['N','n'], ['NG','ŋ'], ['P','p'], ['R','ɹ'], ['S','s'], ['SH','ʃ'],
  ['T','t'], ['TH','θ'], ['V','v'], ['W','w'], ['Y','j'], ['Z','z'], ['ZH','ʒ'],
]);

const ENGLISH_VOWELS = new Set([
  'i','ɪ','e','ɛ','æ','ɑ','ɒ','ɔ','ʊ','u','ʌ','ɜ','ə','ɐ','ɚ','ɝ',
  'eɪ','aɪ','ɔɪ','aʊ','oʊ','ɪə','eə','ʊə',
  'n=','m=','l=',
]);

const IPA_MULTI = [
  't͡ʃ','d͡ʒ','tʃ','dʒ','eɪ','aɪ','ɔɪ','aʊ','əʊ','oʊ','ɪə','eə','ʊə',
  'iː','uː','ɑː','ɔː','ɜː','n̩','m̩','l̩',
];

const IPA_CANON = new Map([
  ['t͡ʃ','tʃ'], ['d͡ʒ','dʒ'], ['ɡ','g'], ['r','ɹ'],
  ['əʊ','oʊ'], ['iː','i'], ['uː','u'], ['ɑː','ɑ'], ['ɔː','ɔ'], ['ɜː','ɜ'],
  ['n̩','n='], ['m̩','m='], ['l̩','l='],
]);

const ENGLISH_CONSONANTS = new Set([
  'p','b','t','d','k','g','f','v','θ','ð','s','z','ʃ','ʒ','h','m','n','ŋ','l','ɹ','j','w','tʃ','dʒ','ʔ',
]);

const VALID_ONSETS = new Set([
  ...ENGLISH_CONSONANTS,
  'p ɹ','p l','b ɹ','b l','t ɹ','d ɹ','k ɹ','k l','g ɹ','g l','f ɹ','f l','θ ɹ','ʃ ɹ',
  's p','s t','s k','s m','s n','s l','s w','s f','t w','d w','k w','g w','h j',
  'p j','b j','f j','v j','k j','g j','m j','n j','l j','s j','z j','t j','d j',
  's p ɹ','s p l','s t ɹ','s k ɹ','s k w',
]);

const VOWEL_FAMILY = new Map([
  ['i','IY'], ['ɪ','I'], ['e','E'], ['eɪ','EY'], ['ɛ','E'], ['æ','AE'],
  ['ɑ','A'], ['ɒ','A_BACK'], ['ɔ','O'], ['oʊ','OW'], ['ʊ','U'], ['u','UW'],
  ['ʌ','UH'], ['ə','SCHWA'], ['ɐ','SCHWA'], ['ɜ','ER_NONRHOTIC'], ['ɚ','ER_RHOTIC'], ['ɝ','ER_RHOTIC'],
  ['aɪ','AY'], ['aʊ','AW'], ['ɔɪ','OY'], ['ɪə','CENTRING_I'], ['eə','CENTRING_E'], ['ʊə','CENTRING_U'],
  ['n=','SYLLABIC_N'], ['m=','SYLLABIC_M'], ['l=','SYLLABIC_L'],
]);

function stripOuter(value) {
  let s = String(value ?? '').normalize('NFC').trim();
  if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('/') && s.endsWith('/'))) s = s.slice(1, -1).trim();
  return s;
}

function arpabetStressLevel(digit) {
  if (digit === '1') return 2;
  if (digit === '2') return 1;
  return 0;
}

function canonicalArpabet(base, stressDigit) {
  if (base === 'AH') return stressDigit === '0' || !stressDigit ? 'ə' : 'ʌ';
  if (base === 'ER') return stressDigit === '0' || !stressDigit ? 'ɚ' : 'ɝ';
  if (base === 'AXR') return 'ɚ';
  const mapped = ARPABET_MAP.get(base);
  if (!mapped) throw new Error(`Unsupported CMUdict ARPAbet phone: ${base}`);
  return mapped;
}

export function tokenizeEnglishArpabet(value) {
  const raw = Array.isArray(value) ? value.map(String) : String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (!raw.length) throw new Error('English ARPAbet pronunciation is empty');
  return raw.map((sourceToken) => {
    const match = sourceToken.toUpperCase().match(/^([A-Z]+)([012])?$/);
    if (!match) throw new Error(`Invalid CMUdict ARPAbet token: ${sourceToken}`);
    const [, base, stressDigit = ''] = match;
    const vowel = ARPABET_VOWELS.has(base);
    if (!vowel && stressDigit) throw new Error(`Stress digit on non-vowel ARPAbet token: ${sourceToken}`);
    return {
      sourceToken,
      token: canonicalArpabet(base, stressDigit),
      boundary: false,
      stress: vowel ? arpabetStressLevel(stressDigit) : 0,
      vowel,
    };
  });
}

function nextCodePoint(value) {
  return [...value][0] ?? '';
}

function isIgnorableIpaMark(ch) {
  return ch === 'ʰ' || ch === '̚' || ch === '̃';
}

export function tokenizeEnglishIpa(value) {
  const s = stripOuter(value);
  if (!s) throw new Error('English IPA pronunciation is empty');
  const tokens = [];
  let pendingStress = 0;
  for (let i = 0; i < s.length;) {
    const rest = s.slice(i);
    if (rest.startsWith(STRESS_PRIMARY)) { pendingStress = 2; i += STRESS_PRIMARY.length; continue; }
    if (rest.startsWith(STRESS_SECONDARY)) { pendingStress = Math.max(pendingStress, 1); i += STRESS_SECONDARY.length; continue; }

    const boundary = [...IPA_BOUNDARIES].find((item) => rest.startsWith(item));
    if (boundary) {
      if (tokens.length && !tokens.at(-1).boundary) tokens.push({ token: '|', boundary: true, stress: 0, vowel: false });
      i += boundary.length;
      continue;
    }

    const multi = IPA_MULTI.find((item) => rest.startsWith(item));
    let rawToken;
    if (multi) {
      rawToken = multi;
      i += multi.length;
    } else {
      rawToken = nextCodePoint(rest);
      i += rawToken.length;
    }

    if (isIgnorableIpaMark(rawToken)) continue;
    const token = IPA_CANON.get(rawToken) || rawToken;
    if (!ENGLISH_VOWELS.has(token) && !ENGLISH_CONSONANTS.has(token)) {
      throw new Error(`Unsupported English IPA symbol: ${rawToken} in ${value}`);
    }
    const vowel = ENGLISH_VOWELS.has(token);
    tokens.push({ token, boundary: false, stress: vowel ? pendingStress : 0, vowel });
    if (vowel) pendingStress = 0;
  }

  while (tokens.at(-1)?.boundary) tokens.pop();
  return tokens.filter((item, index) => !item.boundary || (index > 0 && !tokens[index - 1]?.boundary));
}

function onsetSplit(cluster) {
  if (!cluster.length) return 0;
  for (let len = Math.min(3, cluster.length); len >= 1; len -= 1) {
    const suffix = cluster.slice(cluster.length - len).join(' ');
    if (VALID_ONSETS.has(suffix)) return cluster.length - len;
  }
  return cluster.length;
}

function lastIndexBy(items, predicate) {
  for (let i = items.length - 1; i >= 0; i -= 1) if (predicate(items[i])) return i;
  return -1;
}

function buildEnglishAnalysis(segments, meta = {}) {
  const nuclei = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (!segments[i].boundary && ENGLISH_VOWELS.has(segments[i].token)) nuclei.push(i);
  }
  if (!nuclei.length) throw new Error(`No syllabic nucleus in English pronunciation: ${meta.rawPronunciation ?? ''}`);

  const phonemes = segments.filter((item) => !item.boundary).map((item) => item.token);
  const syllables = [];
  let previousEnd = -1;

  for (let n = 0; n < nuclei.length; n += 1) {
    const nucleusIndex = nuclei[n];
    const nextNucleus = nuclei[n + 1] ?? null;
    let start = previousEnd + 1;
    while (start < nucleusIndex && segments[start]?.boundary) start += 1;
    let end;

    if (nextNucleus === null) {
      end = segments.length - 1;
      while (end > nucleusIndex && segments[end]?.boundary) end -= 1;
    } else {
      let explicitBoundary = -1;
      for (let i = nucleusIndex + 1; i < nextNucleus; i += 1) {
        if (segments[i].boundary) { explicitBoundary = i; break; }
      }
      if (explicitBoundary >= 0) {
        end = explicitBoundary - 1;
      } else {
        const between = [];
        for (let i = nucleusIndex + 1; i < nextNucleus; i += 1) between.push({ index: i, token: segments[i].token });
        const split = onsetSplit(between.map((item) => item.token));
        end = split === 0 ? nucleusIndex : between[split - 1]?.index ?? nucleusIndex;
      }
    }

    const content = segments.slice(start, end + 1).filter((item) => !item.boundary);
    const nucleusPos = content.findIndex((item) => ENGLISH_VOWELS.has(item.token));
    if (nucleusPos < 0) throw new Error(`Failed to syllabify English pronunciation: ${meta.rawPronunciation ?? ''}`);
    const onset = content.slice(0, nucleusPos).map((item) => item.token);
    const nucleus = content[nucleusPos].token;
    const coda = content.slice(nucleusPos + 1).map((item) => item.token);
    syllables.push({
      position: n + 1,
      onset,
      nucleus,
      coda,
      stressLevel: Number(segments[nucleusIndex].stress || 0),
    });
    previousEnd = end;
  }

  if (syllables.length === 1 && syllables[0].stressLevel === 0) syllables[0].stressLevel = 2;
  let rhymeStart = lastIndexBy(syllables, (item) => item.stressLevel === 2);
  if (rhymeStart < 0) rhymeStart = lastIndexBy(syllables, (item) => item.stressLevel === 1);
  if (rhymeStart < 0) rhymeStart = 0;

  const fromStress = syllables.slice(rhymeStart);
  const tailTokens = fromStress.flatMap((syllable, index) => [
    ...(index === 0 ? [] : syllable.onset),
    syllable.nucleus,
    ...syllable.coda,
    ...(index < fromStress.length - 1 ? ['.'] : []),
  ]).filter(Boolean);
  const final = syllables.at(-1);
  const stressPattern = syllables.map((item) => item.stressLevel).join('');
  const vowelSequence = fromStress.map((item) => item.nucleus).join(' ');
  const consonantSequence = fromStress.flatMap((item, index) => [
    ...(index === 0 ? [] : item.onset),
    ...item.coda,
  ]).join(' ');
  const onsetSequence = fromStress.flatMap((item, index) => index === 0 ? [] : item.onset).join(' ');
  const exactTailKey = tailTokens.join(' ').replaceAll(' ', '');
  const finalTail = [final.nucleus, ...final.coda].join(' ');

  return {
    profile: 'en-pron-v1-candidate',
    notation: meta.notation || 'unknown',
    locale: meta.locale || null,
    source: meta.source || null,
    rawPronunciation: meta.rawPronunciation ?? null,
    canonicalPhonemes: phonemes.join(' '),
    phonemes,
    syllables,
    syllableCount: syllables.length,
    stressPattern,
    primaryStressSyllable: rhymeStart + 1,
    rhymeStartSyllable: rhymeStart + 1,
    stressedSyllableCount: fromStress.length,
    stressedTail: tailTokens.join(' '),
    exactTailKey,
    multisyllableKey: fromStress.length >= 2 ? exactTailKey : null,
    finalTail,
    vowelSequence,
    vowelKey: vowelSequence.replaceAll(' ', '-'),
    vowelFamilyKey: fromStress.map((item) => VOWEL_FAMILY.get(item.nucleus) || item.nucleus).join('-'),
    consonantSequence,
    onsetSequence,
    codaKey: final.coda.join(' '),
    codaClassKey: final.coda.length ? null : 'OPEN',
    onsetKey: final.onset.join(' '),
    rhotic: phonemes.some((token) => token === 'ɹ' || token === 'ɚ' || token === 'ɝ'),
  };
}

export function analyzeEnglishArpabet(value, options = {}) {
  const rawPronunciation = Array.isArray(value) ? value.join(' ') : String(value ?? '').trim();
  return buildEnglishAnalysis(tokenizeEnglishArpabet(value), {
    notation: 'arpabet',
    locale: options.locale || 'en-US',
    source: options.source || 'cmudict',
    rawPronunciation,
  });
}

export function analyzeEnglishIpa(value, options = {}) {
  const rawPronunciation = String(value ?? '').trim();
  return buildEnglishAnalysis(tokenizeEnglishIpa(value), {
    notation: 'ipa',
    locale: options.locale || null,
    source: options.source || 'wiktionary',
    rawPronunciation,
  });
}

export function analyzeEnglishPronunciation(value, options = {}) {
  const notation = String(options.notation || '').toLowerCase();
  if (notation === 'arpabet' || notation === 'cmudict') return analyzeEnglishArpabet(value, options);
  if (notation === 'ipa') return analyzeEnglishIpa(value, options);
  throw new Error(`Unsupported English pronunciation notation: ${notation || 'missing'}`);
}
