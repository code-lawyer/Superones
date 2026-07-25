import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import {
  AdminRequestSecurityError,
  assertAdminHost,
  assertAdminMutationRequest,
} from "../lib/admin-request-security.ts";

function mutationRequest(overrides: Record<string, string> = {}) {
  return new NextRequest("https://admin.vault2077.test/api/admin/opc", {
    method: "POST",
    headers: {
      host: "admin.vault2077.test",
      "content-type": "application/json",
      origin: "https://admin.vault2077.test",
      "sec-fetch-site": "same-origin",
      "x-vault2077-admin-request": "1",
      ...overrides,
    },
    body: "{}",
  });
}

test("admin mutations require the isolated host and same-origin request contract", () => {
  const environment = process.env as Record<string, string | undefined>;
  const previousOrigin = environment.VAULT2077_ADMIN_ORIGIN;
  environment.VAULT2077_ADMIN_ORIGIN = "https://admin.vault2077.test";
  try {
    assert.doesNotThrow(() => assertAdminMutationRequest(mutationRequest()));
    assert.throws(
      () => assertAdminMutationRequest(mutationRequest({ "x-vault2077-admin-request": "0" })),
      (error: unknown) => error instanceof AdminRequestSecurityError
        && error.code === "ADMIN_REQUEST_HEADER_REQUIRED",
    );
    assert.throws(
      () => assertAdminMutationRequest(mutationRequest({ origin: "https://attacker.test" })),
      (error: unknown) => error instanceof AdminRequestSecurityError
        && error.code === "ADMIN_ORIGIN_REJECTED",
    );
    assert.throws(
      () => assertAdminMutationRequest(mutationRequest({ origin: "not a url" })),
      (error: unknown) => error instanceof AdminRequestSecurityError
        && error.code === "ADMIN_ORIGIN_REJECTED",
    );
    assert.throws(
      () => assertAdminMutationRequest(mutationRequest({ "sec-fetch-site": "cross-site" })),
      (error: unknown) => error instanceof AdminRequestSecurityError
        && error.code === "ADMIN_CROSS_SITE_REJECTED",
    );
    assert.throws(
      () => assertAdminHost(mutationRequest({ host: "vault2077.test" })),
      (error: unknown) => error instanceof AdminRequestSecurityError
        && error.code === "ADMIN_HOST_REJECTED",
    );
  } finally {
    if (previousOrigin === undefined) delete environment.VAULT2077_ADMIN_ORIGIN;
    else environment.VAULT2077_ADMIN_ORIGIN = previousOrigin;
  }
});

test("local admin host accepts loopback and rejects remote hosts", () => {
  const environment = process.env as Record<string, string | undefined>;
  const previousOrigin = environment.VAULT2077_ADMIN_ORIGIN;
  delete environment.VAULT2077_ADMIN_ORIGIN;
  try {
    assert.doesNotThrow(() => assertAdminHost(new NextRequest("http://localhost:3000/admin", {
      headers: { host: "localhost:3000" },
    })));
    assert.throws(
      () => assertAdminHost(new NextRequest("http://192.0.2.10:3000/admin", {
        headers: { host: "192.0.2.10:3000" },
      })),
      (error: unknown) => error instanceof AdminRequestSecurityError
        && error.code === "ADMIN_HOST_REJECTED",
    );
  } finally {
    if (previousOrigin === undefined) delete environment.VAULT2077_ADMIN_ORIGIN;
    else environment.VAULT2077_ADMIN_ORIGIN = previousOrigin;
  }
});
