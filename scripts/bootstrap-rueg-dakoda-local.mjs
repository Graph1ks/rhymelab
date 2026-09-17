#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

const args=process.argv.slice(2);
let manifestPath='sources/phrase/rueg-dakoda-de-v1.json';
let workDir='data/work/rueg-dakoda-de-v1';
let dbPath='data/local/rhymelab-phrases-v1.sqlite';
let reportPath='data/local/rueg-register-report.json';
let refresh=false;
for(let i=0;i<args.length;i+=1){const a=args[i];if(a==='--manifest')manifestPath=args[++i]||manifestPath;else if(a==='--work')workDir=args[++i]||workDir;else if(a==='--db')dbPath=args[++i]||dbPath;else if(a==='--report')reportPath=args[++i]||reportPath;else if(a==='--refresh')refresh=true;}
const root=process.cwd();manifestPath=resolve(root,manifestPath);workDir=resolve(root,workDir);dbPath=resolve(root,dbPath);reportPath=resolve(root,reportPath);
const archives=join(workDir,'archives'),extracted=join(workDir,'extracted');await mkdir(archives,{recursive:true});await mkdir(extracted,{recursive:true});
async function exists(p){try{await access(p);return true;}catch{return false;}}
function human(bytes){const u=['B','KiB','MiB','GiB'];let n=bytes,i=0;while(n>=1024&&i<u.length-1){n/=1024;i+=1;}return `${n.toFixed(i?1:0)} ${u[i]}`;}
async function download(url,target,{force=false}={}){
 if(!force&&await exists(target)){const s=(await stat(target)).size;if(s>100){console.log(`Reuse ${basename(target)} (${human(s)})`);return s;}await rm(target,{force:true});}
 console.log(`Download ${url}`);const response=await fetch(url,{redirect:'follow',headers:{'User-Agent':'RhymeLab/0.11 (+https://github.com/Graph1ks/rhymelab)','Accept':'application/zip,application/octet-stream,*/*','Referer':'https://dakoda.org/'}});if(!response.ok||!response.body)throw new Error(`Download failed ${response.status}: ${url}`);
 await pipeline(Readable.fromWeb(response.body),createWriteStream(target));const size=(await stat(target)).size;if(size<100)throw new Error(`Downloaded archive too small: ${target}`);console.log(`  saved ${human(size)}`);return size;
}
function extractZip(zip,dest){
 spawnSync(process.platform==='win32'?'cmd':'true',process.platform==='win32'?['/c','if','exist',dest,'rmdir','/s','/q',dest]:[],{stdio:'ignore'}); // no-op on unix
 const tar=spawnSync('tar',['-xf',zip,'-C',dest],{cwd:root,stdio:'inherit',windowsHide:true});if(tar.status===0)return;
 if(process.platform==='win32'){
  const ps=spawnSync('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath ${JSON.stringify(zip)} -DestinationPath ${JSON.stringify(dest)} -Force`],{cwd:root,stdio:'inherit',windowsHide:true});if(ps.status===0)return;
 }
 const unzip=spawnSync('unzip',['-o',zip,'-d',dest],{cwd:root,stdio:'inherit',windowsHide:true});if(unzip.status===0)return;
 throw new Error(`Could not extract ${zip}; neither tar nor platform ZIP fallback succeeded.`);
}
if(!await exists(dbPath))throw new Error(`Phrase catalog DB not found: ${dbPath}. Run npm run phrase:catalog:bootstrap first.`);
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));const inputs=[];let downloadedBytes=0;
for(const sub of manifest.subcorpora||[]){
 const subRoot=join(extracted,sub.code),exbDir=join(subRoot,'exb'),metaDir=join(subRoot,'meta');await mkdir(exbDir,{recursive:true});await mkdir(metaDir,{recursive:true});
 const exbZip=join(archives,`${sub.code}_exb.zip`),metaZip=join(archives,`${sub.code}_meta.zip`);
 downloadedBytes+=await download(sub.exb_url,exbZip,{force:refresh});downloadedBytes+=await download(sub.meta_url,metaZip,{force:refresh});
 if(refresh){await rm(exbDir,{recursive:true,force:true});await rm(metaDir,{recursive:true,force:true});await mkdir(exbDir,{recursive:true});await mkdir(metaDir,{recursive:true});}
 if(refresh||!(await exists(join(exbDir,'.extracted')))){extractZip(exbZip,exbDir);await import('node:fs/promises').then(({writeFile})=>writeFile(join(exbDir,'.extracted'),'ok\n'));}
 if(refresh||!(await exists(join(metaDir,'.extracted')))){extractZip(metaZip,metaDir);await import('node:fs/promises').then(({writeFile})=>writeFile(join(metaDir,'.extracted'),'ok\n'));}
 inputs.push({code:sub.code,exbDir,metaDir});
}
const importerArgs=['scripts/enrich-de-phrase-register-rueg.mjs','--db',dbPath,'--manifest',manifestPath,'--report',reportPath];for(const item of inputs)importerArgs.push('--input',`${item.code}|${item.exbDir}`);
console.log('\nBuild RUEG dual-layer register evidence…');const run=spawnSync(process.execPath,['--no-warnings',...importerArgs],{cwd:root,stdio:'inherit',windowsHide:true});if(run.error||run.status!==0)throw new Error(`RUEG importer failed with exit ${String(run.status??'spawn error')}`);
console.log('\nRUEG DAKODA REGISTER EVIDENCE COMPLETE');console.log(JSON.stringify({database:dbPath,report:reportPath,downloaded_or_reused_archive_bytes:downloadedBytes,downloaded_or_reused_archive_mib:Number((downloadedBytes/1024/1024).toFixed(2)),subcorpora:inputs.map(x=>({code:x.code,exb:x.exbDir,meta:x.metaDir})),audio_downloaded:false,dipl_preserved:true,norm_preserved:true,runtime_rewired:false},null,2));
