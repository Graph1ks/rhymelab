function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function createTokenBucketRateLimiter({
  capacity = 16,
  refillPerSecond = 8,
  maxEntries = 4096,
  idleTtlMs = 120_000,
  now = () => Date.now(),
} = {}) {
  const bucketCapacity = finitePositive(capacity, 16);
  const refillRate = finitePositive(refillPerSecond, 8);
  const entryLimit = Math.max(64, Math.trunc(finitePositive(maxEntries, 4096)));
  const ttl = Math.max(10_000, finitePositive(idleTtlMs, 120_000));
  const buckets = new Map();

  function prune(currentTime) {
    if (buckets.size < entryLimit) return;
    for (const [key, bucket] of buckets) {
      if (currentTime - bucket.touchedAt > ttl) buckets.delete(key);
      if (buckets.size < entryLimit) return;
    }
    while (buckets.size >= entryLimit) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  function consume(key, cost = 1) {
    const currentTime = Number(now());
    const normalizedKey = String(key || 'anonymous');
    const normalizedCost = Math.max(0.01, finitePositive(cost, 1));
    prune(currentTime);

    const previous = buckets.get(normalizedKey);
    const elapsedMs = previous
      ? Math.max(0, currentTime - previous.updatedAt)
      : 0;
    const replenished = previous
      ? Math.min(
          bucketCapacity,
          previous.tokens + (elapsedMs / 1000) * refillRate,
        )
      : bucketCapacity;

    const allowed = replenished >= normalizedCost;
    const remaining = allowed ? replenished - normalizedCost : replenished;
    const deficit = allowed ? 0 : normalizedCost - replenished;
    const retryAfterMs = allowed ? 0 : Math.ceil((deficit / refillRate) * 1000);

    buckets.delete(normalizedKey);
    buckets.set(normalizedKey, {
      tokens: remaining,
      updatedAt: currentTime,
      touchedAt: currentTime,
    });

    return {
      allowed,
      capacity: bucketCapacity,
      remaining,
      refillPerSecond: refillRate,
      retryAfterMs,
    };
  }

  return {
    consume,
    clear() {
      buckets.clear();
    },
    inspect(key) {
      const bucket = buckets.get(String(key || 'anonymous'));
      return bucket ? { ...bucket } : null;
    },
  };
}
