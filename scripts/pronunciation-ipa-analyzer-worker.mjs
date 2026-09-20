import { parentPort } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { inspectEspeakIpaOutput } from './query-pronunciation-espeak-adapter.mjs';

if(!parentPort)throw new Error('IPA analyzer worker requires parentPort.');

function compactAnalysis(analysis){
  return {
    ipa:analysis?.ipa??null,
    canonicalPhonemes:analysis?.canonicalPhonemes??null,
    finalCoda:analysis?.syllables?.at?.(-1)?.coda??[],
    syllableCount:analysis?.syllableCount??null,
    primaryStressSyllable:analysis?.primaryStressSyllable??null,
    stressPattern:analysis?.stressPattern??null,
    stressedTail:analysis?.stressedTail??null,
    finalTail:analysis?.finalTail??null,
    vowelSequence:analysis?.vowelSequence??null,
    consonantSequence:analysis?.consonantSequence??null,
    exactTailKey:analysis?.exactTailKey??null,
    multisyllableKey:analysis?.multisyllableKey??null,
    vowelKey:analysis?.vowelKey??null,
    vowelFamilyKey:analysis?.vowelFamilyKey??null,
    codaKey:analysis?.codaKey??null,
    stressedSyllableCount:analysis?.stressedSyllableCount??null,
    rhotic:analysis?.rhotic??null,
  };
}

parentPort.on('message',(message)=>{
  const id=Number(message?.id);
  const payload=message?.payload||{};
  const started=performance.now();
  try{
    const inspection=inspectEspeakIpaOutput(
      payload.surface,
      payload.language,
      payload.rawIpa,
      {
        engineCommand:payload.engineCommand??null,
        engineVersion:payload.engineVersion??null,
        attempts:Array.isArray(payload.attempts)?payload.attempts:[],
      },
    );
    if(inspection?.status==='accepted'){
      inspection.analysis=compactAnalysis(inspection.analysis);
    }
    parentPort.postMessage({
      id,
      ok:true,
      inspection,
      elapsed_ms:performance.now()-started,
    });
  }catch(error){
    parentPort.postMessage({
      id,
      ok:false,
      error:String(error?.stack||error?.message||error),
      elapsed_ms:performance.now()-started,
    });
  }
});
