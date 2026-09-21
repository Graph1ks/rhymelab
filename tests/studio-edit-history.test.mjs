import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTypingUndoCoalescer,
  typingInputIsCoalescible,
} from '../src/studio/edit-history.mjs';

test('typing coalescer creates one undo checkpoint for a same-Bar typing burst',()=>{
  const coalescer=createTypingUndoCoalescer({windowMs:1000});
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-a',inputType:'insertText',now:1000,
  }),true);
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-a',inputType:'insertText',now:1250,
  }),false);
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-a',inputType:'deleteContentBackward',now:1600,
  }),false);
});

test('typing coalescer starts a new checkpoint after timeout, Bar change, or explicit boundary',()=>{
  const coalescer=createTypingUndoCoalescer({windowMs:500});
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-a',inputType:'insertText',now:1000,
  }),true);
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-a',inputType:'insertText',now:1700,
  }),true);
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-b',inputType:'insertText',now:1800,
  }),true);
  coalescer.noteBoundary();
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-b',inputType:'insertText',now:1900,
  }),true);
});

test('non-typing input types do not leak into later typing transactions',()=>{
  const coalescer=createTypingUndoCoalescer({windowMs:1000});
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-a',inputType:'insertText',now:1000,
  }),true);
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-a',inputType:'insertFromPaste',now:1100,
  }),true);
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-a',inputType:'insertText',now:1200,
  }),true);
  assert.equal(coalescer.shouldCheckpoint({
    songId:'song',barId:'bar-a',inputType:'insertText',now:1300,composing:true,
  }),true);
});

test('typing input classification covers text and deletion edits only',()=>{
  for(const type of [
    'insertText','insertReplacementText','deleteContentBackward',
    'deleteContentForward','deleteWordBackward','deleteWordForward',
  ])assert.equal(typingInputIsCoalescible(type),true,type);
  for(const type of ['insertFromPaste','insertLineBreak','historyUndo','']) {
    assert.equal(typingInputIsCoalescible(type),false,type);
  }
});
