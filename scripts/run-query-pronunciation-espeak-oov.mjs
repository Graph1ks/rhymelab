#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { inspectEspeakQueryPronunciation } from '../src/query-pronunciation-runtime.mjs';

export const ESPEAK_OOV_REPORT_SCHEMA='rhymelab-query-pronunciation-espeak-oov-report-v2';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}
const samplePath=resolve(argValue('--sample','data/local/query-pronunciation-oov-sample-v1.json'));
const outPath=resolve(argValue('--out','data/local/query-pronunciation-espeak-oov-report-v2.json'));
const tsvPath=resolve(argValue('--tsv','data/local/query-pronunciation-espeak-oov-predictions-v2.tsv'));
const command=argValue('--command',process.env.RHYMELAB_ESPEAK_COMMAND||null);

await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(tsvPath),{recursive:true});

const sample=JSON.parse(await readFile(samplePath,'utf8'));
if(sample.schema!=='rhymelab-query-pronunciation-oov-sample-v1'){
  throw new Error(`Unexpected OOV sample schema: ${sample.schema||'missing'}`);
}

const cases=[
  ...(sample.cases||[]).map((row)=>({
    case_id:row.case_id,
    source_stratum:row.source_stratum,
    language:row.language,
    surface:row.surface,
    normalized:row.normalized,
    context:row.context||{},
    sentinel:false,
  })),
  ...(sample.product_sentinels||[]).flatMap((row)=>
    (row.languages||[]).map((language)=>({
      case_id:`${row.sentinel_id}-${language}`,
      source_stratum:'product_sentinel',
      language,
      surface:row.surface,
      normalized:String(row.surface).normalize('NFKC').trim().toLocaleLowerCase(language==='de'?'de-DE':'en-US'),
      context:{},
      sentinel:true,
    }))
  ),
];

if(!cases.length) throw new Error('OOV benchmark sample has no cases.');

const predictions=[];
const failures=[];
const latencies=[];
let engineCommand=null;
let engineVersion=null;

for(const row of cases){
  const started=performance.now();
  const inspected=inspectEspeakQueryPronunciation(row.surface,row.language,{command});
  const elapsedMs=performance.now()-started;
  latencies.push(elapsedMs);

  engineCommand??=inspected.engineCommand||null;
  engineVersion??=inspected.engineVersion||null;

  if(inspected.status!=='accepted'){
    failures.push({
      ...row,
      status:inspected.status,
      reason:inspected.status==='rejected'
        ?'analyzer_rejected_espeak_ipa'
        :'espeak_process_unavailable',
      engine_command:inspected.engineCommand||null,
      engine_version:inspected.engineVersion||null,
      raw_ipa:inspected.rawIpa||null,
      normalized_ipa:inspected.ipa||null,
      analyzer_error:inspected.analyzerError||null,
      attempts:inspected.attempts||[],
      elapsed_ms:Number(elapsedMs.toFixed(3)),
    });
    continue;
  }

  const analysis=inspected.analysis;
  predictions.push({
    ...row,
    method:inspected.method,
    engine:inspected.engine,
    engine_command:inspected.engineCommand||null,
    engine_version:inspected.engineVersion||null,
    raw_ipa:inspected.rawIpa||null,
    ipa:inspected.ipa,
    normalization_changed:(inspected.rawIpa||'')!==(inspected.ipa||''),
    syllable_count:Number(analysis.syllableCount||0),
    primary_stress:Number(analysis.primaryStressSyllable||0)||null,
    stress_pattern:analysis.stressPattern||null,
    exact_tail_key:analysis.exactTailKey||null,
    vowel_key:analysis.vowelKey||null,
    coda_key:analysis.codaKey||null,
    canonical_phonemes:analysis.canonicalPhonemes||null,
    elapsed_ms:Number(elapsedMs.toFixed(3)),
  });
}

if(!predictions.length){
  throw new Error(
    'eSpeak-NG produced no analyzer-compatible predictions. Install eSpeak-NG or pass --command <path>. '
    +'The project does not bundle this GPL tool.'
  );
}

