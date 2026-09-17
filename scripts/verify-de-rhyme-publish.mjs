#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir=process.argv[2]||'data/de/publish';
const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
if(manifest.schema!=='rhymelab-de-publish-v2')throw new Error(`Unexpected schema: ${manifest.schema}`);
let expectedOrder=1,forms=0,pronunciations=0,preferred=0,bytes=0,usageReady=0,dictionaryOnlyReady=0,historicalForms=0;
const words=new Set();
for(const shard of manifest.files){
  const data=await readFile(join(dir,shard.file),'utf8');
  const hash=createHash('sha256').update(data).digest('hex');
  if(hash!==shard.sha256)throw new Error(`Checksum mismatch: ${shard.file}`);
  const actualBytes=Buffer.byteLength(data); if(actualBytes!==shard.bytes)throw new Error(`Byte count mismatch: ${shard.file}`);
  const lines=data.split(/\r?\n/).filter(Boolean); if(lines.length!==shard.items)throw new Error(`Item count mismatch: ${shard.file}`); if(lines.length>manifest.shard_size)throw new Error(`Oversized shard: ${shard.file}`);
  let shardHistorical=0;
  for(const line of lines){
    const row=JSON.parse(line); if(row.o!==expectedOrder)throw new Error(`Publish-order gap: expected ${expectedOrder}, got ${row.o}`); expectedOrder+=1;
    if(!row.w||!row.n)throw new Error(`Missing word identity at publish order ${row.o}`); if(words.has(row.w))throw new Error(`Duplicate surface form: ${row.w}`); words.add(row.w);
    if(!Array.isArray(row.r)||row.r.length===0)throw new Error(`No pronunciation for ${row.w}`); if(row.u!==undefined&&(!Number.isInteger(row.u)||row.u<1))throw new Error(`Invalid usage rank for ${row.w}`);
    if(row.h!==undefined&&row.h!==1)throw new Error(`Invalid historical flag for ${row.w}`); if(row.lt!==undefined&&!Array.isArray(row.lt))throw new Error(`Invalid lexical tags for ${row.w}`);
    if(row.h===1){historicalForms+=1;shardHistorical+=1;if(!Array.isArray(row.lt)||!row.lt.some((tag)=>['archaic','obsolete','dated'].includes(tag)))throw new Error(`Historical form lacks historical lexical tag: ${row.w}`);}
    let preferredForWord=0; const ranks=new Set();
    for(const p of row.r){
      for(const required of ['i','ph','sc','st','ps','rt','ft','v','c','e','vk','vf','ck','cc','rs','pr','pf','el','ev','so','tg','rg','fg'])if(p[required]===undefined||p[required]===null)throw new Error(`Missing ${required} for ${row.w}`);
      if(!Number.isInteger(p.sc)||p.sc<1)throw new Error(`Invalid syllable count for ${row.w}`); if(!Number.isInteger(p.ps)||p.ps<1)throw new Error(`Invalid primary stress for ${row.w}`); if(!Number.isInteger(p.pr)||p.pr<1||ranks.has(p.pr))throw new Error(`Invalid pronunciation rank for ${row.w}`); ranks.add(p.pr);
      if(![0,1].includes(p.pf)||![0,1].includes(p.el))throw new Error(`Invalid pronunciation flags for ${row.w}`); if(!Number.isInteger(p.ev)||p.ev<1||!Number.isInteger(p.so)||p.so<0)throw new Error(`Invalid pronunciation evidence for ${row.w}`); if(!Array.isArray(p.tg)||!Array.isArray(p.rg)||!Array.isArray(p.fg))throw new Error(`Invalid pronunciation metadata for ${row.w}`);
      if(p.pf){preferredForWord+=1;if(!p.el)throw new Error(`Preferred pronunciation is not default-eligible for ${row.w}`);} pronunciations+=1;
    }
    if(preferredForWord!==1)throw new Error(`Expected exactly one preferred pronunciation for ${row.w}, got ${preferredForWord}`); preferred+=preferredForWord; forms+=1; if(row.u!==undefined)usageReady+=1; else dictionaryOnlyReady+=1;
  }
  if(Number.isInteger(shard.historical_items)&&shard.historical_items!==shardHistorical)throw new Error(`Historical count mismatch in ${shard.file}: ${shardHistorical} vs ${shard.historical_items}`);
  bytes+=actualBytes;
}
if(forms!==manifest.rhyme_ready_forms)throw new Error(`Form total mismatch: ${forms} vs ${manifest.rhyme_ready_forms}`); if(pronunciations!==manifest.pronunciations)throw new Error(`Pronunciation total mismatch: ${pronunciations} vs ${manifest.pronunciations}`); if(preferred!==manifest.preferred_pronunciations||preferred!==forms)throw new Error(`Preferred total mismatch: ${preferred}`); if(usageReady!==manifest.usage_ranked_rhyme_ready_forms)throw new Error(`Usage-ready mismatch: ${usageReady} vs ${manifest.usage_ranked_rhyme_ready_forms}`); if(dictionaryOnlyReady!==manifest.dictionary_only_rhyme_ready_forms)throw new Error(`Dictionary-only mismatch: ${dictionaryOnlyReady} vs ${manifest.dictionary_only_rhyme_ready_forms}`); if(Number.isInteger(manifest.historical_forms)&&historicalForms!==manifest.historical_forms)throw new Error(`Historical-form mismatch: ${historicalForms} vs ${manifest.historical_forms}`); if(bytes!==manifest.normalized_bytes)throw new Error(`Normalized-byte mismatch: ${bytes} vs ${manifest.normalized_bytes}`);
console.log(JSON.stringify({status:'ok',rhyme_ready_forms:forms,historical_forms:historicalForms,pronunciations,preferred_pronunciations:preferred,alternate_pronunciations:pronunciations-preferred,shards:manifest.files.length,usage_ranked_rhyme_ready_forms:usageReady,dictionary_only_rhyme_ready_forms:dictionaryOnlyReady,normalized_bytes:bytes,average_bytes_per_form:forms?Number((bytes/forms).toFixed(2)):null,usage_pronunciation_coverage_pct:manifest.usage_pronunciation_coverage_pct,usage_lexically_matched_forms:manifest.usage_lexically_matched_forms,ipa_normalization_failures:manifest.ipa_normalization_failures},null,2));
