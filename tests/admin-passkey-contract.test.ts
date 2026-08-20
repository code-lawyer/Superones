import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { WebAuthnCredential } from "@simplewebauthn/server";
import { adminPasskeyRejectionReason, recordRejectedAdminPasskeyProof } from "../lib/admin-passkey-audit.ts";
import {
  ADMIN_PASSKEY_VERIFICATION_POLICY,
  assertAdminPasskeyUserVerified,
  beginAdminPasskeyAuthentication,
  beginAdminPasskeyRegistration,
  finishAdminPasskeyAuthentication,
  finishAdminPasskeyRegistration,
  type AdminPasskeyAuthenticationDependencies,
  type AdminPasskeyRegistrationDependencies,
} from "../lib/admin-passkey.ts";
import {
  completeAdminPasskeyRegistration,
  createAdminPasskeyCeremony,
} from "../lib/admin-passkey-store.ts";

test("admin Passkey ceremonies prefer browser verification and require authenticator user verification", () => {
  assert.deepEqual(ADMIN_PASSKEY_VERIFICATION_POLICY, {
    browser: "preferred",
    requireUserPresence: true,
    requireUserVerification: true,
  });
  assert.throws(
    () => assertAdminPasskeyUserVerified(
      false,
      "Passkey 登录必须完成设备 PIN 或生物识别验证。",
      "webauthn-user-verification-missing",
    ),
    (error) => error instanceof Error
      && (error as Error & { code?: string }).code === "webauthn-user-verification-missing",
  );
  assert.doesNotThrow(() => assertAdminPasskeyUserVerified(true, "unreachable"));
});

