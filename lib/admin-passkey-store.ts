import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
  WebAuthnCredential,
} from "@simplewebauthn/server";
import {
  mutateStateDocument,
  readStateDocument,
  type StateDocumentDefinition,
} from "./state-document-store.ts";

export type AdminPasskeyPurpose = "registration" | "login" | "reauthentication";

type StoredAdminPasskey = {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type StoredPasskeyCeremony = {
  id: string;
  purpose: AdminPasskeyPurpose;
  challenge: string;
  actorHash: string | null;
  enrollmentTokenHash: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

type StoredEnrollmentToken = {
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

type StoredRecoveryCode = {
  codeHash: string;
  createdAt: string;
  usedAt: string | null;
};

type AdminPasskeyStore = {
  version: 1;
  credentials: StoredAdminPasskey[];
  ceremonies: StoredPasskeyCeremony[];
  enrollmentTokens: StoredEnrollmentToken[];
  recoveryCodes: StoredRecoveryCode[];
};

const passkeyDocument: StateDocumentDefinition<AdminPasskeyStore> = {
  namespace: "admin-passkeys",
  fileName: "admin-passkeys.json",
  create: () => ({
    version: 1,
    credentials: [],
    ceremonies: [],
    enrollmentTokens: [],
    recoveryCodes: [],
  }),
  parse: (value) => {
    const parsed = value as AdminPasskeyStore;
    if (
      parsed.version !== 1
      || !Array.isArray(parsed.credentials)
      || !Array.isArray(parsed.ceremonies)
      || !Array.isArray(parsed.enrollmentTokens)
      || !Array.isArray(parsed.recoveryCodes)
    ) throw new Error("后台 Passkey 存储格式无效。");
    return parsed;
  },
};

const CEREMONY_TTL_MS = 5 * 60 * 1000;
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function prune(store: AdminPasskeyStore, now: Date) {
  const retention = now.getTime() - 24 * 60 * 60 * 1000;
  store.ceremonies = store.ceremonies.filter((item) => (
    item.usedAt === null && Date.parse(item.expiresAt) > now.getTime()
  ) || Date.parse(item.createdAt) > retention);
  store.enrollmentTokens = store.enrollmentTokens.filter((item) => (
    item.usedAt === null && Date.parse(item.expiresAt) > now.getTime()
  ) || Date.parse(item.createdAt) > retention);
}

function activeEnrollmentToken(store: AdminPasskeyStore, tokenHash: string, now: Date) {
  return store.enrollmentTokens.find((item) => (
    item.tokenHash === tokenHash
    && item.usedAt === null
    && Date.parse(item.expiresAt) > now.getTime()
  ));
}

export async function adminPasskeyStatus() {
  const store = await readStateDocument(passkeyDocument);
  return {
    activeCredentials: store.credentials.filter((item) => !item.revokedAt).length,
    unusedRecoveryCodes: store.recoveryCodes.filter((item) => !item.usedAt).length,
  };
}

export async function listActiveAdminPasskeys() {
  const store = await readStateDocument(passkeyDocument);
  return store.credentials.filter((item) => !item.revokedAt).map((item) => ({ ...item }));
}

export async function getAdminPasskey(credentialId: string) {
  const store = await readStateDocument(passkeyDocument);
  const value = store.credentials.find((item) => item.credentialId === credentialId && !item.revokedAt);
  return value ? { ...value } : null;
}

export function storedAdminPasskeyCredential(value: StoredAdminPasskey): WebAuthnCredential {
  return {
    id: value.credentialId,
    publicKey: Buffer.from(value.publicKey, "base64url"),
    counter: value.counter,
    transports: value.transports,
  };
}

export async function issueAdminPasskeyEnrollmentToken(options: {
  revokeExisting?: boolean;
  now?: Date;
} = {}) {
  const now = options.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  await mutateStateDocument(passkeyDocument, (store) => {
    prune(store, now);
    for (const enrollmentToken of store.enrollmentTokens) enrollmentToken.usedAt ??= now.toISOString();
    if (options.revokeExisting) {
      for (const credential of store.credentials) credential.revokedAt ??= now.toISOString();
      for (const ceremony of store.ceremonies) ceremony.usedAt ??= now.toISOString();
      for (const recoveryCode of store.recoveryCodes) recoveryCode.usedAt ??= now.toISOString();
    }
    store.enrollmentTokens.push({
      tokenHash: hash(token),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ENROLLMENT_TTL_MS).toISOString(),
      usedAt: null,
    });
  });
  return { token, expiresAt: new Date(now.getTime() + ENROLLMENT_TTL_MS).toISOString() };
}

export async function createAdminPasskeyCeremony(input: {
  purpose: AdminPasskeyPurpose;
  challenge: string;
  enrollmentToken?: string;
  actorHash?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const tokenHash = input.enrollmentToken ? hash(input.enrollmentToken) : null;
  return mutateStateDocument(passkeyDocument, (store) => {
    prune(store, now);
    if (input.purpose === "registration" && !input.actorHash) {
      if (!tokenHash || !activeEnrollmentToken(store, tokenHash, now)) {
        throw new Error("Passkey 注册令牌无效或已过期。");
      }
    }
    const ceremony: StoredPasskeyCeremony = {
      id: randomUUID(),
      purpose: input.purpose,
      challenge: input.challenge,
      actorHash: input.actorHash ?? null,
      enrollmentTokenHash: tokenHash,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CEREMONY_TTL_MS).toISOString(),
      usedAt: null,
    };
    store.ceremonies.push(ceremony);
    return { ...ceremony };
  });
}

export async function getAdminPasskeyCeremony(
  id: string,
  purpose: AdminPasskeyPurpose,
  now = new Date(),
) {
  const store = await readStateDocument(passkeyDocument);
  const ceremony = store.ceremonies.find((item) => (
    item.id === id
    && item.purpose === purpose
    && item.usedAt === null
    && Date.parse(item.expiresAt) > now.getTime()
  ));
  return ceremony ? { ...ceremony } : null;
}

function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => `V2077-${randomBytes(16).toString("hex").toUpperCase()}`);
}

