import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const MIME_TYPES=Object.freeze({
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.woff':'font/woff',
  '.woff2':'font/woff2',
});

function normalizeRoute(relativePath){
  return '/studio-react/'+relativePath.split(/[\\/]+/u).filter(Boolean).join('/');
}

function walkFiles(root,current=root,output=[]){
  for(const entry of readdirSync(current,{withFileTypes:true})){
    const path=join(current,entry.name);
    if(entry.isDirectory())walkFiles(root,path,output);
    else if(entry.isFile())output.push(path);
  }
  return output;
}

export function loadReactStudioPreviewAssets(distDir,{
  exists=existsSync,
  read=readFileSync,
  list=readdirSync,
}={}){
  if(!exists(distDir)){
    throw new Error(
      'React Studio build missing at '+distDir+'. Run: npm run studio:react:build'
    );
  }
  const indexPath=join(distDir,'index.html');
  if(!exists(indexPath)){
    throw new Error('React Studio index missing at '+indexPath);
  }

  const files=[];
  const visit=(current)=>{
    for(const entry of list(current,{withFileTypes:true})){
      const path=join(current,entry.name);
      if(entry.isDirectory())visit(path);
      else if(entry.isFile())files.push(path);
    }
  };
  visit(distDir);

  const assets={};
  for(const path of files){
    const rel=relative(distDir,path);
    const route=normalizeRoute(rel);
    assets[route]={
      type:MIME_TYPES[extname(path).toLowerCase()]||'application/octet-stream',
      body:read(path),
    };
  }
  const index=assets['/studio-react/index.html'];
  assets['/studio-react']=index;
  assets['/studio-react/']=index;
  return assets;
}
