import test from 'node:test';
import assert from 'node:assert/strict';
import { win32 } from 'node:path';
import {
  requiresShell,
  resolveCondaTool,
} from '../scripts/local-command-resolution.mjs';

test('Windows Conda tool resolution prefers active environment executables',()=>{
  const prefix='C:\\Users\\owner\\miniforge3\\envs\\rhymelab-mfa';
  const mfa=win32.join(prefix,'Scripts','mfa.exe');
  const python=win32.join(prefix,'python.exe');
  const existing=new Set([mfa,python]);

  assert.equal(
    resolveCondaTool('mfa',{
      platform:'win32',
      env:{CONDA_PREFIX:prefix,SystemRoot:'C:\\Windows'},
      exists:(path)=>existing.has(path),
      spawn:()=>({status:1,stdout:'',stderr:''}),
    }),
    mfa,
  );
  assert.equal(
    resolveCondaTool('python',{
      platform:'win32',
      env:{CONDA_PREFIX:prefix,SystemRoot:'C:\\Windows'},
      exists:(path)=>existing.has(path),
      spawn:()=>({status:1,stdout:'',stderr:''}),
    }),
    python,
  );
});

test('Windows Conda tool resolution falls back to where.exe',()=>{
  const discovered='D:\\Tools\\mfa.exe';
  const calls=[];
  const resolved=resolveCondaTool('mfa',{
    platform:'win32',
    env:{SystemRoot:'C:\\Windows'},
    exists:(path)=>path===discovered||path==='C:\\Windows\\System32\\where.exe',
    spawn:(command,args)=>{
      calls.push({command,args});
      return {status:0,stdout:discovered+'\r\n',stderr:''};
    },
  });
  assert.equal(resolved,discovered);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].args,['mfa']);
});

test('Windows command shims request shell execution',()=>{
  assert.equal(requiresShell('C:\\x\\mfa.cmd','win32'),true);
  assert.equal(requiresShell('C:\\x\\mfa.exe','win32'),false);
  assert.equal(requiresShell('/opt/mfa','linux'),false);
});