export async function completeAdminPasskeyRegistration(input: {
  ceremonyId: string;
  credential: WebAuthnCredential;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  now?: Date;
  authorizeCompletion?: () => Promise<void>;
}) {
  const now = input.now ?? new Date();
  const recoveryCodes = newRecoveryCodes();
  return mutateStateDocument(passkeyDocument, async (store) => {
    const ceremony = store.ceremonies.find((item) => (
      item.id === input.ceremonyId
      && item.purpose === "registration"
      && item.usedAt === null
      && Date.parse(item.expiresAt) > now.getTime()
    ));
    if (!ceremony) throw new Error("Passkey 注册会话无效或已过期。");
    await input.authorizeCompletion?.();
    if (ceremony.enrollmentTokenHash) {
      const token = activeEnrollmentToken(store, ceremony.enrollmentTokenHash, now);
      if (!token) throw new Error("Passkey 注册令牌已失效。");
      token.usedAt = now.toISOString();
    }
    if (store.credentials.some((item) => item.credentialId === input.credential.id)) {
      throw new Error("该 Passkey 已经注册。");
    }
    const shouldIssueRecoveryCodes = store.credentials.every((item) => Boolean(item.revokedAt));
    ceremony.usedAt = now.toISOString();
    store.credentials.push({
      credentialId: input.credential.id,
      publicKey: Buffer.from(input.credential.publicKey).toString("base64url"),
      counter: input.credential.counter,
      transports: input.credential.transports ?? [],
      deviceType: input.deviceType,
      backedUp: input.backedUp,
      createdAt: now.toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    });
    if (shouldIssueRecoveryCodes) {
      store.recoveryCodes = recoveryCodes.map((code) => ({
        codeHash: hash(code),
        createdAt: now.toISOString(),
        usedAt: null,
      }));
    }
    return { recoveryCodes: shouldIssueRecoveryCodes ? recoveryCodes : [] };
  });
}

export async function completeAdminPasskeyAuthentication(input: {
  ceremonyId: string;
  purpose: "login" | "reauthentication";
  credentialId: string;
  previousCounter: number;
  newCounter: number;
  actorHash?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return mutateStateDocument(passkeyDocument, (store) => {
    const ceremony = store.ceremonies.find((item) => (
      item.id === input.ceremonyId
      && item.purpose === input.purpose
      && item.usedAt === null
      && Date.parse(item.expiresAt) > now.getTime()
      && (!input.actorHash || item.actorHash === input.actorHash)
    ));
    if (!ceremony) throw new Error("Passkey 验证会话无效或已过期。");
    const credential = store.credentials.find((item) => (
      item.credentialId === input.credentialId && !item.revokedAt
    ));
    if (!credential || credential.counter !== input.previousCounter) {
      throw new Error("Passkey 已被撤销或计数器发生冲突。");
    }
    ceremony.usedAt = now.toISOString();
    credential.counter = input.newCounter;
    credential.lastUsedAt = now.toISOString();
    return true;
  });
}

export async function exchangeAdminRecoveryCode(code: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return mutateStateDocument(passkeyDocument, (store) => {
    const recovery = store.recoveryCodes.find((item) => item.codeHash === hash(code) && !item.usedAt);
    if (!recovery) throw new Error("恢复码无效或已经使用。");
    recovery.usedAt = now.toISOString();
    store.enrollmentTokens.push({
      tokenHash: hash(token),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ENROLLMENT_TTL_MS).toISOString(),
      usedAt: null,
    });
    return { token, expiresAt: new Date(now.getTime() + ENROLLMENT_TTL_MS).toISOString() };
  });
}

export async function revokeAdminPasskey(credentialId: string, now = new Date()) {
  return mutateStateDocument(passkeyDocument, (store) => {
    const active = store.credentials.filter((item) => !item.revokedAt);
    const credential = active.find((item) => item.credentialId === credentialId);
    if (!credential) return false;
    if (active.length <= 1) throw new Error("不能撤销最后一个有效 Passkey；请先注册替代凭证。");
    credential.revokedAt = now.toISOString();
    return true;
  });
}
