import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  createAcquisitionRunEvidence,
  validateAcquisitionPayloadForDelivery,
  validateAcquisitionRunEvidence,
} from "../lib/acquisition-run-evidence.ts";

const execFileAsync = promisify(execFile);

test("completed acquisition evidence proves the report and immutable batches", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-run-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const batches = path.join(root, "acquisition-batches");
  await mkdir(batches, { recursive: true });
  const evidence = createAcquisitionRunEvidence({
    outputRoot: root,
    runId: "run:30828010970:information",
    lane: "information",
    runMode: "incremental",
    scheduleId: "incremental:information:30828010970:1",
    startedAt: "2026-08-03T15:33:00.000Z",
  });

  await evidence.begin();
  await writeFile(path.join(batches, "batch.json"), '{"batchId":"batch:information:1"}\n', "utf8");
  await writeFile(path.join(root, "acquisition-report.json"), JSON.stringify({
    schemaVersion: 1,
    runId: "run:30828010970:information",
    lane: "information",
    batches: 1,
    files: [{ batchId: "batch:information:1", file: "acquisition-batches/batch.json" }],
  }), "utf8");
  await evidence.complete("2026-08-03T15:34:00.000Z");

  const result = await validateAcquisitionRunEvidence(root);
  assert.equal(result.status, "completed");
  assert.equal(result.files.length, 2);
  assert.deepEqual(result.files.map((file) => file.path), [
    "acquisition-batches/batch.json",
    "acquisition-report.json",
  ]);
  assert.ok(result.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
  const persisted = JSON.parse(await readFile(path.join(root, "run-manifest.json"), "utf8"));
  assert.equal(persisted.status, "completed");
  assert.equal(persisted.completedAt, "2026-08-03T15:34:00.000Z");
});

test("failed acquisition evidence remains valid without exposing credentials", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-run-failure-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const evidence = createAcquisitionRunEvidence({
    outputRoot: root,
    runId: "run:30828010970:sic",
    lane: "sic",
    runMode: "incremental",
    scheduleId: "incremental:sic:30828010970:1",
    startedAt: "2026-08-03T00:25:00.000Z",
  });

  await evidence.begin();
  await evidence.fail(
    new Error("Authorization: Bearer top-secret-value; postgresql://vault:database-password@db.example/vault; owner@example.com; api_key=abcdefghijklmnop; https://operator:password@example.com/private"),
    "2026-08-03T00:25:30.000Z",
  );

  const result = await validateAcquisitionRunEvidence(root);
  assert.equal(result.status, "failed");
  const persisted = await readFile(path.join(root, "run-manifest.json"), "utf8");
  assert.match(persisted, /\[REDACTED\]/);
  assert.doesNotMatch(persisted, /top-secret-value|database-password|owner@example\.com|abcdefghijklmnop|operator:password/);
});

test("artifact validation CLI reports an archived run", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-run-cli-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "acquisition-batches"), { recursive: true });
  const evidence = createAcquisitionRunEvidence({
    outputRoot: root,
    runId: "run:cli:rankings",
    lane: "rankings",
    runMode: "incremental",
    scheduleId: "incremental:rankings:cli:1",
  });
  await evidence.begin();
  await writeFile(path.join(root, "acquisition-batches", "batch.json"), '{"batchId":"batch:rankings:1"}', "utf8");
  await writeFile(path.join(root, "acquisition-report.json"), JSON.stringify({
    schemaVersion: 1,
    runId: "run:cli:rankings",
    lane: "rankings",
  }), "utf8");
  await evidence.complete();

  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/validate-acquisition-artifact.ts",
    root,
  ], { cwd: path.resolve(".") });
  assert.match(stdout, /evidence=completed lane=rankings files=2/);
  assert.equal(
    await readFile(path.join(root, ".validated-for-upload"), "utf8"),
    "validated\n",
  );
});

test("workflow evidence finalizer archives a run interrupted before collection", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-run-interrupted-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    VAULT2077_COLLECTOR_OUTPUT_DIR: root,
    VAULT2077_ACQUISITION_LANE: "roadside",
    VAULT2077_ACQUISITION_RUN_MODE: "incremental",
    VAULT2077_SCHEDULE_ID: "incremental:roadside:30828010970:1",
    GITHUB_RUN_ID: "30828010970",
  };

  await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/initialize-acquisition-evidence.ts",
  ], { cwd: path.resolve("."), env: environment });
  await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/finalize-acquisition-evidence.ts",
  ], { cwd: path.resolve("."), env: environment });

  const result = await validateAcquisitionRunEvidence(root);
  assert.equal(result.status, "failed");
  assert.equal(result.lane, "roadside");
  assert.match(result.failure?.message ?? "", /before collection completed/);
});

test("artifact validation rejects credential material in reports", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-run-secret-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "acquisition-batches"), { recursive: true });
  const evidence = createAcquisitionRunEvidence({
    outputRoot: root,
    runId: "run:secret:information",
    lane: "information",
    runMode: "incremental",
    scheduleId: "incremental:information:secret:1",
  });
  await evidence.begin();
  await writeFile(path.join(root, "acquisition-batches", "batch.json"), '{"batchId":"batch:secret:1"}', "utf8");
  await writeFile(path.join(root, "acquisition-report.json"), JSON.stringify({
    schemaVersion: 1,
    runId: "run:secret:information",
    lane: "information",
    error: "Authorization: Bearer accidentally-logged-secret",
  }), "utf8");
  await evidence.complete();

  await assert.rejects(validateAcquisitionRunEvidence(root), /敏感凭据/);
});

