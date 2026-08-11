import "server-only";

import { createHash } from "node:crypto";
import { LEGAL_OPERATOR_NAME } from "./legal-profile.ts";
import {
  mutateStateDocument,
  readStateDocument,
  type StateDocumentDefinition,
} from "./state-document-store.ts";

const maximumAgreementBytes = 5 * 1024 * 1024;
const maximumContactQrBytes = 2 * 1024 * 1024;

export type OpcOfflinePaymentAccount = {
  name: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  cnapsCode: string;
};

export type PublicOpcOfflinePaymentProfile = {
  revision: string;
  publishedAt: string;
  account: OpcOfflinePaymentAccount;
  agreement: { fileName: string; sha256: string; href: string };
  contactQr: {
    fileName: string;
    mediaType: "image/png" | "image/jpeg" | "image/webp";
    sha256: string;
    href: string;
  };
};

type StoredAsset = {
  fileName: string;
  mediaType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  bytesBase64: string;
  sha256: string;
};

type StoredProfile = {
  revision: string;
  publishedAt: string;
  account: OpcOfflinePaymentAccount;
  agreement: StoredAsset & { mediaType: "application/pdf" };
  contactQr: StoredAsset & { mediaType: "image/png" | "image/jpeg" | "image/webp" };
};

type ProfileStore = {
  version: 2;
  published: StoredProfile | null;
  revisionFingerprints: Record<string, string>;
};

const definition: StateDocumentDefinition<ProfileStore> = {
  namespace: "opc-offline-payment-profile",
  fileName: "opc-offline-payment-profile.json",
  create: () => ({ version: 2, published: null, revisionFingerprints: {} }),
  parse(value) {
    const parsed = value as {
      version?: number;
      published?: StoredProfile | null;
      revisionFingerprints?: Record<string, string>;
    };
    if (
      (parsed.version !== 1 && parsed.version !== 2)
      || (parsed.published !== null && typeof parsed.published !== "object")
    ) {
      throw new Error("OPC 线下付款资料格式无效。");
    }
    const published = parsed.published ?? null;
    const revisionFingerprints = parsed.version === 2 && parsed.revisionFingerprints
      ? parsed.revisionFingerprints
      : published
        ? { [published.revision]: profileContentFingerprint(published) }
        : {};
    return { version: 2, published, revisionFingerprints };
  },
};

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function cleanFileName(value: string, extensionPattern: RegExp) {
  const fileName = value.trim();
  if (!/^[^\\/:*?"<>|]{1,120}$/.test(fileName) || !extensionPattern.test(fileName)) {
    throw new Error("OPC 线下付款资产文件名无效。");
  }
  return fileName;
}

function validateAccount(account: OpcOfflinePaymentAccount) {
  const normalized = {
    name: account.name.trim(),
    bankName: account.bankName.trim(),
    branchName: account.branchName.trim(),
    accountNumber: account.accountNumber.replace(/\s+/g, ""),
    cnapsCode: account.cnapsCode.replace(/\s+/g, ""),
  };
  if (normalized.name !== LEGAL_OPERATOR_NAME) throw new Error("企业收款户名必须与网站经营主体一致。");
  if (normalized.bankName.length < 2 || normalized.branchName.length < 2) throw new Error("企业开户银行信息不完整。");
  if (!/^\d{8,32}$/.test(normalized.accountNumber)) throw new Error("企业银行账号格式无效。");
  if (normalized.cnapsCode && !/^\d{12}$/.test(normalized.cnapsCode)) throw new Error("开户行联行号格式无效。");
  return normalized;
}

function validateAgreement(fileName: string, bytes: Buffer) {
  if (bytes.length < 20 || bytes.length > maximumAgreementBytes || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("服务协议必须是大小受控的有效 PDF 文件。");
  }
  return {
    fileName: cleanFileName(fileName, /\.pdf$/i),
    mediaType: "application/pdf" as const,
    bytesBase64: bytes.toString("base64"),
    sha256: sha256(bytes),
  };
}

function validateContactQr(
  fileName: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp",
  bytes: Buffer,
) {
  if (bytes.length < 20 || bytes.length > maximumContactQrBytes) throw new Error("联系人二维码图片大小无效。");
  const validMagic = mediaType === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mediaType === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!validMagic) throw new Error("联系人二维码图片内容与媒体类型不一致。");
  return {
    fileName: cleanFileName(fileName, mediaType === "image/png" ? /\.png$/i : mediaType === "image/jpeg" ? /\.jpe?g$/i : /\.webp$/i),
    mediaType,
    bytesBase64: bytes.toString("base64"),
    sha256: sha256(bytes),
  };
}

