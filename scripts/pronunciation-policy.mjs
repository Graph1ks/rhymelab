const text = (value) => String(value ?? '').normalize('NFKC').trim();

function lowerTags(tags = []) {
  return [...new Set(tags.map(text).filter(Boolean))];
}

export function classifyPronunciationEvidence({ ipa, tags = [], rawTags = [] } = {}) {
  const normalizedTags = lowerTags(tags);
  const normalizedRawTags = lowerTags(rawTags);
  const haystack = [...normalizedTags, ...normalizedRawTags].join(' | ').toLocaleLowerCase('de-DE');

  const connectedSpeech = /[‿\s]/u.test(text(ipa));
  const austrian = /austrian german|österreich/u.test(haystack);
  const swiss = /swiss german|schweiz/u.test(haystack);
  const regional = austrian || swiss || /regional|dialect|dialekt/u.test(haystack);
  const colloquial = /colloquial|informal|slang|umgangssprach/u.test(haystack);
  const contextSpecific = /demonstrativ|context|kontext/u.test(haystack);

  let locale = null;
  let dialect = null;
  if (austrian) { locale = 'de-AT'; dialect = 'Austrian German'; }
  else if (swiss) { locale = 'de-CH'; dialect = 'Swiss German'; }

  let register = null;
  if (colloquial) register = 'colloquial';

  const flags = [];
  if (connectedSpeech) flags.push('connected_speech');
  if (regional) flags.push('regional');
  if (colloquial) flags.push('colloquial');
  if (contextSpecific) flags.push('context_specific');

  // This is an ordinal preference penalty, not a probability/confidence score.
  // Untagged standalone pronunciations are preferred for the default German view;
  // marked variants remain available through the all-variants path.
  let penalty = 0;
  if (contextSpecific) penalty += 30;
  if (colloquial) penalty += 40;
  if (regional) penalty += 80;
  if (connectedSpeech) penalty += 1000;

  return {
    tags: normalizedTags,
    rawTags: normalizedRawTags,
    flags,
    locale,
    dialect,
    register,
    eligible: !connectedSpeech,
    penalty,
  };
}

export function rankPronunciationVariants(variants = []) {
  const enriched = variants.map((variant) => ({
    ...variant,
    ...classifyPronunciationEvidence(variant),
    evidenceCount: Math.max(1, Number(variant.evidenceCount || 1)),
    sourceOrder: Math.max(0, Number(variant.sourceOrder || 0)),
  }));

  enriched.sort((a, b) =>
    Number(b.eligible) - Number(a.eligible)
    || a.penalty - b.penalty
    || b.evidenceCount - a.evidenceCount
    || a.sourceOrder - b.sourceOrder
    || String(a.ipa).localeCompare(String(b.ipa), 'de')
  );

  let preferredAssigned = false;
  return enriched.map((variant, index) => {
    const preferred = !preferredAssigned && variant.eligible;
    if (preferred) preferredAssigned = true;
    return {
      ...variant,
      preferenceRank: index + 1,
      preferred,
    };
  });
}
