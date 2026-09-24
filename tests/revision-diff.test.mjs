import test from 'node:test';
import assert from 'node:assert/strict';
import {compareEditorRevisions,revisionDiffLabel} from '../src/studio/revision-diff.mjs';

test('revision diff keeps unchanged lines so the whole lyric can be reviewed',()=>{
  const current={
    lines:['[Verse]','Neue erste Bar','Gleiche Bar','Neue Schlussbar'],
    barIds:['section','a','b','d'],
    barRevisions:[0,2,0,0],
  };
  const previous={
    snapshot:{
      lines:['[Verse]','Alte erste Bar','Gleiche Bar','Alte entfernte Bar'],
      barIds:['section','a','b','c'],
      barRevisions:[0,1,0,0],
    },
  };
  const diff=compareEditorRevisions(current,previous);
  assert.equal(diff.rows.length,5);
  assert.equal(diff.summary.unchanged,2);
  assert.equal(diff.summary.changed,1);
  assert.equal(diff.summary.added,1);
  assert.equal(diff.summary.removed,1);
  assert.deepEqual(
    diff.rows.map((row)=>row.type),
    ['same','changed','same','removed','added'],
  );
  assert.equal(diff.rows[1].current.text,'Neue erste Bar');
  assert.equal(diff.rows[1].previous.text,'Alte erste Bar');
});

test('revision diff reports moved stable bars without losing their text',()=>{
  const current={
    lines:['B','A','C'],
    barIds:['b','a','c'],
    barRevisions:[0,0,0],
  };
  const previous={
    snapshot:{
      lines:['A','B','C'],
      barIds:['a','b','c'],
      barRevisions:[0,0,0],
    },
  };
  const diff=compareEditorRevisions(current,previous);
  const moved=diff.rows.filter((row)=>row.moved);
  assert.ok(moved.length>=1);
  assert.ok(moved.every((row)=>row.current?.text&&row.previous?.text));
  assert.ok(diff.rows.some((row)=>row.type==='same'&&row.id==='c'));
  assert.equal(revisionDiffLabel(moved[0]),moved[0].textChanged?'Changed + moved':'Moved');
});
