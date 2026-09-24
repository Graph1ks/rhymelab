#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const cutover=process.argv.includes('--cutover');
const root=process.cwd();
const legacyModule=await import(pathToFileURL(resolve(root,'src/studio/parity-manifest.mjs')).href);
const coverage=JSON.parse(await readFile(resolve(root,'apps/studio-react/parity-coverage.json'),'utf8'));
const legacyRows=legacyModule.STUDIO_PARITY_MANIFEST;
const coverageRows=[
  ...(coverage.legacy_capabilities||[]),
  ...(coverage.additional_current_capabilities||[]),
];
const byId=new Map(coverageRows.map((row)=>[row.id,row]));
const missing=legacyRows.filter((row)=>!byId.has(row.id)).map((row)=>row.id);
const duplicateIds=coverageRows
  .map((row)=>row.id)
  .filter((id,index,ids)=>ids.indexOf(id)!==index);
const mandatoryV3=[
  'workflow-v3.compact-default',
  'workflow-v3.bar-hold-drag',
  'workflow-v3.revision-diff',
  'workflow-v3.section-long-press',
  'workflow-v3.follow-selection-default',
  'workflow-v3.fixed-anchor-optin',
  'workflow-v3.continuous-results',
  'workflow-v3.single-drawer-scroll',
  'workflow-v3.active-db-visible',
  'workflow-v3.runtime-db-availability',
  'workflow-v3.runtime-db-fallback',
];
const missingV3=mandatoryV3.filter((id)=>!byId.has(id));
const allowed=new Set(coverage.allowed_statuses||[]);
const invalidStatus=coverageRows.filter((row)=>!allowed.has(row.status)).map((row)=>`${row.id}=${row.status}`);

if(missing.length||missingV3.length||duplicateIds.length||invalidStatus.length){
  console.error('REACT STUDIO PARITY INVENTORY FAILED');
  if(missing.length)console.error('Missing legacy IDs:',missing.join(', '));
  if(missingV3.length)console.error('Missing Workflow UX v3 IDs:',missingV3.join(', '));
  if(duplicateIds.length)console.error('Duplicate IDs:',[...new Set(duplicateIds)].join(', '));
  if(invalidStatus.length)console.error('Invalid statuses:',invalidStatus.join(', '));
  process.exit(1);
}

const allVerified=coverageRows.every((row)=>row.status==='verified');
const verified=coverageRows.filter((row)=>row.status==='verified').length;

console.log(`React Studio parity inventory OK: ${legacyRows.length} legacy + ${coverage.additional_current_capabilities.length} workflow-v3 rows; ${verified}/${coverageRows.length} verified.`);

if(cutover&&!allVerified){
  const blocking=coverageRows.filter((row)=>row.status!=='verified');
  console.error(`CUTOVER BLOCKED: ${blocking.length} parity rows are not verified.`);
  for(const row of blocking.slice(0,25))console.error(`- ${row.id}: ${row.status}`);
  if(blocking.length>25)console.error(`- ... ${blocking.length-25} more`);
  process.exit(2);
}

if(cutover)console.log('CUTOVER PARITY GATE PASSED.');
