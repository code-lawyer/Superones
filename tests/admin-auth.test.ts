import assert from "node:assert/strict";
import { argon2Sync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ADMIN_ABSOLUTE_SECONDS,
  ADMIN_IDLE_SECONDS,
  adminCookieName,
  isValidLocalAdminPassword,
} from "../lib/admin-auth.ts";
import { localAdminIdentity } from "../lib/admin-identity.ts";
import {
  createAdminSession,
  hasRecentAdminReauthentication,
  markAdminSessionReauthenticated,
  readAdminSession,
  revokeAdminSession,
} from "../lib/admin-session-store.ts";
import { anonymizeClientAddress } from "../lib/request-client.ts";

test("admin sessions are opaque, sliding, revocable, and absolutely bounded", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-admin-session-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabase = process.env.VAULT2077_DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  delete process.env.VAULT2077_DATABASE_URL;
  try {
    const issuedAt = new Date("2027-01-15T08:00:00.000Z");
    const created = await createAdminSession(localAdminIdentity(issuedAt), issuedAt);
    assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(created.token.includes(created.session.id), false);

    const active = await readAdminSession(
      created.token,
      new Date(issuedAt.getTime() + 1_000),
    );
    assert.ok(active);
    assert.equal(active.actorHash, created.session.actorHash);

    assert.equal(
      await readAdminSession(
        created.token,
        new Date(issuedAt.getTime() + (ADMIN_IDLE_SECONDS + 2) * 1_000),
      ),
      null,
    );

    const absolute = await createAdminSession(localAdminIdentity(issuedAt), issuedAt);
    assert.equal(
      await readAdminSession(
        absolute.token,
        new Date(issuedAt.getTime() + ADMIN_ABSOLUTE_SECONDS * 1_000),
      ),
      null,
    );

    const revoked = await createAdminSession(localAdminIdentity(issuedAt), issuedAt);
    assert.equal(await revokeAdminSession(revoked.token, new Date(issuedAt.getTime() + 2_000)), true);
    assert.equal(await readAdminSession(revoked.token, new Date(issuedAt.getTime() + 3_000)), null);
  } finally {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabase === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabase;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("recent reauthentication is recorded in the revocable session", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-admin-reauth-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  try {
    const issuedAt = new Date("2027-01-15T08:00:00.000Z");
    const created = await createAdminSession(localAdminIdentity(issuedAt), issuedAt);
    const later = new Date(issuedAt.getTime() + 10 * 60 * 1_000);
    const updated = await markAdminSessionReauthenticated(created.token, later.toISOString());
    assert.ok(updated);
    assert.equal(hasRecentAdminReauthentication(updated, new Date(later.getTime() + 299_000)), true);
    assert.equal(hasRecentAdminReauthentication(updated, new Date(later.getTime() + 300_000)), false);
  } finally {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("local admin password verifies Argon2id and is disabled in production", async () => {
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const previousHash = process.env.VAULT2077_ADMIN_PASSWORD_HASH;
  const previousNodeEnv = process.env.NODE_ENV;
  const password = "a-development-strength-password";
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
    mutableEnvironment.NODE_ENV = "development";
    assert.equal(await isValidLocalAdminPassword(password), true);
    assert.equal(await isValidLocalAdminPassword("wrong-password"), false);
    assert.equal(adminCookieName(), "vault2077_admin");
    mutableEnvironment.NODE_ENV = "production";
    assert.equal(await isValidLocalAdminPassword(password), false);
    assert.equal(adminCookieName(), "__Host-vault2077_admin");
  } finally {
    if (previousHash === undefined) delete process.env.VAULT2077_ADMIN_PASSWORD_HASH;
    else process.env.VAULT2077_ADMIN_PASSWORD_HASH = previousHash;
    if (previousNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
    else mutableEnvironment.NODE_ENV = previousNodeEnv;
  }
});

test("local audit hashing has a valid non-identifying fallback", () => {
  const previousAudit = process.env.VAULT2077_AUDIT_HASH_SECRET;
  const previousSession = process.env.VAULT2077_ADMIN_SESSION_SECRET;
  delete process.env.VAULT2077_AUDIT_HASH_SECRET;
  delete process.env.VAULT2077_ADMIN_SESSION_SECRET;
  try {
    const value = anonymizeClientAddress("127.0.0.1");
    assert.match(value, /^[a-f0-9]{24}$/);
    assert.notEqual(value, "127.0.0.1");
  } finally {
    if (previousAudit === undefined) delete process.env.VAULT2077_AUDIT_HASH_SECRET;
    else process.env.VAULT2077_AUDIT_HASH_SECRET = previousAudit;
    if (previousSession === undefined) delete process.env.VAULT2077_ADMIN_SESSION_SECRET;
    else process.env.VAULT2077_ADMIN_SESSION_SECRET = previousSession;
  }
});
