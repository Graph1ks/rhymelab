export const SERVING_V1_REPORT_CASES=Object.freeze([
  ['de','Arbeitsweise'],['de','Liebe'],['de','Freiheit'],['de','Musik'],['de','Zeit'],
  ['de','der'],['de','den'],['de','die'],['de','und'],['de','von'],['de','in'],
  ['en','time'],['en','love'],['en','rhyme'],['en','music'],['en','freedom'],['en','A'],['en','in'],
  ['both','Liebe'],['both','time'],
].map(([language,input])=>Object.freeze({language,input})));

function finite(values){
  return values.map(Number).filter(Number.isFinite);
}

export function percentile(values,p){
  const sorted=finite(values).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const index=Math.min(
    sorted.length-1,
    Math.max(0,Math.ceil(Number(p)*sorted.length)-1),
  );
  return sorted[index];
}

export function timingSummary(values){
  const clean=finite(values);
  if(!clean.length){
    return {
      samples:0,min_ms:null,p25_ms:null,p50_ms:null,p75_ms:null,p95_ms:null,
      p99_ms:null,max_ms:null,average_ms:null,stddev_ms:null,
    };
  }
  const average=clean.reduce((sum,value)=>sum+value,0)/clean.length;
  const variance=clean.reduce((sum,value)=>sum+(value-average)**2,0)/clean.length;
  const round=(value)=>Number(value.toFixed(3));
  return {
    samples:clean.length,
    min_ms:round(Math.min(...clean)),
    p25_ms:round(percentile(clean,0.25)),
    p50_ms:round(percentile(clean,0.50)),
    p75_ms:round(percentile(clean,0.75)),
    p95_ms:round(percentile(clean,0.95)),
    p99_ms:round(percentile(clean,0.99)),
    max_ms:round(Math.max(...clean)),
    average_ms:round(average),
    stddev_ms:round(Math.sqrt(variance)),
  };
}

function stableHash(value){
  let hash=2166136261;
  for(const char of String(value)){
    hash^=char.codePointAt(0);
    hash=Math.imul(hash,16777619);
  }
  return hash>>>0;
}

export function measurementOrder(cases,round){
  return [...cases].sort((a,b)=>
    stableHash(`${round}\u001f${a.language}\u001f${a.input}`)
    -stableHash(`${round}\u001f${b.language}\u001f${b.input}`)
    ||a.language.localeCompare(b.language,'en')
    ||a.input.localeCompare(b.input,'en')
  );
}

export function groupTiming(rows,keyFn){
  const groups=new Map();
  for(const row of rows){
    const key=String(keyFn(row));
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(Number(row.total_ms));
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([a],[b])=>a.localeCompare(b,'en'))
      .map(([key,values])=>[key,timingSummary(values)])
  );
}

