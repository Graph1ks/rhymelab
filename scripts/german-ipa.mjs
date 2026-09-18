const STRESS_PRIMARY = 'ˈ';
const STRESS_SECONDARY = 'ˌ';
const BOUNDARIES = new Set([' ', '-', '.', '‿']);

const DIPHTHONGS = ['aɪ̯','aʊ̯','ɔɪ̯','ɔʏ̯','aɪ','aʊ','ɔɪ','ɔʏ','eɪ̯','oʊ̯'];
const AFFRICATES = ['t͡s','t͜s','p͡f','p͜f','t͡ʃ','t͜ʃ','d͡ʒ','d͜ʒ'];
const LONG_VOWELS = new Set(['aː','eː','iː','oː','uː','yː','øː','ɛː']);
const VOWELS = new Set(['a','e','i','o','u','y','ø','œ','ɛ','ɪ','ʊ','ʏ','ɔ','ə','ɐ','ɑ','ɒ','æ']);
const SYLLABIC = new Set(['n̩','m̩','l̩','ŋ̍','r̩']);
const VALID_ONSETS = new Set([
  'p','b','t','d','k','ɡ','f','v','s','z','ʃ','ç','x','h','m','n','ŋ','l','r','ʁ','j','ts','pf','tʃ','dʒ','ʔ',
  'pr','br','tr','dr','kr','ɡr','fr','vr','pl','bl','kl','ɡl','fl','ʃp','ʃt','kn','kv','tsv','ʃpr','ʃtr','spl','spr','str'
]);

const CANON = new Map([
  ['ɡ','g'], ['ʁ','R'], ['ʀ','R'], ['r','R'],
  ['t͡s','ts'], ['t͜s','ts'], ['p͡f','pf'], ['p͜f','pf'], ['t͡ʃ','tʃ'], ['t͜ʃ','tʃ'], ['d͡ʒ','dʒ'], ['d͜ʒ','dʒ'],
  ['aɪ̯','aɪ'], ['aʊ̯','aʊ'], ['ɔɪ̯','ɔʏ'], ['ɔɪ','ɔʏ'], ['ɔʏ̯','ɔʏ'], ['eɪ̯','eɪ'], ['oʊ̯','oʊ'],
  ['n̩','n='], ['m̩','m='], ['l̩','l='], ['ŋ̍','ŋ='], ['r̩','R='],
]);

const VOWEL_FAMILY = new Map([
  ['a','A'],['aː','A'],['ɑ','A'],['ɒ','A'],['æ','A_FRONT'],
  ['e','E_CLOSE'],['eː','E_CLOSE'],['ɛ','E_OPEN'],['ɛː','E_OPEN'],['ə','SCHWA'],['ɐ','SCHWA_R'],
  ['i','I_CLOSE'],['iː','I_CLOSE'],['ɪ','I_OPEN'],
  ['o','O_CLOSE'],['oː','O_CLOSE'],['ɔ','O_OPEN'],
  ['u','U_CLOSE'],['uː','U_CLOSE'],['ʊ','U_OPEN'],
  ['y','Y_CLOSE'],['yː','Y_CLOSE'],['ʏ','Y_OPEN'],
  ['ø','OE_CLOSE'],['øː','OE_CLOSE'],['œ','OE_OPEN'],
  ['aɪ','DIPH_AI'],['aʊ','DIPH_AU'],['ɔʏ','DIPH_OY'],['eɪ','DIPH_EI'],['oʊ','DIPH_OU'],
  ['n=','SYLLABIC_N'],['m=','SYLLABIC_M'],['l=','SYLLABIC_L'],['ŋ=','SYLLABIC_NG'],['R=','SYLLABIC_R'],
]);

export function germanVowelFamilySymbol(symbol) {
  return VOWEL_FAMILY.get(String(symbol ?? '')) || String(symbol ?? '');
}

export function germanVowelFamilyKey(nuclei) {
  return (nuclei || []).map((symbol) => germanVowelFamilySymbol(symbol)).join('-');
}

function stripOuter(value) {
  let s = String(value ?? '').normalize('NFC').trim();
  if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('/') && s.endsWith('/'))) s = s.slice(1, -1).trim();
  return s;
}

function isCombining(ch) {
  return /\p{M}/u.test(ch);
}

export function tokenizeGermanIpa(value) {
  const s = stripOuter(value);
  const tokens = [];
  for (let i = 0; i < s.length;) {
    const rest = s.slice(i);
    if (rest.startsWith(STRESS_PRIMARY) || rest.startsWith(STRESS_SECONDARY)) {
      tokens.push(rest[0]); i += 1; continue;
    }
    const boundary = [...BOUNDARIES].find((x) => rest.startsWith(x));
    if (boundary) { tokens.push('|'); i += boundary.length; continue; }
    const multi = [...DIPHTHONGS, ...AFFRICATES].find((x) => rest.startsWith(x));
    if (multi) { tokens.push(multi); i += multi.length; continue; }
    const chars = [...rest];
    let token = chars[0];
    i += token.length;
    const next = s.slice(i);
    if (next.startsWith('ː')) { token += 'ː'; i += 1; }
    else if (next.startsWith('̩') || next.startsWith('̍')) { token += [...next][0]; i += [...next][0].length; }
    while (i < s.length) {
      const cp = [...s.slice(i)][0];
      if (!isCombining(cp) || cp === '̩' || cp === '̍' || cp === '̯') break;
      i += cp.length;
    }
    if (token && !['(',')','[',']','/'].includes(token)) tokens.push(token);
  }
  return tokens.filter((token, index, arr) => token !== '|' || (index > 0 && arr[index - 1] !== '|' && index < arr.length - 1));
}

