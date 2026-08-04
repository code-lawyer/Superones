import assert from "node:assert/strict";
import test from "node:test";
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
