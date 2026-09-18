#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_STAGE_POLICY,
  ENTITY_STAGE_SCHEMA,
  createEntityStageStorage,
  finalizeEntityStageStorage,
  openTextLines,
  stageStats,
} from './entity-staging-core.mjs';
import { normalizeEntityName } from './entity-lexicon-core.mjs';
import {
  QLEVER_ENTITY_SOURCE_SCHEMA,
  parseSparqlTsvLine,
  qidFromEntityTerm,
  normalizeQLeverSite,
} from './qlever-entity-source-core.mjs';

const args=process.argv.slice(2);
let sourceReportPath='data/local/entity-qlever-source-v1-report.json';
let taxonomyPath='sources/entity/wikidata-entity-taxonomy-v1.json';
let outPath='data/work/entity/wikidata-cultural-stage-v1.sqlite';
let reportPath='data/local/entity-qlever-stage-v1-report.json';

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--source-report') sourceReportPath=args[++i]||sourceReportPath;
  else if(arg==='--taxonomy') taxonomyPath=args[++i]||taxonomyPath;
  else if(arg==='--out') outPath=args[++i]||outPath;
  else if(arg==='--report') reportPath=args[++i]||reportPath;
}
sourceReportPath=resolve(sourceReportPath);
taxonomyPath=resolve(taxonomyPath);
outPath=resolve(outPath);
reportPath=resolve(reportPath);
await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(reportPath),{recursive:true});
await rm(outPath,{force:true});

const sourceReport=JSON.parse(await readFile(sourceReportPath,'utf8'));
if(sourceReport.schema!==QLEVER_ENTITY_SOURCE_SCHEMA||sourceReport.status!=='ok'){
  throw new Error('QLever entity source report is missing or not accepted.');
}
const taxonomyBytes=await readFile(taxonomyPath);
const taxonomy=JSON.parse(taxonomyBytes.toString('utf8'));
const taxonomySha256=createHash('sha256').update(taxonomyBytes).digest('hex');
if(taxonomySha256!==sourceReport.taxonomy_sha256){
  throw new Error('QLever source taxonomy SHA-256 does not match the current taxonomy.');
}

const exportById=new Map((sourceReport.exports||[]).map((row)=>[row.id,row]));
for(const id of ['membership','core','aliases','external_ids','wikipedia_sitelinks']){
  if(!exportById.has(id)) throw new Error(`QLever source report is missing export: ${id}`);
}