export function caseTiming(rows){
  const groups=new Map();
  for(const row of rows){
    const key=`${row.language}\u001f${row.input}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(Number(row.total_ms));
  }
  return [...groups.entries()].map(([key,values])=>{
    const [language,input]=key.split('\u001f');
    return {language,input,...timingSummary(values)};
  }).sort((a,b)=>
    Number(b.p50_ms||0)-Number(a.p50_ms||0)
    ||a.language.localeCompare(b.language,'en')
    ||a.input.localeCompare(b.input,'en')
  );
}

export function stageTiming(rows){
  const names=[...new Set(rows.flatMap((row)=>Object.keys(row.stages_ms||{})))];
  return Object.fromEntries(
    names.sort().map((name)=>[
      name,
      timingSummary(
        rows.map((row)=>Number(row.stages_ms?.[name])).filter(Number.isFinite)
      ),
    ])
  );
}

function ms(value){
  return Number.isFinite(Number(value))?`${Number(value).toFixed(1)} ms`:'—';
}

function gib(bytes){
  const value=Number(bytes);
  return Number.isFinite(value)?`${(value/1024/1024/1024).toFixed(2)} GiB`:'—';
}

function gateMark(value){
  return value?'PASS':'MISS';
}

export function renderServingV1BenchmarkMarkdown(report){
  const t=report.timing;
  const lines=[
    '# RhymeLab Serving-v1 Performance Benchmark',
    '',
    `Generated: ${report.completed_at}`,
    '',
    '## Method',
    '',
    `- Runtime: ${report.execution}`,
    `- Dataset mode: ${report.dataset_mode}`,
    `- Cases: ${report.case_count}`,
    `- Warmup rounds: ${report.warmup_rounds} (discarded)`,
    `- Measured repeats per case: ${report.repeats}`,
    `- Measured samples: ${t.samples}`,
    '- Query order is deterministically re-ordered for every measured round.',
    '- Worker startup and warmup are excluded from steady-state latency.',
    '- Timings cover the same persistent-worker unified search path used by the Serving-v1 preview; HTTP/JSON/browser rendering are not included.',
    '',
    '## Result',
    '',
    '| Metric | Result | Target | Gate |',
    '| --- | ---: | ---: | --- |',
    `| p50 | ${ms(t.p50_ms)} | ≤ ${ms(report.targets_ms.p50)} | ${gateMark(report.gates.p50_target)} |`,
    `| p95 | ${ms(t.p95_ms)} | ≤ ${ms(report.targets_ms.p95)} | ${gateMark(report.gates.p95_target)} |`,
    `| max | ${ms(t.max_ms)} | ≤ ${ms(report.targets_ms.max)} | ${gateMark(report.gates.max_target)} |`,
    `| average | ${ms(t.average_ms)} | — | — |`,
    `| stddev | ${ms(t.stddev_ms)} | — | — |`,
    '',
    `**Status:** ${report.status}`,
    '',
    '## By language',
    '',
    '| Language | Samples | p50 | p95 | max | average |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for(const [language,summary] of Object.entries(report.by_language)){
    lines.push(
      `| ${language} | ${summary.samples} | ${ms(summary.p50_ms)} | ${ms(summary.p95_ms)} | ${ms(summary.max_ms)} | ${ms(summary.average_ms)} |`
    );
  }
  lines.push(
    '',
    '## Slowest cases by median',
    '',
    '| Language | Query | Samples | p50 | p95 | max | average |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  );
  for(const row of report.by_case.slice(0,12)){
    lines.push(
      `| ${row.language} | ${String(row.input).replaceAll('|','\\|')} | ${row.samples} | ${ms(row.p50_ms)} | ${ms(row.p95_ms)} | ${ms(row.max_ms)} | ${ms(row.average_ms)} |`
    );
  }
  const stages=Object.entries(report.stages||{})
    .filter(([,summary])=>summary.samples>0)
    .sort((a,b)=>Number(b[1].average_ms||0)-Number(a[1].average_ms||0))
    .slice(0,12);
  if(stages.length){
    lines.push(
      '',
      '## Highest average profiled stages',
      '',
      '| Stage | Samples | p50 | p95 | average |',
      '| --- | ---: | ---: | ---: | ---: |',
    );
    for(const [name,summary] of stages){
      lines.push(
        `| ${name.replaceAll('|','\\|')} | ${summary.samples} | ${ms(summary.p50_ms)} | ${ms(summary.p95_ms)} | ${ms(summary.average_ms)} |`
      );
    }
  }
  lines.push(
    '',
    '## Environment',
    '',
    `- Serving DB: ${report.database.path}`,
    `- DB size: ${gib(report.database.bytes)}`,
    `- Product semantic fingerprint: ${report.database.product_semantic_fingerprint||'—'}`,
    `- Runtime semantic fingerprint: ${report.database.runtime_semantic_fingerprint||'—'}`,
    `- Node: ${report.environment.node}`,
    `- Platform: ${report.environment.platform} ${report.environment.arch}`,
    `- CPU: ${report.environment.cpu_model||'—'} × ${report.environment.logical_cpus}`,
    `- RAM: ${gib(report.environment.total_memory_bytes)}`,
    '',
    'Raw per-sample timings and performance counters are preserved in the companion JSON report.',
    '',
  );
  return lines.join('\n');
}
