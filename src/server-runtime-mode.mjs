export const SERVER_RUNTIME_MODES=Object.freeze({
  ACCEPTED:'accepted',
  SERVING_V1_PREVIEW:'serving-v1-preview',
});

export function resolveServerRuntimeMode({
  argv=[],
  env={},
}={}){
  const args=Array.isArray(argv)?argv.map((value)=>String(value)):[];
  if(args.includes('--serving-v1'))return SERVER_RUNTIME_MODES.SERVING_V1_PREVIEW;

  const requested=String(env?.RHYMELAB_PRODUCT_RUNTIME||'')
    .trim()
    .toLocaleLowerCase('en-US');
  if(['serving-v1','serving-v1-preview','serving'].includes(requested)){
    return SERVER_RUNTIME_MODES.SERVING_V1_PREVIEW;
  }
  return SERVER_RUNTIME_MODES.ACCEPTED;
}

export function isServingV1Preview(mode){
  return mode===SERVER_RUNTIME_MODES.SERVING_V1_PREVIEW;
}