async function sha256File(path){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

for(const row of exportById.values()){
  const path=resolve(row.path);
  const actual=await sha256File(path);
  if(actual!==row.gzip_sha256){
    throw new Error(`QLever source artifact checksum mismatch for ${row.id}: ${path}`);
  }
}

async function* tsvRows(spec){
  const path=resolve(spec.path);
  const stream=openTextLines(path);
  let header=null;
  let rows=0;
  try{
    for await(const line of stream.lines){
      if(header===null){
        header=String(line).replace(/\r$/u,'').split('\t').map((value)=>value.replace(/^\?/u,''));
        continue;
      }
      if(!line) continue;
      const values=parseSparqlTsvLine(line);
      const row={};
      for(let i=0;i<header.length;i+=1) row[header[i]]=values[i]??null;
      rows+=1;
      yield row;
    }
    await stream.done;
  }finally{
    if(header===null) throw new Error(`Empty QLever TSV artifact: ${path}`);
    if(rows!==Number(spec.rows)){
      throw new Error(`QLever TSV row-count mismatch for ${spec.id}: expected ${spec.rows}, got ${rows}`);
    }
  }
}

function textMin(existing,incoming){
  if(existing==null) return incoming;
  if(incoming==null) return existing;
  return incoming.localeCompare(existing,'en')<0?incoming:existing;
}

const db=new DatabaseSync(outPath);
const startedAt=Date.now();
const importCounts={};

try{
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=OFF;
    PRAGMA synchronous=OFF;
    PRAGMA temp_store=MEMORY;
    PRAGMA locking_mode=EXCLUSIVE;
    PRAGMA cache_size=-262144;
  `);
  createEntityStageStorage(db);
  db.exec(`
    CREATE TEMP TABLE ql_category(
      category TEXT PRIMARY KEY,
      priority INTEGER NOT NULL,
      retention_floor REAL NOT NULL
    ) WITHOUT ROWID;
    CREATE TEMP TABLE ql_membership(
      qid TEXT NOT NULL,
      category TEXT NOT NULL,
      match_property TEXT NOT NULL,
      match_target_qid TEXT NOT NULL,
      PRIMARY KEY(qid,category)
    ) WITHOUT ROWID;
    CREATE TEMP TABLE ql_core(
      qid TEXT PRIMARY KEY,
      label_de TEXT,
      label_en TEXT,
      description_de TEXT,
      description_en TEXT,
      statement_count INTEGER NOT NULL DEFAULT 0
    ) WITHOUT ROWID;
    CREATE TEMP TABLE ql_alias(
      qid TEXT NOT NULL,
      language TEXT NOT NULL,
      surface TEXT NOT NULL,
      PRIMARY KEY(qid,language,surface)
    ) WITHOUT ROWID;
    CREATE TEMP TABLE ql_external(
      qid TEXT NOT NULL,
      property_id TEXT NOT NULL,
      system TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY(qid,system,value)
    ) WITHOUT ROWID;
    CREATE TEMP TABLE ql_wiki_metric(
      qid TEXT PRIMARY KEY,
      wikipedia_sitelink_count INTEGER NOT NULL,
      has_dewiki INTEGER NOT NULL,
      has_enwiki INTEGER NOT NULL
    ) WITHOUT ROWID;
  `);

  const insertCategory=db.prepare(
    'INSERT INTO ql_category(category,priority,retention_floor) VALUES(?,?,?)',
  );
  for(const category of taxonomy.categories||[]){
    insertCategory.run(
      category.category,
      Number(category.priority??9999),
      Number(category.retention_percentile_floor??0),
    );
  }

  const membershipSpec=exportById.get('membership');
  const insertMembership=db.prepare(
    'INSERT OR IGNORE INTO ql_membership(qid,category,match_property,match_target_qid) VALUES(?,?,?,?)',
  );
  db.exec('BEGIN');
  let n=0;
  for await(const row of tsvRows(membershipSpec)){
    const qid=qidFromEntityTerm(row.item);
    if(!qid) continue;
    insertMembership.run(qid,row.category,row.matchProperty,row.matchTargetQid);
    n+=1;
  }
  db.exec('COMMIT');
  importCounts.membership=n;

  const coreSpec=exportById.get('core');
  const getCore=db.prepare('SELECT * FROM ql_core WHERE qid=?');
  const insertCore=db.prepare(
    'INSERT INTO ql_core(qid,label_de,label_en,description_de,description_en,statement_count) VALUES(?,?,?,?,?,?)',
  );
  const updateCore=db.prepare(
    'UPDATE ql_core SET label_de=?,label_en=?,description_de=?,description_en=?,statement_count=? WHERE qid=?',
  );
  db.exec('BEGIN');
  n=0;
  let coreDuplicateRows=0;
  for await(const row of tsvRows(coreSpec)){
    const qid=qidFromEntityTerm(row.item);
    if(!qid) continue;
    const incoming={
      label_de:row.labelDe,
      label_en:row.labelEn,
      description_de:row.descriptionDe,
      description_en:row.descriptionEn,
      statement_count:Number.parseInt(row.statementCount||'0',10)||0,
    };
    const existing=getCore.get(qid);
    if(!existing){
      insertCore.run(
        qid,incoming.label_de,incoming.label_en,incoming.description_de,incoming.description_en,incoming.statement_count,
      );
    }else{
      coreDuplicateRows+=1;
      updateCore.run(
        textMin(existing.label_de,incoming.label_de),
        textMin(existing.label_en,incoming.label_en),
        textMin(existing.description_de,incoming.description_de),
        textMin(existing.description_en,incoming.description_en),
        Math.max(Number(existing.statement_count||0),incoming.statement_count),
        qid,
      );
    }
    n+=1;
  }
  db.exec('COMMIT');
  importCounts.core=n;
  importCounts.core_duplicate_rows=coreDuplicateRows;

  const aliasSpec=exportById.get('aliases');
  const insertAlias=db.prepare(
    'INSERT OR IGNORE INTO ql_alias(qid,language,surface) VALUES(?,?,?)',
  );
  db.exec('BEGIN');
  n=0;
  for await(const row of tsvRows(aliasSpec)){
    const qid=qidFromEntityTerm(row.item);
    const language=String(row.language||'');
    const surface=String(row.alias||'').normalize('NFKC').trim().replace(/\s+/gu,' ');
    if(!qid||!['de','en'].includes(language)||!surface) continue;
    insertAlias.run(qid,language,surface);
    n+=1;
  }
  db.exec('COMMIT');
  importCounts.aliases=n;

  const externalSpec=exportById.get('external_ids');
  const insertExternalTemp=db.prepare(
    'INSERT OR IGNORE INTO ql_external(qid,property_id,system,value) VALUES(?,?,?,?)',
  );
  db.exec('BEGIN');
  n=0;
  for await(const row of tsvRows(externalSpec)){
    const qid=qidFromEntityTerm(row.item);
    const propertyId=String(row.propertyId||'');
    const system=taxonomy.external_id_whitelist?.[propertyId];
    const value=String(row.value||'').normalize('NFKC').trim().replace(/\s+/gu,' ');
    if(!qid||!system||!value||/^Q\d+$/u.test(value)) continue;
    insertExternalTemp.run(qid,propertyId,system,value);
    n+=1;
  }
  db.exec('COMMIT');
  importCounts.external_ids=n;

  const wikiSpec=exportById.get('wikipedia_sitelinks');
  const upsertWiki=db.prepare(`
    INSERT INTO ql_wiki_metric(qid,wikipedia_sitelink_count,has_dewiki,has_enwiki)
    VALUES(?,?,?,?)
    ON CONFLICT(qid) DO UPDATE SET
      wikipedia_sitelink_count=ql_wiki_metric.wikipedia_sitelink_count+1,
      has_dewiki=MAX(ql_wiki_metric.has_dewiki,excluded.has_dewiki),
      has_enwiki=MAX(ql_wiki_metric.has_enwiki,excluded.has_enwiki)
  `);
  db.exec('BEGIN');
  n=0;
  for await(const row of tsvRows(wikiSpec)){
    const qid=qidFromEntityTerm(row.item);
    const site=normalizeQLeverSite(row.site);
    if(!qid||!site) continue;
    upsertWiki.run(
      qid,1,
      site==='https://de.wikipedia.org/'?1:0,
      site==='https://en.wikipedia.org/'?1:0,
    );
    n+=1;
  }
  db.exec('COMMIT');
  importCounts.wikipedia_sitelinks=n;

  db.exec(`
    CREATE TEMP TABLE ql_name_presence(qid TEXT PRIMARY KEY) WITHOUT ROWID;
    INSERT OR IGNORE INTO ql_name_presence(qid)
      SELECT qid FROM ql_core WHERE label_de IS NOT NULL OR label_en IS NOT NULL;
    INSERT OR IGNORE INTO ql_name_presence(qid)
      SELECT qid FROM ql_alias;

    CREATE TEMP TABLE ql_external_count(qid TEXT PRIMARY KEY, c INTEGER NOT NULL) WITHOUT ROWID;
    INSERT INTO ql_external_count(qid,c)
      SELECT qid,COUNT(*) FROM ql_external GROUP BY qid;

    CREATE TEMP TABLE ql_primary_category(
      qid TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      priority INTEGER NOT NULL,
      retention_floor REAL NOT NULL
    ) WITHOUT ROWID;
    INSERT INTO ql_primary_category(qid,category,priority,retention_floor)
    SELECT qid,category,priority,retention_floor
    FROM (
      SELECT
        m.qid,m.category,d.priority,d.retention_floor,
        ROW_NUMBER() OVER(PARTITION BY m.qid ORDER BY d.priority,m.category) AS rn
      FROM ql_membership m
      JOIN ql_category d USING(category)
    )
    WHERE rn=1;

    INSERT INTO entity_stage(
      qid,primary_category,description_de,description_en,wikipedia_sitelink_count,
      has_dewiki,has_enwiki,statement_count,external_id_count,qrank,source_ordinal
    )
    SELECT
      c.qid,
      p.category,
      c.description_de,
      c.description_en,
      COALESCE(w.wikipedia_sitelink_count,0),
      COALESCE(w.has_dewiki,0),
      COALESCE(w.has_enwiki,0),
      c.statement_count,
      COALESCE(x.c,0),
      NULL,
      ROW_NUMBER() OVER(ORDER BY c.qid)
    FROM ql_core c
    JOIN ql_name_presence n USING(qid)
    JOIN ql_primary_category p USING(qid)
    LEFT JOIN ql_wiki_metric w USING(qid)
    LEFT JOIN ql_external_count x USING(qid);

    INSERT INTO entity_stage_category(qid,category,priority,retention_percentile_floor)
    SELECT m.qid,m.category,d.priority,d.retention_floor
    FROM ql_membership m
    JOIN ql_category d USING(category)
    JOIN entity_stage e ON e.qid=m.qid;

    INSERT INTO entity_stage_external_id(qid,property_id,system,value)
    SELECT x.qid,x.property_id,x.system,x.value
    FROM ql_external x
    JOIN entity_stage e ON e.qid=x.qid;
  `);

  const insertName=db.prepare(`
    INSERT OR IGNORE INTO entity_stage_name(
      qid,language,surface,normalized,name_kind,preferred
    ) VALUES(?,?,?,?,?,?)
  `);
  db.exec('BEGIN');
  for(const row of db.prepare(`
    SELECT c.qid,c.label_de,c.label_en
    FROM ql_core c JOIN entity_stage e USING(qid)
    ORDER BY c.qid
  `).iterate()){
    if(row.label_de){
      const normalized=normalizeEntityName(row.label_de);
      if(normalized) insertName.run(row.qid,'de',row.label_de,normalized,'label',1);
    }
    if(row.label_en){
      const normalized=normalizeEntityName(row.label_en);
      if(normalized) insertName.run(row.qid,'en',row.label_en,normalized,'label',1);
    }
  }
  for(const row of db.prepare(`
    SELECT a.qid,a.language,a.surface
    FROM ql_alias a JOIN entity_stage e USING(qid)
    ORDER BY a.qid,a.language,a.surface
  `).iterate()){
    const normalized=normalizeEntityName(row.surface);
    if(normalized) insertName.run(row.qid,row.language,row.surface,normalized,'alias',0);
  }
  db.exec('COMMIT');

  finalizeEntityStageStorage(db);
  db.exec('PRAGMA optimize;');

  const meta=db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  const metaRows={
    schema:ENTITY_STAGE_SCHEMA,
    policy:ENTITY_STAGE_POLICY,
    source_kind:'qlever_selective',
    qlever_source_schema:sourceReport.schema,
    qlever_source_policy:sourceReport.policy,
    retrieval_label:sourceReport.retrieval_label,
    endpoint:sourceReport.endpoint,
    taxonomy_schema:taxonomy.schema,
    taxonomy_policy:taxonomy.policy,
    taxonomy_sha256:taxonomySha256,
  };
  for(const [key,value] of Object.entries(metaRows)) meta.run(key,String(value??''));

  const stats=stageStats(db);
  const databaseBytes=(await stat(outPath)).size;
  const elapsedMs=Date.now()-startedAt;
  const report={
    schema:'rhymelab-qlever-entity-stage-report-v1',
    status:'ok',
    built_at:new Date().toISOString(),
    stage_schema:ENTITY_STAGE_SCHEMA,
    stage_policy:ENTITY_STAGE_POLICY,
    source_kind:'qlever_selective',
    source_report:sourceReportPath,
    source_retrieval_label:sourceReport.retrieval_label,
    source_endpoint:sourceReport.endpoint,
    source_total_gzip_bytes:sourceReport.total_gzip_bytes,
    taxonomy:taxonomyPath,
    taxonomy_sha256:taxonomySha256,
    database:outPath,
    database_bytes:databaseBytes,
    elapsed_ms:elapsedMs,
    imports:importCounts,
    stats,
    qrank_joined:false,
    runtime_rewired:false,
    note:'QLever selective source reproduces the Phase 12A2 structural field contract. P31/P106 and whitelisted external IDs use all valued RDF statements via p:/ps:, not only wdt: truthy claims.',
  };
  await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`,'utf8');
  console.log(JSON.stringify(report,null,2));
}finally{
  db.close();
}
