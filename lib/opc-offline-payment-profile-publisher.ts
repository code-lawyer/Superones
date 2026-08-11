import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  publishOpcOfflinePaymentProfile,
  type OpcOfflinePaymentAccount,
} from "./opc-offline-payment-profile.ts";

type StagedProfile = {
  revision: string;
  account: OpcOfflinePaymentAccount;
  agreementFile: string;
  contactQrFile: string;
};

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 不能为空。`);
  if (/(^|[-_\s])REPLACE($|[-_\s])|待填写|示例|placeholder/i.test(value)) {
    throw new Error(`${field} 仍为占位值，禁止发布。`);
  }
  return value.trim();
}

function localAssetName(value: unknown, field: string) {
  const fileName = requiredString(value, field);
  if (path.basename(fileName) !== fileName) throw new Error(`${field} 必须是暂存目录内的文件名。`);
  return fileName;
}

function parseProfile(value: unknown): StagedProfile {
  if (!value || typeof value !== "object") throw new Error("payment-profile.json 格式无效。");
  const record = value as Record<string, unknown>;
  if (!record.account || typeof record.account !== "object") throw new Error("account 配置缺失。");
  const account = record.account as Record<string, unknown>;
  return {
    revision: requiredString(record.revision, "revision"),
    account: {
      name: requiredString(account.name, "account.name"),
      bankName: requiredString(account.bankName, "account.bankName"),
      branchName: requiredString(account.branchName, "account.branchName"),
      accountNumber: requiredString(account.accountNumber, "account.accountNumber"),
      cnapsCode: typeof account.cnapsCode === "string" ? account.cnapsCode.trim() : "",
    },
    agreementFile: localAssetName(record.agreementFile, "agreementFile"),
    contactQrFile: localAssetName(record.contactQrFile, "contactQrFile"),
  };
}

function imageMediaType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".png") return "image/png" as const;
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg" as const;
  if (extension === ".webp") return "image/webp" as const;
  throw new Error("contactQrFile 仅支持 PNG、JPEG 或 WebP。");
}

export async function publishOpcOfflinePaymentProfileFromDirectory(stagingDirectory: string) {
  const root = path.resolve(stagingDirectory);
  const profilePath = path.join(root, "payment-profile.json");
  const profile = parseProfile(JSON.parse(await readFile(profilePath, "utf8")));
  const agreementPath = path.join(root, profile.agreementFile);
  const contactQrPath = path.join(root, profile.contactQrFile);
  return publishOpcOfflinePaymentProfile({
    revision: profile.revision,
    account: profile.account,
    agreement: {
      fileName: profile.agreementFile,
      bytes: await readFile(agreementPath),
    },
    contactQr: {
      fileName: profile.contactQrFile,
      mediaType: imageMediaType(profile.contactQrFile),
      bytes: await readFile(contactQrPath),
    },
  });
}
