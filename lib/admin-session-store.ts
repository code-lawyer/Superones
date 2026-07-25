import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ADMIN_ABSOLUTE_SECONDS,
  ADMIN_IDLE_SECONDS,
  ADMIN_REAUTH_SECONDS,
  adminActorHash,
  adminSessionTokenHash,
  type AdminRole,
} from "./admin-auth.ts";
import type { AdminIdentity } from "./admin-identity.ts";
import { configuredPostgresPool, persistenceMode } from "./state-document-store.ts";

export type AdminSession = {
  id: string;
  actorHash: string;
  role: AdminRole;
  issuedAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  reauthenticatedAt: string;
};

type StoredAdminSession = AdminSession & {
  tokenHash: string;
  revokedAt: string | null;
};

type FileSessionStore = {
  schemaVersion: 1;
  sessions: StoredAdminSession[];
};

const fileWriteChains = new Map<string, Promise<void>>();

function filePath() {
  const dataRoot = process.env.VAULT2077_DATA_DIR
    ? path.resolve(process.env.VAULT2077_DATA_DIR)
    : path.join(process.cwd(), "data");
  return path.join(dataRoot, "admin-sessions.json");
}

function parseDate(value: unknown, label: string) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`后台会话 ${label} 无效。`);
  }
  return value;
}

function parseStoredSession(value: unknown): StoredAdminSession {
  if (!value || typeof value !== "object") throw new Error("后台会话记录无效。");
  const item = value as Partial<StoredAdminSession>;
  if (
    typeof item.id !== "string"
    || typeof item.tokenHash !== "string"
    || !/^[a-f0-9]{64}$/.test(item.tokenHash)
    || typeof item.actorHash !== "string"
    || !/^[a-f0-9]{24}$/.test(item.actorHash)
    || item.role !== "owner"
  ) throw new Error("后台会话记录字段无效。");
  return {
    id: item.id,
    tokenHash: item.tokenHash,
    actorHash: item.actorHash,
    role: item.role,
    issuedAt: parseDate(item.issuedAt, "签发时间"),
    lastSeenAt: parseDate(item.lastSeenAt, "最近活动时间"),
    idleExpiresAt: parseDate(item.idleExpiresAt, "空闲过期时间"),
    absoluteExpiresAt: parseDate(item.absoluteExpiresAt, "绝对过期时间"),
    reauthenticatedAt: parseDate(item.reauthenticatedAt, "再认证时间"),
    revokedAt: item.revokedAt === null || item.revokedAt === undefined
      ? null
      : parseDate(item.revokedAt, "撤销时间"),
  };
}

