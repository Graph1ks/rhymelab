import { createHash } from 'node:crypto';

export const MARKOV_MODEL_SCHEMA='rhymelab-markov-model-v1';
export const MARKOV_MODEL_POLICY='rhymelab-markov-corpus-v1';
export const MARKOV_MODEL_ORDER=2;
export const START_TOKEN='<s>';
export const END_TOKEN='</s>';
export const STATE_SEPARATOR='\u0001';

const WORD_OR_PUNCT=/[\p{L}\p{M}\p{N}]+(?:[’'\-][\p{L}\p{M}\p{N}]+)*|[,;:!?…]+/gu;
const TERMINAL_PUNCT=/^[.!?…]+$/u;
const PUNCT=/^[,;:!?…]+$/u;
const URLISH=/(?:https?:\/\/|www\.|\S+@\S+\.\S+)/iu;

export function clamp(value,min=0,max=1){
  const n=Number(value);
  if(!Number.isFinite(n))return min;
  return Math.max(min,Math.min(max,n));
}

export function normalizeModelToken(value,language='de'){
  const locale=language==='en'?'en-US':'de-DE';
  const token=String(value??'').normalize('NFKC').trim();
  if(!token)return '';
  if(PUNCT.test(token))return token;
  return token.toLocaleLowerCase(locale);
}

export function tokenizeSurface(value,{language='de',maximumTokens=12}={}){
  const raw=String(value??'').normalize('NFKC').trim().match(WORD_OR_PUNCT)||[];
  while(raw.length&&TERMINAL_PUNCT.test(raw.at(-1)))raw.pop();
  return raw.slice(0,maximumTokens).map((surface)=>({surface,norm:normalizeModelToken(surface,language)})).filter((row)=>row.norm);
}

export function tokenizeCorpusSentence(sentence,{language='de',minimumTokens=3,maximumTokens=48}={}){
  let text=String(sentence??'').normalize('NFKC').trim();
  if(!text||URLISH.test(text))return [];
  const raw=text.match(WORD_OR_PUNCT)||[];
  while(raw.length&&TERMINAL_PUNCT.test(raw.at(-1)))raw.pop();
  const tokens=raw.map((surface)=>({
    surface,
    norm:normalizeModelToken(surface,language),
  })).filter((row)=>row.norm);
  if(tokens.length<minimumTokens||tokens.length>maximumTokens)return [];
  const lexical=tokens.filter((row)=>!PUNCT.test(row.norm));
  if(lexical.length<minimumTokens)return [];
  const digitHeavy=lexical.filter((row)=>/^\p{N}+$/u.test(row.norm)).length/lexical.length;
  if(digitHeavy>0.25)return [];
  return tokens;
}

export function sequenceFromSentence(sentence,options={}){
  const tokens=tokenizeCorpusSentence(sentence,options);
  if(!tokens.length)return [];
  return [
    {surface:START_TOKEN,norm:START_TOKEN},
    {surface:START_TOKEN,norm:START_TOKEN},
    ...tokens,
    {surface:END_TOKEN,norm:END_TOKEN},
  ];
}

export function stateKey(tokens){
  return tokens.join(STATE_SEPARATOR);
}

export function splitStateKey(key){
  return String(key??'').split(STATE_SEPARATOR);
}

export function tokenShape(surface){
  const value=String(surface??'');
  if(!value||value===START_TOKEN||value===END_TOKEN||PUNCT.test(value))return 'fixed';
  const letters=[...value].filter((ch)=>/\p{L}/u.test(ch));
  if(!letters.length)return 'fixed';
  if(letters.every((ch)=>ch===ch.toLocaleUpperCase('de-DE')))return 'upper';
  const first=letters[0];
  return first===first.toLocaleUpperCase('de-DE')?'title':'lower';
}

export function preferredSurfaceFor({norm,count=0,title_count=0,upper_count=0}){
  if(norm===START_TOKEN||norm===END_TOKEN||PUNCT.test(norm))return norm;
  const total=Math.max(1,Number(count)||0);
  if((Number(upper_count)||0)/total>=0.5)return String(norm).toLocaleUpperCase('de-DE');
  if((Number(title_count)||0)/total>=0.72){
    const chars=[...String(norm)];
    if(chars.length)chars[0]=chars[0].toLocaleUpperCase('de-DE');
    return chars.join('');
  }
  return String(norm);
}

export function createMarkovStorage(db){
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS token(
      norm TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      title_count INTEGER NOT NULL DEFAULT 0,
      upper_count INTEGER NOT NULL DEFAULT 0,
      preferred_surface TEXT NOT NULL DEFAULT ''
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS state_count(
      state_key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      retained INTEGER NOT NULL DEFAULT 0 CHECK(retained IN (0,1))
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS state_count_retained_idx ON state_count(retained,count DESC,state_key);
    CREATE TABLE IF NOT EXISTS transition(
      direction TEXT NOT NULL CHECK(direction IN ('forward','reverse')),
      context_len INTEGER NOT NULL CHECK(context_len IN (1,2)),
      state_key TEXT NOT NULL,
      next_token TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY(direction,context_len,state_key,next_token)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS transition_lookup_idx
      ON transition(direction,context_len,state_key,count DESC,next_token);
    CREATE TABLE IF NOT EXISTS build_checkpoint(
      phase TEXT NOT NULL,
      source_index INTEGER NOT NULL,
      source_code TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      accepted_sentences INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(phase,source_index)
    ) WITHOUT ROWID;
  `);
}

export function writeMeta(db,values){
  const stmt=db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);
  for(const [key,value] of Object.entries(values))stmt.run(key,String(value));
}

export function readMeta(db){
  try{return Object.fromEntries(db.prepare('SELECT key,value FROM meta ORDER BY key').all().map((r)=>[String(r.key),String(r.value)]));}
  catch{return {};}
}

export function semanticFingerprint(db){
  const hash=createHash('sha256');
  const meta=readMeta(db);
  for(const key of ['schema','policy','language','order','min_token_count','max_states','top_k']){
    hash.update(`${key}\t${meta[key]??''}\n`);
  }
  const tokenRows=db.prepare('SELECT norm,count,title_count,upper_count,preferred_surface FROM token ORDER BY norm').iterate();
  for(const row of tokenRows)hash.update(`T\t${row.norm}\t${row.count}\t${row.title_count}\t${row.upper_count}\t${row.preferred_surface}\n`);
  const transitions=db.prepare('SELECT direction,context_len,state_key,next_token,count FROM transition ORDER BY direction,context_len,state_key,next_token').iterate();
  for(const row of transitions)hash.update(`R\t${row.direction}\t${row.context_len}\t${row.state_key}\t${row.next_token}\t${row.count}\n`);
  return hash.digest('hex');
}

export function modelStats(db){
  const one=(sql,fallback=0)=>{try{return Number(db.prepare(sql).get()?.n||0);}catch{return Number(fallback)||0;}};
  const meta=readMeta(db);
  return {
    schema:meta.schema||null,
    policy:meta.policy||null,
    language:meta.language||null,
    order:Number(meta.order||0),
    tokens:one('SELECT COUNT(*) AS n FROM token'),
    retainedStates:one('SELECT COUNT(*) AS n FROM state_count WHERE retained=1',meta.retained_states),
    transitions:one('SELECT COUNT(*) AS n FROM transition'),
    forwardTransitions:one("SELECT COUNT(*) AS n FROM transition WHERE direction='forward'"),
    reverseTransitions:one("SELECT COUNT(*) AS n FROM transition WHERE direction='reverse'"),
    sourceSentences:Number(meta.source_sentences||0),
    acceptedSentences:Number(meta.accepted_sentences||0),
    semanticFingerprint:meta.semantic_fingerprint||null,
  };
}

export function isPunctuationToken(token){return PUNCT.test(String(token??''));}
export function isBoundaryToken(token){return token===START_TOKEN||token===END_TOKEN;}
