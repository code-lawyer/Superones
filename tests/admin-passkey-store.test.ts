import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { WebAuthnCredential } from "@simplewebauthn/server";
import {
  adminPasskeyStatus,
  completeAdminPasskeyAuthentication,
  completeAdminPasskeyRegistration,
  createAdminPasskeyCeremony,
  exchangeAdminRecoveryCode,
  issueAdminPasskeyEnrollmentToken,
  revokeAdminPasskey,
} from "../lib/admin-passkey-store.ts";

test("Passkey bootstrap, recovery, replay protection, and last-credential guard are durable", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-passkey-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabase = process.env.VAULT2077_DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  delete process.env.VAULT2077_DATABASE_URL;
  try {
    const now = new Date("2027-01-15T08:00:00.000Z");
    const enrollment = await issueAdminPasskeyEnrollmentToken({ now });
    await assert.rejects(createAdminPasskeyCeremony({ purpose: "registration", challenge: "bad", enrollmentToken: "invalid", now }));
    const registration = await createAdminPasskeyCeremony({ purpose: "registration", challenge: "register", enrollmentToken: enrollment.token, now });
    const credential = {
      id: "cGFzc2tleS0x",
      publicKey: new Uint8Array([1, 2, 3, 4]),
      counter: 0,
      transports: ["internal"],
    } as WebAuthnCredential;
    const completed = await completeAdminPasskeyRegistration({ ceremonyId: registration.id, credential, deviceType: "multiDevice", backedUp: true, now });
    assert.equal(completed.recoveryCodes.length, 10);
    assert.deepEqual(await adminPasskeyStatus(), { activeCredentials: 1, unusedRecoveryCodes: 10 });
    await assert.rejects(completeAdminPasskeyRegistration({ ceremonyId: registration.id, credential, deviceType: "multiDevice", backedUp: true, now }));

    const authentication = await createAdminPasskeyCeremony({ purpose: "login", challenge: "login", now });
    await completeAdminPasskeyAuthentication({ ceremonyId: authentication.id, purpose: "login", credentialId: credential.id, previousCounter: 0, newCounter: 1, now });
    await assert.rejects(completeAdminPasskeyAuthentication({ ceremonyId: authentication.id, purpose: "login", credentialId: credential.id, previousCounter: 0, newCounter: 1, now }));

    const recovered = await exchangeAdminRecoveryCode(completed.recoveryCodes[0], now);
    assert.match(recovered.token, /^[A-Za-z0-9_-]{43}$/);
    await assert.rejects(exchangeAdminRecoveryCode(completed.recoveryCodes[0], now));
    await assert.rejects(revokeAdminPasskey(credential.id, now), /Passkey/);

    const reset = await issueAdminPasskeyEnrollmentToken({ revokeExisting: true, now });
    assert.deepEqual(await adminPasskeyStatus(), { activeCredentials: 0, unusedRecoveryCodes: 0 });
    const resetCeremony = await createAdminPasskeyCeremony({ purpose: "registration", challenge: "reset", enrollmentToken: reset.token, now });
    const resetCredential = { ...credential, id: "cGFzc2tleS0y" } as WebAuthnCredential;
    const resetCompleted = await completeAdminPasskeyRegistration({ ceremonyId: resetCeremony.id, credential: resetCredential, deviceType: "multiDevice", backedUp: true, now });
    assert.equal(resetCompleted.recoveryCodes.length, 10);
  } finally {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabase === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabase;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("Passkey registration rechecks authorization before committing the credential", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-passkey-reauth-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabase = process.env.VAULT2077_DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  delete process.env.VAULT2077_DATABASE_URL;
  try {
    const now = new Date("2027-01-15T08:00:00.000Z");
    const ceremony = await createAdminPasskeyCeremony({
      purpose: "registration",
      challenge: "register",
      actorHash: "a".repeat(24),
      now,
    });
    const credential = {
      id: "cGFzc2tleS1yZWF1dGg",
      publicKey: new Uint8Array([5, 6, 7, 8]),
      counter: 0,
      transports: ["internal"],
    } as WebAuthnCredential;

    await assert.rejects(
      completeAdminPasskeyRegistration({
        ceremonyId: ceremony.id,
        credential,
        deviceType: "multiDevice",
        backedUp: true,
        now,
        authorizeCompletion: async () => { throw new Error("reauthentication-expired"); },
      }),
      /reauthentication-expired/,
    );
    assert.deepEqual(await adminPasskeyStatus(), { activeCredentials: 0, unusedRecoveryCodes: 0 });

    const completed = await completeAdminPasskeyRegistration({
      ceremonyId: ceremony.id,
      credential,
      deviceType: "multiDevice",
      backedUp: true,
      now,
      authorizeCompletion: async () => undefined,
    });
    assert.equal(completed.recoveryCodes.length, 10);
    assert.deepEqual(await adminPasskeyStatus(), { activeCredentials: 1, unusedRecoveryCodes: 10 });
  } finally {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabase === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabase;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
