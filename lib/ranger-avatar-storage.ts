import "server-only";

import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OSS from "ali-oss";
import { RANGER_MEDIA_ORIGIN } from "./legal-profile.ts";
import { isRangerAvatarObjectKey } from "./ranger-avatar.ts";

type StorageMode = "local" | "oss";

export type RangerMediaObject = {
  key: string;
  lastModified: string;
};

type OssObjectVersion = RangerMediaObject & {
  versionId: string;
};

export type RangerMediaVersionListResult = {
  objects?: Array<{ name: string; lastModified: string; versionId: string }>;
  deleteMarker?: Array<{ name: string; lastModified: string; versionId: string }>;
  isTruncated: boolean;
  nextKeyMarker?: string | null;
  nextVersionIdMarker?: string | null;
};

export type RangerMediaVersionClient = {
  listObjectVersions: (
    query: Record<string, string | number>,
  ) => Promise<RangerMediaVersionListResult>;
  delete: (key: string, options?: { versionId?: string }) => Promise<unknown>;
};

function storageMode(): StorageMode {
  const configured = process.env.VAULT2077_RANGER_MEDIA_STORAGE?.trim().toLowerCase();
  if (configured === "local" || configured === "oss") return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 VAULT2077_RANGER_MEDIA_STORAGE=oss。");
  }
  return "local";
}

function localMediaRoot() {
  const configured = process.env.VAULT2077_RANGER_MEDIA_DIR?.trim();
  if (configured) return path.resolve(configured);
  const dataRoot = process.env.VAULT2077_DATA_DIR?.trim();
  return path.resolve(dataRoot || path.join(process.cwd(), "data"), "ranger-media");
}

function checkedLocalPath(key: string) {
  if (!isRangerAvatarObjectKey(key)) throw new Error("游骑兵头像对象 key 无效。");
  const root = localMediaRoot();
  const target = path.resolve(root, ...key.split("/"));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("游骑兵头像对象路径越界。");
  return target;
}

function checkedRangerPrefix(slug?: string) {
  if (slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("游骑兵 slug 无效。");
  }
  return slug ? `rangers/${slug}/` : "rangers/";
}

function requiredOssValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`OSS 存储缺少配置 ${name}。`);
  return value;
}

function ossClient() {
  return new OSS({
    region: requiredOssValue("VAULT2077_OSS_REGION"),
    bucket: requiredOssValue("VAULT2077_OSS_BUCKET"),
    accessKeyId: requiredOssValue("VAULT2077_OSS_ACCESS_KEY_ID"),
    accessKeySecret: requiredOssValue("VAULT2077_OSS_ACCESS_KEY_SECRET"),
    internal: process.env.VAULT2077_OSS_INTERNAL === "true",
    secure: true,
    timeout: 15_000,
  });
}

export function publicRangerMediaOrigin() {
  if (storageMode() === "local") return "";
  const origin = requiredOssValue("VAULT2077_OSS_PUBLIC_ORIGIN").replace(/\/$/, "");
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.origin !== origin) {
    throw new Error("VAULT2077_OSS_PUBLIC_ORIGIN 必须是不带路径的 HTTPS origin。");
  }
  if (process.env.NODE_ENV === "production" && origin !== RANGER_MEDIA_ORIGIN) {
    throw new Error(`VAULT2077_OSS_PUBLIC_ORIGIN 必须使用 ${RANGER_MEDIA_ORIGIN}。`);
  }
  return origin;
}

export async function putRangerMediaObject(key: string, contents: Buffer, sha256?: string) {
  if (!isRangerAvatarObjectKey(key)) throw new Error("游骑兵头像对象 key 无效。");
  if (storageMode() === "oss") {
    await ossClient().put(key, contents, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        ...(sha256 ? { "x-oss-meta-sha256": sha256 } : {}),
      },
    });
    return;
  }

  const target = checkedLocalPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { flag: "wx" });
  await rename(temporary, target);
}

