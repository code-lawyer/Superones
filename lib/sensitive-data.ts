import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyForSensitiveData() {
  const configured = process.env.VAULT2077_DATA_KEY;
  if (configured && Buffer.byteLength(configured, "utf8") >= 32) {
    return createHash("sha256").update(configured).digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须设置至少 32 字节的 VAULT2077_DATA_KEY。");
  }
  return createHash("sha256").update("vault2077-local-development-key").digest();
}

export function encryptSensitiveText(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyForSensitiveData(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSensitiveText(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("敏感数据格式无效。");
  const decipher = createDecipheriv("aes-256-gcm", keyForSensitiveData(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
