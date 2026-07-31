import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const route = await readFile(
  path.join(process.cwd(), "app", "api", "admin", "oidc", "logout", "route.ts"),
  "utf8",
);

test("OIDC provider logout GET is a read-only redirect", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /NextResponse\.redirect/);
  assert.doesNotMatch(route, /revokeAdminSession|clearAdminSessionCookie|recordAuditEvent/);
});
