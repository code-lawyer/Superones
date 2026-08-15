import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  isRangerAvatarAsset,
  rangerAvatarPublicUrl,
} from "../lib/ranger-avatar.ts";
import {
  assertRangerAvatarMultipartLength,
  MAX_RANGER_AVATAR_MULTIPART_BYTES,
  MAX_RANGER_AVATAR_UPLOAD_BYTES,
  processAndStoreRangerAvatar,
  RangerAvatarImageError,
} from "../lib/ranger-avatar-image.ts";
import {
  rangerMediaObjectExists,
  readLocalRangerMediaObject,
  rangerAvatarStorageTestUtils,
  type RangerMediaVersionClient,
  type RangerMediaVersionListResult,
} from "../lib/ranger-avatar-storage.ts";

test("ranger avatar uploads require a bounded non-chunked multipart body", () => {
  assert.equal(assertRangerAvatarMultipartLength(new Headers({
    "content-length": String(MAX_RANGER_AVATAR_MULTIPART_BYTES),
  })), MAX_RANGER_AVATAR_MULTIPART_BYTES);
  for (const headers of [
    new Headers(),
    new Headers({ "transfer-encoding": "chunked" }),
    new Headers({ "content-length": "unknown" }),
  ]) {
    assert.throws(
      () => assertRangerAvatarMultipartLength(headers),
      (error: unknown) => error instanceof RangerAvatarImageError && error.status === 411,
    );
  }
  assert.throws(
    () => assertRangerAvatarMultipartLength(new Headers({
      "content-length": String(MAX_RANGER_AVATAR_MULTIPART_BYTES + 1),
    })),
    (error: unknown) => error instanceof RangerAvatarImageError && error.status === 413,
  );
});

test("OSS ranger avatar deletion paginates and permanently deletes versions and markers", async () => {
  const sha256 = "b".repeat(64);
  const key = `rangers/versioned-advisor/${sha256}/avatar-320.webp`;
  const pages: RangerMediaVersionListResult[] = [{
    objects: [{ name: key, lastModified: "2026-07-01T00:00:00.000Z", versionId: "v2" }],
    deleteMarker: [{ name: key, lastModified: "2026-07-02T00:00:00.000Z", versionId: "d1" }],
    isTruncated: true,
    nextKeyMarker: key,
    nextVersionIdMarker: "v2",
  }, {
    objects: [{ name: key, lastModified: "2026-06-01T00:00:00.000Z", versionId: "v1" }],
    isTruncated: false,
  }];
  const queries: Array<Record<string, string | number>> = [];
  const deletions: Array<{ key: string; versionId?: string }> = [];
  const client: RangerMediaVersionClient = {
    async listObjectVersions(query) {
      queries.push(query);
      const page = pages.shift();
      assert.ok(page);
      return page;
    },
    async delete(objectKey, options) {
      deletions.push({ key: objectKey, versionId: options?.versionId });
      return {};
    },
  };

  await rangerAvatarStorageTestUtils.deleteOssRangerMediaObject(client, key);

  assert.deepEqual(queries, [
    { prefix: key, "max-keys": 1000 },
    { prefix: key, "max-keys": 1000, keyMarker: key, versionIdMarker: "v2" },
  ]);
  assert.deepEqual(new Set(deletions.map((item) => item.versionId)), new Set([undefined, "v2", "d1", "v1"]));
  assert.ok(deletions.every((item) => item.key === key));
});

test("OSS ranger avatar deletion fails visibly when an exact version cannot be deleted", async () => {
  const sha256 = "c".repeat(64);
  const key = `rangers/versioned-advisor/${sha256}/avatar-800.webp`;
  const client: RangerMediaVersionClient = {
    async listObjectVersions() {
      return {
        objects: [{ name: key, lastModified: "2026-07-01T00:00:00.000Z", versionId: "blocked" }],
        isTruncated: false,
      };
    },
    async delete(_objectKey, options) {
      if (options?.versionId === "blocked") throw new Error("version-delete-denied");
      return {};
    },
  };

  await assert.rejects(
    rangerAvatarStorageTestUtils.deleteOssRangerMediaObject(client, key),
    /version-delete-denied/,
  );
});

