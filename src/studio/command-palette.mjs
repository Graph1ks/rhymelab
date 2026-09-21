export function normalizeCommandQuery(value){
  return String(value??'')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .trim()
    .replace(/\s+/g,' ');
}

function commandHaystack(command){
  return normalizeCommandQuery([
    command?.label,
    command?.group,
    ...(Array.isArray(command?.keywords)?command.keywords:[]),
  ].filter(Boolean).join(' '));
}

function scoreCommand(command,query){
  if(!query)return 100;
  const label=normalizeCommandQuery(command?.label);
  const haystack=commandHaystack(command);
  const tokens=query.split(' ').filter(Boolean);
  if(!tokens.every((token)=>haystack.includes(token)))return -1;
  let score=0;
  if(label===query)score+=120;
  if(label.startsWith(query))score+=70;
  else if(label.includes(query))score+=45;
  for(const token of tokens){
    if(label.startsWith(token))score+=20;
    else if(label.includes(token))score+=12;
    else score+=6;
  }
  return score;
}

export function rankStudioCommands(commands,query=''){
  const normalized=normalizeCommandQuery(query);
  return (Array.isArray(commands)?commands:[])
    .map((command,index)=>({command,index,score:scoreCommand(command,normalized)}))
    .filter((row)=>row.score>=0)
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .map((row)=>row.command);
}

export function studioCommandGroups(commands){
  const groups=[];
  const byName=new Map();
  for(const command of commands||[]){
    const name=String(command?.group||'Aktionen');
    if(!byName.has(name)){
      const group={name,commands:[]};
      byName.set(name,group);
      groups.push(group);
    }
    byName.get(name).commands.push(command);
  }
  return groups;
}

export function commandShortcutText(shortcut){
  if(!shortcut)return '';
  return String(shortcut)
    .replace(/CtrlOrMeta/gu,'Ctrl / ⌘')
    .replace(/Alt\+/gu,'Alt + ')
    .replace(/Shift\+/gu,'Shift + ')
    .replace(/\+/gu,' + ');
}