test("artifact validation allows public email addresses in collected content", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-run-public-email-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "acquisition-batches"), { recursive: true });
  const evidence = createAcquisitionRunEvidence({
    outputRoot: root,
    runId: "run:public-email:information",
    lane: "information",
    runMode: "incremental",
    scheduleId: "incremental:information:public-email:1",
  });
  await evidence.begin();
  await writeFile(path.join(root, "acquisition-batches", "batch.json"), JSON.stringify({
    batchId: "batch:public-email:1",
    sourceContent: "Contact the public press office at press@example.com.",
  }), "utf8");
  await writeFile(path.join(root, "acquisition-report.json"), JSON.stringify({
    schemaVersion: 1,
    runId: "run:public-email:information",
    lane: "information",
  }), "utf8");
  await evidence.complete();

  await assert.doesNotReject(validateAcquisitionRunEvidence(root));
});

test("delivery preflight allows credential-shaped examples inside public source content", () => {
  assert.doesNotThrow(() => validateAcquisitionPayloadForDelivery(
    "acquisition-batches/public-documentation.json",
    JSON.stringify({
      records: [{
        payload: {
          originalTitle: "Authentication documentation",
          originalContent: [
            "Authorization: Bearer example-documentation-token",
            "Cookie: session=example-cookie-value",
            "api_key=example-api-key-value",
          ].join("\n"),
        },
      }],
    }),
  ));
});

test("delivery preflight still rejects high-confidence credentials inside public source content", () => {
  assert.throws(
    () => validateAcquisitionPayloadForDelivery(
      "acquisition-batches/public-leak.json",
      JSON.stringify({ records: [{ payload: { originalContent: "ghp_1234567890abcdefghijklmnopqrstuvwxyz" } }] }),
    ),
    /provider-credential/,
  );
});

test("artifact validation rejects common credential encodings with safe diagnostics", async (context) => {
  const samples = [
    "api_key=abcdefghijklmnop",
    "client_secret: abcdefghijklmnop",
    "https://operator:password@example.com/private",
    "https://api.example.test/data?access_token=abcdefghijklmnop",
    "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
    "AKIAIOSFODNN7EXAMPLE",
  ];

  for (const [index, sample] of samples.entries()) {
    const root = await mkdtemp(path.join(os.tmpdir(), `vault2077-run-private-${index}-`));
    context.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, "acquisition-batches"), { recursive: true });
    const evidence = createAcquisitionRunEvidence({
      outputRoot: root,
      runId: `run:private:${index}`,
      lane: "information",
      runMode: "incremental",
      scheduleId: `incremental:information:private:${index}`,
    });
    await evidence.begin();
    await writeFile(path.join(root, "acquisition-batches", "batch.json"), JSON.stringify({
      batchId: `batch:private:${index}`,
      diagnostic: sample,
    }), "utf8");
    await writeFile(path.join(root, "acquisition-report.json"), JSON.stringify({
      schemaVersion: 1,
      runId: `run:private:${index}`,
      lane: "information",
    }), "utf8");
    await evidence.complete();

    await assert.rejects(
      validateAcquisitionRunEvidence(root),
      (error: unknown) => error instanceof Error
        && error.message.includes("敏感凭据")
        && error.message.includes("acquisition-batches/batch.json")
        && !error.message.includes(sample),
      sample,
    );
  }
});

test("delivery preflight rejects credential material before network delivery", () => {
  assert.throws(
    () => validateAcquisitionPayloadForDelivery(
      "acquisition-batches/batch.json",
      '{"authorization":"Bearer accidentally-logged-secret"}',
    ),
    (error: unknown) => error instanceof Error
      && error.message.includes("acquisition-batches/batch.json")
      && error.message.includes("credential-json-field")
      && !error.message.includes("accidentally-logged-secret"),
  );
});

test("artifact validation CLI does not authorize unsafe evidence for upload", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-run-unsafe-cli-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "acquisition-batches"), { recursive: true });
  const evidence = createAcquisitionRunEvidence({
    outputRoot: root,
    runId: "run:unsafe-cli:information",
    lane: "information",
    runMode: "incremental",
    scheduleId: "incremental:information:unsafe-cli:1",
  });
  await evidence.begin();
  await writeFile(path.join(root, "acquisition-batches", "batch.json"), JSON.stringify({
    batchId: "batch:unsafe:1",
    sourceReports: [{ errorMessage: "Authorization: Bearer accidentally-logged-secret" }],
  }), "utf8");
  await writeFile(path.join(root, "acquisition-report.json"), JSON.stringify({
    schemaVersion: 1,
    runId: "run:unsafe-cli:information",
    lane: "information",
  }), "utf8");
  await evidence.complete();

  await assert.rejects(execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/validate-acquisition-artifact.ts",
    root,
  ], { cwd: path.resolve(".") }));
  await assert.rejects(readFile(path.join(root, ".validated-for-upload"), "utf8"), /ENOENT/);
});
