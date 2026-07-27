import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { decryptSensitiveText, encryptSensitiveText } from "../lib/sensitive-data.ts";

function withDataKeys<T>(keys: Record<string, string>, activeKeyId: string, operation: () => T) {
  const previousKeys = process.env.VAULT2077_DATA_KEYS;
  const previousActive = process.env.VAULT2077_DATA_ACTIVE_KEY_ID;
  const previousLegacy = process.env.VAULT2077_DATA_KEY;
  process.env.VAULT2077_DATA_KEYS = JSON.stringify(keys);
  process.env.VAULT2077_DATA_ACTIVE_KEY_ID = activeKeyId;
  delete process.env.VAULT2077_DATA_KEY;
  try {
    return operation();
  } finally {
    if (previousKeys === undefined) delete process.env.VAULT2077_DATA_KEYS;
    else process.env.VAULT2077_DATA_KEYS = previousKeys;
    if (previousActive === undefined) delete process.env.VAULT2077_DATA_ACTIVE_KEY_ID;
    else process.env.VAULT2077_DATA_ACTIVE_KEY_ID = previousActive;
    if (previousLegacy === undefined) delete process.env.VAULT2077_DATA_KEY;
    else process.env.VAULT2077_DATA_KEY = previousLegacy;
  }
}

test("sensitive ciphertext records its key version and survives active-key rotation", () => {
  const keys = {
    "2026-07": "a".repeat(40),
    "2026-10": "b".repeat(40),
  };
  const ciphertext = withDataKeys(keys, "2026-07", () => encryptSensitiveText("owner@example.com"));
  assert.match(ciphertext, /^v1\.2026-07\./);
  const decrypted = withDataKeys(keys, "2026-10", () => decryptSensitiveText(ciphertext));
  assert.equal(decrypted, "owner@example.com");
});

test("legacy ciphertext remains readable while its old key is retained", () => {
  const oldSecret = "o".repeat(40);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(oldSecret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update("legacy@example.com", "utf8"), cipher.final()]);
  const legacy = [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
  const decrypted = withDataKeys(
    { old: oldSecret, current: "n".repeat(40) },
    "current",
    () => decryptSensitiveText(legacy),
  );
  assert.equal(decrypted, "legacy@example.com");
});