export function canonicalToken(token) {
  const mapped = CANON.get(token);
  if (mapped) return mapped;
  if (token.endsWith('ː') && VOWELS.has(token.slice(0, -1))) return token;
  return token;
}

function isNucleus(token) {
  const c = canonicalToken(token);
  return VOWELS.has(c) || LONG_VOWELS.has(c) || VOWEL_FAMILY.has(c) || DIPHTHONGS.includes(token) || SYLLABIC.has(token);
}

function canonicalCluster(tokens) {
  return tokens.map(canonicalToken).join('');
}

function onsetSplit(cluster) {
  if (!cluster.length) return 0;
  for (let len = Math.min(3, cluster.length); len >= 1; len -= 1) {
    const suffix = canonicalCluster(cluster.slice(cluster.length - len));
    if (VALID_ONSETS.has(suffix)) return cluster.length - len;
  }
  return cluster.length;
}

export function analyzeGermanIpa(value) {
  const ipa = stripOuter(value);
  const rawTokens = tokenizeGermanIpa(ipa);
  const segments = [];
  let pendingStress = 0;
  for (const token of rawTokens) {
    if (token === STRESS_PRIMARY) { pendingStress = 2; continue; }
    if (token === STRESS_SECONDARY) { pendingStress = Math.max(pendingStress, 1); continue; }
    if (token === '|') { segments.push({ token: '|', boundary: true, stress: 0 }); continue; }
    segments.push({ token: canonicalToken(token), boundary: false, stress: isNucleus(token) ? pendingStress : 0 });
    if (isNucleus(token)) pendingStress = 0;
  }

  const phonemes = segments.filter((x) => !x.boundary).map((x) => x.token);
  const nuclei = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (!segments[i].boundary && isNucleus(segments[i].token)) nuclei.push(i);
  }
  if (!nuclei.length) throw new Error(`No syllabic nucleus in IPA: ${value}`);

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
      const between = [];
      for (let i = nucleusIndex + 1; i < nextNucleus; i += 1) if (!segments[i].boundary) between.push({ index: i, token: segments[i].token });
      const boundaryIndex = segments.slice(nucleusIndex + 1, nextNucleus).findIndex((x) => x.boundary);
      if (boundaryIndex >= 0) {
        end = nucleusIndex + boundaryIndex;
      } else {
        const split = onsetSplit(between.map((x) => x.token));
        end = split === 0 ? nucleusIndex : between[split - 1]?.index ?? nucleusIndex;
      }
    }
    const content = segments.slice(start, end + 1).filter((x) => !x.boundary);
    const nucleusPos = content.findIndex((x) => isNucleus(x.token));
    const onset = content.slice(0, nucleusPos).map((x) => x.token);
    const nucleus = content[nucleusPos]?.token;
    const coda = content.slice(nucleusPos + 1).map((x) => x.token);
    syllables.push({ position: n + 1, onset, nucleus, coda, stressLevel: segments[nucleusIndex].stress });
    previousEnd = end;
  }

  if (syllables.length === 1 && syllables[0].stressLevel === 0) syllables[0].stressLevel = 2;
  let primary = syllables.findIndex((s) => s.stressLevel === 2);
  if (primary < 0) primary = syllables.findIndex((s) => s.stressLevel === 1);
  if (primary < 0) primary = 0;
  const stressPattern = syllables.map((s) => s.stressLevel).join('');
  const fromStress = syllables.slice(primary);
  const tailTokens = fromStress.flatMap((s, index) => [
    ...(index === 0 ? [] : s.onset),
    s.nucleus,
    ...s.coda,
    ...(index < fromStress.length - 1 ? ['.'] : []),
  ]).filter(Boolean);
  const final = syllables.at(-1);
  const vowelSequence = fromStress.map((s) => s.nucleus).join(' ');
  const consonantSequence = fromStress.flatMap((s, index) => [...(index === 0 ? [] : s.onset), ...s.coda]).join(' ');
  const onsetSequence = fromStress.flatMap((s, index) => index === 0 ? [] : s.onset).join(' ');
  const vowelFamilyKey = fromStress.map((s) => VOWEL_FAMILY.get(s.nucleus) || s.nucleus).join('-');
  const codaKey = final.coda.join(' ');
  const stressedTail = tailTokens.join(' ');
  const finalTail = [final.nucleus, ...final.coda].filter(Boolean).join(' ');

  return {
    ipa,
    canonicalPhonemes: phonemes.join(' '),
    phonemes,
    syllables,
    syllableCount: syllables.length,
    stressPattern,
    primaryStressSyllable: primary + 1,
    stressedTail,
    finalTail,
    vowelSequence,
    consonantSequence,
    onsetSequence,
    exactTailKey: stressedTail.replaceAll(' ', ''),
    multisyllableKey: fromStress.length >= 2 ? stressedTail.replaceAll(' ', '') : null,
    vowelKey: vowelSequence.replaceAll(' ', '-'),
    vowelFamilyKey,
    codaKey,
    codaClassKey: codaKey || 'OPEN',
    onsetKey: final.onset.join(' '),
    stressShape: stressPattern,
    stressedSyllableCount: fromStress.length,
  };
}