test("Passkey completion paths enforce user verification before persistence", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-passkey-policy-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabase = process.env.VAULT2077_DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  delete process.env.VAULT2077_DATABASE_URL;
  try {
    const registrationBegin = await beginAdminPasskeyRegistration({ actorHash: "a".repeat(24) });
    assert.equal(registrationBegin.options.authenticatorSelection?.userVerification, "preferred");

    const registration = await createAdminPasskeyCeremony({
      purpose: "registration",
      challenge: "register-policy",
      actorHash: "a".repeat(24),
    });
    let registrationOptions: Record<string, unknown> | undefined;
    let registrationPersisted = false;
    const registrationDependencies = {
      verify: (async (options: unknown) => {
        registrationOptions = options as Record<string, unknown>;
        return { verified: true, registrationInfo: { userVerified: false } } as never;
      }) as AdminPasskeyRegistrationDependencies["verify"],
      complete: (async () => {
        registrationPersisted = true;
        throw new Error("registration persistence must not run");
      }) as AdminPasskeyRegistrationDependencies["complete"],
    };
    await assert.rejects(
      finishAdminPasskeyRegistration({ ceremonyId: registration.id, response: {} as never }, registrationDependencies),
      /PIN|生物识别/,
    );
    assert.equal(registrationOptions?.requireUserPresence, true);
    assert.equal(registrationOptions?.requireUserVerification, true);
    assert.equal(registrationPersisted, false);

    const credential = {
      id: "cGFzc2tleS1wb2xpY3k",
      publicKey: new Uint8Array([1, 2, 3, 4]),
      counter: 0,
      transports: ["internal"],
    } as WebAuthnCredential;
    await completeAdminPasskeyRegistration({
      ceremonyId: registration.id,
      credential,
      deviceType: "multiDevice",
      backedUp: true,
    });
    const authenticationBegin = await beginAdminPasskeyAuthentication({ purpose: "login" });
    assert.equal(authenticationBegin.options.userVerification, "preferred");

    const authentication = await createAdminPasskeyCeremony({ purpose: "login", challenge: "login-policy" });
    let authenticationOptions: Record<string, unknown> | undefined;
    let authenticationPersisted = false;
    const authenticationDependencies = {
      verify: (async (options: unknown) => {
        authenticationOptions = options as Record<string, unknown>;
        return { verified: true, authenticationInfo: { userVerified: false } } as never;
      }) as AdminPasskeyAuthenticationDependencies["verify"],
      complete: (async () => {
        authenticationPersisted = true;
        throw new Error("authentication persistence must not run");
      }) as AdminPasskeyAuthenticationDependencies["complete"],
    };
    await assert.rejects(
      finishAdminPasskeyAuthentication({
        ceremonyId: authentication.id,
        purpose: "login",
        response: { id: credential.id } as never,
      }, authenticationDependencies),
      /PIN|生物识别/,
    );
    assert.equal(authenticationOptions?.requireUserVerification, true);
    assert.equal(authenticationPersisted, false);
  } finally {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabase === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabase;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("production admin exposes native Passkey routes and no retired OIDC routes", async () => {
  for (const route of [
    "register/options",
    "register/verify",
    "authenticate/options",
    "authenticate/verify",
    "recover",
    "credentials",
  ]) {
    await access(new URL(`../app/api/admin/passkey/${route}/route.ts`, import.meta.url));
  }
  for (const retired of ["start", "callback", "logout"]) {
    await assert.rejects(access(new URL(`../app/api/admin/oidc/${retired}/route.ts`, import.meta.url)));
  }
});

test("rejected Passkey proofs are written as sanitized security audit events", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-passkey-audit-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabase = process.env.VAULT2077_DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  delete process.env.VAULT2077_DATABASE_URL;
  try {
    await recordRejectedAdminPasskeyProof({
      actorHash: "a".repeat(24),
      action: "admin.login",
      targetType: "session",
      targetId: "passkey-login",
      reason: "passkey-proof-rejected",
    });
    const lines = (await readFile(path.join(dataDirectory, "security-audit.jsonl"), "utf8")).trim().split("\n");
    const event = JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown>;
    assert.equal(event.action, "admin.login");
    assert.equal(event.result, "rejected");
    assert.equal(event.reason, "passkey-proof-rejected");
    assert.deepEqual(event.diff, { mode: "passkey" });
  } finally {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabase === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabase;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("Passkey rejection diagnostics classify verification stages without leaking proof data", () => {
  const secretChallenge = "challenge-do-not-log";
  const secretOrigin = "https://unexpected.example";
  const secretCredential = "credential-do-not-log";

  assert.equal(
    adminPasskeyRejectionReason(new Error(`Unexpected authentication response challenge "${secretChallenge}"`)),
    "webauthn-challenge-mismatch",
  );
  assert.equal(
    adminPasskeyRejectionReason(new Error(`Unexpected authentication response origin "${secretOrigin}"`)),
    "webauthn-origin-mismatch",
  );
  assert.equal(
    adminPasskeyRejectionReason(Object.assign(new Error("Unexpected RP ID hash"), { name: "UnexpectedRPIDHash" })),
    "webauthn-rp-id-mismatch",
  );
  assert.equal(
    adminPasskeyRejectionReason(new Error(`Passkey ${secretCredential} does not exist`)),
    "webauthn-credential-not-found",
  );
  assert.equal(
    adminPasskeyRejectionReason(new Error("Response counter value 0 was lower than expected 4")),
    "webauthn-counter-replay",
  );
  assert.equal(
    adminPasskeyRejectionReason(new Error("User verification required, but user could not be verified")),
    "webauthn-user-verification-missing",
  );

  const classified = [
    adminPasskeyRejectionReason(new Error(`Unexpected authentication response challenge "${secretChallenge}"`)),
    adminPasskeyRejectionReason(new Error(`Unexpected authentication response origin "${secretOrigin}"`)),
    adminPasskeyRejectionReason(new Error(`Passkey ${secretCredential} does not exist`)),
  ].join(" ");
  assert.doesNotMatch(classified, new RegExp(`${secretChallenge}|${secretOrigin}|${secretCredential}`));
});
