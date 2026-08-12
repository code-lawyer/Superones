import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OSS from "ali-oss";
import { isValidOpcOrderReference } from "./opc-order-reference.ts";

type StorageMode = "local" | "oss";

export type OpcContractArchiveRecord = {
  status: "pending" | "archived" | "failed";
  objectKey: string | null;
  manifestKey: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  verifiedAt: string | null;
  archivedAt: string | null;
  retainUntil: string | null;
  evidence: Array<{ fileHash: string; transactionId: string; transactionHash: string }>;
  failureReason: string | null;
};

export type OpcContractArchiveManifest = {
  schemaVersion: 1;
  orderReference: string;
  signFlowId: string;
  providerFileId: string;
  sha256: string;
  sizeBytes: number;
  verifiedAt: string;
  archivedAt: string;
  retainUntil: string;
  signerCount: number;
  evidence: OpcContractArchiveRecord["evidence"];
};

const objectKeyPattern = /^opc-contracts\/\d{4}\/OPC-\d{8}-[0-9A-F]{12}\/[a-f0-9]{64}\.(?:pdf|json)$/;

function storageMode(): StorageMode {
  const configured = process.env.VAULT2077_OPC_CONTRACT_ARCHIVE_STORAGE?.trim().toLowerCase();
  if (configured === "local" || configured === "oss") return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 VAULT2077_OPC_CONTRACT_ARCHIVE_STORAGE=oss。");
  }
  return "local";
}

function localRoot() {
  const configured = process.env.VAULT2077_OPC_CONTRACT_ARCHIVE_DIR?.trim();
  if (configured) return path.resolve(configured);
  const dataRoot = process.env.VAULT2077_DATA_DIR?.trim();
  return path.resolve(dataRoot || path.join(process.cwd(), "data"), "opc-contract-archive");
}

function checkedLocalPath(key: string) {
  if (!objectKeyPattern.test(key)) throw new Error("OPC 合同归档对象 key 无效。");
  const root = localRoot();
  const target = path.resolve(root, ...key.split("/"));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("OPC 合同归档路径越界。");
  return target;
}

function requiredOssValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`OPC 合同归档缺少配置 ${name}。`);
  return value;
}

function ossClient() {
  return new OSS({
    region: requiredOssValue("VAULT2077_OPC_CONTRACT_OSS_REGION"),
    bucket: requiredOssValue("VAULT2077_OPC_CONTRACT_OSS_BUCKET"),
    accessKeyId: requiredOssValue("VAULT2077_OPC_CONTRACT_OSS_ACCESS_KEY_ID"),
    accessKeySecret: requiredOssValue("VAULT2077_OPC_CONTRACT_OSS_ACCESS_KEY_SECRET"),
    internal: process.env.VAULT2077_OPC_CONTRACT_OSS_INTERNAL === "true",
    secure: true,
    timeout: 30_000,
  });
}

async function putImmutableObject(key: string, contents: Buffer, contentType: string, sha256: string) {
  if (!objectKeyPattern.test(key)) throw new Error("OPC 合同归档对象 key 无效。");
  if (storageMode() === "oss") {
    await ossClient().put(key, contents, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "x-oss-object-acl": "private",
        "x-oss-forbid-overwrite": "true",
        "x-oss-meta-sha256": sha256,
      },
    });
    return;
  }
  const target = checkedLocalPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await writeFile(target, contents, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

export function opcContractArchiveConfigurationErrors(
  environment: Record<string, string | undefined> = process.env,
) {
  const errors: string[] = [];
  if (environment.VAULT2077_OPC_CONTRACT_ARCHIVE_STORAGE !== "oss") {
    errors.push("VAULT2077_OPC_CONTRACT_ARCHIVE_STORAGE 必须设为 oss。");
  }
  const region = environment.VAULT2077_OPC_CONTRACT_OSS_REGION?.trim() ?? "";
  const bucket = environment.VAULT2077_OPC_CONTRACT_OSS_BUCKET?.trim() ?? "";
  if (!/^oss-[a-z0-9-]+$/.test(region)) errors.push("合同归档 OSS 地域无效。");
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) errors.push("合同归档 OSS Bucket 名称无效。");
  if (bucket && bucket === environment.VAULT2077_OSS_BUCKET?.trim()) errors.push("合同归档不得复用公开媒体 Bucket。");
  if (!environment.VAULT2077_OPC_CONTRACT_OSS_ACCESS_KEY_ID?.trim()) errors.push("合同归档 OSS AccessKey ID 未配置。");
  if (!environment.VAULT2077_OPC_CONTRACT_OSS_ACCESS_KEY_SECRET?.trim()) errors.push("合同归档 OSS AccessKey Secret 未配置。");
  if (!['true', 'false'].includes(environment.VAULT2077_OPC_CONTRACT_OSS_INTERNAL ?? "")) errors.push("合同归档 OSS 内网开关必须明确配置。");
  if (environment.VAULT2077_OPC_CONTRACT_RETENTION_YEARS !== "10") errors.push("合同归档保留期必须明确配置为 10 年。");
  if (environment.VAULT2077_OPC_CONTRACT_RETENTION_LOCKED !== "true") errors.push("合同归档 Bucket 必须先启用并验收 10 年保留锁，再设置 VAULT2077_OPC_CONTRACT_RETENTION_LOCKED=true。");
  return errors;
}

export async function putOpcContractArchive(input: {
  reference: string;
  pdf: Buffer;
  manifest: Omit<OpcContractArchiveManifest, "archivedAt" | "retainUntil" | "sizeBytes">;
}) {
  if (!isValidOpcOrderReference(input.reference)) throw new Error("OPC 订单号无效。");
  if (input.pdf.length < 8 || input.pdf.length > 60 * 1024 * 1024 || !input.pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("待归档文件不是有效且大小受控的 PDF。");
  }
  const archivedAt = new Date().toISOString();
  const retainUntilDate = new Date(archivedAt);
  retainUntilDate.setUTCFullYear(retainUntilDate.getUTCFullYear() + 10);
  const retainUntil = retainUntilDate.toISOString();
  const year = input.reference.slice(4, 8);
  const base = `opc-contracts/${year}/${input.reference}/${input.manifest.sha256}`;
  const objectKey = `${base}.pdf`;
  const manifestKey = `${base}.json`;
  const manifest: OpcContractArchiveManifest = {
    ...input.manifest,
    sizeBytes: input.pdf.length,
    archivedAt,
    retainUntil,
  };
  await putImmutableObject(objectKey, input.pdf, "application/pdf", input.manifest.sha256);
  await putImmutableObject(
    manifestKey,
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    "application/json; charset=utf-8",
    input.manifest.sha256,
  );
  return { objectKey, manifestKey, archivedAt, retainUntil, sizeBytes: input.pdf.length };
}

export async function readOpcContractArchive(objectKey: string) {
  if (!objectKeyPattern.test(objectKey) || !objectKey.endsWith(".pdf")) throw new Error("OPC 合同归档对象 key 无效。");
  if (storageMode() === "local") return readFile(checkedLocalPath(objectKey));
  const result = await ossClient().get(objectKey);
  const content = (result as unknown as { content?: Buffer }).content;
  if (!Buffer.isBuffer(content)) throw new Error("OPC 合同归档读取结果无效。");
  return content;
}
