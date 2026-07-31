import "server-only";

import { recordAuditEvent } from "./security-audit.ts";

export type AdminPasskeyAuditAction =
  | "admin.login"
  | "admin.reauthenticate"
  | "admin.passkey.register"
  | "admin.passkey.recover"
  | "admin.passkey.revoke";

export function adminPasskeyRejectionReason(error: unknown, fallback = "passkey-proof-rejected") {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 120);
  }
  return fallback;
}

export function recordRejectedAdminPasskeyEvent(input: {
  actorHash: string;
  action: AdminPasskeyAuditAction;
  targetType: "session" | "credential";
  targetId: string;
  reason: string;
}) {
  return recordAuditEvent({
    ...input,
    result: "rejected",
    diff: { mode: "passkey" },
  });
}

export const recordRejectedAdminPasskeyProof = recordRejectedAdminPasskeyEvent;
