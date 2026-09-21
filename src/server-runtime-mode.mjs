export const SERVER_RUNTIME_MODES=Object.freeze({
  SERVING_V1:'serving-v1',
  LEGACY_ARCHIVE:'legacy-archive',

  // Compatibility aliases for older tooling/tests. These names are archival;
  // the canonical product default is SERVING_V1.
  SERVING_V1_PREVIEW:'serving-v1',
  ACCEPTED:'legacy-archive',
});

export function resolveServerRuntimeMode({
  argv=[],
  env={},
}={}){
  const args=Array.isArray(argv)?argv.map((value)=>String(value)):[];
  if(args.includes('--legacy-runtime')||args.includes('--archive-runtime')){
    return SERVER_RUNTIME_MODES.LEGACY_ARCHIVE;
  }
  if(args.includes('--serving-v1'))return SERVER_RUNTIME_MODES.SERVING_V1;

  const requested=String(env?.RHYMELAB_PRODUCT_RUNTIME||'')
    .trim()
    .toLocaleLowerCase('en-US');
  if(['legacy','legacy-archive','archive','writer-v5','accepted'].includes(requested)){
    return SERVER_RUNTIME_MODES.LEGACY_ARCHIVE;
  }
  return SERVER_RUNTIME_MODES.SERVING_V1;
}

export function isServingV1(mode){
  return mode===SERVER_RUNTIME_MODES.SERVING_V1;
}

// Backward-compatible symbol for scripts that still import the old preview name.
export const isServingV1Preview=isServingV1;
