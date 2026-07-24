import { createHash } from "node:crypto";

export function payloadHash(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

export function signingInput(timestamp: string, batchId: string, bodyHash: string) {
  return `${timestamp}.${batchId}.${bodyHash}`;
}
