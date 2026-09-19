export function prepareG2pEnNeuralInput(value){
  const original=String(value??'');
  const normalized=original
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US');
  const decomposed=normalized.normalize('NFKD');
  let folded='';
  let removedCombiningMarks=0;
  for(const char of decomposed){
    if(/\p{M}/u.test(char)){
      removedCombiningMarks+=1;
      continue;
    }
    folded+=char;
  }
  folded=folded.normalize('NFKC');
  const unsupported=[
    ...new Set([...folded].filter((char)=>!/[a-z]/u.test(char))),
  ].sort();
  const eligible=Boolean(folded)&&unsupported.length===0;
  return {
    original,
    normalized,
    model_input:eligible?folded:null,
    eligible,
    strategy:removedCombiningMarks>0
      ?'lowercase_diacritic_fold'
      :'lowercase_normalized',
    removed_combining_marks:removedCombiningMarks,
    unsupported_graphemes:unsupported,
  };
}

export function prepareG2pEnNeuralCases(benchmarkCases){
  const eligible=[];
  const ineligible=[];
  let diacriticFoldCases=0;
  const modelInputs=new Map();

  for(const row of benchmarkCases||[]){
    const prepared=prepareG2pEnNeuralInput(row.normalized||row.surface);
    if(prepared.strategy==='lowercase_diacritic_fold') diacriticFoldCases+=1;
    const out={
      case_id:row.case_id,
      surface:row.surface,
      normalized:row.normalized,
      model_input:prepared.model_input,
      strategy:prepared.strategy,
      unsupported_graphemes:prepared.unsupported_graphemes,
    };
    if(!prepared.eligible){
      ineligible.push(out);
      continue;
    }
    eligible.push(out);
    const ids=modelInputs.get(prepared.model_input)||[];
    ids.push(row.case_id);
    modelInputs.set(prepared.model_input,ids);
  }

  const collisions=[...modelInputs.entries()]
    .filter(([,ids])=>ids.length>1)
    .map(([model_input,case_ids])=>({model_input,case_ids}));

  return {
    eligible,
    ineligible,
    collisions,
    diacritic_fold_cases:diacriticFoldCases,
  };
}
