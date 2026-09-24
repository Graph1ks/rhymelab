import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';

const root=resolve('.');
const failures=[];

function fail(message){failures.push(message)}
function read(path){return readFileSync(resolve(root,path),'utf8')}
function walk(path,filter){
  const absolute=resolve(root,path);
  const rows=[];
  for(const name of readdirSync(absolute)){
    const full=join(absolute,name);
    const stat=statSync(full);
    if(stat.isDirectory())rows.push(...walk(relative(root,full),filter));
    else if(!filter||filter(full))rows.push(relative(root,full).replaceAll('\\','/'));
  }
  return rows;
}

const workflowFiles=walk('.github/workflows',(path)=>/\.ya?ml$/i.test(path));
for(const path of workflowFiles){
  const source=read(path);
  for(const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)){
    const value=match[1];
    if(value.startsWith('./'))continue;
    const at=value.lastIndexOf('@');
    const ref=at>=0?value.slice(at+1):'';
    if(!/^[0-9a-f]{40}$/i.test(ref)){
      fail(`${path}: action is not pinned to a full commit SHA: ${value}`);
    }
  }
}

const server=read('src/server.mjs');
if(/access-control-allow-origin['"]?\s*[:=]\s*['"]\*['"]/i.test(server)){
  fail('src/server.mjs: wildcard CORS is forbidden for the localhost API.');
}
if(!server.includes("from './http-security.mjs'")){
  fail('src/server.mjs: HTTP security boundary module is not wired in.');
}
if(server.includes('req.headers.host')){
  fail('src/server.mjs: request URL parsing must not trust the inbound Host header.');
}

const securityModule=read('src/http-security.mjs');
for(const directive of [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
]){
  if(!securityModule.includes(directive)){
    fail(`src/http-security.mjs: CSP directive missing: ${directive}`);
  }
}
if(securityModule.includes("'unsafe-eval'")){
  fail("src/http-security.mjs: CSP must not permit 'unsafe-eval'.");
}

const htmlSources=[
  ...walk('src',(path)=>/\.html$/i.test(path)),
  'apps/studio-react/index.html',
];
for(const path of htmlSources){
  const source=read(path);
  if(/<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i.test(source)){
    fail(`${path}: inline script conflicts with the strict CSP.`);
  }
  if(/\son[a-z]+\s*=/i.test(source)){
    fail(`${path}: inline event handler conflicts with script-src-attr 'none'.`);
  }
  if(/(?:href|src)\s*=\s*["']\s*javascript:/i.test(source)){
    fail(`${path}: javascript: URL is forbidden.`);
  }
}

const executableSources=[
  ...walk('src',(path)=>/\.(?:mjs|js)$/i.test(path)),
  ...walk('apps/studio-react/src',(path)=>/\.(?:ts|tsx|js|mjs)$/i.test(path)),
];
const banned=[
  ['eval(',/\beval\s*\(/],
  ['new Function(',/\bnew\s+Function\s*\(/],
  ['document.write(',/\bdocument\.write\s*\(/],
  ['dangerouslySetInnerHTML',/\bdangerouslySetInnerHTML\b/],
];
for(const path of executableSources){
  const source=read(path);
  for(const [label,pattern] of banned){
    if(pattern.test(source))fail(`${path}: banned runtime primitive found: ${label}`);
  }
}

if(failures.length){
  console.error('Security baseline audit failed:');
  for(const item of failures)console.error(' - '+item);
  process.exitCode=1;
}else{
  console.log(`Security baseline audit passed · ${workflowFiles.length} workflows · ${executableSources.length} runtime source files · ${htmlSources.length} HTML surfaces`);
}
