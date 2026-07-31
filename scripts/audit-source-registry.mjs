import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) options.set(process.argv[index], process.argv[index + 1]);

const registryPath = resolve(options.get("--registry") ?? "config/source-registry.json");
const csvPath = resolve(options.get("--csv") ?? "docs/Vault2077-Source-Registry.csv");
const healthPath = resolve(options.get("--health") ?? "config/source-health.json");
const concurrency = Math.max(1, Number.parseInt(options.get("--concurrency") ?? "8", 10));
const perHostConcurrency = Math.max(1, Number.parseInt(options.get("--per-host") ?? "2", 10));
const timeoutMs = Math.max(3_000, Number.parseInt(options.get("--timeout") ?? "15000", 10));
const resume = options.get("--resume") === "true";
const retryFailed = options.get("--retry-failed") === "true";
const allowDegraded = options.get("--allow-degraded") === "true";
const promote = options.get("--promote") === "true";
const maxBytes = 256 * 1024;
const registry = JSON.parse(await readFile(registryPath, "utf8"));
if (resume || retryFailed) {
  try {
    const previousHealth = JSON.parse(await readFile(healthPath, "utf8"));
    if (previousHealth.registryGeneratedAt === registry.generatedAt) {
      const previousChannels = new Map(previousHealth.channels.map((channel) => [channel.id, channel]));
      for (const channel of registry.channels) {
        const previous = previousChannels.get(channel.id);
        if (!previous) continue;
        const previousEndpoints = new Map(previous.endpoints.map((endpoint) => [endpoint.url, endpoint]));
        for (const endpoint of channel.endpoints) {
          const observed = previousEndpoints.get(endpoint.url);
          if (observed?.validation) endpoint.validation = observed.validation;
        }
      }
    }
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
  }
}
const tasks = registry.channels.flatMap((channel) => channel.endpoints.map((endpoint) => ({ channel, endpoint })));
const hostActive = new Map();
let cursor = 0;
let completed = 0;

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function classifyStatus(status) {
  if (status === 401 || status === 407) return "auth_required";
  if (status === 403 || status === 429) return "blocked";
  if (status === 404 || status === 410) return "unavailable";
  if (status >= 500) return "upstream_error";
  return "http_error";
}

async function readLimitedBody(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - total;
    chunks.push(value.byteLength > remaining ? value.slice(0, remaining) : value);
    total += Math.min(value.byteLength, remaining);
  }
  await reader.cancel().catch(() => {});
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

