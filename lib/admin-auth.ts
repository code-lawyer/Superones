import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "vault2077_admin";

function configValue(name: "VAULT2077_ADMIN_PASSWORD" | "VAULT2077_ADMIN_SESSION_SECRET", fallback: string) {
  const configured = process.env[name];
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error(`生产环境必须设置 ${name}。`);
  return fallback;
}

function signature(payload: string) {
  return createHmac("sha256", configValue("VAULT2077_ADMIN_SESSION_SECRET", "vault2077-local-session-secret")).update(payload).digest("base64url");
}

function safeEquals(left: string, right: string) {
  const leftValue = Buffer.from(left);
  const rightValue = Buffer.from(right);
  return leftValue.length === rightValue.length && timingSafeEqual(leftValue, rightValue);
}

export function isValidAdminPassword(value: string) {
  return safeEquals(value, configValue("VAULT2077_ADMIN_PASSWORD", "vault2077-local-admin"));
}

export function createAdminSession() {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `admin.${expiresAt}`;
  return `${payload}.${signature(payload)}`;
}

export function isValidAdminSession(value: string | undefined) {
  if (!value) return false;
  const [role, expiresValue, suppliedSignature] = value.split(".");
  if (role !== "admin" || !expiresValue || !suppliedSignature) return false;
  const payload = `${role}.${expiresValue}`;
  if (!safeEquals(suppliedSignature, signature(payload))) return false;
  const expiresAt = Number(expiresValue);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
