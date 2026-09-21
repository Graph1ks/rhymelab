import {existsSync,statSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

import {
  buildDistributionCensusReport,
} from './distribution-census-core.mjs';

function argValue(name,fallback=null){
  const index=process.argv.indexOf(name);
  if(index<0)return fallback;
  const value=process.argv[index+1];
  if(value==null||value.startsWith('--'))throw new Error(name+' requires a value');
  return value;
}

const sourcePath=resolve(
  argValue('--db',process.env.RHYMELAB_SERVING_V1_DB||'data/local/rhymelab-serving-v1.sqlite'),
);
const outputPath=resolve(
  argValue('--output','data/local/distribution/distribution-census-v1.json'),
);
const jsonOnly=process.argv.includes('--json');

if(!existsSync(sourcePath)){
  throw new Error('Serving-v1 Master missing: '+sourcePath);
}

const db=new DatabaseSync(sourcePath,{readOnly:true});
let report;
try{
  report=buildDistributionCensusReport(db,{
    sourcePath,
    sourceSizeBytes:statSync(sourcePath).size,
  });
}finally{
  db.close();
}

await mkdir(dirname(outputPath),{recursive:true});
await writeFile(outputPath,JSON.stringify(report,null,2)+'\n','utf8');

if(jsonOnly){
  console.log(JSON.stringify(report,null,2));
}else{
  const mib=(bytes)=>Number(bytes||0)/(1024*1024);
  const gib=(bytes)=>Number(bytes||0)/(1024*1024*1024);
  console.log('[distribution] master='+sourcePath);
  console.log('[distribution] file='+gib(report.source.size_bytes).toFixed(2)+' GiB');
  console.log('[distribution] Core lexical surfaces='+report.population.core.lexical_surfaces.toLocaleString('en-US')
    +' · word pronunciations='+report.population.core.word_pronunciations.toLocaleString('en-US'));
  console.log('[distribution] Generated-only lexical surfaces='+report.population.generated_only.lexical_surfaces.toLocaleString('en-US')
    +' · word pronunciations='+report.population.generated_only.word_pronunciations.toLocaleString('en-US'));
  console.log('[distribution] Phrase runtime rows='+report.population.phrases.runtime_rows.toLocaleString('en-US')
    +' · windows='+report.population.phrases.windows.toLocaleString('en-US'));
  console.log('[distribution] Entity identities='+report.population.entities.identities.toLocaleString('en-US')
    +' · names='+report.population.entities.names.toLocaleString('en-US')
    +' · pronunciations='+report.population.entities.pronunciations.toLocaleString('en-US'));
  if(report.storage.available){
    console.log('[distribution] dbstat logical groups:');
    for(const [group,data] of Object.entries(report.storage.groups).sort((a,b)=>b[1].bytes-a[1].bytes)){
      console.log('  '+group.padEnd(18)+' '+mib(data.bytes).toFixed(1).padStart(10)+' MiB · '+data.objects+' objects');
    }
  }else{
    console.log('[distribution] dbstat unavailable: '+report.storage.error);
  }
  console.log('[distribution] rank gate='+report.ranking.status
    +' · ranked Core surfaces='+report.ranking.ranked_core_surfaces.toLocaleString('en-US')
    +'/'+report.ranking.total_core_lexical_surfaces.toLocaleString('en-US'));
  console.log('[distribution] report='+outputPath);
}