function validateBody(connectorType, body, contentType) {
  const trimmed = body.trim();
  if (connectorType === "rss") {
    const isFeed = /<(rss|feed|rdf:RDF)\b/i.test(trimmed);
    const entryCount = (trimmed.match(/<(item|entry)\b/gi) ?? []).length;
    const title = trimmed.match(/<title(?:\s[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return { valid: isFeed, format: isFeed ? "feed" : "unexpected", entryCount, observedTitle: title?.slice(0, 240) };
  }
  if (["json", "newsnow", "hackernews", "reddit", "github-releases", "github-user-events"].includes(connectorType)) {
    try {
      const parsed = JSON.parse(trimmed);
      const itemCount = Array.isArray(parsed)
        ? parsed.length
        : Array.isArray(parsed?.data)
          ? parsed.data.length
          : Array.isArray(parsed?.items)
            ? parsed.items.length
            : Array.isArray(parsed?.articles)
              ? parsed.articles.length
              : null;
      return { valid: true, format: "json", entryCount: itemCount };
    } catch {
      const looksLikeTruncatedJson = contentType.includes("json") && /^[\[{]/.test(trimmed);
      return {
        valid: looksLikeTruncatedJson,
        format: looksLikeTruncatedJson ? "json-truncated" : contentType.includes("html") ? "html" : "unexpected",
        truncated: looksLikeTruncatedJson,
      };
    }
  }
  if (["html-index", "github-trending-html"].includes(connectorType)) {
    const isHtml = /<!doctype html|<html\b|<body\b/i.test(trimmed);
    const title = trimmed.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
    return { valid: isHtml, format: isHtml ? "html" : "unexpected", observedTitle: title?.slice(0, 240) };
  }
  return { valid: trimmed.length > 0, format: contentType || "unknown" };
}

async function probe(endpoint) {
  if (endpoint.requiresAuth) {
    return { status: "auth_required", checkedAt: new Date().toISOString(), note: "Endpoint requires credentials and was not called by the public audit." };
  }
  const startedAt = Date.now();
  try {
    const response = await fetch(endpoint.url, {
      redirect: "follow",
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml, application/xml, text/html;q=0.8, */*;q=0.2",
        "Accept-Language": "en-US,en;q=0.8,zh-CN;q=0.5",
        Range: `bytes=0-${maxBytes - 1}`,
        "User-Agent": "Vault2077-Source-Auditor/1.0 (+https://superones.top)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = await readLimitedBody(response);
    const bodyResult = validateBody(endpoint.connectorType, body, contentType.toLowerCase());
    const status = response.ok ? (bodyResult.valid ? "usable" : "invalid_content") : classifyStatus(response.status);
    return {
      status,
      checkedAt: new Date().toISOString(),
      httpStatus: response.status,
      finalUrl: response.url,
      contentType: contentType.slice(0, 200),
      latencyMs: Date.now() - startedAt,
      bytesInspected: new TextEncoder().encode(body).byteLength,
      ...bodyResult,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: /timeout|aborted/i.test(message) ? "timeout" : "network_error",
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      error: message.slice(0, 300),
    };
  }
}

async function nextTask() {
  while (true) {
    if (cursor >= tasks.length) return null;
    const task = tasks[cursor];
    const host = new URL(task.endpoint.url).hostname.toLowerCase();
    if ((hostActive.get(host) ?? 0) >= perHostConcurrency) {
      await delay(40);
      continue;
    }
    cursor += 1;
    hostActive.set(host, (hostActive.get(host) ?? 0) + 1);
    return { ...task, host };
  }
}

async function worker() {
  while (true) {
    const task = await nextTask();
    if (!task) return;
    try {
      const previousStatus = task.endpoint.validation?.status;
      const shouldSkip = (resume && task.endpoint.validation?.checkedAt)
        || (retryFailed && ["usable", "auth_required"].includes(previousStatus));
      if (!shouldSkip) {
        task.endpoint.validation = await probe(task.endpoint);
      }
    } finally {
      hostActive.set(task.host, Math.max(0, (hostActive.get(task.host) ?? 1) - 1));
      completed += 1;
      if (completed % 25 === 0 || completed === tasks.length) {
        console.log(`Audited ${completed}/${tasks.length} endpoints`);
      }
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const endpointStatuses = tasks.map(({ endpoint }) => endpoint.validation?.status ?? "not_checked");
const publicEndpointStatuses = endpointStatuses.filter((status) => status !== "auth_required");
const usableEndpointCount = endpointStatuses.filter((status) => status === "usable").length;
const transportFailureCount = publicEndpointStatuses
  .filter((status) => status === "network_error" || status === "timeout")
  .length;
const transportFailureRatio = publicEndpointStatuses.length > 0
  ? transportFailureCount / publicEndpointStatuses.length
  : 1;
if (
  !allowDegraded
  && (usableEndpointCount === 0 || transportFailureRatio > 0.8)
) {
  throw new Error(
    `来源审计拒绝覆盖最后一次结果：usable=${usableEndpointCount}，`
    + `transportFailureRatio=${transportFailureRatio.toFixed(3)}。`
    + "仅限调查时可显式传入 --allow-degraded true。",
  );
}

for (const channel of registry.channels) {
  const statuses = channel.endpoints.map((endpoint) => endpoint.validation.status);
  const status = statuses.includes("usable")
    ? "usable"
    : statuses.every((value) => value === "auth_required")
      ? "auth_required"
      : statuses.includes("blocked")
        ? "blocked"
        : statuses.includes("timeout")
          ? "timeout"
          : statuses[0] ?? "not_checked";
  channel.validation = {
    status,
    checkedAt: new Date().toISOString(),
    usableEndpoints: statuses.filter((value) => value === "usable").length,
    checkedEndpoints: statuses.filter((value) => value !== "auth_required").length,
  };
}

registry.audit = {
  checkedAt: new Date().toISOString(),
  timeoutMs,
  concurrency,
  perHostConcurrency,
  usableEndpointCount,
  transportFailureCount,
  transportFailureRatio: Number(transportFailureRatio.toFixed(4)),
  statusCounts: Object.fromEntries([...new Set(registry.channels.map((channel) => channel.validation.status))].sort().map((status) => [status, registry.channels.filter((channel) => channel.validation.status === status).length])),
};

const healthReport = {
  version: 1,
  registryGeneratedAt: registry.generatedAt,
  ...registry.audit,
  channels: registry.channels.map((channel) => ({
    id: channel.id,
    identity: channel.identity,
    status: channel.validation.status,
    endpoints: channel.endpoints.map((endpoint) => ({
      url: endpoint.url,
      connectorType: endpoint.connectorType,
      requiresAuth: endpoint.requiresAuth,
      validation: endpoint.validation,
    })),
  })),
};
await writeFile(healthPath, `${JSON.stringify(healthReport, null, 2)}\n`, "utf8");

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

const csvRows = [[
  "id", "publisher_name", "publisher_role", "owner_entity", "publisher_kind", "evidence_nature", "classification_confidence", "primary_language", "geography", "channel_type", "channel_identifier", "endpoint", "connector", "aggregator", "requires_auth", "evidence_eligible", "content_capability", "validation_status", "http_status", "final_url", "content_type", "entry_count", "checked_at", "discovered_from",
]];
for (const channel of registry.channels) {
  for (const endpoint of channel.endpoints.length ? channel.endpoints : [{}]) {
    csvRows.push([
      channel.id,
      channel.publisherName,
      channel.publisherRole,
      channel.ownerEntity,
      channel.publisherKind,
      channel.evidenceNature,
      channel.classification?.confidence,
      channel.primaryLanguage,
      channel.geography,
      channel.channelType,
      channel.channelIdentifier,
      endpoint.url,
      endpoint.connectorType,
      endpoint.aggregator,
      endpoint.requiresAuth,
      channel.evidenceEligible,
      channel.contentCapability,
      endpoint.validation?.status ?? channel.validation.status,
      endpoint.validation?.httpStatus,
      endpoint.validation?.finalUrl,
      endpoint.validation?.contentType,
      endpoint.validation?.entryCount,
      endpoint.validation?.checkedAt,
      channel.discoveredFrom.map((item) => `${item.repository}:${item.path}`).join(" | "),
    ]);
  }
}

if (promote) {
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  await writeFile(csvPath, `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
}
console.log(JSON.stringify({
  ...registry.audit,
  healthPath,
  promoted: promote,
}, null, 2));
