import { spawnSync } from 'node:child_process';
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

export function normalizeEspeakIpa(value,language){
  const code=normalizeLanguage(language);
  let ipa=String(value??'')
    .normalize('NFC')
    .replace(/\p{Cf}/gu,'')
    .replace(/[\r\n]+/gu,' ')
    .replace(/[‖|]+/gu,' ')
    .replace(/_/gu,' ')
    .replace(/\s+/gu,' ')
    .trim();

  if(code==='en'){
    ipa=ipa
      .replaceAll('ɫ','l')
      .replaceAll('ɾ','t')
      .replaceAll('ᵻ','ɪ')
      .replaceAll('ᵊ','ə')
      .replaceAll('ɡ','g')
      .replaceAll('əː','ɜ')
      .replaceAll('ɹ̩','ɚ')
      .replaceAll('oː','oʊ')
      .replaceAll('eː','eɪ')
      .replaceAll('ɛː','ɛ')
      .replaceAll('ɪː','i')
      .replaceAll('ʊː','u');
  }else{
    ipa=ipa
      .replaceAll('ɡ','g')
      .replaceAll('ɾ','r')
      .replaceAll('ɫ','l')
      .replaceAll('ᵊ','ə')
      .replaceAll('ɑː','aː')
      .replaceAll('ɒː','aː')
      .replaceAll('ɜː','ɐ')
      .replaceAll('ɜ','ɐ');
  }
  return ipa;
}

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
    const rawIpa=String(result.stdout??'').normalize('NFC').trim();
    const ipa=normalizeEspeakIpa(rawIpa,code);
    if(!ipa){
      return {
        status:'rejected',language:code,surface:String(surface),engine:'espeak-ng',
        engineCommand:candidate,engineVersion:engineVersion(candidate,runner),
        rawIpa,ipa,analyzerError:'empty_normalized_ipa',attempts,
      };
    }

    try{
      const profile=getPhonologyProfile(code);
      const analysis=profile.analyzeIpa(ipa);
      return {
        status:'accepted',method:'espeak_ng',engine:'espeak-ng',
        engineCommand:candidate,engineVersion:engineVersion(candidate,runner),
        language:code,surface:String(surface),rawIpa,ipa,analysis,attempts,
      };
    }catch(error){
      return {
        status:'rejected',language:code,surface:String(surface),engine:'espeak-ng',
        engineCommand:candidate,engineVersion:engineVersion(candidate,runner),
        rawIpa,ipa,analyzerError:String(error?.message||error),attempts,
      };
    }
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
