const DENSITIES=Object.freeze(['list','compact','tiles']);

export function normalizeDensity(value){
  return DENSITIES.includes(value)?value:'compact';
}

export function nextDensity(value){
  const density=normalizeDensity(value);
  return density==='compact'?'list':'compact';
}
