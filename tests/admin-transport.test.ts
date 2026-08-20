import assert from "node:assert/strict";
import test from "node:test";
import { AdminApiError, requestAdminJson } from "../lib/admin-transport.ts";

test("admin transport applies the mutation contract and returns typed JSON", async () => {
  let captured: RequestInit | undefined;
  const body = await requestAdminJson<{ orders: [] }>("/api/admin/content", {
    method: "POST",
    cache: "force-cache",
    headers: { "X-Vault2077-Admin-Request": "0" },
    body: JSON.stringify({ action: "test" }),
  }, async (_input, init) => {
    captured = init;
    return Response.json({ orders: [] });
  });

  assert.deepEqual(body, { orders: [] });
  assert.equal(captured?.cache, "no-store");
  const headers = new Headers(captured?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("x-vault2077-admin-request"), "1");
});

test("admin transport preserves reauthentication details in a typed error", async () => {
  await assert.rejects(
    requestAdminJson("/api/admin/frontier", {}, async () => Response.json({
      error: "请重新验证。",
      code: "ADMIN_REAUTH_REQUIRED",
      reauthenticationUrl: "/admin#admin-reauth",
    }, { status: 403 })),
    (error) => error instanceof AdminApiError
      && error.status === 403
      && error.code === "ADMIN_REAUTH_REQUIRED"
      && error.reauthenticationUrl === "/admin#admin-reauth",
  );
});
