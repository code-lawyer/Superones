import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("offline payment profile publishes one immutable account, agreement PDF, and contact QR snapshot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-offline-payment-profile-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const profileModule = await import(`../lib/opc-offline-payment-profile.ts?profile=${Date.now()}`);
    const published = await profileModule.publishOpcOfflinePaymentProfile({
      revision: "offline-payment-2026-08-10",
      account: {
        name: "上海睿诚明达咨询管理有限公司",
        bankName: "测试银行",
        branchName: "测试支行",
        accountNumber: "1234567890123456",
        cnapsCode: "123456789012",
      },
      agreement: {
        fileName: "OPC服务协议.pdf",
        bytes: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n", "utf8"),
      },
      contactQr: {
        fileName: "contact-qr.png",
        mediaType: "image/png",
        bytes: onePixelPng,
      },
      publishedAt: "2026-08-10T12:00:00.000Z",
    });

    const publicProfile = await profileModule.readPublishedOpcOfflinePaymentProfile();
    const agreement = await profileModule.readPublishedOpcOfflinePaymentAsset("agreement");
    const contactQr = await profileModule.readPublishedOpcOfflinePaymentAsset("contact-qr");

    assert.deepEqual(publicProfile, {
      revision: "offline-payment-2026-08-10",
      publishedAt: "2026-08-10T12:00:00.000Z",
      account: {
        name: "上海睿诚明达咨询管理有限公司",
        bankName: "测试银行",
        branchName: "测试支行",
        accountNumber: "1234567890123456",
        cnapsCode: "123456789012",
      },
      agreement: {
        fileName: "OPC服务协议.pdf",
        sha256: published.agreement.sha256,
        href: `/api/opc/offline-payment/assets/agreement?revision=offline-payment-2026-08-10&v=${published.agreement.sha256}`,
      },
      contactQr: {
        fileName: "contact-qr.png",
        mediaType: "image/png",
        sha256: published.contactQr.sha256,
        href: `/api/opc/offline-payment/assets/contact-qr?revision=offline-payment-2026-08-10&v=${published.contactQr.sha256}`,
      },
    });
    assert.equal(agreement.mediaType, "application/pdf");
    assert.deepEqual(agreement.bytes, Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n", "utf8"));
    assert.equal(contactQr.mediaType, "image/png");
    assert.deepEqual(contactQr.bytes, onePixelPng);
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    await rm(root, { recursive: true, force: true });
  }
});

test("offline payment assets require the current immutable SHA-256 version", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-offline-payment-assets-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const profileModule = await import(`../lib/opc-offline-payment-profile.ts?asset-profile=${Date.now()}`);
    const published = await profileModule.publishOpcOfflinePaymentProfile({
      revision: "offline-payment-assets-1",
      account: {
        name: "上海睿诚明达咨询管理有限公司",
        bankName: "测试银行",
        branchName: "测试支行",
        accountNumber: "1234567890123456",
        cnapsCode: "",
      },
      agreement: {
        fileName: "OPC服务协议.pdf",
        bytes: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n", "utf8"),
      },
      contactQr: { fileName: "contact-qr.png", mediaType: "image/png", bytes: onePixelPng },
    });
    const route = await import(`../app/api/opc/offline-payment/assets/[kind]/route.ts?route=${Date.now()}`);

    const assetUrl = `https://superones.top/api/opc/offline-payment/assets/agreement?revision=${published.revision}&v=${published.agreement.sha256}`;
    const response = await route.GET(new Request(assetUrl), {
      params: Promise.resolve({ kind: "agreement" }),
    });
    const headResponse = await route.HEAD(new Request(assetUrl, { method: "HEAD" }), {
      params: Promise.resolve({ kind: "agreement" }),
    });
    const staleResponse = await route.GET(new Request(`https://superones.top/api/opc/offline-payment/assets/agreement?revision=${published.revision}&v=${"0".repeat(64)}`), {
      params: Promise.resolve({ kind: "agreement" }),
    });
    const staleRevisionResponse = await route.GET(new Request(`https://superones.top/api/opc/offline-payment/assets/agreement?revision=offline-payment-assets-old&v=${published.agreement.sha256}`), {
      params: Promise.resolve({ kind: "agreement" }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "public, max-age=300, must-revalidate");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.match(response.headers.get("content-disposition") ?? "", /OPC/);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
    assert.equal(headResponse.status, 200);
    assert.equal((await headResponse.arrayBuffer()).byteLength, 0);
    assert.equal(staleResponse.status, 404);
    assert.equal(staleRevisionResponse.status, 404);
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    await rm(root, { recursive: true, force: true });
  }
});

