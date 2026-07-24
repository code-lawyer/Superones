import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadXSourcePolicy, normalizeXHandle } from "./x-source-policy.mjs";

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) options.set(process.argv[index], process.argv[index + 1]);

const registryPath = resolve(options.get("--registry") ?? "config/source-registry.json");
const outputPath = resolve(options.get("--output") ?? "config/source-bundle.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const unchecked = registry.channels.flatMap((channel) => channel.endpoints).filter((endpoint) => !endpoint.validation?.checkedAt);
if (!registry.audit?.checkedAt || unchecked.length > 0 || Date.parse(registry.audit.checkedAt) < Date.parse(registry.generatedAt)) {
  throw new Error(`Registry must be audited after extraction before building a bundle (${unchecked.length} unchecked endpoints).`);
}
const unclassified = registry.channels.filter((channel) => !channel.ownerEntity || !channel.publisherKind || !channel.evidenceNature || !channel.classification?.confidence);
if (!registry.classification?.classifiedAt || unclassified.length > 0 || Date.parse(registry.classification.classifiedAt) < Date.parse(registry.generatedAt)) {
  throw new Error(`Registry must be classified after extraction before building a bundle (${unclassified.length} unclassified channels).`);
}
const overridesText = await readFile(resolve(registry.classification.overridesFile), "utf8");
const overridesHash = createHash("sha256").update(overridesText).digest("hex");
if (overridesHash !== registry.classification.overridesHash) {
  throw new Error("Source classification overrides changed after the registry was classified. Run sources:classify again.");
}
const xPolicyPath = resolve(options.get("--x-policy") ?? registry.classification.xPolicyFile ?? "config/x-source-policy.json");
const { policy: xPolicy, hash: xPolicyHash } = await loadXSourcePolicy(xPolicyPath);
if (xPolicyHash !== registry.classification.xPolicyHash) {
  throw new Error("X source policy changed after the registry was classified. Run sources:classify again.");
}

const ignoredChannelTypes = new Set(["market-data", "twitch", "dynamic-aggregate-list", "youtube"]);
const collectorSupport = new Set([
  "rss",
  "hackernews",
  "reddit",
  "github-releases",
  "github-user-events",
  "newsnow",
  "json",
]);
const unstructuredHtmlConnectors = new Set([
  "html-index",
  "github-trending-html",
  "telegram-html",
]);

const internationalPlatformChannels = new Set([
  "x",
  "github-release",
  "github-user-events",
  "github-trending",
  "reddit",
  "telegram",
  "podcast",
  "community",
]);
const mainlandOriginHosts = [
  "baidu.com",
  "bilibili.com",
  "cls.cn",
  "douyin.com",
  "ifeng.com",
  "mp.weixin.qq.com",
  "thepaper.cn",
  "toutiao.com",
  "wallstreetcn.com",
  "weibo.com",
  "xiaoyuzhoufm.com",
  "xiaohongshu.com",
  "zhihu.com",
];

function hostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function matchesHost(host, expected) {
  return host === expected || host.endsWith(`.${expected}`);
}

function isMainlandOrigin(channel) {
  const originHost = hostname(channel.homeUrl);
  if (mainlandOriginHosts.some((expected) => matchesHost(originHost, expected))) return true;
  return channel.endpoints.some((endpoint) => {
    const endpointUrl = String(endpoint.url ?? "").toLowerCase();
    return hostname(endpointUrl).includes("wechat2rss") || endpointUrl.includes("/xiaoyuzhou/");
  });
}

function sourceAdmission(channel) {
  if (isMainlandOrigin(channel)) return "mainland_origin_platform";
  if (
    channel.channelType === "x"
    && !xPolicy.accounts.has(normalizeXHandle(channel.channelIdentifier))
  ) return "x_policy_excluded";
  if (internationalPlatformChannels.has(channel.channelType)) return null;
  if (["article", "official-blog"].includes(channel.channelType)) {
    if (channel.geography === "CN") return "mainland_direct_publisher";
    if (!/^[A-Z]{2}$/.test(channel.geography ?? "")) return "unverified_direct_publisher_origin";
  }
  return null;
}

function priority(endpoint) {
  const validation = endpoint.validation?.status;
  return (validation === "usable" ? 0 : 100)
    + (endpoint.requiresAuth ? 50 : 0)
    + (endpoint.aggregator ? 10 : 0);
}

function runtimeEndpoint(endpoint) {
  const finalUrl = endpoint.validation?.finalUrl;
  if (typeof finalUrl === "string" && finalUrl.startsWith("https://")) return finalUrl;
  return endpoint.url;
}

const sources = [];
const pending = [];
for (const channel of registry.channels) {
  if (ignoredChannelTypes.has(channel.channelType)) continue;
  const endpoints = [...channel.endpoints].sort((left, right) => priority(left) - priority(right));
  const endpoint = endpoints.find((candidate) => candidate.validation?.status === "usable" && collectorSupport.has(candidate.connectorType));
  const hasUnstructuredHtml = endpoints.some((candidate) => unstructuredHtmlConnectors.has(candidate.connectorType));
  const admissionFailure = sourceAdmission(channel);
  const xPolicyAccount = channel.channelType === "x"
    ? xPolicy.accounts.get(normalizeXHandle(channel.channelIdentifier))
    : undefined;
  const item = {
    id: channel.id,
    identity: channel.identity,
    name: channel.publisherName,
    role: channel.publisherRole,
    ownerEntity: channel.ownerEntity,
    publisherKind: channel.publisherKind,
    evidenceNature: channel.evidenceNature,
    classificationConfidence: channel.classification.confidence,
    classificationSource: channel.classification.source,
    language: channel.language,
    primaryLanguage: channel.primaryLanguage,
    geography: channel.geography,
    channelType: channel.channelType,
    channelIdentifier: channel.channelIdentifier,
    homeUrl: channel.homeUrl,
    evidenceEligible: channel.evidenceEligible,
    contentCapability: channel.contentCapability,
    discoveredFrom: channel.discoveredFrom,
    sourceStream: channel.channelType === "x" ? "statements" : "information",
    originPlatform: channel.channelType === "x" ? "x" : "web",
    authorityTier: xPolicyAccount?.authorityTier ?? null,
  };
  if (endpoint && !admissionFailure) {
    sources.push({
      ...item,
      endpoint: runtimeEndpoint(endpoint),
      connector: endpoint.connectorType,
      aggregator: endpoint.aggregator,
      validation: endpoint.validation,
    });
  } else {
    pending.push({
      ...item,
      endpoints: endpoints.map((candidate) => ({
        url: candidate.url,
        connector: candidate.connectorType,
        requiresAuth: candidate.requiresAuth,
        validation: candidate.validation,
      })),
      reason: admissionFailure
        ?? (endpoints.length === 0
        ? "no_concrete_endpoint"
        : hasUnstructuredHtml
          ? "unstructured_html_connector_disallowed"
        : endpoints.some((candidate) => candidate.validation?.status === "usable")
          ? "connector_not_implemented"
          : "no_verified_usable_endpoint"),
    });
  }
}

sources.sort((left, right) => left.channelType.localeCompare(right.channelType) || left.name.localeCompare(right.name, "zh-CN"));
pending.sort((left, right) => left.channelType.localeCompare(right.channelType) || left.name.localeCompare(right.name, "zh-CN"));
const bundleRevision = createHash("sha256")
  .update(JSON.stringify({
    xPolicyHash,
    repositories: registry.repositories.map(({ name, commit }) => ({ name, commit })),
    sources: sources.map(({ id, endpoint, connector, ownerEntity, publisherKind, evidenceNature }) => ({ id, endpoint, connector, ownerEntity, publisherKind, evidenceNature })),
  }))
  .digest("hex")
  .slice(0, 16);

const bundle = {
  version: 1,
  revision: `source-bundle-${bundleRevision}`,
  generatedAt: new Date().toISOString(),
  registryGeneratedAt: registry.generatedAt,
  registryAuditedAt: registry.audit?.checkedAt ?? null,
  policy: "One verified primary endpoint per deduplicated source channel. X statements and document-style information are equal event inputs but remain separate presentation streams. Only X accounts admitted by the fail-closed authority policy enter the runtime bundle; directory and RSS relay duplication never creates additional logical accounts. Content language is not an admission criterion. Mainland-China origin platforms are excluded; international publishing platforms may carry content in any language. YouTube and other video-only channels are excluded because the product does not perform video download, transcription, or summarization. Runtime connectors must use machine-readable interfaces. Browser automation and unstructured HTML index connectors are disallowed.",
  counts: {
    active: sources.length,
    pending: pending.length,
    rss: sources.filter((source) => source.connector === "rss").length,
    structured: sources.filter((source) => source.connector !== "rss").length,
    information: sources.filter((source) => source.sourceStream === "information").length,
    statements: sources.filter((source) => source.sourceStream === "statements").length,
    xCandidates: registry.channels.filter((channel) => channel.channelType === "x").length,
    xRunnableCandidates: registry.channels.filter((channel) => (
      channel.channelType === "x"
      && channel.endpoints.some((endpoint) => (
        endpoint.validation?.status === "usable"
        && collectorSupport.has(endpoint.connectorType)
      ))
    )).length,
    xExcludedFromRuntime: pending.filter((source) => (
      source.reason === "x_policy_excluded"
      && source.endpoints.some((endpoint) => (
        endpoint.validation?.status === "usable"
        && collectorSupport.has(endpoint.connector)
      ))
    )).length,
    xDuplicateDiscoveriesMerged: registry.channels
      .filter((channel) => channel.channelType === "x")
      .reduce((total, channel) => total + Math.max(0, channel.discoveredFrom.length - 1), 0),
  },
  sources,
  pending,
};

await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...bundle.counts }, null, 2));
