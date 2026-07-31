import "server-only";

import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import type { RangerAvatarAsset } from "./ranger-avatar.ts";
import { putRangerMediaObject, rangerMediaObjectExists } from "./ranger-avatar-storage.ts";

export const MAX_RANGER_AVATAR_UPLOAD_BYTES = 5_000_000;
export const MAX_RANGER_AVATAR_MULTIPART_BYTES = MAX_RANGER_AVATAR_UPLOAD_BYTES + 250_000;
const MAX_INPUT_PIXELS = 25_000_000;
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class RangerAvatarImageError extends Error {
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "RangerAvatarImageError";
    this.status = status;
  }
}

export function assertRangerAvatarMultipartLength(headers: Headers) {
  const rawLength = headers.get("content-length")?.trim();
  if (headers.has("transfer-encoding") || !rawLength || !/^[1-9]\d*$/.test(rawLength)) {
    throw new RangerAvatarImageError("头像上传必须提供可验证的 Content-Length。", 411);
  }
  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength > MAX_RANGER_AVATAR_MULTIPART_BYTES) {
    throw new RangerAvatarImageError("头像文件必须小于 5MB。", 413);
  }
  return contentLength;
}

function safeRangerSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new RangerAvatarImageError("请先填写有效的游骑兵 slug，再上传头像。");
  }
  return normalized;
}

async function renderSquare(input: Buffer, size: 320 | 800) {
  return sharp(input, { animated: false, failOn: "warning", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .toColourspace("srgb")
    .resize(size, size, { fit: "cover", position: "attention", withoutEnlargement: false })
    .webp({ quality: 84, effort: 5, smartSubsample: true })
    .toBuffer();
}

export async function processAndStoreRangerAvatar(input: Buffer, slug: string): Promise<RangerAvatarAsset> {
  if (!input.length || input.length > MAX_RANGER_AVATAR_UPLOAD_BYTES) {
    throw new RangerAvatarImageError("头像文件必须小于 5MB。");
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input, { animated: false, failOn: "warning", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new RangerAvatarImageError("图片无法解析或已损坏。");
  }
  if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
    throw new RangerAvatarImageError("头像仅支持 PNG、JPEG 或 WEBP 图片。");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new RangerAvatarImageError("头像不支持动画图片。");
  }
  if (!metadata.width || !metadata.height || metadata.width < 320 || metadata.height < 320) {
    throw new RangerAvatarImageError("头像宽高均不得小于 320px。");
  }
  if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw new RangerAvatarImageError("头像像素总量过大。");
  }

  const normalizedSlug = safeRangerSlug(slug);
  const [small, large] = await Promise.all([renderSquare(input, 320), renderSquare(input, 800)]);
  const sha256 = createHash("sha256").update(large).digest("hex");
  const prefix = `rangers/${normalizedSlug}/${sha256}`;
  const asset: RangerAvatarAsset = {
    schemaVersion: 1,
    smallKey: `${prefix}/avatar-320.webp`,
    largeKey: `${prefix}/avatar-800.webp`,
    sha256,
    width: 800,
    height: 800,
    updatedAt: new Date().toISOString(),
  };
  await Promise.all([
    putRangerMediaObject(asset.smallKey, small, sha256),
    putRangerMediaObject(asset.largeKey, large, sha256),
  ]);
  return asset;
}

export async function missingRangerAvatarObjectKeys(asset: RangerAvatarAsset) {
  const [smallExists, largeExists] = await Promise.all([
    rangerMediaObjectExists(asset.smallKey, asset.sha256),
    rangerMediaObjectExists(asset.largeKey, asset.sha256),
  ]);
  return [
    ...(smallExists ? [] : [asset.smallKey]),
    ...(largeExists ? [] : [asset.largeKey]),
  ];
}
