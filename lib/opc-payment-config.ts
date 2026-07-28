import "server-only";

import { open, stat } from "node:fs/promises";
import path from "node:path";

export type OpcPaymentConfiguration = {
  provider: "支付宝";
  qrImagePath: string;
  payee: string;
};

function validPublicAssetPath(value: string) {
  return /^\/(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9/_-]+\.(?:png|webp|jpe?g)$/i.test(value);
}

export function readOpcPaymentConfiguration(
  environment: Record<string, string | undefined> = process.env,
): OpcPaymentConfiguration | null {
  const qrImagePath = environment.VAULT2077_OPC_ALIPAY_QR_PATH?.trim() ?? "";
  const payee = environment.VAULT2077_OPC_ALIPAY_PAYEE?.trim() ?? "";
  if (!validPublicAssetPath(qrImagePath) || payee.length < 2 || payee.length > 80) return null;
  return { provider: "支付宝", qrImagePath, payee };
}

function imageSignatureMatches(file: Buffer, extension: string) {
  if (extension === ".png") {
    return file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === ".webp") {
    return file.subarray(0, 4).toString("ascii") === "RIFF"
      && file.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
}

export async function opcPaymentAssetAvailable(configuration: OpcPaymentConfiguration) {
  const publicRoot = path.resolve(process.cwd(), "public");
  const target = path.resolve(publicRoot, configuration.qrImagePath.slice(1));
  if (path.dirname(target) === publicRoot || target.startsWith(`${publicRoot}${path.sep}`)) {
    try {
      const asset = await stat(target);
      if (!asset.isFile() || asset.size < 12 || asset.size > 2 * 1024 * 1024) return false;
      const handle = await open(target, "r");
      try {
        const signature = Buffer.alloc(12);
        const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
        return bytesRead === signature.length
          && imageSignatureMatches(signature, path.extname(target).toLowerCase());
      } finally {
        await handle.close();
      }
    } catch {
      return false;
    }
  }
  return false;
}

export async function opcOrderingAvailable(
  environment: Record<string, string | undefined> = process.env,
) {
  const configuration = readOpcPaymentConfiguration(environment);
  return configuration ? opcPaymentAssetAvailable(configuration) : false;
}

export async function requireOpcPaymentConfiguration() {
  const configuration = readOpcPaymentConfiguration();
  if (!configuration || !(await opcPaymentAssetAvailable(configuration))) {
    throw new Error("支付宝收款信息尚未完成生产配置，当前不能创建订单。");
  }
  return configuration;
}

export function isValidOpcPaymentAssetPath(value: string) {
  return validPublicAssetPath(value);
}
