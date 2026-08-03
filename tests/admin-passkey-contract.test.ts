import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { adminPasskeyRejectionReason, recordRejectedAdminPasskeyProof } from "../lib/admin-passkey-audit.ts";

test("production admin exposes native Passkey flows and no retired OIDC routes", async () => {
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
  const identity = await readFile(new URL("../lib/admin-identity.ts", import.meta.url), "utf8");
  const frontierAdmin = await readFile(new URL("../app/api/admin/frontier/route.ts", import.meta.url), "utf8");
  const authenticationVerify = await readFile(new URL("../app/api/admin/passkey/authenticate/verify/route.ts", import.meta.url), "utf8");
  const registrationVerify = await readFile(new URL("../app/api/admin/passkey/register/verify/route.ts", import.meta.url), "utf8");
  const registrationOptions = await readFile(new URL("../app/api/admin/passkey/register/options/route.ts", import.meta.url), "utf8");
  const authenticationOptions = await readFile(new URL("../app/api/admin/passkey/authenticate/options/route.ts", import.meta.url), "utf8");
  const credentials = await readFile(new URL("../app/api/admin/passkey/credentials/route.ts", import.meta.url), "utf8");
  const recovery = await readFile(new URL("../app/api/admin/passkey/recover/route.ts", import.meta.url), "utf8");
  const browserReauthentication = await readFile(new URL("../lib/admin-passkey-browser.ts", import.meta.url), "utf8");
  const opcEditor = await readFile(new URL("../components/admin-opc-catalog-editor.tsx", import.meta.url), "utf8");
  const enrollmentScript = await readFile(new URL("../scripts/create-admin-passkey-enrollment.ts", import.meta.url), "utf8");
  const passkeyService = await readFile(new URL("../lib/admin-passkey.ts", import.meta.url), "utf8");
  assert.match(identity, /"passkey" \| "local-password"/);
  assert.doesNotMatch(identity, /OIDC|oidc|jose/);
  assert.doesNotMatch(frontierAdmin, /refresh-stars|updateSubmissionStars|inspectGitHubRepository/);
  assert.match(authenticationVerify, /recordRejectedAdminPasskeyProof/);
  assert.match(registrationVerify, /recordRejectedAdminPasskeyProof/);
  assert.match(registrationVerify, /authorizeCompletion/);
  assert.match(registrationVerify, /hasRecentAdminReauthentication\(currentAccess\.session\)/);
  for (const source of [registrationOptions, authenticationOptions, credentials, recovery]) {
    assert.match(source, /recordRejectedAdminPasskeyEvent/);
  }
  assert.match(enrollmentScript, /recordAuditEvent/);
  assert.match(browserReauthentication, /purpose: "reauthentication"/);
  assert.match(browserReauthentication, /startAuthentication/);
  assert.match(opcEditor, /reauthenticateAdminWithPasskey/);
  assert.doesNotMatch(opcEditor, /\boidc\b|IDaaS/);
  assert.match(passkeyService, /const PASSKEY_BROWSER_USER_VERIFICATION = "required"/);
  assert.equal([...passkeyService.matchAll(/userVerification: PASSKEY_BROWSER_USER_VERIFICATION/g)].length, 2);
  assert.equal([...passkeyService.matchAll(/requireUserVerification: true/g)].length, 2);
  assert.match(passkeyService, /registrationInfo\.userVerified/);
  assert.match(passkeyService, /authenticationInfo\.userVerified/);
  assert.doesNotMatch(passkeyService, /requireUserVerification: false/);
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
