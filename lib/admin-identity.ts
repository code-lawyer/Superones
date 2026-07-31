import "server-only";

import {
  createLocalJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";
import { PRODUCTION_ADMIN_EMAIL } from "./admin-profile.ts";
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

export function adminAccessMode(): "oidc" | "local-password" {
  return process.env.NODE_ENV === "production" ? "oidc" : "local-password";
}

export function configuredAdminIdentity() {
  const issuer = process.env.VAULT2077_ADMIN_OIDC_ISSUER?.trim() ?? "";
  const audience = process.env.VAULT2077_ADMIN_OIDC_CLIENT_ID?.trim() ?? "";
  const allowlist = new Set(
    (process.env.VAULT2077_ADMIN_IDENTITY_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!issuer || !audience || allowlist.size === 0) {
    throw new Error("生产后台 OIDC 身份配置不完整。");
  }
  const issuerUrl = new URL(issuer);
  if (issuerUrl.protocol !== "https:") throw new Error("生产后台 OIDC 发行者必须使用 HTTPS。");
  if ([...allowlist].some((value) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))) {
    throw new Error("生产后台身份白名单包含无效邮箱。");
  }
  if (process.env.NODE_ENV === "production" && (
    allowlist.size !== 1
    || !allowlist.has(PRODUCTION_ADMIN_EMAIL)
  )) {
    throw new Error(`生产后台只允许已确认管理员 ${PRODUCTION_ADMIN_EMAIL}。`);
  }
  return { issuer, audience, allowlist } satisfies AdminIdentityConfiguration;
}

export async function verifyAdminIdentityJwt(
  assertion: string,
  keySet: JWTVerifyGetKey | JSONWebKeySet,
  configuration: AdminIdentityConfiguration,
  now = new Date(),
  expectedNonce?: string,
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
  if (
    !subject
    || !email
    || !configuration.allowlist.has(email)
    || typeof authenticatedSeconds !== "number"
    || result.payload.email_verified === false
    || (expectedNonce !== undefined && result.payload.nonce !== expectedNonce)
  ) {
    throw new Error("后台身份不在允许名单或断言缺少必要字段。");
  }
  return {
    subject,
    email,
    role: "owner",
    authenticatedAt: new Date(authenticatedSeconds * 1000).toISOString(),
  };
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
