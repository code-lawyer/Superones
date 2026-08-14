import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getSicStoredContent,
  mergeSicContentItems,
  mergeSicSourceReports,
  mergeSicStoredContent,
} from "../lib/sic-content-store.ts";
import { getSicContent } from "../lib/sic-content.ts";
import type { SicContentItem } from "../lib/sic-content-types.ts";

function item(id: string, collectedAt: string): SicContentItem {
  return {
    id,
    sourceId: "catalog-source",
    group: "courses",
    sourceName: "Catalog Source",
    publisher: "Catalog Publisher",
    title: `Course ${id}`,
    summary: `Summary ${id}`,
    url: `https://example.com/courses/${id}`,
    publishedAt: null,
    collectedAt,
  };
}

test("a partial catalog response cannot erase previously processed SiC items", () => {
  const previous = [
    { ...item("one", "2026-07-24T00:00:00.000Z"), translatedTitle: "课程一" },
    { ...item("two", "2026-07-24T00:00:00.000Z"), translatedTitle: "课程二" },
  ];
  const current = [item("one", "2026-07-25T00:00:00.000Z")];
  const merged = mergeSicContentItems(previous, current);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((value) => value.id === "one")?.translatedTitle, "课程一");
  assert.equal(merged.find((value) => value.id === "two")?.translatedTitle, "课程二");
});

test("locale query variants collapse to one canonical SiC item", () => {
  const localized = {
    ...item("localized", "2026-07-24T00:00:00.000Z"),
    url: "https://developers.google.com/machine-learning/crash-course?hl=hi",
    translatedTitle: "机器学习速成课程",
  };
  const canonical = {
    ...item("canonical", "2026-07-25T00:00:00.000Z"),
    url: "https://developers.google.com/machine-learning/crash-course",
  };
  const merged = mergeSicContentItems([localized], [canonical]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "canonical");
  assert.equal(merged[0].translatedTitle, "机器学习速成课程");
});

test("an authoritative Google catalog refresh removes stale locale-only entries", () => {
  const stale = {
    ...item("stale", "2026-07-24T00:00:00.000Z"),
    sourceId: "google-ml-courses",
    url: "https://developers.google.com/machine-learning/testing-debugging?hl=hi",
  };
  const current = {
    ...item("current", "2026-07-25T00:00:00.000Z"),
    sourceId: "google-ml-courses",
    url: "https://developers.google.com/machine-learning/crash-course",
  };
  const merged = mergeSicContentItems([stale], [current], {
    replaceSourceIds: new Set(["google-ml-courses"]),
  });
  assert.deepEqual(merged.map((value) => value.id), ["current"]);
});

test("an authoritative weekly paper snapshot replaces the previous week", () => {
  const stale = {
    ...item("old-paper", "2026-07-24T00:00:00.000Z"),
    sourceId: "hugging-face-daily-papers",
    group: "papers" as const,
  };
  const current = {
    ...item("new-paper", "2026-07-31T00:00:00.000Z"),
    sourceId: "hugging-face-daily-papers",
    group: "papers" as const,
  };
  const merged = mergeSicContentItems([stale], [current], {
    replaceSourceIds: new Set(["hugging-face-daily-papers"]),
  });
  assert.deepEqual(merged.map((value) => value.id), ["new-paper"]);
});

test("a refreshed canonical item preserves its verified Chinese editorial result", () => {
  const localized = {
    ...item("paper", "2026-07-31T00:00:00.000Z"),
    translatedTitle: "中文论文标题",
    description: "中文说明",
    contentSummary: "中文内容摘要",
    editorialLocale: "zh-CN" as const,
    editorialVersion: 1,
  };
  const refreshed = {
    ...localized,
    translatedTitle: undefined,
    description: undefined,
    contentSummary: undefined,
    editorialLocale: undefined,
    editorialVersion: undefined,
  };
  const merged = mergeSicContentItems([localized], [refreshed]);
  assert.equal(merged[0].translatedTitle, "中文论文标题");
  assert.equal(merged[0].editorialLocale, "zh-CN");
  assert.equal(merged[0].editorialVersion, 1);
});

test("a single-source refresh preserves reports from the other SiC sources", () => {
  const reports = mergeSicSourceReports([
    { sourceId: "google-ml-courses", status: "success", collectedAt: "2026-07-30T00:00:00.000Z", itemCount: 3 },
    { sourceId: "hugging-face-daily-papers", status: "success", collectedAt: "2026-07-30T00:00:00.000Z", itemCount: 120 },
  ], [
    { sourceId: "hugging-face-daily-papers", status: "success", collectedAt: "2026-07-31T00:00:00.000Z", itemCount: 135 },
  ]);
  assert.deepEqual(reports.map((report) => [report.sourceId, report.itemCount]), [
    ["google-ml-courses", 3],
    ["hugging-face-daily-papers", 135],
  ]);
});

