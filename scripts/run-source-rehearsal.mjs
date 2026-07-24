import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const secret = "vault2077-local-source-rehearsal-secret";
const sourceIds = new Set([
  "source-5ae3bf5e0de199cb", // AWS Architecture Blog
  "source-d613403526f9ac18", // Simon Willison
  "source-40bf6330c82c7e69", // GitHub Blog
  "source-c0499a0dc713d290", // Hacker News API
]);

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createTcpServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitUntilReady(url, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`服务提前退出：${output()}`);
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待服务启动超时：${output()}`);
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let output = "";
    child.stdout?.on("data", (chunk) => { output += chunk; });
    child.stderr?.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`${args.join(" ")} exited with ${code}: ${output}`)));
  });
}

function jsonResponse(response, value, status = 200) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}

function mockModelResponse(messages) {
  const system = String(messages?.[0]?.content ?? "");
  const user = String(messages?.[1]?.content ?? "");
  const marker = user.lastIndexOf("不可信原始资料");
  const inputStart = user.indexOf("{", marker >= 0 ? marker : 0);
  const input = inputStart >= 0 ? JSON.parse(user.slice(inputStart)) : {};
  if (system.includes("information_batch_editorial")) {
    return {
      items: (input.information ?? []).map((item) => ({
        idempotencyKey: item.idempotencyKey,
        translatedTitle: `本地演练｜${String(item.originalTitle).slice(0, 56)}`,
        summary: `模拟摘要：${String(item.originalTitle).slice(0, 92)}`,
        translatedContent: `模拟中文译文。原始英文标题和正文仍由系统单独保留。\n\n${String(item.originalContent ?? item.originalTitle).slice(0, 800)}`,
        decision: { disposition: "candidate", candidateKey: "local-source-rehearsal-event", directionAligned: true },
      })),
    };
  }
  if (system.includes("repository_editorial")) {
    return { description: "本地演练项目说明", fit: "用于验证 GitHub 项目信息从境外采集到境内摘要的完整链路。", category: "开发工具" };
  }
  if (system.includes("event_editorial")) {
    return {
      title: "多源资讯本地演练事件",
      judgment: "多条国际信源指向同一变化方向",
      summary: "这是一次使用真实公开信源、模拟境内 LLM 的事件编排演练。",
      significance: "验证原始资讯、中文处理结果和事件沉淀能够在同一条管线中完整流转。",
      entities: ["Vault2077", "Local rehearsal"],
      category: "模型与产品",
    };
  }
  return { disposition: "independent" };
}

const [modelPort, sitePort] = await Promise.all([availablePort(), availablePort()]);
const dataRoot = await mkdtemp(path.join(tmpdir(), "vault2077-source-rehearsal-"));
const outputRoot = path.join(dataRoot, "collector-output");
const children = [];
let modelServer;

try {
  const sourceBundle = JSON.parse(await readFile(path.join(root, "config/source-bundle.json"), "utf8"));
  const selected = sourceBundle.sources.filter((source) => sourceIds.has(source.id));
  if (selected.length !== sourceIds.size) throw new Error(`测试信源缺失：期望 ${sourceIds.size} 个，实际 ${selected.length} 个。`);
  const rehearsalBundle = { ...sourceBundle, revision: `${sourceBundle.revision}-local-rehearsal`, sources: selected, counts: { active: selected.length, pending: 0, rss: selected.filter((source) => source.connector === "rss").length, structured: selected.filter((source) => source.connector !== "rss").length } };
  const bundlePath = path.join(dataRoot, "source-bundle.json");
  await writeFile(bundlePath, `${JSON.stringify(rehearsalBundle, null, 2)}\n`, "utf8");

  modelServer = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") return jsonResponse(response, { error: "not found" }, 404);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const content = JSON.stringify(mockModelResponse(body.messages));
      jsonResponse(response, { id: "local-rehearsal", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] });
    } catch (error) {
      jsonResponse(response, { error: { message: error instanceof Error ? error.message : "invalid request" } }, 400);
    }
  });
  await new Promise((resolve) => modelServer.listen(modelPort, "127.0.0.1", resolve));

  let siteOutput = "";
  const site = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(sitePort)], {
    cwd: root,
    env: {
      ...process.env,
      VAULT2077_DATA_DIR: path.join(dataRoot, "data"),
      VAULT2077_PIPELINE_SHARED_SECRET: secret,
      VAULT2077_PIPELINE_WORKER_SECRET: secret,
      VAULT2077_LLM_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
      VAULT2077_LLM_API_KEY: "local-rehearsal-key",
      VAULT2077_LLM_MODEL: "local-rehearsal-model",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(site);
  site.stdout.on("data", (chunk) => { siteOutput += chunk; });
  site.stderr.on("data", (chunk) => { siteOutput += chunk; });
  await waitUntilReady(`http://127.0.0.1:${sitePort}/feed`, site, () => siteOutput);

  const offlineCollector = `
import json, os, sys, types, time
import xml.etree.ElementTree as ET
from email.utils import parsedate_tz, mktime_tz
from datetime import datetime, timedelta, timezone
from pathlib import Path

def fake_feed_parse(payload):
    root = ET.fromstring(payload)
    entries = []
    for item in root.findall(".//item"):
        published = item.findtext("pubDate") or ""
        parsed = parsedate_tz(published)
        entry = {
            "title": item.findtext("title") or "",
            "link": item.findtext("link") or "",
            "summary": item.findtext("description") or "",
            "published_parsed": time.gmtime(mktime_tz(parsed)) if parsed else None,
        }
        entries.append(entry)
    return types.SimpleNamespace(bozo=False, entries=entries)

sys.modules["feedparser"] = types.SimpleNamespace(parse=fake_feed_parse)
import collector.feed_collector as fc

bundle, sources = fc.load_bundle(Path(os.environ["VAULT2077_SOURCE_BUNDLE_FILE"]))
now = datetime.now(timezone.utc)
start, end = fc.collection_window(now, lookback_hours=8760)
published = end - timedelta(hours=1)
stamp = fc.now_iso(now)

def rss(title, link, publisher):
    return f"""<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>{publisher}</title><item><title>{title}</title><link>{link}</link><guid>{link}</guid><pubDate>{published.strftime('%a, %d %b %Y %H:%M:%S GMT')}</pubDate><description>English source text for local pipeline rehearsal.</description></item></channel></rss>""".encode()

def fake_bytes(url, accept="application/json"):
    if "aws.amazon.com/blogs/architecture/feed" in url:
        return rss("Distributed agents move toward recoverable execution", "https://example.com/aws-architecture-rehearsal", "AWS Architecture Blog")
    if "simonwillison.net/atom/everything" in url:
        return rss("A practical look at durable agent workflows", "https://example.com/simon-rehearsal", "Simon Willison")
    if "github.blog/feed" in url:
        return rss("Open tooling makes agent state easier to inspect", "https://example.com/github-rehearsal", "GitHub Blog")
    raise ValueError(f"unmapped fixture endpoint: {url}")

def fake_json(url):
    if url.endswith("topstories.json"):
        return [101, 102, 103]
    if "/item/" in url:
        item_id = int(url.rsplit("/", 1)[-1].split(".")[0])
        return {"id": item_id, "time": int(published.timestamp()), "title": f"Community report {item_id} on recoverable agents", "url": f"https://news.ycombinator.com/item?id={item_id}", "text": "English community source text for rehearsal.", "by": "rehearsal-user"}
    raise ValueError(f"unmapped fixture JSON endpoint: {url}")

fc.fetch_bytes = fake_bytes
fc.fetch_json = fake_json
information, candidates, failures = [], [], []
for source in sources:
    try:
        documents, projects = fc.collect_source(source, start, end)
        information.extend(documents)
        candidates.extend(projects)
    except Exception as error:
        failures.append({"id": source.get("id"), "error": str(error)})
packets = fc.build_packets(bundle["revision"], fc.now_iso(start), fc.now_iso(end), stamp, information, [])
output = Path(os.environ["VAULT2077_COLLECTOR_OUTPUT_DIR"])
output.mkdir(parents=True, exist_ok=True)
receipts = []
for packet in packets:
    payload = fc.packet_payload(packet)
    (output / f"{packet['batchId']}.json").write_bytes(payload)
    receipts.append(fc.send_packet(os.environ["VAULT2077_DOMESTIC_INGEST_URL"], os.environ["VAULT2077_PIPELINE_SHARED_SECRET"], packet, payload))
processing = fc.trigger_processing(os.environ["VAULT2077_DOMESTIC_PROCESS_URL"], os.environ["VAULT2077_PIPELINE_SHARED_SECRET"], 20)
report = {"bundleRevision": bundle["revision"], "sourcesAttempted": len(sources), "sourcesSucceeded": len(sources) - len(failures), "sourcesFailed": len(failures), "information": len(information), "repositories": 0, "packets": len(packets), "receipts": receipts, "processing": processing, "failures": failures}
(output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
print(json.dumps({k: report[k] for k in ("sourcesAttempted", "sourcesSucceeded", "sourcesFailed", "information", "packets")}, ensure_ascii=False))
`;
  const collectorCommand = process.env.VAULT2077_REHEARSAL_MODE === "live" ? ["collector/feed_collector.py"] : ["-c", offlineCollector];
  const collectorOutput = await run(process.env.VAULT2077_PYTHON ?? "python", collectorCommand, {
    cwd: root,
    env: {
      ...process.env,
      PYTHONPATH: [path.join(root, ".collector-python"), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      VAULT2077_SOURCE_BUNDLE_FILE: bundlePath,
      VAULT2077_COLLECTOR_OUTPUT_DIR: outputRoot,
      VAULT2077_DOMESTIC_INGEST_URL: `http://127.0.0.1:${sitePort}/api/internal/content`,
      VAULT2077_DOMESTIC_PROCESS_URL: `http://127.0.0.1:${sitePort}/api/internal/content/process`,
      VAULT2077_PIPELINE_SHARED_SECRET: secret,
      VAULT2077_TRIGGER_PROCESSING: "true",
      VAULT2077_COLLECTION_LOOKBACK_HOURS: "8760",
      VAULT2077_MAX_ITEMS_PER_SOURCE: "3",
      VAULT2077_MAX_TREND_PROJECTS: "3",
      VAULT2077_COLLECTOR_CONCURRENCY: "4",
      VAULT2077_PER_HOST_CONCURRENCY: "2",
      VAULT2077_SOURCE_TIMEOUT_SECONDS: "20",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const report = JSON.parse(await readFile(path.join(outputRoot, "report.json"), "utf8"));
  const store = JSON.parse(await readFile(path.join(dataRoot, "data/content-store.json"), "utf8"));
  const feedResponse = await fetch(`http://127.0.0.1:${sitePort}/feed`);
  const feedHtml = await feedResponse.text();
  console.log(JSON.stringify({
    ok: true,
    siteUrl: `http://127.0.0.1:${sitePort}/`,
    sourceCount: selected.length,
    sourceTypes: selected.reduce((counts, source) => ({ ...counts, [source.connector]: (counts[source.connector] ?? 0) + 1 }), {}),
    collector: { sourcesAttempted: report.sourcesAttempted, sourcesSucceeded: report.sourcesSucceeded, sourcesFailed: report.sourcesFailed, information: report.information, repositories: report.repositories, packets: report.packets },
    domestic: { feedStatus: feedResponse.status, information: store.information.length, events: store.events.length, projects: store.projects.length, batches: store.batches.length, quarantined: store.quarantine.length },
    sample: store.information.slice(0, 2).map((item) => ({ translatedTitle: item.translatedTitle, originalTitle: item.originalTitle, summary: item.summary, originalUrl: item.sourceUrl })),
    eventSample: store.events.slice(0, 1).map((event) => ({ title: event.title, judgment: event.judgment, sources: event.sources.length })),
    pageChecks: { hasTranslatedTitle: feedHtml.includes("本地演练"), hasEvent: feedHtml.includes("多源资讯本地演练事件") },
    collectorLog: collectorOutput.trim().slice(-1200),
    dataRoot,
  }, null, 2));

  // Keep the rehearsal site available for visual inspection for 20 minutes.
  await new Promise((resolve) => setTimeout(resolve, 20 * 60 * 1000));
} finally {
  for (const child of children.reverse()) if (child.exitCode === null) child.kill();
  modelServer?.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
