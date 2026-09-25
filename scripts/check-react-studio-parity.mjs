#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const coverage=JSON.parse(await readFile(resolve('apps/studio-react/parity-coverage.json'),'utf8'));
const legacyRows=coverage.legacy_capabilities||[];
const currentRows=coverage.additional_current_capabilities||[];
const rows=[...legacyRows,...currentRows];
const allowed=new Set(coverage.allowed_statuses||[]);
const duplicateIds=rows.map((row)=>row.id).filter((id,index,ids)=>ids.indexOf(id)!==index);
const invalidStatus=rows.filter((row)=>!allowed.has(row.status)).map((row)=>`${row.id}=${row.status}`);
const notPorted=rows.filter((row)=>!['ported','verified'].includes(row.status)).map((row)=>`${row.id}=${row.status}`);
const missingEvidence=rows.filter((row)=>!Array.isArray(row.evidence)||row.evidence.length===0).map((row)=>row.id);
const forbiddenEvidencePrefixes=[
  'src/studio/','src/ui/','src/pad/','src/rhymepad-v14.mjs',
  'apps/studio-react/src/legacy/',
  'apps/studio-react/src/features/system/SystemAcceptancePanel.tsx',
  'scripts/check-studio-v2-cutover.mjs',
  'scripts/check-react-studio-r7.mjs',
  'scripts/merge-studio-device-acceptance.mjs',
  '.github/workflows/studio-v2.yml',
];
const retiredEvidence=rows.flatMap((row)=>
  (row.evidence||[])
    .filter((entry)=>forbiddenEvidencePrefixes.some((prefix)=>String(entry).startsWith(prefix)))
    .map((entry)=>`${row.id} -> ${entry}`)
);
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
const byId=new Set(rows.map((row)=>row.id));
const missingV3=mandatoryV3.filter((id)=>!byId.has(id));
const expectedLegacy=Number(coverage.baseline?.legacy_capability_count||82);
const expectedCurrent=Number(coverage.baseline?.additional_current_capability_count||11);
const countMismatch=legacyRows.length!==expectedLegacy||currentRows.length!==expectedCurrent;

if(duplicateIds.length||invalidStatus.length||notPorted.length||missingEvidence.length||retiredEvidence.length||missingV3.length||countMismatch){
  console.error('REACT STUDIO PARITY INVENTORY FAILED');
  if(countMismatch)console.error(`Count mismatch: ${legacyRows.length}/${expectedLegacy} baseline, ${currentRows.length}/${expectedCurrent} current`);
  if(duplicateIds.length)console.error('Duplicate IDs:',[...new Set(duplicateIds)].join(', '));
  if(invalidStatus.length)console.error('Invalid statuses:',invalidStatus.join(', '));
  if(notPorted.length)console.error('Not ported:',notPorted.join(', '));
  if(missingEvidence.length)console.error('Missing current evidence:',missingEvidence.join(', '));
  if(retiredEvidence.length)console.error('Retired evidence references:',retiredEvidence.join(', '));
  if(missingV3.length)console.error('Missing Workflow UX v3 IDs:',missingV3.join(', '));
  process.exit(1);
}

console.log(`React Studio parity inventory OK: ${legacyRows.length} migration-baseline + ${currentRows.length} workflow-v3 rows; ${rows.length}/${rows.length} ported or verified with current evidence.`);
