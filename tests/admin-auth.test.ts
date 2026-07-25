import assert from "node:assert/strict";
import { argon2Sync } from "node:crypto";
import test from "node:test";
import {
  ADMIN_IDLE_SECONDS,
  createAdminSession,
  isValidAdminPassword,
  readAdminSession,
  refreshAdminSession,
} from "../lib/admin-auth.ts";

test("admin session enforces idle and absolute expiry", () => {
  const issuedAt = 1_800_000_000_000;
  const token = createAdminSession(issuedAt);
  const session = readAdminSession(token, issuedAt + 1_000);
  assert.ok(session);
  assert.equal(readAdminSession(token, issuedAt + ADMIN_IDLE_SECONDS * 1_000), null);

  const refreshed = refreshAdminSession(session, issuedAt + 30 * 60 * 1_000);
  assert.ok(readAdminSession(refreshed, issuedAt + 75 * 60 * 1_000));
  assert.equal(readAdminSession(refreshed, issuedAt + 91 * 60 * 1_000), null);
});

test("admin password verifies the configured Argon2id hash", async () => {
  const previous = process.env.VAULT2077_ADMIN_PASSWORD_HASH;
  const password = "a-production-strength-password";
  const nonce = Buffer.from("0123456789abcdef");
  const expected = argon2Sync("argon2id", {
    message: Buffer.from(password),
    nonce,
    parallelism: 1,
    tagLength: 32,
    memory: 19_456,
    passes: 2,
  });
  process.env.VAULT2077_ADMIN_PASSWORD_HASH = `argon2id$v=1$m=19456,t=2,p=1$${nonce.toString("base64url")}$${expected.toString("base64url")}`;
  try {
    assert.equal(await isValidAdminPassword(password), true);
    assert.equal(await isValidAdminPassword("wrong-password"), false);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_ADMIN_PASSWORD_HASH;
    else process.env.VAULT2077_ADMIN_PASSWORD_HASH = previous;
  }
});