export async function rangerMediaObjectExists(key: string, expectedSha256?: string) {
  if (!isRangerAvatarObjectKey(key)) return false;
  if (storageMode() === "oss") {
    try {
      const result = await ossClient().head(key);
      return !expectedSha256 || result.meta.sha256 === expectedSha256;
    } catch (error) {
      const status = (error as { status?: number; statusCode?: number }).status
        ?? (error as { statusCode?: number }).statusCode;
      if (status === 404) return false;
      throw error;
    }
  }
  try {
    const info = await stat(checkedLocalPath(key));
    return info.isFile() && info.size > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function readLocalRangerMediaObject(key: string) {
  if (storageMode() !== "local") throw new Error("生产媒体由 OSS 直接提供。");
  return readFile(checkedLocalPath(key));
}

async function listLocalRangerMediaObjects(prefix: string) {
  const root = localMediaRoot();
  const objects: RangerMediaObject[] = [];

  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    await Promise.all(entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return visit(target);
      if (!entry.isFile()) return;
      const key = path.relative(root, target).split(path.sep).join("/");
      if (!key.startsWith(prefix) || !isRangerAvatarObjectKey(key)) return;
      const info = await stat(target);
      objects.push({ key, lastModified: info.mtime.toISOString() });
    }));
  }

  await visit(path.join(root, ...prefix.split("/").filter(Boolean)));
  return objects.sort((left, right) => left.key.localeCompare(right.key));
}

export async function listRangerMediaObjects(slug?: string): Promise<RangerMediaObject[]> {
  const prefix = checkedRangerPrefix(slug);
  if (storageMode() === "local") return listLocalRangerMediaObjects(prefix);

  const client = ossClient();
  const objects: RangerMediaObject[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await client.listV2({
      prefix,
      "max-keys": 1000,
      ...(continuationToken ? { "continuation-token": continuationToken } : {}),
    });
    for (const item of result.objects ?? []) {
      if (isRangerAvatarObjectKey(item.name)) {
        objects.push({ key: item.name, lastModified: item.lastModified });
      }
    }
    continuationToken = result.isTruncated ? result.nextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

async function listOssRangerMediaVersions(client: RangerMediaVersionClient, prefix: string) {
  const versions: OssObjectVersion[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  do {
    const result = await client.listObjectVersions({
      prefix,
      "max-keys": 1000,
      ...(keyMarker ? { keyMarker } : {}),
      ...(versionIdMarker ? { versionIdMarker } : {}),
    });
    for (const item of [...(result.objects ?? []), ...(result.deleteMarker ?? [])]) {
      if (isRangerAvatarObjectKey(item.name)) {
        versions.push({ key: item.name, lastModified: item.lastModified, versionId: item.versionId });
      }
    }
    keyMarker = result.isTruncated ? result.nextKeyMarker ?? undefined : undefined;
    versionIdMarker = result.isTruncated ? result.nextVersionIdMarker ?? undefined : undefined;
  } while (keyMarker);
  return versions;
}

async function deleteOssRangerMediaObject(client: RangerMediaVersionClient, key: string) {
  await client.delete(key);
  const versions = (await listOssRangerMediaVersions(client, key)).filter((item) => item.key === key);
  await Promise.all(versions.map((item) => client.delete(key, { versionId: item.versionId })));
}

export async function deleteRangerMediaObject(key: string) {
  if (!isRangerAvatarObjectKey(key)) throw new Error("游骑兵头像对象 key 无效。");
  if (storageMode() === "oss") {
    const client = ossClient() as unknown as RangerMediaVersionClient;
    await deleteOssRangerMediaObject(client, key);
    return;
  }
  try {
    await unlink(checkedLocalPath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function deleteRangerMediaObjectsForSlug(slug: string) {
  const prefix = checkedRangerPrefix(slug);
  const keys = storageMode() === "oss"
    ? Array.from(new Set((await listOssRangerMediaVersions(
      ossClient() as unknown as RangerMediaVersionClient,
      prefix,
    )).map((object) => object.key)))
    : (await listRangerMediaObjects(slug)).map((object) => object.key);
  await Promise.all(keys.map(deleteRangerMediaObject));
  return keys;
}

export const rangerAvatarStorageTestUtils = {
  deleteOssRangerMediaObject,
  listOssRangerMediaVersions,
};
