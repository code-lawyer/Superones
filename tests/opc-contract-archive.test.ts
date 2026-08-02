import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("OPC contract archive writes immutable local PDF and manifest objects", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-archive-"));
  const names = ["VAULT2077_OPC_CONTRACT_ARCHIVE_STORAGE", "VAULT2077_OPC_CONTRACT_ARCHIVE_DIR"] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  process.env.VAULT2077_OPC_CONTRACT_ARCHIVE_STORAGE = "local";
  process.env.VAULT2077_OPC_CONTRACT_ARCHIVE_DIR = root;
  try {
    const archive = await import(`../lib/opc-contract-archive.ts?test=${Date.now()}`);
    const pdf = Buffer.from("%PDF-1.4\nmock signed contract\n%%EOF\n", "utf8");
    const sha256 = createHash("sha256").update(pdf).digest("hex");
    const stored = await archive.putOpcContractArchive({
      reference: "OPC-20260802-A1B2C3D4E5F6",
      pdf,
      manifest: {
        schemaVersion: 1,
        orderReference: "OPC-20260802-A1B2C3D4E5F6",
        signFlowId: "flow-123",
        providerFileId: "file-123",
        sha256,
        verifiedAt: "2026-08-02T00:00:00.000Z",
        signerCount: 2,
        evidence: [],
      },
    });
    assert.equal(stored.objectKey.endsWith(`${sha256}.pdf`), true);
    assert.deepEqual(await archive.readOpcContractArchive(stored.objectKey), pdf);
    assert.equal(new Date(stored.retainUntil).getUTCFullYear(), new Date(stored.archivedAt).getUTCFullYear() + 10);
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
