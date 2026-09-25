import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commandShortcutText,
  normalizeCommandQuery,
  rankStudioCommands,
  studioCommandGroups,
} from '../packages/shared-core/src/commands/command-palette.mjs';

const commands=[
  {id:'settings',group:'Ansicht',label:'Einstellungen öffnen',keywords:['settings','preferences']},
  {id:'search',group:'Navigation',label:'Reimsuche öffnen',keywords:['search','writer']},
  {id:'perform',group:'Modus',label:'Perform-Modus',keywords:['flow','timing']},
];

test('command palette normalizes multilingual command queries',()=>{
  assert.equal(normalizeCommandQuery('  Reim-Suche!  '),'reim suche');
  assert.equal(normalizeCommandQuery('SETTINGS'),'settings');
});

test('command palette ranks exact/prefix labels before keyword-only matches',()=>{
  assert.deepEqual(rankStudioCommands(commands,'reim').map((row)=>row.id),['search']);
  assert.deepEqual(rankStudioCommands(commands,'settings').map((row)=>row.id),['settings']);
  assert.deepEqual(rankStudioCommands(commands,'flow').map((row)=>row.id),['perform']);
});

test('command palette groups ranked commands without losing order',()=>{
  const groups=studioCommandGroups(commands);
  assert.deepEqual(groups.map((group)=>group.name),['Ansicht','Navigation','Modus']);
  assert.equal(groups[0].commands[0].id,'settings');
});

test('command shortcut labels are human readable',()=>{
  assert.equal(commandShortcutText('Alt+R'),'Alt + R');
  assert.equal(commandShortcutText('CtrlOrMeta+K'),'Ctrl / ⌘ + K');
});
