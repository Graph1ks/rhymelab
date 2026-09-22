import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

import {createServingV1Storage} from '../scripts/serving-v1-core.mjs';
import {createServingV1RuntimeStorage} from '../scripts/serving-v1-runtime-core.mjs';
import {createServingV1ProductStorage} from '../scripts/serving-v1-product-core.mjs';
import {
  DISTRIBUTION_COPY_STAGES,
  DISTRIBUTION_RANK_POLICY,
  copyDistributionStage,
  createRankTables,
  createSelectionStorage,
  clearSelectionStorage,
  createTargetSchema,
  distributionIntegrityReport,
  editionContract,
  ensureEntityAvailability,
  normalizeEditionAvailability,
  populateDistributionSelection,
  readMeta,
  writeDistributionManifest,
} from '../scripts/distribution-materializer-core.mjs';
import {
  servingV1DistributionCapabilities,
} from '../src/serving-v1-product-runtime.mjs';
import {
  verifyDistributionNestingFiles,
} from '../scripts/distribution-nesting-core.mjs';

function putMeta(db,key,value){
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,String(value));
}

function seedSource(db){
  createServingV1Storage(db);
  createServingV1RuntimeStorage(db);
  createServingV1ProductStorage(db);
  for(const [key,value] of Object.entries({
    schema:'rhymelab-serving-v1',
    identity_revision:'identity-v1',
    runtime_status:'complete',
    runtime_revision:'runtime-v1',
    runtime_semantic_fingerprint:'runtime-fp',
    product_adapter_schema:'rhymelab-serving-v1-product-adapter-v1',
    product_adapter_status:'complete',
    product_adapter_revision:'product-v1',
    product_adapter_identity_revision:'identity-v1',
    product_adapter_semantic_fingerprint:'product-fp',
  }))putMeta(db,key,value);

  const surface=db.prepare(`
    INSERT INTO surface(
      surface_id,language,normalized,display_surface,
      canonical_available,generated_available,authority_rank,authority_kind,
      usage_rank,usage_count,historical
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `);
  const rows=[
    [1,'de','alpha','Alpha',1,0,10,'core_word',1,1000,0],
    [2,'de','beta','Beta',1,0,10,'core_word',2,900,0],
    [3,'en','apple','Apple',1,0,10,'core_word',1,1000,0],
    [4,'en','berry','Berry',1,0,10,'core_word',2,900,0],
    [5,'de','ohne-rang','Ohne Rang',1,0,10,'core_word',null,10,0],
    [6,'en','unranked','Unranked',1,0,10,'core_word',null,10,0],
    [7,'de','genau','Genau',0,1,110,'generated_word',5,100,0],
    [8,'en','generated','Generated',0,1,110,'generated_word',5,100,0],
  ];
  for(const row of rows)surface.run(...row);

  const pron=db.prepare(`
    INSERT INTO pronunciation(
      pronunciation_id,surface_id,identity_key,notation,raw,ipa,
      eligible,canonical_available,generated_available,
      canonical_preferred,generated_preferred,authority_rank,authority_kind
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  for(const row of rows){
    const id=100+row[0];
    const core=row[4]===1;
    pron.run(
      id,row[0],'id-'+id,'ipa','x','x',1,
      core?1:0,core?0:1,core?1:0,core?0:1,
      core?10:110,core?'core_word':'generated_word',
    );
  }

  const role=db.prepare(`
    INSERT INTO surface_role(surface_id,role,canonical_available,generated_available)
    VALUES(?,?,?,?)
  `);
  const origin=db.prepare(`
    INSERT INTO pronunciation_origin(pronunciation_id,layer,domain,source_kind,origin_count)
    VALUES(?,?,?,?,1)
  `);
  for(const row of rows){
    const core=row[4]===1;
    role.run(row[0],'lexical',core?1:0,core?0:1);
    origin.run(100+row[0],core?'core':'generated','word',core?'fixture_core':'fixture_generated');
  }
}

test('distribution rank v1 merges language-local usage percentiles before fallback rows',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    seedSource(db);
    createRankTables(db,{alias:'main'});
    const top4=db.prepare(`
      SELECT language,normalized,rank_class,distribution_rank
      FROM _dist_core_rank
      ORDER BY distribution_rank
      LIMIT 4
    `).all();
    assert.deepEqual(
      top4.map((row)=>[row.language,row.normalized,row.rank_class]),
      [
        ['de','alpha',0],
        ['en','apple',0],
        ['de','beta',0],
        ['en','berry',0],
      ],
    );
    const fallback=db.prepare(`
      SELECT MIN(distribution_rank) first_fallback
      FROM _dist_core_rank WHERE rank_class=1
    `).get();
    assert.equal(Number(fallback.first_fallback),5);
  }finally{db.close();}
});

test('Lite positive materialization keeps only selected Core word closure and explicit capabilities',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-distribution-'));
  const sourcePath=join(dir,'source.sqlite');
  const targetPath=join(dir,'lite.sqlite');
  const source=new DatabaseSync(sourcePath);
  seedSource(source);
  source.close();

  const target=new DatabaseSync(targetPath);
  try{
    target.prepare('ATTACH DATABASE ? AS src').run(sourcePath);
    const sourceMeta=readMeta(target,{alias:'src'});
    const schema=createTargetSchema(target,{alias:'src'});
    createRankTables(target,{alias:'src'});
    const selection=populateDistributionSelection(target,{
      edition:'lite',
      alias:'src',
      totalTarget:2,
      entityPerCategory:0,
    });
    assert.equal(selection.budget.target,2);
    assert.equal(selection.budget.entries,2);
    assert.equal(selection.budget.words,2);
    assert.equal(selection.word_surfaces.core,2);
    assert.equal(selection.word_surfaces.generated,0);
    assert.equal(selection.selected.phrases,0);
    assert.equal(selection.selected.entities,0);

    for(const stage of DISTRIBUTION_COPY_STAGES){
      copyDistributionStage(target,stage,{alias:'src'});
    }
    normalizeEditionAvailability(target,'lite');
    writeDistributionManifest(target,{edition:'lite',sourceMeta,selection});
    for(const row of schema.indexes)target.exec(String(row.sql));

    const integrity=distributionIntegrityReport(target,'lite');
    assert.equal(integrity.ok,true,JSON.stringify(integrity));
    assert.equal(target.prepare('SELECT COUNT(*) c FROM surface').get().c,2);
    assert.equal(target.prepare('SELECT COUNT(*) c FROM pronunciation').get().c,2);
    assert.equal(target.prepare('SELECT COUNT(*) c FROM runtime_phrase').get().c,0);
    assert.equal(target.prepare('SELECT COUNT(*) c FROM runtime_entity_identity').get().c,0);
    assert.equal(
      target.prepare(`
        SELECT COUNT(*) c FROM pronunciation
        WHERE canonical_available=0 AND generated_available=1
      `).get().c,
      0,
    );

    const capabilities=servingV1DistributionCapabilities(target);
    assert.deepEqual(capabilities,{
      edition:'lite',
      words_de:true,
      words_en:true,
      phrases:false,
      entities:false,
      generated:false,
      markov:false,
    });
    assert.equal(
      target.prepare("SELECT value FROM meta WHERE key='distribution_rank_policy'").get().value,
      DISTRIBUTION_RANK_POLICY,
    );
  }finally{
    try{target.exec('DETACH DATABASE src;');}catch{}
    target.close();
    await rm(dir,{recursive:true,force:true});
  }
});

test('distribution edition contracts use total package budgets with per-category Entity quotas',()=>{
  assert.deepEqual(
    {
      lite:editionContract('lite'),
      standard:editionContract('standard'),
      full:editionContract('full'),
    },
    {
      lite:{
        edition:'lite',totalTarget:50000,entityPerCategory:0,phraseMode:'none',mode:'core',
        features:{words_de:true,words_en:true,phrases:false,entities:false,generated:false,markov:false},
      },
      standard:{
        edition:'standard',totalTarget:250000,entityPerCategory:1000,phraseMode:'core',mode:'core',
        features:{words_de:true,words_en:true,phrases:true,entities:true,generated:false,markov:false},
      },
      full:{
        edition:'full',totalTarget:400000,entityPerCategory:5000,phraseMode:'all',mode:'all',
        features:{words_de:true,words_en:true,phrases:true,entities:true,generated:true,markov:false},
      },
    },
  );
});


test('selection reset clears Entity quota memberships between edition plans',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    createSelectionStorage(db);
    db.prepare(`
      INSERT INTO _dist_entity_membership(
        entity_id,category,edition_category_rank,selection_source
      ) VALUES(1,'person.actor',1,'edition_quota')
    `).run();
    assert.equal(
      db.prepare('SELECT COUNT(*) c FROM _dist_entity_membership').get().c,
      1,
    );
    clearSelectionStorage(db);
    assert.equal(
      db.prepare('SELECT COUNT(*) c FROM _dist_entity_membership').get().c,
      0,
    );
  }finally{db.close();}
});


test('Entity availability is materialized once and reused by category quota selection',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    seedSource(db);

    db.prepare(`
      INSERT INTO runtime_entity_identity(
        entity_id,qid,primary_category,popularity_score,popularity_percentile,popularity_tier
      ) VALUES(1,'Q1','person.actor',100,1,'A')
    `).run();
    db.prepare(`
      INSERT INTO runtime_entity_category(
        entity_id,category,category_score,category_rank,category_percentile,
        category_tier,retention_percentile_floor,retained_by_category
      ) VALUES(1,'person.actor',100,1,1,'A',0.34,1)
    `).run();
    db.prepare(`
      INSERT INTO runtime_entity_name(
        name_id,entity_id,surface_id,surface,normalized,language,script,
        name_kind,preferred,searchable,source_kind,source_record
      ) VALUES(1,1,1,'Alpha','alpha','de','Latn','label',1,1,'fixture','Q1')
    `).run();
    db.prepare(`
      INSERT INTO runtime_entity_pronunciation(
        product_pronunciation_id,name_id,serving_pronunciation_id,source_priority,
        locale,pronunciation_role,ipa,preferred,source_kind,source_record,
        generated,model_id,confidence,review_state
      ) VALUES(1,1,101,1,'de','canonical','x',1,'fixture','Q1',0,NULL,1,'accepted')
    `).run();

    const progress=[];
    const first=ensureEntityAvailability(db,{
      alias:'main',
      onProgress:(event)=>progress.push(event),
    });
    const second=ensureEntityAvailability(db,{
      alias:'main',
      onProgress:(event)=>progress.push(event),
    });
    assert.equal(first,1);
    assert.equal(second,1);
    assert.equal(
      db.prepare('SELECT canonical_available c FROM _dist_entity_availability WHERE entity_id=1').get().c,
      1,
    );
    assert.equal(progress.some((event)=>event.status==='resume_skip'),true);

    const eligible=db.prepare(`
      SELECT ec.entity_id,ec.category
      FROM runtime_entity_category ec
      JOIN _dist_entity_availability ea USING(entity_id)
      WHERE ec.retained_by_category=1
        AND ea.canonical_available=1
      ORDER BY ec.category_rank,ec.entity_id
      LIMIT 1
    `).get();
    assert.deepEqual(eligible,{entity_id:1,category:'person.actor'});
  }finally{db.close();}
});

async function makeNestingFixture(path,edition,surfaceIds){
  const db=new DatabaseSync(path);
  try{
    createServingV1Storage(db);
    createServingV1RuntimeStorage(db);
    createServingV1ProductStorage(db);
    putMeta(db,'distribution_edition',edition);
    const insert=db.prepare(`
      INSERT INTO surface(
        surface_id,language,normalized,display_surface,
        canonical_available,generated_available,authority_rank,authority_kind,
        usage_rank,usage_count,historical
      ) VALUES(?,?,?,?,1,0,10,'fixture',?,100,0)
    `);
    for(const id of surfaceIds){
      insert.run(id,'de','word-'+id,'Word '+id,id);
    }
  }finally{db.close();}
}

test('hard nesting verifier rejects missing lower-tier identities and accepts strict supersets',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rhymelab-nesting-'));
  const lite=join(dir,'lite.sqlite');
  const standard=join(dir,'standard.sqlite');
  const full=join(dir,'full.sqlite');
  try{
    await makeNestingFixture(lite,'lite',[1]);
    await makeNestingFixture(standard,'standard',[2]);
    await makeNestingFixture(full,'full',[1,2,3]);

    assert.throws(
      ()=>verifyDistributionNestingFiles({
        litePath:lite,standardPath:standard,fullPath:full,
      }),
      /nesting verification failed/,
    );

    await rm(standard,{force:true});
    await makeNestingFixture(standard,'standard',[1,2]);
    const report=verifyDistributionNestingFiles({
      litePath:lite,standardPath:standard,fullPath:full,
    });
    assert.equal(report.ok,true);
    assert.equal(report.lite_standard.ok,true);
    assert.equal(report.standard_full.ok,true);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
