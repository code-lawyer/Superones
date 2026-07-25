import "server-only";

import { configuredPostgresPool, persistenceMode } from "./state-document-store.ts";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function withinRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
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
