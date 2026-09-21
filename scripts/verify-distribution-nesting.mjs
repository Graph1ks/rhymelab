import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifyDistributionNestingFiles} from './distribution-nesting-core.mjs';

function argValue(name,fallback=null){
  const index=process.argv.indexOf(name);
  if(index<0)return fallback;
  const value=process.argv[index+1];
  if(value==null||value.startsWith('--'))throw new Error(name+' requires a value');
  return value;
}

const baseDir=resolve(argValue('--output-dir','data/local/distribution'));
const litePath=resolve(argValue('--lite',baseDir+'/rhymelab-serving-v1-lite.sqlite'));
const standardPath=resolve(argValue('--standard',baseDir+'/rhymelab-serving-v1-standard.sqlite'));
const fullPath=resolve(argValue('--full',baseDir+'/rhymelab-serving-v1-full.sqlite'));
const reportPath=resolve(argValue('--report',baseDir+'/distribution-nesting-report-v1.json'));

const report=verifyDistributionNestingFiles({litePath,standardPath,fullPath});
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({...report,report:reportPath},null,2));
