import "server-only";

import { argon2, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_IDLE_SECONDS = 30 * 60;
export const ADMIN_ABSOLUTE_SECONDS = 4 * 60 * 60;
export const ADMIN_REAUTH_SECONDS = 5 * 60;

export type AdminRole = "owner";

type Argon2Parameters = {
  memory: number;
  passes: number;
  parallelism: number;
  nonce: Buffer;
  expected: Buffer;
};

function safeEquals(left: string | Buffer, right: string | Buffer) {
  const leftValue = Buffer.isBuffer(left) ? left : Buffer.from(left);
  const rightValue = Buffer.isBuffer(right) ? right : Buffer.from(right);
  return leftValue.length === rightValue.length && timingSafeEqual(leftValue, rightValue);
}

function parsePasswordHash(value: string): Argon2Parameters {
  const match = /^argon2id\$v=1\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(value);
  if (!match) throw new Error("后台密码 Argon2id 哈希格式无效。");
  const [, memoryValue, passesValue, parallelismValue, nonceValue, expectedValue] = match;
  const parameters = {
    memory: Number(memoryValue),
    passes: Number(passesValue),
    parallelism: Number(parallelismValue),
    nonce: Buffer.from(nonceValue, "base64url"),
    expected: Buffer.from(expectedValue, "base64url"),
  };
  if (
    parameters.memory < 19_456
    || parameters.passes < 2
    || parameters.parallelism < 1
    || parameters.nonce.length < 16
    || parameters.expected.length < 32
  ) {
    throw new Error("后台密码 Argon2id 参数低于最低安全基线。");
  }
  return parameters;
}

async function derivePassword(value: string, parameters: Argon2Parameters) {
  return new Promise<Buffer>((resolve, reject) => {
    argon2("argon2id", {
      message: Buffer.from(value, "utf8"),
      nonce: parameters.nonce,
      parallelism: parameters.parallelism,
      tagLength: parameters.expected.length,
      memory: parameters.memory,
      passes: parameters.passes,
    }, (error, derived) => {
      if (error) reject(error);
      else resolve(Buffer.from(derived));
    });
  });
}

export async function verifyArgon2Password(value: string, encodedHash: string) {
  const parameters = parsePasswordHash(encodedHash);
  return safeEquals(await derivePassword(value, parameters), parameters.expected);
}

export async function isValidLocalAdminPassword(value: string) {
  if (process.env.NODE_ENV === "production") return false;
  const configuredHash = process.env.VAULT2077_ADMIN_PASSWORD_HASH;
  if (configuredHash) return verifyArgon2Password(value, configuredHash);
  return safeEquals(value, process.env.VAULT2077_ADMIN_PASSWORD || "vault2077-local-admin");
}

export function requiredAdminSessionSecret() {
  const configured = process.env.VAULT2077_ADMIN_SESSION_SECRET;
  if (configured && Buffer.byteLength(configured, "utf8") >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须设置至少 32 字节的 VAULT2077_ADMIN_SESSION_SECRET。");
  }
  return "vault2077-local-session-secret-development!";
}

export function adminSessionTokenHash(token: string) {
  return createHmac("sha256", requiredAdminSessionSecret()).update(token).digest("hex");
}

export function adminActorHash(subject: string) {
  const secret = process.env.VAULT2077_AUDIT_HASH_SECRET || requiredAdminSessionSecret();
  return createHmac("sha256", secret).update(`admin:${subject}`).digest("hex").slice(0, 24);
}

export function adminCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Host-vault2077_admin"
    : "vault2077_admin";
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_IDLE_SECONDS,
  };
}
