import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("anonymous correction reports remain immutable encrypted audit inputs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-corrections-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const { createCorrectionReport } = await import(`../lib/correction-store.ts?test=${Date.now()}`);
    const created = await createCorrectionReport({
      issueType: "factual_error",
      recordType: "information",
      recordId: "info:test",
      pageUrl: "https://vault2077.example/feed/info/test",
      description: "The published date does not match the original source.",
      evidenceUrl: "https://example.com/original",
      email: "reader@example.com",
    });
    const stored = JSON.parse(await readFile(path.join(root, "corrections.json"), "utf8")) as {
      reports: Array<{ id: string; emailEncrypted: string | null; status: string; resolution: string | null }>;
    };
    assert.equal(stored.reports[0].id, created.id);
    assert.notEqual(stored.reports[0].emailEncrypted, "reader@example.com");
    assert.equal(stored.reports[0].status, "open");
    assert.equal(stored.reports[0].resolution, null);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
