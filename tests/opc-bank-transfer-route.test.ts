import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { adminCookieName } from "../lib/admin-auth.ts";
import { localAdminIdentity } from "../lib/admin-identity.ts";
import { createAdminSession } from "../lib/admin-session-store.ts";
import { listAuditEventsForTarget } from "../lib/security-audit.ts";

test("bank-transfer verification route rejects a valid owner session without recent reauthentication", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-bank-route-reauth-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabase = process.env.VAULT2077_DATABASE_URL;
  const previousOrigin = process.env.VAULT2077_ADMIN_ORIGIN;
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  delete process.env.VAULT2077_DATABASE_URL;
  process.env.VAULT2077_ADMIN_ORIGIN = "https://admin.vault2077.test";
  try {
    const authenticatedAt = new Date(Date.now() - 10 * 60_000);
    const session = await createAdminSession(localAdminIdentity(authenticatedAt), authenticatedAt);
    const orderId = "bank-order-requires-reauth";
    const request = new NextRequest(`https://admin.vault2077.test/api/admin/opc/orders/${orderId}/verify-bank-transfer`, {
      method: "POST",
      headers: {
        host: "admin.vault2077.test",
        "content-type": "application/json",
        cookie: `${adminCookieName()}=${session.token}`,
        origin: "https://admin.vault2077.test",
        "sec-fetch-site": "same-origin",
        "x-vault2077-admin-request": "1",
      },
      body: JSON.stringify({
        expectedUpdatedAt: new Date().toISOString(),
        amountDecimal: "1.00",
        bankTransactionId: "BANK-ROUTE-TEST-0001",
        payerName: "测试付款人",
        paidAt: new Date().toISOString(),
      }),
    });
    const route = await import(`../app/api/admin/opc/orders/[id]/verify-bank-transfer/route.ts?reauth=${Date.now()}`);
    const response = await route.POST(request, { params: Promise.resolve({ id: orderId }) });
    const body = await response.json() as { code?: string };
    assert.equal(response.status, 403);
    assert.equal(body.code, "ADMIN_REAUTH_REQUIRED");
    const events = await listAuditEventsForTarget("opc-order", orderId);
    assert.equal(events[0]?.result, "rejected");
    assert.equal(events[0]?.reason, "recent-reauthentication-required");
  } finally {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabase === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabase;
    if (previousOrigin === undefined) delete process.env.VAULT2077_ADMIN_ORIGIN;
    else process.env.VAULT2077_ADMIN_ORIGIN = previousOrigin;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("bank-transfer verification route requires explicit server-side evidence confirmation", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-bank-route-evidence-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabase = process.env.VAULT2077_DATABASE_URL;
  const previousOrigin = process.env.VAULT2077_ADMIN_ORIGIN;
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  delete process.env.VAULT2077_DATABASE_URL;
  process.env.VAULT2077_ADMIN_ORIGIN = "https://admin.vault2077.test";
  try {
    const authenticatedAt = new Date();
    const session = await createAdminSession(localAdminIdentity(authenticatedAt), authenticatedAt);
    const orderId = "bank-order-evidence-not-confirmed";
    const request = new NextRequest(`https://admin.vault2077.test/api/admin/opc/orders/${orderId}/verify-bank-transfer`, {
      method: "POST",
      headers: {
        host: "admin.vault2077.test",
        "content-type": "application/json",
        cookie: `${adminCookieName()}=${session.token}`,
        origin: "https://admin.vault2077.test",
        "sec-fetch-site": "same-origin",
        "x-vault2077-admin-request": "1",
      },
      body: JSON.stringify({
        expectedUpdatedAt: new Date().toISOString(),
        amountDecimal: "1.00",
        bankTransactionId: "BANK-ROUTE-TEST-0002",
        payerName: "测试付款人",
        paidAt: new Date().toISOString(),
        evidenceConfirmed: false,
      }),
    });
    const route = await import(`../app/api/admin/opc/orders/[id]/verify-bank-transfer/route.ts?evidence=${Date.now()}`);
    const response = await route.POST(request, { params: Promise.resolve({ id: orderId }) });
    const body = await response.json() as { error?: string };
    assert.equal(response.status, 400);
    assert.match(body.error ?? "", /逐项核对/);
    const events = await listAuditEventsForTarget("opc-order", orderId);
    assert.equal(events[0]?.result, "rejected");
    assert.equal(events[0]?.reason, "bank-evidence-confirmation-required");
  } finally {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabase === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabase;
    if (previousOrigin === undefined) delete process.env.VAULT2077_ADMIN_ORIGIN;
    else process.env.VAULT2077_ADMIN_ORIGIN = previousOrigin;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
