function paramsOf(input){
  if(input instanceof URLSearchParams)return input;
  if(input?.searchParams instanceof URLSearchParams)return input.searchParams;
  return new URLSearchParams(String(input||''));
}

export function generatedOnlyRequested(input){
  return paramsOf(input).get('generated_only')==='1';
}

export function generatedDataRequested(input){
  const params=paramsOf(input);
  if(generatedOnlyRequested(params))return true;
  return params.get('generated')!=='0';
}

export function generatedDataExplicitlyRequired(input){
  const params=paramsOf(input);
  return generatedOnlyRequested(params)||params.get('generated')==='1';
}
