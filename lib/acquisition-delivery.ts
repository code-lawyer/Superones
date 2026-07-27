import { createHmac } from "node:crypto";
import type { AcquisitionBatch } from "./acquisition-contract.ts";
import { payloadHash, signingInput } from "./batch-signing.ts";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export type AcquisitionDeliveryReceipt = {
  attempt: number;
  status: number;
  body: unknown;
};

type FetchAdapter = typeof fetch;

function retryDelayMs(response: Response | null, attempt: number, baseDelayMs: number) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(30_000, Number(retryAfter) * 1_000);
  }
  return Math.min(30_000, baseDelayMs * (2 ** (attempt - 1)));
}

function signedHeaders(input: {
  keyId: string;
  secret: string;
  batchId: string;
  rawPayload: string;
  timestamp: string;
}) {
  const bodyHash = payloadHash(input.rawPayload);
  const signature = createHmac("sha256", input.secret)
    .update(signingInput(input.timestamp, input.batchId, bodyHash))
    .digest("base64url");
  return {
    "content-type": "application/json",
    "x-vault2077-batch-id": input.batchId,
    "x-vault2077-key-id": input.keyId,
    "x-vault2077-timestamp": input.timestamp,
    "x-vault2077-signature": `sha256=${signature}`,
  };
}

export async function deliverAcquisitionBatch(input: {
  url: string;
  keyId: string;
  secret: string;
  batch: Pick<AcquisitionBatch, "batchId">;
  rawPayload: string;
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  fetcher?: FetchAdapter;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}): Promise<AcquisitionDeliveryReceipt> {
  const requestedAttempts = Number.isFinite(input.attempts) ? input.attempts as number : 4;
  const requestedTimeout = Number.isFinite(input.timeoutMs) ? input.timeoutMs as number : 60_000;
  const requestedBaseDelay = Number.isFinite(input.baseDelayMs) ? input.baseDelayMs as number : 1_000;
  const attempts = Math.max(1, Math.min(8, Math.floor(requestedAttempts)));
  const timeoutMs = Math.max(1_000, Math.min(120_000, Math.floor(requestedTimeout)));
  const baseDelayMs = Math.max(10, Math.min(10_000, Math.floor(requestedBaseDelay)));
  const fetcher = input.fetcher ?? fetch;
  const wait = input.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const timestamp = String(Math.floor((input.now?.() ?? Date.now()) / 1_000));
    let response: Response | null = null;
    try {
      response = await fetcher(input.url, {
        method: "POST",
        headers: signedHeaders({
          keyId: input.keyId,
          secret: input.secret,
          batchId: input.batch.batchId,
          rawPayload: input.rawPayload,
          timestamp,
        }),
        body: input.rawPayload,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const rawBody = await response.text();
      if (response.ok) {
        let body: unknown = null;
        try {
          body = rawBody ? JSON.parse(rawBody) as unknown : null;
        } catch {
          throw new Error("境内接收端返回了无效 JSON。");
        }
        return { attempt, status: response.status, body };
      }
      lastError = new Error(`统一接收返回 HTTP ${response.status}：${rawBody.slice(0, 500)}`);
      if (!RETRYABLE_STATUS.has(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
      if (
        response
        && !RETRYABLE_STATUS.has(response.status)
      ) {
        throw error;
      }
    }
    if (attempt < attempts) await wait(retryDelayMs(response, attempt, baseDelayMs));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("统一采集批次投递失败。");
}
