const DEFAULT_TYPING_WINDOW_MS=1100;
const COALESCIBLE_INPUT_TYPES=new Set([
  'insertText',
  'insertReplacementText',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
]);

function clean(value){return String(value??'').trim()}

export function typingInputIsCoalescible(inputType){
  return COALESCIBLE_INPUT_TYPES.has(clean(inputType));
}

export function createTypingUndoCoalescer({windowMs=DEFAULT_TYPING_WINDOW_MS}={}){
  const maxGap=Math.max(150,Number(windowMs)||DEFAULT_TYPING_WINDOW_MS);
  let active=null;

  function reset(){active=null}

  function shouldCheckpoint({
    songId='',
    barId='',
    inputType='',
    now=Date.now(),
    composing=false,
  }={}){
    if(composing||!typingInputIsCoalescible(inputType)){
      reset();
      return true;
    }
    const stamp=Number(now)||Date.now();
    const next={songId:clean(songId),barId:clean(barId),inputType:clean(inputType),at:stamp};
    const sameBurst=Boolean(
      active
      &&active.songId===next.songId
      &&active.barId===next.barId
      &&stamp>=active.at
      &&stamp-active.at<=maxGap
    );
    active=next;
    return !sameBurst;
  }

  function noteBoundary(){reset()}

  function inspect(){
    return active?{...active}:null;
  }

  return {
    shouldCheckpoint,
    reset,
    noteBoundary,
    inspect,
    windowMs:maxGap,
  };
}
