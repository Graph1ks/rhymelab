export const DEMO_RHYME_DATASETS=Object.freeze({
  nacht:[['Macht','word','rein',1],['gedacht','word','rein',2],['erwacht','word','rein',2],['vollbracht','word','rein',2],['gute Nacht','phrase','rein',3],['Acht','word','rein',1],['über Nacht','phrase','rein',3],['entfacht','word','rein',2],['Wacht','word','rein',1],['Bracht','entity','rein',1],['lacht','word','rein',1],['sacht','word','rein',1]],
  zeit:[['bereit','word','rein',2],['weit','word','rein',1],['Ewigkeit','word','rein',3],['mit der Zeit','phrase','rein',3],['befreit','word','rein',2],['zu zweit','phrase','rein',2],['Kleid','word','rein',1],['Leid','word','rein',1]],
  leben:[['schweben','word','rein',2],['geben','word','rein',2],['daneben','word','rein',3],['erleben','word','rein',3],['nach den Sternen streben','phrase','rein',5],['eben','word','rein',2],['Regen','word','nah',2],['Segen','word','nah',2]],
  nation:[['station','word','rein',2,'en'],['creation','word','rein',3,'en'],['vibration','word','rein',3,'en'],['imagination','word','rein',5,'en'],['destination','word','rein',4,'en']],
  haut:[['laut','word','rein',1],['vertraut','word','rein',2],['gebaut','word','rein',2],['aufgetaut','word','rein',3]],
  wach:[['Dach','word','rein',1],['Bach','entity','rein',1],['danach','word','rein',2],['nach und nach','phrase','rein',3]],
});

export function estimateSyllables(surface){
  return (String(surface||'').toLowerCase().match(/[aeiouyäöü]+/g)||[]).length;
}

export function getDemoSearchRows({
  query,
  scope='all',
  relation='all',
  resultLanguage='both',
  queryBasis='de',
}={}){
  const normalized=String(query||'').toLocaleLowerCase().trim();
  return (DEMO_RHYME_DATASETS[normalized]||[])
    .map((row,index)=>({
      word:row[0],
      kind:row[1],
      relation:row[2],
      syll:row[3],
      lang:row[4]||'de',
      id:`${normalized}-${index}`,
    }))
    .filter((row)=>(
      (scope==='all'||scope===row.kind)
      &&(relation==='all'||relation===row.relation)
      &&(resultLanguage==='both'||resultLanguage===row.lang)
      &&(queryBasis==='both'||queryBasis===row.lang)
    ));
}
