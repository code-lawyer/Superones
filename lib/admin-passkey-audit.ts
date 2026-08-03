import "server-only";

import { recordAuditEvent } from "./security-audit.ts";

export type AdminPasskeyAuditAction =
  | "admin.login"
  | "admin.reauthenticate"
  | "admin.passkey.register"
  | "admin.passkey.recover"
  | "admin.passkey.revoke";

const sanitizedWebAuthnReasons: Array<[RegExp, string]> = [
  [/unexpected authentication response challenge/i, "webauthn-challenge-mismatch"],
  [/unexpected authentication response origin/i, "webauthn-origin-mismatch"],
  [/unexpected rp id hash/i, "webauthn-rp-id-mismatch"],
  [/response counter value .* lower than expected/i, "webauthn-counter-replay"],
  [/user verification required|pin .* biometric|user could not be verified/i, "webauthn-user-verification-missing"],
  [/user not present/i, "webauthn-user-presence-missing"],
  [/passkey .* does not exist|passkey .* revoked/i, "webauthn-credential-not-found"],
  [/public key|\bcose\b|unsupported.*algorithm|unknown cose curve|signature verification with public key/i, "webauthn-credential-key-invalid"],
  [/credential id|credential missing response|clientdatajson|authenticatordata|signature was not a base64url|string.*userhandle|tokenbinding/i, "webauthn-response-invalid"],
];

export function adminPasskeyRejectionReason(error: unknown, fallback = "passkey-proof-rejected") {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 120);
  }
  if (error instanceof Error) {
    if (error.name === "UnexpectedRPIDHash") return "webauthn-rp-id-mismatch";
    for (const [pattern, reason] of sanitizedWebAuthnReasons) {
      if (pattern.test(error.message)) return reason;
    }
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
