import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await Promise.all([
  "opc/route.ts",
  "frontier/route.ts",
  "content/route.ts",
].map(async (route) => ({
  route,
  source: await readFile(new URL(`../app/api/admin/${route}`, import.meta.url), "utf8"),
})));

test("successful high-risk admin writes couple the mutation and audit in one persistence transaction", () => {
  for (const { route, source } of routes) {
    assert.match(source, /import \{ withPersistenceTransaction \}/, route);
    assert.match(
      source,
      /withPersistenceTransaction\(async \(\) => \{[\s\S]*?(?:publishServiceCatalog|saveFrontierSeasonRewardDraft|recordOpcAlipayQuery|updateOpcOrderStatus)[\s\S]*?recordAuditEvent\(/,
      route,
    );
  }
});

test("content reconciliation audits authentication, validation, and missing-order rejections", () => {
  const source = routes.find(({ route }) => route === "content/route.ts")!.source;
  for (const reason of [
    "recent-reauthentication-required",
    "invalid-or-unconfirmed-request",
    "order-not-found",
  ]) assert.match(source, new RegExp(`reason: "${reason}"`));
});

test("paper contract approval, cancellation, and refund writes share a transaction with their audits", async () => {
  for (const action of ["approve-contract", "cancel", "refund"]) {
    const source = await readFile(new URL(`../app/api/admin/opc/orders/[id]/${action}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /authenticateAdminRequest\(request, \{ mutation: true \}\)/);
    assert.match(source, /expectedUpdatedAt/);
    assert.match(source, /withPersistenceTransaction\(async \(\) => \{[\s\S]*?recordAuditEvent\(/);
  }
});
