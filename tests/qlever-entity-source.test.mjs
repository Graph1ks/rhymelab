import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildAllRankCandidateUnion,
  buildQLeverEntityQueries,
  decodeSparqlTsvTerm,
  normalizeQLeverSite,
  parseSparqlTsvLine,
  qidFromEntityTerm,
} from '../scripts/qlever-entity-source-core.mjs';

const taxonomy=JSON.parse(
  await readFile('sources/entity/wikidata-entity-taxonomy-v1.json','utf8'),
);

test('QLever candidate union matches current all-valued-statement semantics',()=>{
  const query=buildAllRankCandidateUnion(taxonomy);
  assert.match(query,/p:P106/u);
  assert.match(query,/ps:P106/u);
  assert.match(query,/p:P31/u);
  assert.match(query,/ps:P31/u);
  assert.match(query,/wd:Q33999/u);
  assert.equal((query.match(/\bUNION\b/gu)||[]).length,12);
});

test('QLever selective export set covers every Phase 12A2 stage field family',()=>{
  const queries=buildQLeverEntityQueries(taxonomy);
  assert.deepEqual(
    queries.map((row)=>row.id),
    ['membership','core','aliases','external_ids','wikipedia_sitelinks'],
  );
  const byId=new Map(queries.map((row)=>[row.id,row.query]));
  assert.match(byId.get('membership'),/matchProperty/u);
  assert.match(byId.get('core'),/wikibase:statements/u);
  assert.match(byId.get('core'),/descriptionDe/u);
  assert.match(byId.get('aliases'),/skos:altLabel/u);
  for(const propertyId of Object.keys(taxonomy.external_id_whitelist)){
    assert.match(byId.get('external_ids'),new RegExp(`p:${propertyId}\\b`,'u'));
    assert.match(byId.get('external_ids'),new RegExp(`ps:${propertyId}\\b`,'u'));
  }
  assert.match(
    byId.get('external_ids'),
    /WHERE \{\s*\{\s*\{ \?item p:P106[\s\S]+?\}\s*\}\s*\{\s*\{ \?item p:P1902[\s\S]+?\}\s*\}\s*\}/u,
  );
  assert.match(byId.get('wikipedia_sitelinks'),/wikibase:wikiGroup "wikipedia"/u);
});

test('SPARQL TSV decoder handles URIs, typed literals, languages and escapes',()=>{
  assert.equal(
    decodeSparqlTsvTerm('<http://www.wikidata.org/entity/Q221074>'),
    'http://www.wikidata.org/entity/Q221074',
  );
  assert.equal(decodeSparqlTsvTerm('"Bud Spencer"@de'),'Bud Spencer');
  assert.equal(
    decodeSparqlTsvTerm('"74"^^<http://www.w3.org/2001/XMLSchema#int>'),
    '74',
  );
  assert.equal(decodeSparqlTsvTerm('"a\\tb\\n\\u00DF"'),'a\tb\nß');
  assert.equal(
    decodeSparqlTsvTerm(String.raw`"Russian rap band\"@en`),
    'Russian rap band\\',
  );
  assert.equal(
    decodeSparqlTsvTerm(String.raw`"Band\""@en`),
    'Band"',
  );
  assert.equal(decodeSparqlTsvTerm(''),null);

  const row=parseSparqlTsvLine(
    '<http://www.wikidata.org/entity/Q221074>\t"de"\t"Carlo Pedersoli"@de',
  );
  assert.deepEqual(row,[
    'http://www.wikidata.org/entity/Q221074',
    'de',
    'Carlo Pedersoli',
  ]);
  assert.equal(qidFromEntityTerm(row[0]),'Q221074');
});

test('QLever Wikipedia site normalization is stable',()=>{
  assert.equal(normalizeQLeverSite('https://de.wikipedia.org'),'https://de.wikipedia.org/');
  assert.equal(normalizeQLeverSite('https://en.wikipedia.org/'),'https://en.wikipedia.org/');
});
