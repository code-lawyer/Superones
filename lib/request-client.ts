import "server-only";

import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

export function requestClientAddress(request: NextRequest) {
  if (process.env.VAULT2077_TRUST_PROXY_HEADERS !== "true") return "untrusted-client";
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return forwarded?.[0] || request.headers.get("x-real-ip")?.trim() || "unknown-client";
}

export function anonymizeClientAddress(address: string) {
  const secret = process.env.VAULT2077_AUDIT_HASH_SECRET
    || process.env.VAULT2077_ADMIN_SESSION_SECRET
    || (process.env.NODE_ENV === "production" ? "" : "vault2077-local-audit-secret!");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("生产审计哈希密钥至少需要 32 字节。");
  }
  return createHmac("sha256", secret).update(address).digest("hex").slice(0, 24);
}
