#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const dbPath = resolve(process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec('PRAGMA query_only=ON;');

const expectedPreferred = {
  Spotify: 'ˈspɔtɪfaɪ̯',
  Twitter: 'ˈtvɪtɐ',
  YouTube: 'ˈjuːtuːp',
  TikTok: 'ˈtɪktɔk',
  Instagram: 'ˈɪnstəɡʁam',
  Netflix: 'ˈnɛtflɪks',
};
const required = Object.keys(expectedPreferred);
const scalar = (sql, ...args) => Number(Object.values(db.prepare(sql).get(...args) || { value: 0 })[0] || 0);
const value = (sql, ...args) => Object.values(db.prepare(sql).get(...args) || { value: null })[0] ?? null;
const supportedSchemas = new Set(['rhymelab-local-db-v3', 'rhymelab-local-db-v4']);

try {
  const schema = value("SELECT value FROM meta WHERE key='schema'");
  if (!supportedSchemas.has(schema)) throw new Error(`Expected supported local DB schema (${[...supportedSchemas].join(' or ')}), got ${schema || 'missing'}`);

  const focus = {};
  const regression = {};
  for (const word of required) {
    const normalized = word.toLocaleLowerCase('de-DE');
    focus[word] = db.prepare(`
      SELECT surface, ipa, syllable_count, usage_rank, usage_count,
             lexicon_layer, entity_kind, pronunciation_source,
             pronunciation_preferred, pronunciation_rank
      FROM hot
      WHERE normalized=?
      ORDER BY pronunciation_preferred DESC, pronunciation_rank, usage_rank IS NULL, usage_rank, id
      LIMIT 12
    `).all(normalized);
    const observed = focus[word].find((row) => row.pronunciation_preferred) || null;
    regression[word] = {
      expected_ipa: expectedPreferred[word],
      observed_ipa: observed?.ipa ?? null,
      observed_source: observed?.pronunciation_source ?? null,
      observed_layer: observed?.lexicon_layer ?? null,
      ok: observed?.ipa === expectedPreferred[word]
        && observed?.pronunciation_source === 'RhymeLab curated modern lexicon'
        && observed?.lexicon_layer === 'modern',
    };
  }

  const requiredFound = Object.fromEntries(Object.entries(focus).map(([word, rows]) => [word, rows.length > 0]));
  const modernLayerForms = scalar("SELECT COUNT(DISTINCT publish_order) FROM hot WHERE lexicon_layer='modern'");
  const dictionaryLayerForms = scalar("SELECT COUNT(DISTINCT publish_order) FROM hot WHERE lexicon_layer='dictionary'");
  const modernWithUsageRank = scalar("SELECT COUNT(DISTINCT publish_order) FROM hot WHERE lexicon_layer='modern' AND usage_rank IS NOT NULL");
  const modernWithUsageCount = scalar("SELECT COUNT(DISTINCT publish_order) FROM hot WHERE lexicon_layer='modern' AND usage_count IS NOT NULL");
  const badModernSource = scalar(`
    SELECT COUNT(*) FROM hot
    WHERE lexicon_layer='modern'
      AND pronunciation_source!='RhymeLab curated modern lexicon'
  `);
  const modernWithoutOnePreferred = scalar(`
    SELECT COUNT(*) FROM (
      SELECT publish_order, SUM(pronunciation_preferred) AS preferred_count
      FROM hot
      WHERE publish_order IN (SELECT DISTINCT publish_order FROM hot WHERE lexicon_layer='modern')
      GROUP BY publish_order
      HAVING preferred_count != 1
    )
  `);
  const overlayMeta = {
    supplemental_forms: Number(value("SELECT value FROM meta WHERE key='supplemental_forms'") || 0),
    supplemental_overlaid_forms: Number(value("SELECT value FROM meta WHERE key='supplemental_overlaid_forms'") || 0),
    supplemental_pronunciations_added: Number(value("SELECT value FROM meta WHERE key='supplemental_pronunciations_added'") || 0),
  };

  const ok = Object.values(requiredFound).every(Boolean)
    && Object.values(regression).every((item) => item.ok)
    && badModernSource === 0
    && modernWithoutOnePreferred === 0
    && modernLayerForms >= required.length
    && overlayMeta.supplemental_overlaid_forms > 0;

  console.log(JSON.stringify({
    schema: 'rhymelab-modern-lexicon-audit-v3',
    database_schema: schema,
    ok,
    required_found: requiredFound,
    preferred_regression: regression,
    dictionary_layer_forms: dictionaryLayerForms,
    modern_layer_forms: modernLayerForms,
    modern_with_usage_rank: modernWithUsageRank,
    modern_with_usage_count: modernWithUsageCount,
    bad_modern_source_rows: badModernSource,
    modern_forms_without_exactly_one_preferred: modernWithoutOnePreferred,
    overlay_meta: overlayMeta,
    focus,
  }, null, 2));
} finally {
  db.close();
}
