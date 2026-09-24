import test from 'node:test';
import assert from 'node:assert/strict';

import {createTokenBucketRateLimiter} from '../src/request-rate-limit.mjs';

test('Writer request limiter allows a burst then returns a retry delay',()=>{
  let now=1_000;
  const limiter=createTokenBucketRateLimiter({
    capacity:3,
    refillPerSecond:2,
    now:()=>now,
  });

  assert.equal(limiter.consume('client').allowed,true);
  assert.equal(limiter.consume('client').allowed,true);
  assert.equal(limiter.consume('client').allowed,true);

  const blocked=limiter.consume('client');
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.remaining,0);
  assert.equal(blocked.retryAfterMs,500);

  now+=500;
  const recovered=limiter.consume('client');
  assert.equal(recovered.allowed,true);
  assert.equal(recovered.remaining,0);
});

test('Writer request limiter keeps independent client buckets',()=>{
  const limiter=createTokenBucketRateLimiter({
    capacity:1,
    refillPerSecond:1,
    now:()=>10_000,
  });

  assert.equal(limiter.consume('a').allowed,true);
  assert.equal(limiter.consume('a').allowed,false);
  assert.equal(limiter.consume('b').allowed,true);
});
