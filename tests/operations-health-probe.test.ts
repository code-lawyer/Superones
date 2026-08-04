import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendOperationsHealthHeartbeat } from "../lib/operations-health-heartbeat.ts";
import { probeOperationsHealth } from "../lib/operations-health-probe.ts";

test("operations probe accepts a completely healthy protected response", async () => {
  const body = await probeOperationsHealth({
    secret: "health-secret-value-long-enough",
    fetcher: async () => new Response(JSON.stringify({
      status: "ok",
      checkedAt: "2026-08-04T04:30:00.000Z",
      checks: {
        acquisitionInbox: { status: "ok", detail: "queue clear" },
        informationFlow: { status: "ok", detail: "on schedule" },
      },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });

  assert.equal(body.status, "ok");
});

test("operations probe fails a systemd run when business health is degraded", async () => {
  await assert.rejects(
    probeOperationsHealth({
      secret: "health-secret-value-long-enough",
      fetcher: async (input, init) => {
        assert.equal(String(input), "http://127.0.0.1:3000/api/internal/health");
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer health-secret-value-long-enough");
        return new Response(JSON.stringify({
          status: "degraded",
          checkedAt: "2026-08-04T04:30:00.000Z",
          checks: { informationFlow: { status: "degraded", detail: "missed deadline" } },
        }), { status: 503, headers: { "content-type": "application/json" } });
      },
    }),
    /informationFlow/,
  );
});

test("successful probes append a minimal heartbeat without health details", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-health-heartbeat-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, "health-heartbeat.log");
  await appendOperationsHealthHeartbeat(target, {
    checkedAt: "2026-08-04T04:30:00.000Z",
    observedAt: "2026-08-04T04:30:01.000Z",
  });

  assert.equal(
    await readFile(target, "utf8"),
    '{"source":"vault2077-health","status":"ok","checkedAt":"2026-08-04T04:30:00.000Z","observedAt":"2026-08-04T04:30:01.000Z"}\n',
  );
});