test("same-run SiC reports aggregate shard counts and retain partial status", () => {
  const collectedAt = "2026-07-31T00:00:00.000Z";
  const reports = mergeSicSourceReports([{
    sourceId: "hugging-face-daily-papers",
    status: "partial",
    collectedAt,
    itemCount: 100,
    error: "一条编辑失败。",
  }], [{
    sourceId: "hugging-face-daily-papers",
    status: "success",
    collectedAt,
    itemCount: 35,
  }]);
  assert.equal(reports[0].status, "partial");
  assert.equal(reports[0].itemCount, 135);
  assert.equal(reports[0].error, "一条编辑失败。");
});

test("retired SiC sources are removed from the current public snapshot", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-sic-store-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabaseUrl = process.env.VAULT2077_DATABASE_URL;
  const previousFallbackDatabaseUrl = process.env.DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = root;
  delete process.env.VAULT2077_DATABASE_URL;
  delete process.env.DATABASE_URL;
  context.after(async () => {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabaseUrl === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabaseUrl;
    if (previousFallbackDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousFallbackDatabaseUrl;
    await rm(root, { recursive: true, force: true });
  });

  const collectedAt = "2026-07-30T00:00:00.000Z";
  await mergeSicStoredContent({
    items: [
      { ...item("active", collectedAt), sourceId: "active-source" },
      { ...item("retired", collectedAt), sourceId: "retired-source" },
    ],
    reports: [
      { sourceId: "active-source", status: "success", collectedAt, itemCount: 1 },
      { sourceId: "retired-source", status: "success", collectedAt, itemCount: 1 },
    ],
    updatedAt: collectedAt,
    snapshotId: "run:first",
    activeSourceIds: ["active-source", "retired-source"],
  });
  await mergeSicStoredContent({
    items: [],
    reports: [{ sourceId: "active-source", status: "failure", collectedAt: "2026-07-31T00:00:00.000Z", itemCount: 0 }],
    updatedAt: "2026-07-31T00:00:00.000Z",
    snapshotId: "run:latest",
    activeSourceIds: ["active-source"],
  });

  const stored = await getSicStoredContent();
  assert.deepEqual(stored.items.map((value) => value.sourceId), ["active-source"]);
  assert.deepEqual(stored.reports.map((value) => value.sourceId), ["active-source"]);
});

test("a first failed approved source with no items still marks its SiC group stale", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-sic-empty-failure-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabaseUrl = process.env.VAULT2077_DATABASE_URL;
  const previousFallbackDatabaseUrl = process.env.DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = root;
  delete process.env.VAULT2077_DATABASE_URL;
  delete process.env.DATABASE_URL;
  context.after(async () => {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabaseUrl === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabaseUrl;
    if (previousFallbackDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousFallbackDatabaseUrl;
    await rm(root, { recursive: true, force: true });
  });

  await mergeSicStoredContent({
    items: [],
    reports: [{
      sourceId: "google-ml-courses",
      status: "failure",
      collectedAt: "2026-08-13T00:00:00.000Z",
      itemCount: 0,
      error: "upstream unavailable",
    }],
    updatedAt: "2026-08-13T00:00:00.000Z",
    snapshotId: "run:first-failure",
    activeSourceIds: ["google-ml-courses"],
  });

  const content = await getSicContent();
  assert.deepEqual(content.groups.courses, []);
  assert.equal(content.state.stale, true);
  assert.deepEqual((await getSicStoredContent()).bootstrap, {
    completedSourceIds: [],
    lastBootstrapAt: null,
    lastRunMode: null,
  });
});

test("a successful bootstrap records per-source baseline coverage", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-sic-bootstrap-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabaseUrl = process.env.VAULT2077_DATABASE_URL;
  const previousFallbackDatabaseUrl = process.env.DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = root;
  delete process.env.VAULT2077_DATABASE_URL;
  delete process.env.DATABASE_URL;
  context.after(async () => {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabaseUrl === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabaseUrl;
    if (previousFallbackDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousFallbackDatabaseUrl;
    await rm(root, { recursive: true, force: true });
  });
  const course = { ...item("bootstrap", "2026-08-14T00:00:00.000Z"), sourceId: "google-ml-courses" };
  await writeFile(path.join(root, "sic-content-store.json"), JSON.stringify({
    version: 2,
    updatedAt: course.collectedAt,
    items: [course],
    reports: [],
    sourceSnapshots: {},
  }));
  assert.deepEqual((await getSicStoredContent()).bootstrap.completedSourceIds, []);
  await mergeSicStoredContent({
    items: [course],
    reports: [{ sourceId: "google-ml-courses", status: "success", collectedAt: course.collectedAt, itemCount: 1 }],
    updatedAt: course.collectedAt,
    snapshotId: "run:bootstrap",
    activeSourceIds: ["google-ml-courses"],
    runMode: "bootstrap",
  });
  assert.deepEqual((await getSicStoredContent()).bootstrap, {
    completedSourceIds: ["google-ml-courses"],
    lastBootstrapAt: course.collectedAt,
    lastRunMode: "bootstrap",
  });
});
