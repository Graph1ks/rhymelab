import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSearchState,
  searchStateFromUrl,
  searchStateToWriterParams,
  writeSearchStateToUrl,
} from '../src/ui/search-state.mjs';

test('SearchState normalizes Entity multi-select while preserving legacy single-category compatibility',()=>{
  const state=createSearchState({
    entityCategory:'person',
    entityCategories:['person','musician','person','all',''],
  });
  assert.equal(state.entityCategory,'person');
  assert.deepEqual(state.entityCategories,['person','musician']);

  const legacy=createSearchState({entityCategory:'film'});
  assert.equal(legacy.entityCategory,'film');
  assert.deepEqual(legacy.entityCategories,['film']);
});

test('SearchState URL multi-select overrides legacy category and round-trips deterministically',()=>{
  const current=createSearchState({
    entityCategories:['person','musician'],
  });

  const single=searchStateFromUrl(
    'http://rhymelab.local/?entity_category=film',
    current,
  );
  assert.equal(single.entityCategory,'film');
  assert.deepEqual(single.entityCategories,['film']);

  const multi=searchStateFromUrl(
    'http://rhymelab.local/?entity_category=film&entity_categories=person,musician',
    current,
  );
  assert.equal(multi.entityCategory,'person');
  assert.deepEqual(multi.entityCategories,['person','musician']);

  const written=writeSearchStateToUrl(
    'http://rhymelab.local/',
    createSearchState({entityCategories:['person','musician']}),
  );
  assert.equal(written.searchParams.get('entity_category'),null);
  assert.equal(written.searchParams.get('entity_categories'),'person,musician');
});

test('Writer params expose explicit multi-category filter without pretending one category is authoritative',()=>{
  const params=searchStateToWriterParams(createSearchState({
    anchor:'Nacht',
    scope:'entities',
    entityCategories:['person','musician','film'],
  }));
  assert.equal(params.get('entity_category'),'all');
  assert.equal(params.get('entity_categories'),'person,musician,film');

  const single=searchStateToWriterParams(createSearchState({
    anchor:'Nacht',
    scope:'entities',
    entityCategory:'film',
  }));
  assert.equal(single.get('entity_category'),'film');
  assert.equal(single.has('entity_categories'),false);
});
