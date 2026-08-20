import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("Frontier storage diagnostics expose capacity evidence without private records", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-diagnostics-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const { createPendingSubmission } = await import(`../lib/frontier/submissions.ts?diagnostics-write=${Date.now()}`);
    const { getFrontierStorageDiagnostics } = await import(`../lib/frontier/diagnostics.ts?diagnostics-read=${Date.now()}`);
    await createPendingSubmission({
      owner: "example",
      repo: "project",
      email: "private@example.test",
      note: "public note",
      defaultBranch: "main",
      challenge: "secret-challenge",
      rulesAccepted: true,
      now: new Date("2099-01-01T00:00:00.000Z"),
    });

    const diagnostics = await getFrontierStorageDiagnostics();
    const persisted = JSON.parse(await readFile(path.join(root, "mvp-store.json"), "utf8")) as {
      version?: unknown;
      mutationMetrics?: unknown;
    };
    assert.equal(persisted.version, 6, "the previous release must continue to recognize the schema discriminant");
    assert.ok(Array.isArray(persisted.mutationMetrics), "write metrics must remain an ignorable v6 extension");
    assert.equal(diagnostics.strategy, "single-state-document");
    assert.equal(diagnostics.submissionCount, 1);
    assert.ok(diagnostics.documentBytes > 0);
    assert.equal(diagnostics.peakMutationsPerHour, 1);
    assert.equal(diagnostics.lockWaitEvidence, "postgresql-telemetry-required");
    assert.equal(diagnostics.normalizationRecommended, false);
    assert.deepEqual(diagnostics.reasons, []);
    assert.equal("email" in diagnostics, false);
    assert.equal("repository" in diagnostics, false);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
