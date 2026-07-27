import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryRateLimiter } from "../lib/rate-limit.ts";

test("memory rate limiter expires old keys and never grows past its bound plus overflow", () => {
  let now = 1_000;
  const limiter = createMemoryRateLimiter({ maximumBuckets: 100, now: () => now });
  for (let index = 0; index < 1_000; index += 1) {
    limiter.within(`client:${index}`, 2, 60_000);
  }
  assert.ok(limiter.size() <= 101);
  now += 60_001;
  limiter.prune();
  assert.equal(limiter.size(), 0);
});

test("overflow traffic shares a conservative bucket after the key bound is reached", () => {
  const limiter = createMemoryRateLimiter({ maximumBuckets: 100, now: () => 1_000 });
  for (let index = 0; index < 100; index += 1) {
    assert.equal(limiter.within(`known:${index}`, 1, 60_000), true);
  }
  assert.equal(limiter.within("overflow:first", 2, 60_000), true);
  assert.equal(limiter.within("overflow:second", 2, 60_000), true);
  assert.equal(limiter.within("overflow:third", 2, 60_000), false);
});
