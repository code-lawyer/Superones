import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyAdminIdentityJwt } from "../lib/admin-identity.ts";

test("identity gateway JWT requires valid cryptography, audience, and allowlist", async () => {
  const now = new Date("2027-01-15T08:00:00.000Z");
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "admin-key-1";
  publicJwk.alg = "RS256";
  const configuration = {
    issuer: "https://identity.vault2077.test",
    audience: "vault2077-production-admin",
    allowlist: new Set(["owner@vault2077.test"]),
  };
  const assertion = await new SignJWT({
    email: "Owner@Vault2077.test",
    auth_time: nowSeconds - 30,
  })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuer(configuration.issuer)
    .setAudience(configuration.audience)
    .setSubject("identity-provider-subject")
    .setIssuedAt(nowSeconds - 30)
    .setExpirationTime(nowSeconds + 300)
    .sign(privateKey);

  const identity = await verifyAdminIdentityJwt(
    assertion,
    { keys: [publicJwk] },
    configuration,
    now,
  );
  assert.equal(identity.email, "owner@vault2077.test");
  assert.equal(identity.role, "owner");
  assert.equal(identity.authenticatedAt, new Date((nowSeconds - 30) * 1_000).toISOString());

  await assert.rejects(
    verifyAdminIdentityJwt(assertion, { keys: [publicJwk] }, {
      ...configuration,
      audience: "wrong-audience",
    }, now),
  );
  await assert.rejects(
    verifyAdminIdentityJwt(assertion, { keys: [publicJwk] }, {
      ...configuration,
      allowlist: new Set(["other@vault2077.test"]),
    }, now),
  );
});

test("identity gateway JWT rejects expired assertions", async () => {
  const now = new Date("2027-01-15T08:00:00.000Z");
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "expired-admin-key";
  publicJwk.alg = "RS256";
  const assertion = await new SignJWT({
    email: "owner@vault2077.test",
    auth_time: nowSeconds - 600,
  })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuer("https://identity.vault2077.test")
    .setAudience("vault2077-production-admin")
    .setSubject("identity-provider-subject")
    .setIssuedAt(nowSeconds - 600)
    .setExpirationTime(nowSeconds - 60)
    .sign(privateKey);
  await assert.rejects(
    verifyAdminIdentityJwt(assertion, { keys: [publicJwk] }, {
      issuer: "https://identity.vault2077.test",
      audience: "vault2077-production-admin",
      allowlist: new Set(["owner@vault2077.test"]),
    }, now),
  );
});
