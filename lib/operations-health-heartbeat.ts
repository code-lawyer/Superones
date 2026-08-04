import { appendFile } from "node:fs/promises";

export async function appendOperationsHealthHeartbeat(target: string, input: {
  checkedAt: string;
  observedAt?: string;
}) {
  const record = {
    source: "vault2077-health",
    status: "ok",
    checkedAt: input.checkedAt,
    observedAt: input.observedAt ?? new Date().toISOString(),
  } as const;
  await appendFile(target, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
}
