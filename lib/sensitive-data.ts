import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sensitiveDataKeyring } from "./secret-keyring.ts";

function derivedKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptSensitiveText(value: string) {
  const keyring = sensitiveDataKeyring();
  const secret = keyring.keys.get(keyring.activeKeyId);
  if (!secret) throw new Error("活动敏感数据密钥不存在。");
  const iv = randomBytes(12);
  const header = `v1.${keyring.activeKeyId}`;
  const cipher = createCipheriv("aes-256-gcm", derivedKey(secret), iv);
  cipher.setAAD(Buffer.from(header, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    header,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decrypt(
  secret: string,
  ivValue: string,
  tagValue: string,
  encryptedValue: string,
  aad?: string,
) {
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(secret), Buffer.from(ivValue, "base64url"));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptSensitiveText(value: string) {
  const parts = value.split(".");
  const keyring = sensitiveDataKeyring();
  if (parts.length === 5 && parts[0] === "v1") {
    const [, keyId, ivValue, tagValue, encryptedValue] = parts;
    const secret = keyring.keys.get(keyId);
    if (!secret || !ivValue || !tagValue || !encryptedValue) {
      throw new Error("敏感数据格式或密钥版本无效。");
    }
    return decrypt(secret, ivValue, tagValue, encryptedValue, `v1.${keyId}`);
  }
  if (parts.length === 3) {
    const [ivValue, tagValue, encryptedValue] = parts;
    for (const secret of keyring.keys.values()) {
      try {
        return decrypt(secret, ivValue, tagValue, encryptedValue);
      } catch {
        // Legacy ciphertext has no key ID. Try each retained rotation key.
      }
    }
  }
  throw new Error("敏感数据格式或密钥版本无效。");
}
