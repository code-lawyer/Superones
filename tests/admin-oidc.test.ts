import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_OIDC_TRANSACTION_SECONDS,
  adminOidcTransactionCookieOptions,
  decodeAdminOidcTransaction,
  encodeAdminOidcTransaction,
  parseAdminOidcDiscovery,
  type AdminOidcConfiguration,
  type AdminOidcTransaction,
} from "../lib/admin-oidc.ts";

const configuration: AdminOidcConfiguration = {
  issuer: "https://issuer.example.test",
  clientId: "vault2077-admin",
  clientSecret: "test-client-secret",
  discoveryUrl: "https://issuer.example.test/.well-known/openid-configuration",
};

test("OIDC discovery requires matching issuer, HTTPS endpoints, and RS256", () => {
  const discovery = parseAdminOidcDiscovery({
    issuer: configuration.issuer,
    authorization_endpoint: "https://issuer.example.test/oauth2/authorize",
    token_endpoint: "https://issuer.example.test/oauth2/token",
    jwks_uri: "https://issuer.example.test/oauth2/jwks",
    end_session_endpoint: "https://issuer.example.test/oauth2/logout",
    id_token_signing_alg_values_supported: ["RS256"],
  }, configuration);
  assert.equal(discovery.issuer, configuration.issuer);
  assert.equal(discovery.authorizationEndpoint, "https://issuer.example.test/oauth2/authorize");
  assert.equal(discovery.endSessionEndpoint, "https://issuer.example.test/oauth2/logout");

  assert.throws(() => parseAdminOidcDiscovery({
    issuer: "https://attacker.example.test",
    authorization_endpoint: "https://issuer.example.test/oauth2/authorize",
    token_endpoint: "https://issuer.example.test/oauth2/token",
    jwks_uri: "https://issuer.example.test/oauth2/jwks",
  }, configuration));
  assert.throws(() => parseAdminOidcDiscovery({
    issuer: configuration.issuer,
    authorization_endpoint: "http://issuer.example.test/oauth2/authorize",
    token_endpoint: "https://issuer.example.test/oauth2/token",
    jwks_uri: "https://issuer.example.test/oauth2/jwks",
  }, configuration));
  assert.throws(() => parseAdminOidcDiscovery({
    issuer: configuration.issuer,
    authorization_endpoint: "https://issuer.example.test/oauth2/authorize",
    token_endpoint: "https://issuer.example.test/oauth2/token",
    jwks_uri: "https://issuer.example.test/oauth2/jwks",
    id_token_signing_alg_values_supported: ["ES256"],
  }, configuration));
});

test("OIDC transaction cookie is signed, tamper evident, and short lived", () => {
  const previousSecret = process.env.VAULT2077_ADMIN_SESSION_SECRET;
  process.env.VAULT2077_ADMIN_SESSION_SECRET = "test-admin-session-secret-at-least-32-bytes";
  try {
    const now = new Date("2027-01-15T08:00:00.000Z");
    const transaction: AdminOidcTransaction = {
      state: "state-value",
      nonce: "nonce-value",
      codeVerifier: "code-verifier-value",
      intent: "reauth",
      actorHash: "actor-hash",
      createdAt: now.toISOString(),
    };
    const encoded = encodeAdminOidcTransaction(transaction);
    assert.deepEqual(decodeAdminOidcTransaction(encoded, now), transaction);

    const [payload, signature] = encoded.split(".");
    assert.throws(() => decodeAdminOidcTransaction(`${payload}x.${signature}`, now));
    assert.throws(() => decodeAdminOidcTransaction(
      encoded,
      new Date(now.getTime() + (ADMIN_OIDC_TRANSACTION_SECONDS + 1) * 1_000),
    ));
  } finally {
    if (previousSecret === undefined) delete process.env.VAULT2077_ADMIN_SESSION_SECRET;
    else process.env.VAULT2077_ADMIN_SESSION_SECRET = previousSecret;
  }
});

test("OIDC transaction cookie permits only the top-level provider callback", () => {
  const options = adminOidcTransactionCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.maxAge, ADMIN_OIDC_TRANSACTION_SECONDS);
});