const sortedLatency=[...latencies].sort((a,b)=>a-b);
function percentile(values,p){
  if(!values.length) return 0;
  const index=Math.min(values.length-1,Math.max(0,Math.floor((values.length-1)*p)));
  return Number(values[index].toFixed(3));
}
function pct(n,d){return d?Number((n*100/d).toFixed(2)):0;}

const byStratum={};
for(const row of cases){
  const entry=byStratum[row.source_stratum]||{cases:0,predicted:0};
  entry.cases+=1;
  byStratum[row.source_stratum]=entry;
}
for(const row of predictions) byStratum[row.source_stratum].predicted+=1;
for(const entry of Object.values(byStratum)){
  entry.coverage_pct=pct(entry.predicted,entry.cases);
}

const byFailureReason={};
for(const row of failures){
  byFailureReason[row.reason]=(byFailureReason[row.reason]||0)+1;
}
const normalizationChanged=predictions.filter((row)=>row.normalization_changed).length;

const evidence={
  schema:ESPEAK_OOV_REPORT_SCHEMA,
  status:failures.length?'partial':'complete',
  purpose:'Structural local eSpeak-NG pronunciation evaluation over real unresolved RhymeLab rows; not lexical gold.',
  source_sample_schema:sample.schema,
  source_sample_fingerprint:sample.semantic_fingerprint||null,
  candidate:{
    engine:'eSpeak-NG',
    command:engineCommand||command||'auto-detect',
    version:engineVersion,
    bundled:false,
    runtime_required:false,
    license_note:'GPL-3.0-or-later upstream; used here only as an externally installed host tool/reference generator.',
  },
  cases:cases.length,
  unresolved_database_cases:(sample.cases||[]).length,
  product_sentinel_cases:cases.filter((row)=>row.sentinel).length,
  predicted:predictions.length,
  failed:failures.length,
  prediction_coverage_pct:pct(predictions.length,cases.length),
  analyzer_compatible_pct:pct(predictions.length,cases.length),
  normalization_changed:normalizationChanged,
  normalization_changed_pct:pct(normalizationChanged,predictions.length),
  by_failure_reason:byFailureReason,
  latency_ms:{
    p50:percentile(sortedLatency,0.5),
    p95:percentile(sortedLatency,0.95),
    max:sortedLatency.length?Number(sortedLatency.at(-1).toFixed(3)):0,
  },
  by_stratum:byStratum,
  failures,
  predictions,
  safeguards:{
    canonical_lexicon_mutated:false,
    entity_runtime_mutated:false,
    phrase_runtime_mutated:false,
    generated_rows_promoted:false,
    generated_rows_source_backed:false,
    network_required:false,
  },
};
const semanticFingerprint=createHash('sha256')
  .update(JSON.stringify(evidence))
  .digest('hex');
const report={...evidence,semantic_fingerprint:semanticFingerprint};
await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');

const header=[
  'case_id','source_stratum','language','surface','normalized','raw_ipa','ipa','normalization_changed',
  'syllable_count','primary_stress','stress_pattern','exact_tail_key','engine','engine_version','elapsed_ms',
];
const lines=[
  header.join('\t'),
  ...predictions.map((row)=>header.map((key)=>
    String(row[key]??'').replace(/[\t\r\n]/gu,' ')
  ).join('\t')),
];
await writeFile(tsvPath,lines.join('\n')+'\n','utf8');

console.log(JSON.stringify({
  schema:report.schema,
  status:report.status,
  cases:report.cases,
  unresolved_database_cases:report.unresolved_database_cases,
  product_sentinel_cases:report.product_sentinel_cases,
  predicted:report.predicted,
  failed:report.failed,
  prediction_coverage_pct:report.prediction_coverage_pct,
  analyzer_compatible_pct:report.analyzer_compatible_pct,
  normalization_changed:report.normalization_changed,
  normalization_changed_pct:report.normalization_changed_pct,
  by_failure_reason:report.by_failure_reason,
  latency_ms:report.latency_ms,
  by_stratum:report.by_stratum,
  semantic_fingerprint:semanticFingerprint,
  report:outPath,
  tsv:tsvPath,
},null,2));
