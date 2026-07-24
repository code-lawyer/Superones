import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("a durable batch waits for model configuration and succeeds on retry", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "vault2077-worker-"));
  process.env.VAULT2077_DATA_DIR = dataDirectory;
  delete process.env.VAULT2077_LLM_BASE_URL;
  delete process.env.VAULT2077_LLM_API_KEY;
  delete process.env.VAULT2077_LLM_MODEL;

  const [{ persistInboundBatch, inboundBatchStats, claimNextInboundBatch, completeInboundBatch, failInboundBatch }, { processPendingInboundBatches }, { getStoredContent }] = await Promise.all([
    import("../lib/inbound-batch-store.ts"),
    import("../lib/content-worker.ts"),
    import("../lib/content-store.ts"),
  ]);
  const originalTitle = "A new model ships";
  const originalContent = "Original English source content.";
  const rawPayload = JSON.stringify({
    version: 2,
    batchId: "vault2077-202607221200-worker-test",
    sourceBundleRevision: "source-bundle-test",
    collectedFrom: "2026-07-22T04:00:00.000Z",
    collectedUntil: "2026-07-22T10:00:00.000Z",
    generatedAt: "2026-07-22T10:17:00.000Z",
    information: [{
      idempotencyKey: "worker-item-1",
      sourceChannelId: "source-test",
      discoveryPath: "rss:https://example.com/feed.xml",
      originalPublisher: "Example AI",
      ownerEntity: "entity:example-ai",
      publisherKind: "organization",
      evidenceNature: "primary",
      classificationConfidence: "high",
      sourceRole: "官方",
      originalUrl: "https://example.com/news/model",
      originalPublishedAt: "2026-07-22T09:00:00.000Z",
      fetchedAt: "2026-07-22T10:10:00.000Z",
      originalLanguage: "en",
      originalTitle,
      originalContent,
      contentCompleteness: "fulltext",
      contentHash: createHash("sha256").update(`${originalTitle}\n${originalContent}`).digest("hex"),
    }],
    repositories: [{
      githubId: 2077,
      owner: "example",
      name: "agent-kit",
      canonicalUrl: "https://github.com/example/agent-kit",
      description: "Agent toolkit",
      readme: "# Agent Kit",
      readmeSha: "readme-sha-1",
      license: "MIT",
      primaryLanguage: "TypeScript",
      stars: 2077,
      forks: 77,
      watchers: 20,
      createdAt: "2026-01-01T00:00:00.000Z",
      pushedAt: "2026-07-22T09:00:00.000Z",
      fetchedAt: "2026-07-22T10:10:00.000Z",
      delta24: 77,
      delta7: 0,
    }],
  });
  const bodyHash = createHash("sha256").update(rawPayload).digest("hex");
  await persistInboundBatch("vault2077-202607221200-worker-test", bodyHash, rawPayload);
  await assert.rejects(() => processPendingInboundBatches(1), /尚未完成配置/);
  assert.deepEqual(await inboundBatchStats(), { pending: 0, processing: 0, succeeded: 0, failed: 1 });
  assert.equal((await getStoredContent()).state.mode, "demo");

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: Array<{ content: string }> };
      const system = body.messages[0].content;
      const result = system.includes("information_batch_editorial")
        ? { items: [{ idempotencyKey: "worker-item-1", translatedTitle: "新模型正式发布", summary: "官方发布了一款新模型。", translatedContent: "原始英文内容的中文翻译。", decision: { disposition: "independent" } }] }
        : system.includes("information_editorial")
          ? { translatedTitle: "新模型正式发布", summary: "官方发布了一款新模型。", translatedContent: "原始英文内容的中文翻译。" }
        : system.includes("repository_editorial")
          ? { description: "Agent 工具集", fit: "适合超级个体构建自动化工作流。", category: "Agent" }
          : { disposition: "independent" };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  process.env.VAULT2077_LLM_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.VAULT2077_LLM_API_KEY = "test-key";
  process.env.VAULT2077_LLM_MODEL = "test-model";
  try {
    const result = await processPendingInboundBatches(1);
    assert.equal(result.processed.length, 1);
    assert.deepEqual(result.queue, { pending: 0, processing: 0, succeeded: 1, failed: 0 });
    const stored = await getStoredContent();
    assert.equal(stored.state.mode, "live");
    assert.equal(stored.information.length, 1);
    assert.equal(stored.information[0].originalContent, originalContent);
    assert.equal(stored.information[0].translatedTitle, "新模型正式发布");
    assert.equal(stored.projects.length, 1);
    assert.equal(stored.projects[0].repo, "agent-kit");
    assert.equal(stored.batches[0].status, "succeeded");

    const secondPayload = JSON.stringify({
      version: 2,
      batchId: "vault2077-202607221800-worker-test",
      sourceBundleRevision: "source-bundle-test",
      collectedFrom: "2026-07-22T10:00:00.000Z",
      collectedUntil: "2026-07-22T16:00:00.000Z",
      generatedAt: "2026-07-22T16:17:00.000Z",
      information: [],
      repositories: [],
    });
    await persistInboundBatch("vault2077-202607221800-worker-test", createHash("sha256").update(secondPayload).digest("hex"), secondPayload);
    await processPendingInboundBatches(1);
    const afterEmptyBatch = await getStoredContent();
    assert.equal(afterEmptyBatch.projects.length, 1);
    assert.equal(afterEmptyBatch.projects[0].repo, "agent-kit");

    await persistInboundBatch("vault2077-priority-failed", createHash("sha256").update("{}").digest("hex"), "{}");
    const firstClaim = await claimNextInboundBatch();
    assert.equal(firstClaim?.batchId, "vault2077-priority-failed");
    await failInboundBatch("vault2077-priority-failed", new Error("retry later"));
    await persistInboundBatch("vault2077-priority-pending", createHash("sha256").update("{\"new\":true}").digest("hex"), "{\"new\":true}");
    const prioritizedClaim = await claimNextInboundBatch();
    assert.equal(prioritizedClaim?.batchId, "vault2077-priority-pending");
    await completeInboundBatch("vault2077-priority-pending");
    const retryClaim = await claimNextInboundBatch();
    assert.equal(retryClaim?.batchId, "vault2077-priority-failed");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