test("offline payment profile refuses a non-idempotent revision overwrite", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-offline-payment-revision-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const profileModule = await import(`../lib/opc-offline-payment-profile.ts?revision=${Date.now()}`);
    const input = {
      revision: "offline-payment-immutable-1",
      account: {
        name: "上海睿诚明达咨询管理有限公司",
        bankName: "测试银行",
        branchName: "测试支行",
        accountNumber: "1234567890123456",
        cnapsCode: "",
      },
      agreement: {
        fileName: "OPC服务协议.pdf",
        bytes: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n", "utf8"),
      },
      contactQr: { fileName: "contact-qr.png", mediaType: "image/png" as const, bytes: onePixelPng },
      publishedAt: "2026-08-10T12:00:00.000Z",
    };
    const first = await profileModule.publishOpcOfflinePaymentProfile(input);
    const replay = await profileModule.publishOpcOfflinePaymentProfile({ ...input, publishedAt: "2026-08-11T12:00:00.000Z" });
    assert.equal(replay.publishedAt, first.publishedAt);
    await profileModule.publishOpcOfflinePaymentProfile({
      ...input,
      revision: "offline-payment-immutable-2",
      publishedAt: "2026-08-12T12:00:00.000Z",
    });
    await assert.rejects(
      () => profileModule.publishOpcOfflinePaymentProfile({
        ...input,
        account: { ...input.account, accountNumber: "9999999999999999" },
      }),
      /修订号.*已存在/,
    );
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    await rm(root, { recursive: true, force: true });
  }
});

test("offline payment profile can be replaced from one fixed staging directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-offline-payment-publish-"));
  const dataRoot = path.join(root, "data");
  const stagingRoot = path.join(root, "staging");
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = dataRoot;
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(stagingRoot, { recursive: true });
    await writeFile(path.join(stagingRoot, "payment-profile.json"), JSON.stringify({
      revision: "offline-payment-replacement-1",
      account: {
        name: "上海睿诚明达咨询管理有限公司",
        bankName: "测试银行",
        branchName: "测试支行",
        accountNumber: "1234567890123456",
        cnapsCode: "",
      },
      agreementFile: "service-agreement.pdf",
      contactQrFile: "contact-qr.png",
    }));
    await writeFile(path.join(stagingRoot, "service-agreement.pdf"), "%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n");
    await writeFile(path.join(stagingRoot, "contact-qr.png"), onePixelPng);

    const publisher = await import(`../lib/opc-offline-payment-profile-publisher.ts?publisher=${Date.now()}`);
    const result = await publisher.publishOpcOfflinePaymentProfileFromDirectory(stagingRoot);
    const profileModule = await import(`../lib/opc-offline-payment-profile.ts?published=${Date.now()}`);
    const publicProfile = await profileModule.readPublishedOpcOfflinePaymentProfile();

    assert.equal(result.revision, "offline-payment-replacement-1");
    assert.equal(publicProfile?.account.bankName, "测试银行");
    assert.equal(publicProfile?.agreement.fileName, "service-agreement.pdf");
    assert.equal(publicProfile?.contactQr.fileName, "contact-qr.png");
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    await rm(root, { recursive: true, force: true });
  }
});
