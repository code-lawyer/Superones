type OperationsHealthBody = {
  status?: unknown;
  checkedAt?: unknown;
  checks?: Record<string, { status?: unknown; detail?: unknown }>;
};

export async function probeOperationsHealth(input: {
  secret: string;
  origin?: string;
  fetcher?: typeof fetch;
}) {
  if (input.secret.trim().length < 16) throw new Error("health probe 缺少有效鉴权密钥。");
  const origin = input.origin ?? "http://127.0.0.1:3000";
  const response = await (input.fetcher ?? fetch)(`${origin}/api/internal/health`, {
    headers: { Authorization: `Bearer ${input.secret}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null) as OperationsHealthBody | null;
  if (!body || typeof body !== "object") throw new Error(`health probe 返回无效正文（HTTP ${response.status}）。`);
  const degradedChecks = Object.entries(body.checks ?? {})
    .filter(([, check]) => check?.status !== "ok")
    .map(([name]) => name)
    .sort();
  if (!response.ok || body.status !== "ok" || degradedChecks.length > 0) {
    throw new Error(`业务健康降级（HTTP ${response.status}）：${degradedChecks.join(", ") || "unknown"}。`);
  }
  return body;
}