function profileContentFingerprint(profile: StoredProfile) {
  const content = JSON.stringify({
    account: profile.account,
    agreement: {
      fileName: profile.agreement.fileName,
      mediaType: profile.agreement.mediaType,
      sha256: profile.agreement.sha256,
    },
    contactQr: {
      fileName: profile.contactQr.fileName,
      mediaType: profile.contactQr.mediaType,
      sha256: profile.contactQr.sha256,
    },
  });
  return sha256(Buffer.from(content));
}

export async function publishOpcOfflinePaymentProfile(input: {
  revision: string;
  account: OpcOfflinePaymentAccount;
  agreement: { fileName: string; bytes: Buffer };
  contactQr: {
    fileName: string;
    mediaType: "image/png" | "image/jpeg" | "image/webp";
    bytes: Buffer;
  };
  publishedAt?: string;
}) {
  const revision = input.revision.trim();
  if (!/^[a-z0-9][a-z0-9._-]{5,79}$/i.test(revision)) throw new Error("线下付款资料修订号无效。");
  const publishedAt = input.publishedAt ?? new Date().toISOString();
  if (!Number.isFinite(new Date(publishedAt).getTime())) throw new Error("线下付款资料发布时间无效。");
  const profile: StoredProfile = {
    revision,
    publishedAt,
    account: validateAccount(input.account),
    agreement: validateAgreement(input.agreement.fileName, input.agreement.bytes),
    contactQr: validateContactQr(input.contactQr.fileName, input.contactQr.mediaType, input.contactQr.bytes),
  };
  return mutateStateDocument(definition, (store) => {
    const fingerprint = profileContentFingerprint(profile);
    const knownFingerprint = store.revisionFingerprints[profile.revision];
    if (knownFingerprint && knownFingerprint !== fingerprint) {
      throw new Error("线下付款资料修订号已存在，内容变化时必须使用新修订号。");
    }
    if (store.published?.revision === profile.revision) {
      return store.published;
    }
    store.revisionFingerprints[profile.revision] = fingerprint;
    store.published = profile;
    return profile;
  });
}

export async function readPublishedOpcOfflinePaymentProfile(): Promise<PublicOpcOfflinePaymentProfile | null> {
  const profile = (await readStateDocument(definition)).published;
  if (!profile) return null;
  return {
    revision: profile.revision,
    publishedAt: profile.publishedAt,
    account: profile.account,
    agreement: {
      fileName: profile.agreement.fileName,
      sha256: profile.agreement.sha256,
      href: `/api/opc/offline-payment/assets/agreement?revision=${encodeURIComponent(profile.revision)}&v=${profile.agreement.sha256}`,
    },
    contactQr: {
      fileName: profile.contactQr.fileName,
      mediaType: profile.contactQr.mediaType,
      sha256: profile.contactQr.sha256,
      href: `/api/opc/offline-payment/assets/contact-qr?revision=${encodeURIComponent(profile.revision)}&v=${profile.contactQr.sha256}`,
    },
  };
}

export async function readPublishedOpcOfflinePaymentAsset(kind: "agreement" | "contact-qr") {
  const profile = (await readStateDocument(definition)).published;
  if (!profile) return null;
  const asset = kind === "agreement" ? profile.agreement : profile.contactQr;
  return {
    revision: profile.revision,
    fileName: asset.fileName,
    mediaType: asset.mediaType,
    sha256: asset.sha256,
    bytes: Buffer.from(asset.bytesBase64, "base64"),
  };
}