async function readFileStore(): Promise<FileSessionStore> {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(target, "utf8")) as { schemaVersion?: unknown; sessions?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.sessions)) throw new Error("后台会话文件格式无效。");
    return { schemaVersion: 1, sessions: parsed.sessions.map(parseStoredSession) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const initial: FileSessionStore = { schemaVersion: 1, sessions: [] };
    await writeFile(target, `${JSON.stringify(initial, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
      .catch((writeError: NodeJS.ErrnoException) => {
        if (writeError.code !== "EEXIST") throw writeError;
      });
    return readFileStore();
  }
}

async function writeFileStore(value: FileSessionStore) {
  const target = filePath();
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
}

async function mutateFileStore<T>(mutator: (store: FileSessionStore) => T | Promise<T>) {
  const key = filePath();
  const previous = fileWriteChains.get(key) ?? Promise.resolve();
  const operation = previous.then(async () => {
    const store = await readFileStore();
    const result = await mutator(store);
    await writeFileStore(store);
    return result;
  });
  const chain = operation.then(() => undefined, () => undefined);
  fileWriteChains.set(key, chain);
  try {
    return await operation;
  } finally {
    if (fileWriteChains.get(key) === chain) fileWriteChains.delete(key);
  }
}

function publicSession(value: StoredAdminSession): AdminSession {
  const { tokenHash: _tokenHash, revokedAt: _revokedAt, ...session } = value;
  return session;
}

function sessionDates(identity: AdminIdentity, now: Date): StoredAdminSession {
  const absolute = new Date(now.getTime() + ADMIN_ABSOLUTE_SECONDS * 1000);
  const idle = new Date(Math.min(
    absolute.getTime(),
    now.getTime() + ADMIN_IDLE_SECONDS * 1000,
  ));
  return {
    id: randomUUID(),
    tokenHash: "",
    actorHash: adminActorHash(identity.subject),
    role: identity.role,
    issuedAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    idleExpiresAt: idle.toISOString(),
    absoluteExpiresAt: absolute.toISOString(),
    reauthenticatedAt: identity.authenticatedAt,
    revokedAt: null,
  };
}

function mapPostgresSession(row: Record<string, unknown>): AdminSession {
  const date = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
  return {
    id: String(row.id),
    actorHash: String(row.actor_hash),
    role: row.role as AdminRole,
    issuedAt: date(row.issued_at),
    lastSeenAt: date(row.last_seen_at),
    idleExpiresAt: date(row.idle_expires_at),
    absoluteExpiresAt: date(row.absolute_expires_at),
    reauthenticatedAt: date(row.reauthenticated_at),
  };
}

export async function createAdminSession(identity: AdminIdentity, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const stored = sessionDates(identity, now);
  stored.tokenHash = adminSessionTokenHash(token);
  if (persistenceMode() === "postgresql") {
    await configuredPostgresPool().query(
      `DELETE FROM vault2077_admin_sessions
       WHERE absolute_expires_at <= $1 OR revoked_at IS NOT NULL`,
      [now.toISOString()],
    );
    await configuredPostgresPool().query(
      `INSERT INTO vault2077_admin_sessions
       (id, token_hash, actor_hash, role, issued_at, last_seen_at, idle_expires_at, absolute_expires_at, reauthenticated_at)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8)`,
      [
        stored.id,
        stored.tokenHash,
        stored.actorHash,
        stored.role,
        stored.issuedAt,
        stored.idleExpiresAt,
        stored.absoluteExpiresAt,
        stored.reauthenticatedAt,
      ],
    );
  } else {
    await mutateFileStore((store) => {
      store.sessions = store.sessions.filter((session) => (
        !session.revokedAt && Date.parse(session.absoluteExpiresAt) > now.getTime()
      ));
      store.sessions.push(stored);
    });
  }
  return { token, session: publicSession(stored) };
}

export async function readAdminSession(token: string | undefined, now = new Date()) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = adminSessionTokenHash(token);
  const nextIdle = new Date(now.getTime() + ADMIN_IDLE_SECONDS * 1000);
  if (persistenceMode() === "postgresql") {
    const result = await configuredPostgresPool().query<Record<string, unknown>>(
      `UPDATE vault2077_admin_sessions
       SET last_seen_at = $2,
           idle_expires_at = LEAST(absolute_expires_at, $3)
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND idle_expires_at > $2
         AND absolute_expires_at > $2
       RETURNING id, actor_hash, role, issued_at, last_seen_at, idle_expires_at, absolute_expires_at, reauthenticated_at`,
      [tokenHash, now.toISOString(), nextIdle.toISOString()],
    );
    return result.rowCount ? mapPostgresSession(result.rows[0]) : null;
  }
  return mutateFileStore((store) => {
    const session = store.sessions.find((item) => item.tokenHash === tokenHash);
    if (
      !session
      || session.revokedAt
      || Date.parse(session.idleExpiresAt) <= now.getTime()
      || Date.parse(session.absoluteExpiresAt) <= now.getTime()
    ) return null;
    session.lastSeenAt = now.toISOString();
    session.idleExpiresAt = new Date(Math.min(
      Date.parse(session.absoluteExpiresAt),
      nextIdle.getTime(),
    )).toISOString();
    return publicSession(session);
  });
}

export async function revokeAdminSession(token: string | undefined, now = new Date()) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const tokenHash = adminSessionTokenHash(token);
  if (persistenceMode() === "postgresql") {
    const result = await configuredPostgresPool().query(
      `UPDATE vault2077_admin_sessions
       SET revoked_at = $2
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash, now.toISOString()],
    );
    return Boolean(result.rowCount);
  }
  return mutateFileStore((store) => {
    const session = store.sessions.find((item) => item.tokenHash === tokenHash && !item.revokedAt);
    if (!session) return false;
    session.revokedAt = now.toISOString();
    return true;
  });
}

export async function markAdminSessionReauthenticated(
  token: string | undefined,
  authenticatedAt: string,
) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = adminSessionTokenHash(token);
  if (persistenceMode() === "postgresql") {
    const result = await configuredPostgresPool().query<Record<string, unknown>>(
      `UPDATE vault2077_admin_sessions
       SET reauthenticated_at = $2
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING id, actor_hash, role, issued_at, last_seen_at, idle_expires_at, absolute_expires_at, reauthenticated_at`,
      [tokenHash, authenticatedAt],
    );
    return result.rowCount ? mapPostgresSession(result.rows[0]) : null;
  }
  return mutateFileStore((store) => {
    const session = store.sessions.find((item) => item.tokenHash === tokenHash && !item.revokedAt);
    if (!session) return null;
    session.reauthenticatedAt = authenticatedAt;
    return publicSession(session);
  });
}

export function hasRecentAdminReauthentication(session: AdminSession, now = new Date()) {
  const authenticatedAt = Date.parse(session.reauthenticatedAt);
  return Number.isFinite(authenticatedAt)
    && authenticatedAt <= now.getTime() + 5_000
    && now.getTime() - authenticatedAt < ADMIN_REAUTH_SECONDS * 1000;
}
