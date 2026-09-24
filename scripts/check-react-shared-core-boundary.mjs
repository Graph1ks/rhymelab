import {readdirSync,readFileSync,statSync} from 'node:fs';
import {resolve,relative} from 'node:path';

const root=resolve('apps/studio-react/src');
const violations=[];

function walk(dir){
  for(const name of readdirSync(dir)){
    const path=resolve(dir,name);
    const stat=statSync(path);
    if(stat.isDirectory()){
      if(name==='legacy')violations.push(relative(process.cwd(),path)+' :: legacy directory must not exist');
      walk(path);
      continue;
    }
    if(!/\.(?:ts|tsx)$/u.test(name))continue;
    const source=readFileSync(path,'utf8');
    const checks=[
      [/from\s+['"][^'"]*\/legacy(?:\/|['"])/gu,'legacy import'],
      [/from\s+['"][^'"]*(?:\.\.\/)+src\/studio\//gu,'direct src/studio import'],
      [/from\s+['"][^'"]*(?:\.\.\/)+src\/ui\//gu,'direct src/ui import'],
    ];
    for(const [pattern,label] of checks){
      if(pattern.test(source))violations.push(relative(process.cwd(),path)+' :: '+label);
    }
  }
}
walk(root);

if(violations.length){
  console.error('React Shared Core boundary violations:');
  for(const row of violations)console.error('- '+row);
  process.exitCode=1;
}else{
  console.log('React Shared Core boundary: PASS');
}
