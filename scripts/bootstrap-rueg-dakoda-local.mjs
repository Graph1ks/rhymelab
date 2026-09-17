#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

const args=process.argv.slice(2);
let manifestPath='sources/phrase/rueg-dakoda-de-v1.json';
let workDir='data/work/rueg-dakoda-de-v1';
let dbPath='data/local/rhymelab-phrases-v1.sqlite';
let reportPath='data/local/rueg-register-report.json';
let archivesDir=null, refresh=false;
const sourceArgs=[];
for(let i=0;i<args.length;i+=1){
 const arg=args[i];
 if(arg==='--manifest')manifestPath=args[++i]||manifestPath;
 else if(arg==='--work')workDir=args[++i]||workDir;
 else if(arg==='--db')dbPath=args[++i]||dbPath;
 else if(arg==='--report')reportPath=args[++i]||reportPath;
 else if(arg==='--archives')archivesDir=args[++i]||archivesDir;
 else if(arg==='--source')sourceArgs.push(args[++i]||'');
 else if(arg==='--refresh')refresh=true;
}
const root=process.cwd(); manifestPath=resolve(root,manifestPath); workDir=resolve(root,workDir); dbPath=resolve(root,dbPath); reportPath=resolve(root,reportPath);
archivesDir=resolve(root,archivesDir||join(workDir,'downloads'));
await mkdir(archivesDir,{recursive:true}); await mkdir(join(workDir,'extracted'),{recursive:true});
async function exists(path){try{await access(path);return true;}catch{return false;}}
function parseMapping(value){const at=value.indexOf('=');if(at<=0||at===value.length-1)throw new Error('Expected --source ID=/path');return{id:value.slice(0,at),root:resolve(value.slice(at+1))};}
const explicit=new Map(sourceArgs.filter(Boolean).map(parseMapping).map(x=>[x.id,x.root]));
async function sha256File(path){const hash=createHash('sha256');await new Promise((done,fail)=>{const s=createReadStream(path);s.on('data',c=>hash.update(c));s.on('error',fail);s.on('end',done);});return hash.digest('hex');}
async function download(url,target){
 if(!refresh&&await exists(target)){console.log('Reuse '+basename(target)+' ('+(await stat(target)).size+' bytes)');return;}
 console.log('Download '+url);
 const response=await fetch(url,{redirect:'follow',headers:{'user-agent':'RhymeLab/0.11 local corpus bootstrap','accept':'application/zip,application/octet-stream;q=0.9,*/*;q=0.1'}});
 if(!response.ok||!response.body)throw new Error('Download failed '+response.status+' for '+url+'\nDownload it manually to '+target+' or use --source ID=/already/extracted/folder');
 let bytes=0;const meter=new Transform({transform(chunk,enc,cb){bytes+=chunk.length;cb(null,chunk);}});
 await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(target));console.log('  saved '+bytes+' bytes');
}
function extract(zip,target){const r=spawnSync('tar',['-xf',zip,'-C',target],{cwd:root,stdio:'inherit',windowsHide:true,shell:false});if(r.error||r.status!==0)throw new Error('Could not extract '+zip+' with tar');}
function runImporter(mappings){const argv=['--no-warnings','scripts/enrich-de-phrase-register-rueg.mjs','--db',dbPath,'--manifest',manifestPath,'--report',reportPath];for(const x of mappings)argv.push('--subcorpus',x.id+'='+x.root);const r=spawnSync(process.execPath,argv,{cwd:root,stdio:'inherit',windowsHide:true});if(r.error||r.status!==0)throw new Error('RUEG importer failed with exit '+String(r.status??'spawn error'));}
if(!await exists(dbPath))throw new Error('Phrase DB missing: '+dbPath+'\nRun npm run phrase:catalog:bootstrap first.');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));const mappings=[];const archiveReport=[];
for(const corpus of manifest.subcorpora||[]){
 if(explicit.has(corpus.id)){mappings.push({id:corpus.id,root:explicit.get(corpus.id)});continue;}
 const exbZip=join(archivesDir,corpus.id+'_exb.zip');const metaZip=join(archivesDir,corpus.id+'_meta.zip');
 await download(corpus.exb_url,exbZip);await download(corpus.meta_url,metaZip);
 const target=join(workDir,'extracted',corpus.id);const marker=join(target,'.rhymelab-extracted.json');
 const exbSha=await sha256File(exbZip),metaSha=await sha256File(metaZip);let reuse=false;
 if(!refresh&&await exists(marker)){try{const old=JSON.parse(await readFile(marker,'utf8'));reuse=old.exb_sha256===exbSha&&old.meta_sha256===metaSha;}catch{}}
 if(!reuse){await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});console.log('Extract '+basename(exbZip));extract(exbZip,target);console.log('Extract '+basename(metaZip));extract(metaZip,target);await writeFile(marker,JSON.stringify({exb_sha256:exbSha,meta_sha256:metaSha},null,2)+'\n','utf8');}
 else console.log('Reuse extracted '+corpus.id);
 mappings.push({id:corpus.id,root:target});archiveReport.push({id:corpus.id,exb_sha256:exbSha,meta_sha256:metaSha,root:target});
}
console.log('\nBuild RUEG dipl + norm register evidence...');runImporter(mappings);
console.log('\nRUEG DAKODA REGISTER BUILD COMPLETE');console.log(JSON.stringify({database:dbPath,report:reportPath,sources:mappings,archives:archiveReport,audio_downloaded:false,candidate_generation:false,runtime_rewired:false},null,2));