test("ranger avatar processing creates immutable local WebP variants", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vault2077-ranger-avatar-"));
  const previousStorage = process.env.VAULT2077_RANGER_MEDIA_STORAGE;
  const previousDirectory = process.env.VAULT2077_RANGER_MEDIA_DIR;
  process.env.VAULT2077_RANGER_MEDIA_STORAGE = "local";
  process.env.VAULT2077_RANGER_MEDIA_DIR = directory;
  try {
    const input = await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#a65f35" },
    }).jpeg({ quality: 90 }).toBuffer();
    const asset = await processAndStoreRangerAvatar(input, "legal-advisor-1");

    assert.equal(isRangerAvatarAsset(asset), true);
    assert.match(asset.smallKey, /^rangers\/legal-advisor-1\/[0-9a-f]{64}\/avatar-320\.webp$/);
    assert.equal(await rangerMediaObjectExists(asset.smallKey), true);
    assert.equal(await rangerMediaObjectExists(asset.largeKey), true);
    assert.equal(rangerAvatarPublicUrl(asset, "small"), `/media/${asset.smallKey}`);
    assert.equal(
      rangerAvatarPublicUrl(asset, "large", "https://media.superones.top/"),
      `https://media.superones.top/${asset.largeKey}`,
    );

    const smallMetadata = await sharp(await readLocalRangerMediaObject(asset.smallKey)).metadata();
    const largeMetadata = await sharp(await readLocalRangerMediaObject(asset.largeKey)).metadata();
    assert.deepEqual([smallMetadata.format, smallMetadata.width, smallMetadata.height], ["webp", 320, 320]);
    assert.deepEqual([largeMetadata.format, largeMetadata.width, largeMetadata.height], ["webp", 800, 800]);
  } finally {
    if (previousStorage === undefined) delete process.env.VAULT2077_RANGER_MEDIA_STORAGE;
    else process.env.VAULT2077_RANGER_MEDIA_STORAGE = previousStorage;
    if (previousDirectory === undefined) delete process.env.VAULT2077_RANGER_MEDIA_DIR;
    else process.env.VAULT2077_RANGER_MEDIA_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});

test("ranger avatar processing rejects invalid inputs before storage", async () => {
  await assert.rejects(
    () => processAndStoreRangerAvatar(Buffer.from("not-an-image"), "legal-advisor-1"),
    (error: unknown) => error instanceof RangerAvatarImageError && error.message.includes("无法解析"),
  );
  await assert.rejects(
    () => processAndStoreRangerAvatar(Buffer.alloc(MAX_RANGER_AVATAR_UPLOAD_BYTES + 1), "legal-advisor-1"),
    (error: unknown) => error instanceof RangerAvatarImageError && error.message.includes("5MB"),
  );

  const width = 320;
  const height = 320;
  const pixels = Buffer.alloc(width * height * 2 * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = 255;
    pixels[index * 4 + 3] = 255;
    const secondFrame = (width * height + index) * 4;
    pixels[secondFrame + 2] = 255;
    pixels[secondFrame + 3] = 255;
  }
  const animatedWebp = await sharp(pixels, {
    raw: { width, height: height * 2, channels: 4, pageHeight: height },
  }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  await assert.rejects(
    () => processAndStoreRangerAvatar(animatedWebp, "legal-advisor-1"),
    (error: unknown) => error instanceof RangerAvatarImageError && error.message.includes("动画"),
  );
});

test("ranger avatar cleanup removes seven-day orphan objects", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-ranger-cleanup-"));
  const previousStorage = process.env.VAULT2077_RANGER_MEDIA_STORAGE;
  const previousDirectory = process.env.VAULT2077_RANGER_MEDIA_DIR;
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const mediaDirectory = path.join(root, "media");
  process.env.VAULT2077_RANGER_MEDIA_STORAGE = "local";
  process.env.VAULT2077_RANGER_MEDIA_DIR = mediaDirectory;
  process.env.VAULT2077_DATA_DIR = path.join(root, "state");
  try {
    const input = await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#4d6073" },
    }).png().toBuffer();
    const asset = await processAndStoreRangerAvatar(input, "cleanup-advisor");
    const staleTime = new Date("2026-07-01T00:00:00.000Z");
    await Promise.all([asset.smallKey, asset.largeKey].map((key) => (
      utimes(path.join(mediaDirectory, ...key.split("/")), staleTime, staleTime)
    )));

    const { cleanupRangerAvatarMedia } = await import(
      `../lib/managed-service-catalog.ts?cleanup=${Date.now()}`
    );
    const result = await cleanupRangerAvatarMedia(new Date("2026-07-31T00:00:00.000Z"));
    assert.deepEqual(new Set(result.deleted), new Set([asset.smallKey, asset.largeKey]));
    assert.equal(await rangerMediaObjectExists(asset.smallKey), false);
    assert.equal(await rangerMediaObjectExists(asset.largeKey), false);
  } finally {
    if (previousStorage === undefined) delete process.env.VAULT2077_RANGER_MEDIA_STORAGE;
    else process.env.VAULT2077_RANGER_MEDIA_STORAGE = previousStorage;
    if (previousDirectory === undefined) delete process.env.VAULT2077_RANGER_MEDIA_DIR;
    else process.env.VAULT2077_RANGER_MEDIA_DIR = previousDirectory;
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    await rm(root, { recursive: true, force: true });
  }
});

