import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("high-risk admin writes couple the mutation and audit in one persistence transaction", async () => {
  for (const route of ["opc/route.ts", "frontier/route.ts", "content/route.ts"]) {
    const source = await readFile(new URL(`../app/api/admin/${route}`, import.meta.url), "utf8");
    assert.match(source, /withPersistenceTransaction\(async \(\) => \{[\s\S]*?recordAuditEvent\(/, route);
  }
});

test("bank cancellation shares its transaction with the audit event", async () => {
  const source = await readFile(new URL("../app/api/admin/opc/orders/[id]/cancel/route.ts", import.meta.url), "utf8");
  assert.match(source, /authenticateAdminRequest\(request, \{ mutation: true \}\)/);
  assert.match(source, /expectedUpdatedAt/);
  assert.match(source, /withPersistenceTransaction\(async \(\) => \{[\s\S]*?recordAuditEvent\(/);
});
