import "server-only";

import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";
import type { AdminRole } from "./admin-auth.ts";

export type AdminIdentity = {
  subject: string;
  email: string;
  role: AdminRole;
  authenticatedAt: string;
};

export type AdminIdentityConfiguration = {
  issuer: string;
  audience: string;
  allowlist: Set<string>;
};

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

export function adminAccessMode(): "identity-gateway" | "local-password" {
  return process.env.NODE_ENV === "production" ? "identity-gateway" : "local-password";
}

export function configuredAdminIdentityHeader() {
  const header = (process.env.VAULT2077_ADMIN_IDENTITY_HEADER || "cf-access-jwt-assertion").toLowerCase();
  if (!/^[a-z0-9-]+$/.test(header)) throw new Error("生产后台身份网关请求头名称无效。");
  return header;
}

export function configuredAdminIdentity() {
  const issuer = process.env.VAULT2077_ADMIN_IDENTITY_ISSUER?.trim() ?? "";
  const audience = process.env.VAULT2077_ADMIN_IDENTITY_AUDIENCE?.trim() ?? "";
  const allowlist = new Set(
    (process.env.VAULT2077_ADMIN_IDENTITY_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!issuer || !audience || allowlist.size === 0) {
    throw new Error("生产后台身份网关配置不完整。");
  }
  const issuerUrl = new URL(issuer);
  if (issuerUrl.protocol !== "https:") throw new Error("生产后台身份网关发行者必须使用 HTTPS。");
  if ([...allowlist].some((value) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))) {
    throw new Error("生产后台身份白名单包含无效邮箱。");
  }
  return { issuer, audience, allowlist } satisfies AdminIdentityConfiguration;
}

function remoteKeySet() {
  const rawUrl = process.env.VAULT2077_ADMIN_IDENTITY_JWKS_URL?.trim() ?? "";
  if (!rawUrl) throw new Error("生产后台身份网关 JWKS URL 未配置。");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("生产后台身份网关 JWKS URL 必须使用 HTTPS。");
  const cached = remoteKeySets.get(url.href);
  if (cached) return cached;
  const keySet = createRemoteJWKSet(url, {
    cooldownDuration: 30_000,
    timeoutDuration: 5_000,
  });
  remoteKeySets.set(url.href, keySet);
  return keySet;
}

export async function verifyAdminIdentityJwt(
  assertion: string,
  keySet: JWTVerifyGetKey | JSONWebKeySet,
  configuration: AdminIdentityConfiguration,
  now = new Date(),
): Promise<AdminIdentity> {
  const resolver = typeof keySet === "function" ? keySet : createLocalJWKSet(keySet);
  const result = await jwtVerify(assertion, resolver, {
    issuer: configuration.issuer,
    audience: configuration.audience,
    currentDate: now,
    clockTolerance: 5,
  });
  const subject = typeof result.payload.sub === "string" ? result.payload.sub.trim() : "";
  const email = typeof result.payload.email === "string" ? result.payload.email.trim().toLowerCase() : "";
  const authenticatedSeconds = typeof result.payload.auth_time === "number"
    ? result.payload.auth_time
    : result.payload.iat;
  if (!subject || !email || !configuration.allowlist.has(email) || typeof authenticatedSeconds !== "number") {
    throw new Error("后台身份不在允许名单或断言缺少必要字段。");
  }
  return {
    subject,
    email,
    role: "owner",
    authenticatedAt: new Date(authenticatedSeconds * 1000).toISOString(),
  };
}

export async function readGatewayAdminIdentity(headers: Headers, now = new Date()) {
  if (adminAccessMode() !== "identity-gateway") {
    throw new Error("本地开发不读取生产身份网关断言。");
  }
  const assertion = headers.get(configuredAdminIdentityHeader())?.trim();
  if (!assertion) throw new Error("缺少身份网关签名断言。");
  return verifyAdminIdentityJwt(assertion, remoteKeySet(), configuredAdminIdentity(), now);
}

export function localAdminIdentity(now = new Date()): AdminIdentity {
  if (adminAccessMode() !== "local-password") throw new Error("生产环境不接受本地管理员身份。");
  return {
    subject: "local-owner",
    email: "local-owner@vault2077.invalid",
    role: "owner",
    authenticatedAt: now.toISOString(),
  };
}
