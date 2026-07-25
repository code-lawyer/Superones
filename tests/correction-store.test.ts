import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("anonymous correction reports preserve encrypted contact and close with a resolution", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-corrections-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const {
      closeCorrectionReport,
      createCorrectionReport,
      listAdminCorrectionReports,
    } = await import(`../lib/correction-store.ts?test=${Date.now()}`);
    const created = await createCorrectionReport({
      issueType: "factual_error",
      recordType: "information",
      recordId: "info:test",
      pageUrl: "https://vault2077.example/feed/info/test",
      description: "The published date does not match the original source.",
      evidenceUrl: "https://example.com/original",
      email: "reader@example.com",
    });
    const open = await listAdminCorrectionReports();
    assert.equal(open[0].id, created.id);
    assert.equal(open[0].email, "reader@example.com");
    assert.equal(open[0].status, "open");

    await closeCorrectionReport(created.id, "Verified the source and corrected the date.");
    const closed = await listAdminCorrectionReports();
    assert.equal(closed[0].status, "closed");
    assert.match(closed[0].resolution ?? "", /corrected/);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
