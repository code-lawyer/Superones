import "server-only";

import { argon2, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "vault2077_admin";
export const ADMIN_IDLE_SECONDS = 60 * 60;
export const ADMIN_ABSOLUTE_SECONDS = 8 * 60 * 60;

export type AdminSession = {
  sessionId: string;
  issuedAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
};

function requiredSessionSecret() {
  const configured = process.env.VAULT2077_ADMIN_SESSION_SECRET;
  if (configured && Buffer.byteLength(configured, "utf8") >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须设置至少 32 字节的 VAULT2077_ADMIN_SESSION_SECRET。");
  }
  return "vault2077-local-session-secret!";
}

function signature(payload: string) {
  return createHmac("sha256", requiredSessionSecret()).update(payload).digest("base64url");
}

function safeEquals(left: string | Buffer, right: string | Buffer) {
  const leftValue = Buffer.isBuffer(left) ? left : Buffer.from(left);
  const rightValue = Buffer.isBuffer(right) ? right : Buffer.from(right);
  return leftValue.length === rightValue.length && timingSafeEqual(leftValue, rightValue);
}

type Argon2Parameters = {
  memory: number;
  passes: number;
  parallelism: number;
  nonce: Buffer;
  expected: Buffer;
};

function parsePasswordHash(value: string): Argon2Parameters {
  const match = /^argon2id\$v=1\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(value);
  if (!match) throw new Error("VAULT2077_ADMIN_PASSWORD_HASH 格式无效。");
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

export async function isValidAdminPassword(value: string) {
  const configuredHash = process.env.VAULT2077_ADMIN_PASSWORD_HASH;
  if (configuredHash) {
    const parameters = parsePasswordHash(configuredHash);
    return safeEquals(await derivePassword(value, parameters), parameters.expected);
  }
  if (process.env.NODE_ENV === "production") {
    if (process.env.VAULT2077_ADMIN_PASSWORD) {
      throw new Error("生产环境不接受明文 VAULT2077_ADMIN_PASSWORD；请配置 VAULT2077_ADMIN_PASSWORD_HASH。");
    }
    throw new Error("生产环境必须设置 VAULT2077_ADMIN_PASSWORD_HASH。");
  }
  return safeEquals(value, process.env.VAULT2077_ADMIN_PASSWORD || "vault2077-local-admin");
}

function encodeSession(session: AdminSession) {
  const payload = [
    "admin",
    session.sessionId,
    session.issuedAt,
    session.idleExpiresAt,
    session.absoluteExpiresAt,
  ].join(".");
  return `${payload}.${signature(payload)}`;
}

export function createAdminSession(now = Date.now()) {
  return encodeSession({
    sessionId: randomBytes(18).toString("base64url"),
    issuedAt: now,
    idleExpiresAt: now + ADMIN_IDLE_SECONDS * 1000,
    absoluteExpiresAt: now + ADMIN_ABSOLUTE_SECONDS * 1000,
  });
}

export function readAdminSession(value: string | undefined, now = Date.now()): AdminSession | null {
  if (!value) return null;
  const [role, sessionId, issuedValue, idleValue, absoluteValue, suppliedSignature] = value.split(".");
  if (
    role !== "admin"
    || !/^[A-Za-z0-9_-]{24}$/.test(sessionId ?? "")
    || !issuedValue
    || !idleValue
    || !absoluteValue
    || !suppliedSignature
  ) return null;
  const payload = [role, sessionId, issuedValue, idleValue, absoluteValue].join(".");
  if (!safeEquals(suppliedSignature, signature(payload))) return null;
  const session = {
    sessionId,
    issuedAt: Number(issuedValue),
    idleExpiresAt: Number(idleValue),
    absoluteExpiresAt: Number(absoluteValue),
  };
  if (
    !Number.isSafeInteger(session.issuedAt)
    || !Number.isSafeInteger(session.idleExpiresAt)
    || !Number.isSafeInteger(session.absoluteExpiresAt)
    || session.issuedAt > now
    || session.idleExpiresAt <= now
    || session.absoluteExpiresAt <= now
    || session.idleExpiresAt > session.absoluteExpiresAt
  ) return null;
  return session;
}

export function refreshAdminSession(session: AdminSession, now = Date.now()) {
  if (session.absoluteExpiresAt <= now) throw new Error("后台会话已到绝对过期时间。");
  return encodeSession({
    ...session,
    idleExpiresAt: Math.min(session.absoluteExpiresAt, now + ADMIN_IDLE_SECONDS * 1000),
  });
}

export function isValidAdminSession(value: string | undefined) {
  return readAdminSession(value) !== null;
}

export function adminSessionAnonymousId(session: AdminSession) {
  return createHash("sha256").update(session.sessionId).digest("hex").slice(0, 24);
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ADMIN_IDLE_SECONDS,
};
