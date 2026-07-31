import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { requiredAdminSessionSecret } from "./admin-auth.ts";
import {
  configuredAdminIdentity,
  verifyAdminIdentityJwt,
  type AdminIdentity,
} from "./admin-identity.ts";
import { configuredAdminOrigin } from "./admin-request-security.ts";

export const ADMIN_OIDC_TRANSACTION_SECONDS = 10 * 60;

export type AdminOidcIntent = "login" | "reauth";

export type AdminOidcConfiguration = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
};

export type AdminOidcDiscovery = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  endSessionEndpoint: string | null;
};

export type AdminOidcTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  intent: AdminOidcIntent;
  actorHash: string | null;
  createdAt: string;
};

const discoveryCache = new Map<string, {
  expiresAt: number;
  value: AdminOidcDiscovery;
}>();
const keySetCache = new Map<string, JWTVerifyGetKey>();

function requireHttpsUrl(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${label}必须使用 HTTPS。`);
  return url;
}

export function configuredAdminOidc(
  environment: Record<string, string | undefined> = process.env,
): AdminOidcConfiguration {
  const issuer = environment.VAULT2077_ADMIN_OIDC_ISSUER?.trim() ?? "";
  const clientId = environment.VAULT2077_ADMIN_OIDC_CLIENT_ID?.trim() ?? "";
  const clientSecret = environment.VAULT2077_ADMIN_OIDC_CLIENT_SECRET?.trim() ?? "";
  if (!issuer || !clientId || !clientSecret) throw new Error("生产后台 OIDC 配置不完整。");
  const issuerUrl = requireHttpsUrl(issuer, "OIDC issuer");
  const discoveryUrl = environment.VAULT2077_ADMIN_OIDC_DISCOVERY_URL?.trim()
    || `${issuerUrl.href.replace(/\/$/, "")}/.well-known/openid-configuration`;
  requireHttpsUrl(discoveryUrl, "OIDC discovery URL");
  return { issuer, clientId, clientSecret, discoveryUrl };
}

function discoveryEndpoint(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`OIDC discovery 缺少 ${label}。`);
  return requireHttpsUrl(value.trim(), label).href;
}

export function parseAdminOidcDiscovery(
  body: unknown,
  configuration: AdminOidcConfiguration,
): AdminOidcDiscovery {
  if (!body || typeof body !== "object") throw new Error("OIDC discovery 返回无效。");
  const value = body as Record<string, unknown>;
  if (value.issuer !== configuration.issuer) throw new Error("OIDC discovery issuer 与生产配置不一致。");
  const algorithms = value.id_token_signing_alg_values_supported;
  if (Array.isArray(algorithms) && !algorithms.includes("RS256")) {
    throw new Error("OIDC 提供方不支持要求的 RS256 ID Token。");
  }
  const endSessionEndpoint = typeof value.end_session_endpoint === "string"
    && value.end_session_endpoint.trim()
    ? requireHttpsUrl(value.end_session_endpoint.trim(), "OIDC end_session_endpoint").href
    : null;
  return {
    issuer: configuration.issuer,
    authorizationEndpoint: discoveryEndpoint(value.authorization_endpoint, "authorization_endpoint"),
    tokenEndpoint: discoveryEndpoint(value.token_endpoint, "token_endpoint"),
    jwksUri: discoveryEndpoint(value.jwks_uri, "jwks_uri"),
    endSessionEndpoint,
  };
}

export async function loadAdminOidcDiscovery(
  configuration = configuredAdminOidc(),
  now = Date.now(),
) {
  const cached = discoveryCache.get(configuration.discoveryUrl);
  if (cached && cached.expiresAt > now) return cached.value;
  const response = await fetch(configuration.discoveryUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`OIDC discovery 请求失败：HTTP ${response.status}。`);
  const value = parseAdminOidcDiscovery(await response.json(), configuration);
  discoveryCache.set(configuration.discoveryUrl, {
    expiresAt: now + 5 * 60 * 1_000,
    value,
  });
  return value;
}

function transactionSignature(payload: string) {
  return createHmac("sha256", requiredAdminSessionSecret()).update(payload).digest("base64url");
}

export function adminOidcTransactionCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Host-vault2077_oidc"
    : "vault2077_oidc";
}

export function adminOidcTransactionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_OIDC_TRANSACTION_SECONDS,
  };
}

export function encodeAdminOidcTransaction(transaction: AdminOidcTransaction) {
  const payload = Buffer.from(JSON.stringify(transaction), "utf8").toString("base64url");
  return `${payload}.${transactionSignature(payload)}`;
}

export function decodeAdminOidcTransaction(value: string, now = new Date()) {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw new Error("OIDC 登录事务格式无效。");
  const actual = Buffer.from(signature, "base64url");
  const expected = Buffer.from(transactionSignature(payload), "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("OIDC 登录事务签名无效。");
  }
  const transaction = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as AdminOidcTransaction;
  if (
    !transaction
    || typeof transaction.state !== "string"
    || typeof transaction.nonce !== "string"
    || typeof transaction.codeVerifier !== "string"
    || !["login", "reauth"].includes(transaction.intent)
    || (transaction.actorHash !== null && typeof transaction.actorHash !== "string")
  ) {
    throw new Error("OIDC 登录事务内容无效。");
  }
  const createdAt = Date.parse(transaction.createdAt);
  if (
    !Number.isFinite(createdAt)
    || now.getTime() < createdAt - 5_000
    || now.getTime() - createdAt > ADMIN_OIDC_TRANSACTION_SECONDS * 1_000
  ) {
    throw new Error("OIDC 登录事务已过期。");
  }
  return transaction;
}

export async function createAdminOidcAuthorization(
  intent: AdminOidcIntent,
  actorHash: string | null,
  now = new Date(),
) {
  const configuration = configuredAdminOidc();
  const discovery = await loadAdminOidcDiscovery(configuration);
  const transaction: AdminOidcTransaction = {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    codeVerifier: randomBytes(48).toString("base64url"),
    intent,
    actorHash,
    createdAt: now.toISOString(),
  };
  const challenge = createHash("sha256")
    .update(transaction.codeVerifier)
    .digest("base64url");
  const url = new URL(discovery.authorizationEndpoint);
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("redirect_uri", `${configuredAdminOrigin()}/api/admin/oidc/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", transaction.state);
  url.searchParams.set("nonce", transaction.nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (intent === "reauth") {
    url.searchParams.set("prompt", "login");
    url.searchParams.set("max_age", "0");
  }
  return {
    authorizationUrl: url.href,
    cookieValue: encodeAdminOidcTransaction(transaction),
    transaction,
  };
}

function basicCredentialPart(value: string) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function remoteKeySet(jwksUri: string) {
  const cached = keySetCache.get(jwksUri);
  if (cached) return cached;
  const value = createRemoteJWKSet(new URL(jwksUri), {
    cooldownDuration: 30_000,
    timeoutDuration: 5_000,
  });
  keySetCache.set(jwksUri, value);
  return value;
}

export async function exchangeAdminOidcCode(
  code: string,
  transaction: AdminOidcTransaction,
  now = new Date(),
): Promise<AdminIdentity> {
  const configuration = configuredAdminOidc();
  const discovery = await loadAdminOidcDiscovery(configuration);
  const credentials = Buffer.from(
    `${basicCredentialPart(configuration.clientId)}:${basicCredentialPart(configuration.clientSecret)}`,
    "utf8",
  ).toString("base64");
  const response = await fetch(discovery.tokenEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${configuredAdminOrigin()}/api/admin/oidc/callback`,
      code_verifier: transaction.codeVerifier,
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => null) as {
    id_token?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok || typeof body?.id_token !== "string") {
    const reason = typeof body?.error === "string" ? body.error.slice(0, 80) : `HTTP ${response.status}`;
    throw new Error(`OIDC 授权码交换失败：${reason}。`);
  }
  return verifyAdminIdentityJwt(
    body.id_token,
    remoteKeySet(discovery.jwksUri),
    configuredAdminIdentity(),
    now,
    transaction.nonce,
  );
}

export async function configuredAdminOidcLogoutUrl() {
  const configuration = configuredAdminOidc();
  const discovery = await loadAdminOidcDiscovery(configuration);
  if (!discovery.endSessionEndpoint) return null;
  const url = new URL(discovery.endSessionEndpoint);
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("post_logout_redirect_uri", `${configuredAdminOrigin()}/admin`);
  return url.href;
}
