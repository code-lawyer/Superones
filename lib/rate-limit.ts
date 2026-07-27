import "server-only";

import { configuredPostgresPool, persistenceMode } from "./state-document-store.ts";

type Bucket = { count: number; resetAt: number };

export function createMemoryRateLimiter(options: {
  maximumBuckets?: number;
  now?: () => number;
} = {}) {
  const maximumBuckets = Math.max(100, Math.min(100_000, options.maximumBuckets ?? 10_000));
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  let overflow: Bucket | undefined;
  let operations = 0;

  function increment(bucket: Bucket | undefined, limit: number, windowMs: number, timestamp: number) {
    if (!bucket || bucket.resetAt <= timestamp) {
      return { allowed: true, bucket: { count: 1, resetAt: timestamp + windowMs } };
    }
    if (bucket.count >= limit) return { allowed: false, bucket };
    bucket.count += 1;
    return { allowed: true, bucket };
  }

  function prune(timestamp: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) buckets.delete(key);
    }
    if (overflow && overflow.resetAt <= timestamp) overflow = undefined;
  }

  function within(key: string, limit: number, windowMs: number) {
    const timestamp = now();
    operations += 1;
    if (operations % 128 === 0 || buckets.size >= maximumBuckets) prune(timestamp);

    const existing = buckets.get(key);
    if (existing) return increment(existing, limit, windowMs, timestamp).allowed;
    if (buckets.size >= maximumBuckets) {
      const result = increment(overflow, limit, windowMs, timestamp);
      overflow = result.bucket;
      return result.allowed;
    }
    const result = increment(undefined, limit, windowMs, timestamp);
    buckets.set(key, result.bucket);
    return result.allowed;
  }

  return {
    within,
    size: () => buckets.size + (overflow ? 1 : 0),
    prune: () => prune(now()),
  };
}

const memoryRateLimiter = createMemoryRateLimiter();

export function withinRateLimit(key: string, limit: number, windowMs: number) {
  return memoryRateLimiter.within(key, limit, windowMs);
}

export async function withinDurableRateLimit(key: string, limit: number, windowMs: number) {
  if (persistenceMode() !== "postgresql") return withinRateLimit(key, limit, windowMs);
  const result = await configuredPostgresPool().query<{ count: number }>(
    `INSERT INTO vault2077_rate_limits (key, count, window_started_at)
     VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE
         WHEN vault2077_rate_limits.window_started_at < now() - ($2::bigint * interval '1 millisecond') THEN 1
         ELSE vault2077_rate_limits.count + 1
       END,
       window_started_at = CASE
         WHEN vault2077_rate_limits.window_started_at < now() - ($2::bigint * interval '1 millisecond') THEN now()
         ELSE vault2077_rate_limits.window_started_at
       END,
       updated_at = now()
     RETURNING count`,
    [key, windowMs],
  );
  return Number(result.rows[0]?.count ?? limit + 1) <= limit;
}

export async function pruneDurableRateLimits(retentionMs = 7 * 24 * 60 * 60 * 1000) {
  if (persistenceMode() !== "postgresql") {
    memoryRateLimiter.prune();
    return 0;
  }
  const result = await configuredPostgresPool().query(
    `DELETE FROM vault2077_rate_limits
     WHERE updated_at < now() - ($1::bigint * interval '1 millisecond')`,
    [Math.max(60_000, retentionMs)],
  );
  return result.rowCount ?? 0;
}
