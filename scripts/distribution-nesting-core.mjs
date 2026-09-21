import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

export const DISTRIBUTION_NESTING_POLICY='distribution-hard-identity-superset-v1';

const CHECKS=Object.freeze([
  ['word_surfaces','runtime_lexical_profile','surface_id'],
  ['surfaces','surface','surface_id'],
  ['pronunciations','pronunciation','pronunciation_id'],
  ['surface_roles','surface_role','surface_id,role'],
  ['pronunciation_origins','pronunciation_origin','pronunciation_id,layer,domain,source_kind'],
  ['runtime_targets','runtime_target','target_id'],
  ['runtime_keys','runtime_key','key_id'],
  ['runtime_key_members','runtime_key_member','key_id,target_id'],
  ['morphology','runtime_surface_morphology','surface_id'],
  ['phrases','runtime_phrase','runtime_phrase_id'],
  ['phrase_usage','runtime_phrase_usage','runtime_phrase_id,snapshot_label'],
  ['phrase_attestations','runtime_phrase_attestation','runtime_phrase_id,ordinal'],
  ['phrase_windows','runtime_phrase_window','runtime_window_id'],
  ['pronunciation_profiles','runtime_pronunciation_profile','pronunciation_id'],
  ['de_surface_profiles','runtime_de_surface_profile','surface_id'],
  ['de_candidates','runtime_de_candidate','pronunciation_id'],
  ['de_analysis','runtime_de_analysis','pronunciation_id'],
  ['de_writer_candidates','runtime_de_writer_candidate','pronunciation_id'],
  ['phrase_profiles','runtime_phrase_profile','runtime_phrase_id'],
  ['phrase_ranking_evidence','runtime_phrase_ranking_evidence','runtime_phrase_id'],
  ['en_candidates','runtime_en_key_candidate','pronunciation_id'],
  ['entities','runtime_entity_identity','entity_id'],
  ['entity_categories','runtime_entity_category','entity_id,category'],
  ['entity_names','runtime_entity_name','name_id'],
  ['entity_pronunciations','runtime_entity_pronunciation','product_pronunciation_id'],
  ['entity_analysis','runtime_entity_analysis','product_pronunciation_id'],
  ['entity_anchor_occurrence','runtime_entity_anchor_occurrence','analyzer_id,channel,anchor_key,product_pronunciation_id'],
  ['entity_anchor_ranked','runtime_entity_anchor_ranked','analyzer_id,channel,anchor_key,product_pronunciation_id'],
  ['entity_writer_anchors','runtime_entity_writer_anchor','analyzer_id,channel,anchor_key,serving_pronunciation_id'],
]);

function q(value){
  return '"'+String(value).replaceAll('"','""')+'"';
}

function attach(db,alias,path){
  db.prepare('ATTACH DATABASE ? AS '+q(alias)).run(resolve(path));
}

function meta(db,alias,key){
  return db.prepare('SELECT value FROM '+q(alias)+'.meta WHERE key=?').get(key)?.value??null;
}

function missingCount(db,lowerAlias,upperAlias,table,columns){
  const sql=`
    SELECT COUNT(*) AS c
    FROM (
      SELECT ${columns} FROM ${q(lowerAlias)}.${q(table)}
      EXCEPT
      SELECT ${columns} FROM ${q(upperAlias)}.${q(table)}
    )
  `;
  return Number(db.prepare(sql).get()?.c||0);
}

export function verifyAttachedDistributionNesting(db,{
  lowerAlias,
  upperAlias,
  lowerEdition,
  upperEdition,
}){
  const lowerMeta=meta(db,lowerAlias,'distribution_edition');
  const upperMeta=meta(db,upperAlias,'distribution_edition');
  if(lowerMeta!==lowerEdition||upperMeta!==upperEdition){
    throw new Error(
      'Distribution edition metadata mismatch: '
      +JSON.stringify({lowerMeta,upperMeta,lowerEdition,upperEdition}),
    );
  }

  const checks={};
  const violations=[];
  for(const [name,table,columns] of CHECKS){
    const missing=missingCount(db,lowerAlias,upperAlias,table,columns);
    checks[name]={table,columns,missing};
    if(missing>0)violations.push({name,table,missing});
  }
  return {
    lower:lowerEdition,
    upper:upperEdition,
    ok:violations.length===0,
    checks,
    violations,
  };
}

export function verifyDistributionNestingFiles({
  litePath,
  standardPath,
  fullPath,
}){
  for(const path of [litePath,standardPath,fullPath]){
    if(!existsSync(path))throw new Error('Distribution nesting input missing: '+resolve(path));
  }
  const db=new DatabaseSync(':memory:');
  try{
    attach(db,'lite',litePath);
    attach(db,'standard',standardPath);
    attach(db,'full',fullPath);
    db.exec('PRAGMA query_only=ON;');

    const liteStandard=verifyAttachedDistributionNesting(db,{
      lowerAlias:'lite',
      upperAlias:'standard',
      lowerEdition:'lite',
      upperEdition:'standard',
    });
    const standardFull=verifyAttachedDistributionNesting(db,{
      lowerAlias:'standard',
      upperAlias:'full',
      lowerEdition:'standard',
      upperEdition:'full',
    });
    const report={
      schema:'rhymelab-distribution-nesting-report-v1',
      policy:DISTRIBUTION_NESTING_POLICY,
      ok:liteStandard.ok&&standardFull.ok,
      lite_standard:liteStandard,
      standard_full:standardFull,
    };
    if(!report.ok){
      throw new Error('Distribution nesting verification failed: '+JSON.stringify(report));
    }
    return report;
  }finally{
    db.close();
  }
}
