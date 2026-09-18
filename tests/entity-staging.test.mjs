import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  attachAndJoinQRank,
  categoryCutDiagnostics,
  createEntityStageStorage,
  createQRankStageStorage,
  createTaxonomyRawPrefilter,
  extractStageEntity,
  finalizeQRankStage,
  parseQRankLine,
  parseWikidataDumpLine,
  sentinelCutChecks,
  stageStats,
  writeStageEntity,
} from '../scripts/entity-staging-core.mjs';
import { readFile } from 'node:fs/promises';

const taxonomy = JSON.parse(
  await readFile('sources/entity/wikidata-entity-taxonomy-v1.json', 'utf8'),
);

function wikidataClaimEntity(id) {
  return [{
    mainsnak: {
      snaktype: 'value',
      property: 'P106',
      datatype: 'wikibase-item',
      datavalue: { value: { 'entity-type': 'item', id }, type: 'wikibase-entityid' },
    },
    type: 'statement',
    rank: 'normal',
  }];
}

function actor(id, name, qrankFriendly = true) {
  return {
    id,
    type: 'item',
    labels: {
      en: { language: 'en', value: name },
      de: { language: 'de', value: name },
    },
    aliases: {},
    descriptions: {},
    sitelinks: qrankFriendly
      ? {
        dewiki: { site: 'dewiki', title: name },
        enwiki: { site: 'enwiki', title: name },
      }
      : { enwiki: { site: 'enwiki', title: name } },
    claims: {
      P31: [{
        mainsnak: {
          snaktype: 'value',
          property: 'P31',
          datatype: 'wikibase-item',
          datavalue: { value: { 'entity-type': 'item', id: 'Q5' }, type: 'wikibase-entityid' },
        },
        type: 'statement',
        rank: 'normal',
      }],
      P106: wikidataClaimEntity('Q33999'),
    },
  };
}

test('Wikidata line parser accepts array framing and trailing commas', () => {
  assert.equal(parseWikidataDumpLine('['), null);
  assert.equal(parseWikidataDumpLine(']'), null);
  assert.deepEqual(parseWikidataDumpLine(' {"id":"Q42","type":"item"}, '), { id: 'Q42', type: 'item' });
});

test('staging extractor handles real Wikibase mainsnak entity IDs', () => {
  const row = extractStageEntity(actor('Q221074', 'Bud Spencer'), taxonomy);
  assert.equal(row.qid, 'Q221074');
  assert.equal(row.primaryCategory, 'person.actor');
  assert.equal(row.categories.some((x) => x.category === 'person.actor'), true);
  assert.equal(row.hasDewiki, 1);
  assert.equal(row.hasEnwiki, 1);
});

test('raw taxonomy prefilter is lossless for relevant categories and conservative for false positives', () => {
  const prefilter = createTaxonomyRawPrefilter(taxonomy);
  assert.equal(prefilter.qids.length, 13);

  const relevant = JSON.stringify(actor('Q900000101', 'Relevant Actor'));
  assert.equal(prefilter.test(relevant), true);

  const irrelevant = JSON.stringify({
    id: 'Q900000102',
    type: 'item',
    labels: { en: { language: 'en', value: 'Irrelevant Human' } },
    aliases: {},
    descriptions: {},
    sitelinks: {},
    claims: {
      P31: [{
        mainsnak: {
          datavalue: { value: { id: 'Q5' } },
        },
      }],
    },
  });
  assert.equal(prefilter.test(irrelevant), false);

  const conservativeFalsePositive = JSON.stringify({
    id: 'Q900000103',
    type: 'item',
    labels: { en: { language: 'en', value: 'Text Mention Only' } },
    aliases: {},
    descriptions: { en: { language: 'en', value: 'mentions Q33999 only as text' } },
    sitelinks: {},
    claims: {},
  });
  assert.equal(prefilter.test(conservativeFalsePositive), true);
  assert.equal(extractStageEntity(JSON.parse(conservativeFalsePositive), taxonomy), null);
});

test('duplicate source claims collapse to one staged external ID', () => {
  const item = actor('Q900000104', 'Duplicate ID Actor');
  const claim = (value) => ({
    mainsnak: {
      snaktype: 'value',
      property: 'P345',
      datatype: 'external-id',
      datavalue: { value, type: 'string' },
    },
    type: 'statement',
    rank: 'normal',
  });
  item.claims.P345 = [claim('nm1234567'), claim('nm1234567')];

  const row = extractStageEntity(item, taxonomy);
  assert.equal(row.externalIdCount, 1);
  assert.deepEqual(row.externalIds, [{
    propertyId: 'P345',
    system: 'imdb',
    value: 'nm1234567',
  }]);

  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON;');
    createEntityStageStorage(db);
    assert.doesNotThrow(() => writeStageEntity(db, row, 1));
    assert.equal(
      Number(db.prepare('SELECT COUNT(*) AS c FROM entity_stage_external_id').get().c),
      1,
    );
  } finally {
    db.close();
  }
});

