import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { adminCookieName } from "../lib/admin-auth.ts";
import { localAdminIdentity } from "../lib/admin-identity.ts";
import { discoverAdminLoginState } from "../lib/admin-login-discovery.ts";
import { createAdminSession } from "../lib/admin-session-store.ts";

test("admin login discovery reports anonymous and authenticated session state", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-admin-login-discovery-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabase = process.env.VAULT2077_DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  delete process.env.VAULT2077_DATABASE_URL;
  try {
    const anonymousDiscovery = await discoverAdminLoginState(new NextRequest("http://localhost/api/admin/login", {
      headers: { host: "localhost" },
    }));
    assert.equal(anonymousDiscovery.body.authenticated, false);
    assert.equal(anonymousDiscovery.access, null);

    const created = await createAdminSession(localAdminIdentity());
    const authenticatedDiscovery = await discoverAdminLoginState(new NextRequest("http://localhost/api/admin/login", {
      headers: {
        host: "localhost",
        cookie: `${adminCookieName()}=${created.token}`,
      },
    }));
    assert.equal(authenticatedDiscovery.body.authenticated, true);
    assert.ok(authenticatedDiscovery.access);
  } finally {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabase === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabase;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
