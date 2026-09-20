import { execFile, spawnSync } from 'node:child_process';
import { normalizeEspeakIpa } from './espeak-ipa-normalization.mjs';
import { getPhonologyProfile } from './phonology-profiles.mjs';

const commandVersionCache=new Map();
let autoEspeakCommandState=undefined;

function normalizeLanguage(value){
  const language=String(value||'').trim().toLocaleLowerCase('en-US');
  if(!['de','en'].includes(language)){
    throw new TypeError(`Unsupported query-pronunciation language: ${value}`);
  }
  return language;
}

export { normalizeEspeakIpa } from './espeak-ipa-normalization.mjs';

function espeakCommands(explicitCommand=null){
  if(explicitCommand)return[String(explicitCommand)];
  if(process.env.RHYMELAB_ESPEAK_COMMAND)return[String(process.env.RHYMELAB_ESPEAK_COMMAND)];
  return process.platform==='win32'
    ?['espeak-ng.exe','espeak-ng','espeak.exe','espeak']
    :['espeak-ng','espeak'];
}

function runCommand(command,args,runner){
  if(typeof runner==='function')return runner(command,args);
  return spawnSync(command,args,{
    encoding:'utf8',
    windowsHide:true,
    timeout:2500,
    maxBuffer:1024*1024,
  });
}

function engineVersion(command,runner){
  if(typeof runner==='function')return null;
  if(commandVersionCache.has(command))return commandVersionCache.get(command);
  const result=runCommand(command,['--version'],runner);
  const version=result?.status===0
    ?String(result.stdout||result.stderr||'').split(/\r?\n/u)[0].trim()||null
    :null;
  commandVersionCache.set(command,version);
  return version;
}

async function runCommandAsync(command,args,runner){
  if(typeof runner==='function')return await runner(command,args);
  return await new Promise((resolve)=>{
    execFile(command,args,{
      encoding:'utf8',
      windowsHide:true,
      timeout:2500,
      maxBuffer:1024*1024,
    },(error,stdout,stderr)=>{
      resolve({
        status:error?Number.isInteger(error.code)?error.code:null:0,
        error:error&&!Number.isInteger(error.code)?error:null,
        stdout:String(stdout??''),
        stderr:String(stderr??''),
      });
    });
  });
}

export function inspectEspeakIpaOutput(
  surface,
  language,
  rawIpa,
  {engineCommand=null,engineVersion=null,attempts=[]}={},
){
  const code=normalizeLanguage(language);
  const raw=String(rawIpa??'').normalize('NFC').trim();
  const ipa=normalizeEspeakIpa(raw,code);
  if(!ipa){
    return {
      status:'rejected',language:code,surface:String(surface),engine:'espeak-ng',
      engineCommand,engineVersion,rawIpa:raw,ipa,
      analyzerError:'empty_normalized_ipa',attempts,
    };
  }
  try{
    const profile=getPhonologyProfile(code);
    const analysis=profile.analyzeIpa(ipa);
    return {
      status:'accepted',method:'espeak_ng',engine:'espeak-ng',
      engineCommand,engineVersion,language:code,surface:String(surface),
      rawIpa:raw,ipa,analysis,attempts,
    };
  }catch(error){
    return {
      status:'rejected',language:code,surface:String(surface),engine:'espeak-ng',
      engineCommand,engineVersion,rawIpa:raw,ipa,
      analyzerError:String(error?.message||error),attempts,
    };
  }
}

export function inspectEspeakQueryPronunciation(
  surface,
  language,
  {command=null,runner=null}={},
){
  const code=normalizeLanguage(language);
  const voice=code==='de'?'de':'en-us';
  const autoDiscovery=runner==null&&!command&&!process.env.RHYMELAB_ESPEAK_COMMAND;
  if(autoDiscovery&&autoEspeakCommandState===null){
    return {status:'unavailable',language:code,surface:String(surface),attempts:[]};
  }
  const candidates=autoDiscovery&&typeof autoEspeakCommandState==='string'
    ?[autoEspeakCommandState]
    :espeakCommands(command);
  const attempts=[];

  for(const candidate of candidates){
    const result=runCommand(candidate,['-q','--ipa=3','-v',voice,String(surface)],runner);
    if(result?.error||result?.status!==0){
      attempts.push({
        command:candidate,
        processStatus:result?.status??null,
        processError:result?.error?String(result.error.message||result.error):null,
        stderr:String(result?.stderr||'').trim()||null,
      });
      continue;
    }

    if(autoDiscovery)autoEspeakCommandState=candidate;
    return inspectEspeakIpaOutput(surface,code,result.stdout,{
      engineCommand:candidate,
      engineVersion:engineVersion(candidate,runner),
      attempts,
    });
  }

  if(autoDiscovery)autoEspeakCommandState=null;
  return {status:'unavailable',language:code,surface:String(surface),attempts};
}

export async function inspectEspeakQueryPronunciationAsync(
  surface,
  language,
  {command=null,runner=null}={},
){
  const code=normalizeLanguage(language);
  const voice=code==='de'?'de':'en-us';
  const autoDiscovery=runner==null&&!command&&!process.env.RHYMELAB_ESPEAK_COMMAND;
  if(autoDiscovery&&autoEspeakCommandState===null){
    return {status:'unavailable',language:code,surface:String(surface),attempts:[]};
  }
  const candidates=autoDiscovery&&typeof autoEspeakCommandState==='string'
    ?[autoEspeakCommandState]
    :espeakCommands(command);
  const attempts=[];

  for(const candidate of candidates){
    const result=await runCommandAsync(candidate,['-q','--ipa=3','-v',voice,String(surface)],runner);
    if(result?.error||result?.status!==0){
      attempts.push({
        command:candidate,
        processStatus:result?.status??null,
        processError:result?.error?String(result.error.message||result.error):null,
        stderr:String(result?.stderr||'').trim()||null,
      });
      continue;
    }

    if(autoDiscovery)autoEspeakCommandState=candidate;
    return inspectEspeakIpaOutput(surface,code,result.stdout,{
      engineCommand:candidate,
      engineVersion:engineVersion(candidate,runner),
      attempts,
    });
  }

  if(autoDiscovery)autoEspeakCommandState=null;
  return {status:'unavailable',language:code,surface:String(surface),attempts};
}

export function tryEspeakQueryPronunciation(surface,language,options={}){
  const inspected=inspectEspeakQueryPronunciation(surface,language,options);
  return inspected.status==='accepted'?inspected:null;
}

export function clearEspeakQueryPronunciationDiscovery(){
  autoEspeakCommandState=undefined;
}