test('QRank CSV parser accepts header and numeric rows', () => {
  assert.equal(parseQRankLine('Entity,QRank', 1), null);
  assert.deepEqual(parseQRankLine('Q221074,1234567', 2), { qid: 'Q221074', qrank: 1234567 });
  assert.equal(parseQRankLine('bad,row', 3), null);
});

test('staging DB joins QRank and produces category-relative cut diagnostics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rhymelab-entity-stage-'));
  const entityPath = join(dir, 'entities.sqlite');
  const qrankPath = join(dir, 'qrank.sqlite');
  const entityDb = new DatabaseSync(entityPath);
  const qrankDb = new DatabaseSync(qrankPath);

  try {
    entityDb.exec('PRAGMA foreign_keys=ON;');
    createEntityStageStorage(entityDb);

    const rows = [
      actor('Q221074', 'Bud Spencer'),
      actor('Q900000011', 'Mid Actor'),
      actor('Q900000012', 'Tail Actor', false),
    ].map((item) => extractStageEntity(item, taxonomy));

    rows.forEach((row, index) => writeStageEntity(entityDb, row, index + 1));

    createQRankStageStorage(qrankDb);
    const insert = qrankDb.prepare('INSERT INTO qrank_stage(qid,qrank) VALUES(?,?)');
    insert.run('Q221074', 900000);
    insert.run('Q900000011', 100000);
    insert.run('Q900000012', 10);
    finalizeQRankStage(qrankDb);
    qrankDb.close();

    attachAndJoinQRank(entityDb, qrankPath);

    assert.deepEqual(stageStats(entityDb), {
      entities: 3,
      categories: 3,
      names: 6,
      externalIds: 0,
      withQRank: 3,
      withDewiki: 2,
      withEnwiki: 3,
    });

    const diagnostics = categoryCutDiagnostics(entityDb, taxonomy);
    const actorRows = diagnostics.find((row) => row.category === 'person.actor');
    assert.equal(actorRows.candidates, 3);
    assert.equal(actorRows.kept, 2);
    assert.equal(actorRows.top[0].qid, 'Q221074');
    assert.equal(actorRows.tail.at(-1).qid, 'Q900000012');
    assert.equal(actorRows.tail.at(-1).keep, false);

    const sentinel = sentinelCutChecks(entityDb, taxonomy);
    assert.equal(sentinel[0].qid, 'Q221074');
    assert.equal(sentinel[0].pass, true);
    assert.equal(sentinel[0].qrank, 900000);
  } finally {
    try { entityDb.close(); } catch {}
    try { qrankDb.close(); } catch {}
    await rm(dir, { recursive: true, force: true });
  }
});


test('owner source registry pins dated Wikidata snapshot and local-pinned QRank policy', async () => {
  const registry = JSON.parse(
    await readFile('sources/entity/phase12a-sources-v1.json', 'utf8'),
  );
  const wikidata = registry.sources.find((row) => row.source_id === 'wikidata-json-entities');
  const qrank = registry.sources.find((row) => row.source_id === 'wikidata-qrank');

  assert.equal(wikidata.selected_owner_snapshot.snapshot_label, '20260914');
  assert.equal(
    wikidata.selected_owner_snapshot.url,
    'https://dumps.wikimedia.org/wikidatawiki/entities/20260914/wikidata-20260914-all.json.bz2',
  );
  assert.equal(wikidata.selected_owner_snapshot.bytes, 103137817948);
  assert.equal(
    wikidata.selected_owner_snapshot.official_checksum,
    '0a985a65262a665fa33808c7d40a1d42ad28d62c',
  );
  assert.equal(wikidata.selected_owner_snapshot.official_checksum_algorithm, 'sha1');
  assert.deepEqual(
    wikidata.selected_owner_snapshot.transport_urls.map((row) => [row.id, row.role]),
    [
      ['acc-umu-se', 'primary_mirror'],
      ['your-org', 'secondary_mirror'],
      ['wikimedia-origin', 'origin_fallback'],
    ],
  );
  assert.equal(
    wikidata.selected_owner_snapshot.transport_urls[2].url,
    wikidata.selected_owner_snapshot.url,
  );

  assert.equal(qrank.selected_owner_snapshot_policy.retrieval_date, '2026-09-18');
  assert.equal(qrank.selected_owner_snapshot_policy.filename, 'qrank-20260918.csv.gz');
  assert.equal(qrank.selected_owner_snapshot_policy.historical_retrieval_guaranteed, false);
});