test("ranger avatar cleanup retains replaced media for 30 days and revocation purges immediately", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-ranger-retention-"));
  const previousStorage = process.env.VAULT2077_RANGER_MEDIA_STORAGE;
  const previousDirectory = process.env.VAULT2077_RANGER_MEDIA_DIR;
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const mediaDirectory = path.join(root, "media");
  const stateDirectory = path.join(root, "state");
  process.env.VAULT2077_RANGER_MEDIA_STORAGE = "local";
  process.env.VAULT2077_RANGER_MEDIA_DIR = mediaDirectory;
  process.env.VAULT2077_DATA_DIR = stateDirectory;
  try {
    const input = await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#775947" },
    }).png().toBuffer();
    const replaced = await processAndStoreRangerAvatar(input, "replaced-advisor");
    const staleTime = new Date("2026-07-01T00:00:00.000Z");
    await Promise.all([replaced.smallKey, replaced.largeKey].map((key) => (
      utimes(path.join(mediaDirectory, ...key.split("/")), staleTime, staleTime)
    )));

    const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
    const historicalCatalog = createDefaultOpcCatalog();
    historicalCatalog.rangers.push({
      slug: "replaced-advisor",
      publicName: "已替换头像的顾问",
      identityId: "legal-advisor",
      avatar: replaced,
      intro: "公开简介。",
      tags: ["商业交易"],
      contactLabel: "replaced-advisor@example.com",
      contactState: "EMAIL / PUBLIC",
      verificationDate: "2026-07-01",
      profileUpdatedAt: "2026-07-01",
      authorizationStatus: "本人已授权公开",
    });
    const currentCatalog = createDefaultOpcCatalog();
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(path.join(stateDirectory, "opc-service-catalog.json"), `${JSON.stringify({
      schemaVersion: 1,
      revision: 2,
      draftUpdatedAt: "2026-07-20T00:00:00.000Z",
      publishedAt: null,
      draft: currentCatalog,
      published: currentCatalog,
      publications: [{
        revision: 1,
        publishedAt: "2026-07-20T00:00:00.000Z",
        catalog: historicalCatalog,
      }],
    }, null, 2)}\n`);

    const {
      cleanupRangerAvatarMedia,
      purgeRangerAvatarMediaAfterRevocation,
    } = await import(`../lib/managed-service-catalog.ts?retention=${Date.now()}`);
    const retained = await cleanupRangerAvatarMedia(new Date("2026-07-31T00:00:00.000Z"));
    assert.ok(retained.retained.includes(replaced.smallKey));
    assert.equal(await rangerMediaObjectExists(replaced.smallKey), true);

    const expired = await cleanupRangerAvatarMedia(new Date("2026-08-20T00:00:01.000Z"));
    assert.ok(expired.deleted.includes(replaced.smallKey));
    assert.equal(await rangerMediaObjectExists(replaced.smallKey), false);

    const revoked = await processAndStoreRangerAvatar(input, "revoked-advisor");
    const purged = await purgeRangerAvatarMediaAfterRevocation("revoked-advisor");
    assert.deepEqual(new Set(purged), new Set([revoked.smallKey, revoked.largeKey]));
    assert.equal(await rangerMediaObjectExists(revoked.smallKey), false);
  } finally {
    if (previousStorage === undefined) delete process.env.VAULT2077_RANGER_MEDIA_STORAGE;
    else process.env.VAULT2077_RANGER_MEDIA_STORAGE = previousStorage;
    if (previousDirectory === undefined) delete process.env.VAULT2077_RANGER_MEDIA_DIR;
    else process.env.VAULT2077_RANGER_MEDIA_DIR = previousDirectory;
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    await rm(root, { recursive: true, force: true });
  }
});
