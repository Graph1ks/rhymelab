import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuegExb, inferRuegRegisterFromId } from '../scripts/rueg-register-core.mjs';

const EXB=`<?xml version="1.0" encoding="UTF-8"?>
<basic-transcription><basic-body><common-timeline>
<tli id="T0"/><tli id="T1"/><tli id="T2"/><tli id="T3"/><tli id="T4"/>
</common-timeline>
<tier id="dipl" category="dipl" display-name="dipl"><event start="T0" end="T1">ich</event><event start="T1" end="T2">hab</event><event start="T2" end="T3">nix</event><event start="T3" end="T4">gesehen</event></tier>
<tier id="norm" category="norm" display-name="norm"><event start="T0" end="T1">ich</event><event start="T1" end="T2">habe</event><event start="T2" end="T3">nichts</event><event start="T3" end="T4">gesehen</event></tier>
<tier id="language" category="language" display-name="language"><event start="T0" end="T1">deu</event><event start="T1" end="T2">deu</event><event start="T2" end="T3">eng/deu</event><event start="T3" end="T4">deu</event></tier>
<tier id="cu" category="cu" display-name="CU"><event start="T0" end="T4">decl</event></tier>
</basic-body></basic-transcription>`;

test('RUEG EXB parser preserves dipl and norm side by side',()=>{
 const units=parseRuegExb(EXB,{sourceRecordId:'DEbi02FG_isD'});
 assert.equal(units.length,1);
 assert.equal(units[0].diplText,'ich hab nix gesehen');
 assert.equal(units[0].normText,'ich habe nichts gesehen');
 assert.equal(units[0].formality,'informal');
 assert.equal(units[0].mode,'spoken');
 assert.deepEqual(units[0].languageValues,['deu','eng','deu']);
 assert.equal(units[0].germanTokenRatio,1);
 assert.equal(units[0].cuFallback,false);
});

test('RUEG filename register codes are deterministic',()=>{
 assert.deepEqual(inferRuegRegisterFromId('DEbi02FG_fsD'),{formality:'formal',mode:'spoken',registerCode:'fs'});
 assert.deepEqual(inferRuegRegisterFromId('DEbi02FG_fwD'),{formality:'formal',mode:'written',registerCode:'fw'});
 assert.deepEqual(inferRuegRegisterFromId('DEbi02FG_isD'),{formality:'informal',mode:'spoken',registerCode:'is'});
 assert.deepEqual(inferRuegRegisterFromId('DEbi02FG_iwD'),{formality:'informal',mode:'written',registerCode:'iw'});
});
