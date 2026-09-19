#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_G2P_BENCHMARK_POLICY,
  groupProperNameReferences,
  selectProperNameTokenBenchmarkCases,
} from './entity-g2p-benchmark-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const entityDbPath=resolve(
  argValue('--entities','data/local/rhymelab-entities-v1.sqlite')
);
const sourceIndexPath=resolve(
  argValue('--source-index','data/work/entity/entity-pronunciation-source-expansion-v1.sqlite')
);
const outPath=resolve(
  argValue('--out','data/local/entity-g2p-proper-name-benchmark-v2.json')
);
const inputPath=resolve(
  argValue('--input','data/local/entity-g2p-proper-name-benchmark-v2-input.tsv')
);
const targetSize=Math.max(
  100,
  Math.min(2000,Number.parseInt(argValue('--size','600'),10)||600),
);
const perCategory=Math.max(
  20,
  Math.min(250,Number.parseInt(argValue('--per-category','100'),10)||100),
);

await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(inputPath),{recursive:true});

const entityDb=new DatabaseSync(entityDbPath,{readOnly:true});
entityDb.exec('PRAGMA query_only=ON;');
const sourceDb=new DatabaseSync(sourceIndexPath,{readOnly:true});
sourceDb.exec('PRAGMA query_only=ON;');

try{
  const properRefs=groupProperNameReferences(
    sourceDb.prepare(`
      SELECT
        evidence_id,normalized,surface,source_kind,locale,notation,raw
      FROM pronunciation_evidence
      WHERE source_kind='wiktionary_kaikki_proper_name'
        AND runtime_profile_eligible=1
        AND analysis_status='ok'
      ORDER BY normalized,evidence_id
    `).all()
  );

  const entityRows=entityDb.prepare(`
    SELECT
      n.name_id,n.surface,n.normalized,
      e.qid,e.primary_category,e.popularity_tier,
      e.popularity_percentile,e.popularity_score
    FROM entity_name n
    JOIN entity e USING(entity_id)
    WHERE n.searchable=1
      AND n.language='en'
      AND n.preferred=1
    ORDER BY
      e.popularity_percentile DESC,
      e.popularity_score DESC,
      e.qid,
      n.name_id
  `).iterate();

  const selection=selectProperNameTokenBenchmarkCases(
    entityRows,
    properRefs,
    {targetSize,perCategory},
  );

  if(selection.cases.length<100){
    throw new Error(
      `Proper-name token G2P benchmark needs >=100 explicit proper-name controls, got ${selection.cases.length}.`
    );
  }

  if(selection.distinct_normalized!==selection.cases.length){
    throw new Error('Proper-name token G2P benchmark contains duplicate normalized controls.');
  }

  if(
    selection.cases.some((row)=>
      row.control_source!=='wiktionary_kaikki_proper_name'
      ||!row.references.length
      ||row.references.some((ref)=>
        ref.source_kind!=='wiktionary_kaikki_proper_name'
        ||ref.locale!=='en-US'
        ||ref.notation!=='ipa'
      )
    )
  ){
    throw new Error('Proper-name token benchmark control-source invariant failed.');
  }

  const evidence={
    schema:'rhymelab-entity-g2p-proper-name-token-benchmark-v2',
    status:'prepared',
    policy:ENTITY_G2P_BENCHMARK_POLICY,
    supersedes:'rhymelab-entity-g2p-proper-name-benchmark-v1',
    v1_rejection_reason:[
      'v1 sampled whole Entity surfaces instead of the unknown name-token unit that generated fallback must solve',
      'owner v1 sample was 599/600 single-word Entity surfaces and 592/600 had CMUdict references',
      'v1 contained duplicate normalized surfaces and therefore overstated ordinary-English/CMUdict performance',
    ],
    population:'unique tokens observed in preferred searchable English Entity names with explicit en-US Wiktionary/Kaikki proper-name IPA controls',
    selection:'popularity-descending Entity contexts with deterministic per-category cap; unique normalized token controls; Kaikki proper-name IPA only',
    requested_size:targetSize,
    actual_size:selection.cases.length,
    distinct_normalized:selection.distinct_normalized,
    duplicate_normalized:selection.cases.length-selection.distinct_normalized,
    per_category_cap:perCategory,
    category_counts:selection.category_counts,
    orthography_counts:selection.orthography_counts,
    candidates:{
      mfa_english_us_arpa:{
        production_eligible_for_benchmark:true,
        model_id:'english_us_arpa',
        pinned_model_version:'2.0.0a',
        phone_set:'ARPA',
        architecture:'pynini',
        license:'CC-BY-4.0',
        expected_notation:'arpabet',
        reason:'directly compatible with RhymeLab accepted ARPAbet analyzer; no MFA-phone-set conversion layer required',
      },
      deep_phonemizer_en_us:{
        production_eligible_for_benchmark:true,
        code_license:'MIT',
        model_license_pin_required_before_runtime_promotion:true,
        expected_notation:'ipa',
      },
      charsiu_multilingual:{
        production_eligible_for_benchmark:false,
        code_license:'MIT',
        reason:'upstream training-data licenses include unspecified cases',
        expected_notation:'ipa',
      },
    },
    prediction_contract:{
      format:'TSV',
      columns:['case_id','notation','pronunciation'],
      notation_values:['arpabet','ipa'],
      rule:'one prediction per unique token control for the first benchmark; N-best only if single-best proper-name quality is insufficient',
    },
    safeguards:{
      whole_entity_surface_benchmark:false,
      token_level_benchmark:true,
      unique_normalized_controls:true,
      cmudict_as_gold:false,
      explicit_proper_name_gold:true,
      generated_runtime_promotion:false,
    },
    cases:selection.cases,
  };
  const fingerprint=createHash('sha256')
    .update(JSON.stringify(evidence))
    .digest('hex');
  const report={...evidence,semantic_fingerprint:fingerprint};

  await writeFile(outPath,JSON.stringify(report,null,2)+'\n');
  await writeFile(
    inputPath,
    [
      'case_id\tsurface',
      ...selection.cases.map((row)=>
        `${row.case_id}\t${String(row.surface).replace(/[\t\r\n]/gu,' ')}`
      ),
    ].join('\n')+'\n',
  );

  console.log('\nENTITY PROPER-NAME TOKEN G2P BENCHMARK V2 PREPARED');
  console.log(JSON.stringify({
    cases:selection.cases.length,
    distinct_normalized:selection.distinct_normalized,
    duplicate_normalized:selection.cases.length-selection.distinct_normalized,
    category_counts:selection.category_counts,
    orthography_counts:selection.orthography_counts,
    semantic_fingerprint:fingerprint,
    benchmark:outPath,
    input:inputPath,
  },null,2));
}finally{
  sourceDb.close();
  entityDb.close();
}
