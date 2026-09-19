import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { win32, posix } from 'node:path';

function firstExisting(paths,exists=existsSync){
  for(const path of paths){
    if(path&&exists(path)) return path;
  }
  return null;
}

function windowsWhere(command,{env=process.env,exists=existsSync,spawn=spawnSync}={}){
  const systemRoot=env.SystemRoot||env.SYSTEMROOT||'C:\\Windows';
  const whereExe=win32.join(systemRoot,'System32','where.exe');
  const executable=exists(whereExe)?whereExe:'where.exe';
  const result=spawn(executable,[command],{
    encoding:'utf8',
    stdio:'pipe',
    shell:false,
    env,
  });
  if(result.error||result.status!==0) return null;
  const paths=String(result.stdout||'')
    .split(/\r?\n/u)
    .map((value)=>value.trim())
    .filter(Boolean);
  return firstExisting(
    [
      ...paths.filter((value)=>/\.exe$/iu.test(value)),
      ...paths.filter((value)=>!/[.](?:cmd|bat)$/iu.test(value)),
      ...paths,
    ],
    exists,
  );
}

export function resolveCondaTool(
  name,
  {
    explicit=null,
    platform=process.platform,
    env=process.env,
    exists=existsSync,
    spawn=spawnSync,
  }={},
){
  if(explicit) return String(explicit);

  const prefix=env.CONDA_PREFIX||null;
  if(platform==='win32'){
    const candidates=[];
    if(prefix){
      if(name==='python'){
        candidates.push(
          win32.join(prefix,'python.exe'),
          win32.join(prefix,'Scripts','python.exe'),
        );
      }else{
        candidates.push(
          win32.join(prefix,'Scripts',name+'.exe'),
          win32.join(prefix,name+'.exe'),
          win32.join(prefix,'Library','bin',name+'.exe'),
          win32.join(prefix,'Scripts',name+'.cmd'),
          win32.join(prefix,'Scripts',name+'.bat'),
        );
      }
    }
    const direct=firstExisting(candidates,exists);
    if(direct) return direct;

    const discovered=windowsWhere(name,{env,exists,spawn});
    if(discovered) return discovered;

    throw new Error(
      'Unable to resolve '+name+' on Windows.'
      +(prefix?' CONDA_PREFIX='+prefix+'.':' No active CONDA_PREFIX was found.')
      +' Activate the rhymelab-mfa environment and retry.'
    );
  }

  if(prefix){
    const direct=firstExisting(
      [
        posix.join(prefix,'bin',name),
        name==='python'?posix.join(prefix,'bin','python3'):null,
      ],
      exists,
    );
    if(direct) return direct;
  }
  return name;
}

export function requiresShell(command,platform=process.platform){
  return platform==='win32'&&/[.](?:cmd|bat)$/iu.test(String(command));
}
