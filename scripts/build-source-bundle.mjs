import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadXSourcePolicy, normalizeXHandle } from "./x-source-policy.mjs";

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) options.set(process.argv[index], process.argv[index + 1]);

const registryPath = resolve(options.get("--registry") ?? "config/source-registry.json");
const outputPath = resolve(options.get("--output") ?? "config/source-bundle.json");
const runtimePolicyPath = resolve(options.get("--runtime-policy") ?? "config/runtime-source-policy.json");
const sicRegistryPath = resolve(options.get("--sic-registry") ?? "config/sic-source-registry.json");
const institutionalNewsRegistryPath = resolve(options.get("--institutional-news-registry") ?? "config/institutional-news-registry.json");
const followBuildersRegistryPath = resolve(options.get("--follow-builders-registry") ?? "config/follow-builders-source-registry.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const runtimePolicy = JSON.parse(await readFile(runtimePolicyPath, "utf8"));
const sicRegistry = JSON.parse(await readFile(sicRegistryPath, "utf8"));
const institutionalNewsRegistry = JSON.parse(await readFile(institutionalNewsRegistryPath, "utf8"));
const followBuildersRegistry = JSON.parse(await readFile(followBuildersRegistryPath, "utf8"));
if (runtimePolicy.version !== 1 || !Array.isArray(runtimePolicy.excluded)) {
  throw new Error("Runtime source policy must contain a version 1 excluded list.");
}
const runtimeExclusions = new Map();
for (const exclusion of runtimePolicy.excluded) {
  if (
    typeof exclusion.id !== "string"
    || typeof exclusion.reason !== "string"
    || typeof exclusion.note !== "string"
    || !exclusion.id
    || !exclusion.reason
    || !exclusion.note
    || runtimeExclusions.has(exclusion.id)
  ) {
    throw new Error("Runtime source exclusions require unique id, reason, and note fields.");
  }
  runtimeExclusions.set(exclusion.id, exclusion);
}
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
  "sitemap",
  "dated-index",
  "follow-builders-x",
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
  if (runtimeExclusions.has(channel.id)) return runtimeExclusions.get(channel.id).reason;
  if (isMainlandOrigin(channel)) return "mainland_origin_platform";
  if (channel.channelType === "github-trending") return "platform_ranking_moved_to_direct_lane";
  if (channel.channelType === "github-user-events") return "github_activity_is_not_published_speech";
  if (channel.channelType === "podcast") return "podcast_moved_to_sic_lane";
  if (["reddit", "telegram"].includes(channel.channelType)) return "community_channel_not_in_initial_policy";
  if (
    ["article", "official-blog"].includes(channel.channelType)
    && ["organization", "open_source_project"].includes(channel.publisherKind)
  ) return "institutional_source_requires_curated_single_destination";
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

function contentRouting(channel) {
  if (channel.channelType === "x") {
    return {
      contentGroup: "roadside",
      itemKind: "personal_post",
      provenanceRole: "canonical",
      provenanceStatus: "verified",
    };
  }
  if (channel.channelType === "community") {
    return {
      contentGroup: "roadside",
      itemKind: "community_topic",
      provenanceRole: "canonical",
      provenanceStatus: "verified",
    };
  }
  if (channel.publisherKind === "person") {
    return {
      contentGroup: "roadside",
      itemKind: "personal_post",
      provenanceRole: "canonical",
      provenanceStatus: "verified",
    };
  }
  if (channel.channelType === "github-release") {
    return {
      contentGroup: "information",
      itemKind: "release",
      provenanceRole: "canonical",
      provenanceStatus: "verified",
    };
  }
  if (channel.publisherKind === "organization" || channel.publisherKind === "open_source_project") {
    return {
      contentGroup: "information",
      itemKind: "article",
      provenanceRole: "canonical",
      provenanceStatus: "verified",
    };
  }
  return {
    contentGroup: "information",
    itemKind: "article",
    provenanceRole: "canonical",
    provenanceStatus: "verified",
  };
}

function institutionalNewsSource(source) {
  const connector = source.kind === "official_sitemap"
    ? "sitemap"
    : "rss";
  const aggregated = source.kind === "aggregated_rss";
  return {
    id: `institutional-news:${source.id}`,
    identity: `institutional-news:${source.id}`,
    name: source.name,
    role: "官方",
    ownerEntity: `organization:${source.publisher.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    publisherKind: "organization",
    evidenceNature: "primary",
    classificationConfidence: "high",
    classificationSource: "institutional_news_registry",
    language: "en",
    primaryLanguage: "en",
    geography: "US",
    channelType: "official-news",
    channelIdentifier: source.id,
    homeUrl: source.homeUrl,
    evidenceEligible: true,
    contentCapability: source.kind === "official_sitemap" ? "fulltext" : "feed-content",
    discoveredFrom: [{ repository: "code-lawyer/Superones", path: "config/institutional-news-registry.json" }],
    sourceStream: "information",
    contentGroup: "information",
    itemKind: "article",
    provenanceRole: "canonical",
    provenanceStatus: aggregated ? "declared" : "verified",
    originPlatform: "web",
    authorityTier: null,
    endpoint: source.endpoint,
    connector,
    pathPrefix: source.pathPrefix ?? null,
    aggregator: source.aggregator ?? null,
    validation: {
      status: "usable",
      checkedAt: new Date().toISOString(),
      finalUrl: source.endpoint,
    },
  };
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
  const routing = contentRouting(channel);
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
    sourceStream: routing.contentGroup === "roadside" ? "roadside" : "information",
    ...routing,
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

if (!sicRegistry || sicRegistry.version !== 1 || !Array.isArray(sicRegistry.sources)) {
  throw new Error("SiC source registry must contain a version 1 sources list.");
}
const approvedSicDocuments = sicRegistry.sources.filter((item) => (
  item.group === "documents" && item.status === "approved"
));
for (const source of approvedSicDocuments) {
  const curatedHome = source.homeUrl.replace(/\/$/, "").toLowerCase();
  const curatedEndpoint = source.endpoint.replace(/\/$/, "").toLowerCase();
  const duplicateNames = new Set({
    "google-deepmind-blog": ["Google DeepMind Blog"],
    "meta-engineering": ["Engineering at Meta", "Meta Engineering"],
    "microsoft-research-blog": ["Microsoft Research Blog"],
    "aws-architecture-blog": ["AWS Architecture Blog"],
    "aws-machine-learning-blog": ["AWS Machine Learning Blog"],
    "cloudflare-blog": ["The Cloudflare Blog"],
  }[source.id] ?? [source.name]);
  const duplicateIndexes = sources
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => (
      String(candidate.homeUrl ?? "").replace(/\/$/, "").toLowerCase() === curatedHome
      || String(candidate.endpoint ?? "").replace(/\/$/, "").toLowerCase() === curatedEndpoint
      || duplicateNames.has(candidate.name)
    ))
    .map(({ index }) => index)
    .reverse();
  for (const index of duplicateIndexes) sources.splice(index, 1);
  const pendingDuplicateIndexes = pending
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => (
      String(candidate.homeUrl ?? "").replace(/\/$/, "").toLowerCase() === curatedHome
      || duplicateNames.has(candidate.name)
    ))
    .map(({ index }) => index)
    .reverse();
  for (const index of pendingDuplicateIndexes) pending.splice(index, 1);
}

if (
  !institutionalNewsRegistry
  || institutionalNewsRegistry.version !== 1
  || !Array.isArray(institutionalNewsRegistry.sources)
) {
  throw new Error("Institutional news registry must contain a version 1 sources list.");
}
for (const source of institutionalNewsRegistry.sources.filter((item) => item.status === "approved")) {
  const curated = institutionalNewsSource(source);
  const curatedHome = curated.homeUrl.replace(/\/$/, "").toLowerCase();
  const duplicateNames = new Set({
    "anthropic-news": ["Anthropic News"],
    "openai-news": ["OpenAI Blog", "OpenAI News"],
  }[source.id] ?? [source.name]);
  const duplicateIndexes = sources
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => (
      String(candidate.homeUrl ?? "").replace(/\/$/, "").toLowerCase() === curatedHome
      || duplicateNames.has(candidate.name)
    ))
    .map(({ index }) => index)
    .reverse();
  for (const index of duplicateIndexes) sources.splice(index, 1);
  const pendingDuplicateIndexes = pending
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => (
      String(candidate.homeUrl ?? "").replace(/\/$/, "").toLowerCase() === curatedHome
      || duplicateNames.has(candidate.name)
    ))
    .map(({ index }) => index)
    .reverse();
  for (const index of pendingDuplicateIndexes) pending.splice(index, 1);
  sources.push(curated);
}

if (
  !followBuildersRegistry
  || followBuildersRegistry.version !== 1
  || !Array.isArray(followBuildersRegistry.accounts)
  || followBuildersRegistry.failureMode !== "isolated"
  || !String(followBuildersRegistry.upstream?.feedUrl ?? "").startsWith("https://raw.githubusercontent.com/")
) {
  throw new Error("Follow Builders registry must contain a version 1 account list, isolated failure mode, and an HTTPS raw feed URL.");
}
if (
  !Number.isInteger(followBuildersRegistry.staleAfterHours)
  || followBuildersRegistry.staleAfterHours < 24
  || followBuildersRegistry.staleAfterHours > 72
  || followBuildersRegistry.maxAccounts !== followBuildersRegistry.accounts.length
  || !Number.isInteger(followBuildersRegistry.maxItemsPerAccount)
  || followBuildersRegistry.maxItemsPerAccount < 1
  || followBuildersRegistry.maxItemsPerAccount > 3
  || followBuildersRegistry.maxItemsPerFeed !== followBuildersRegistry.maxAccounts * followBuildersRegistry.maxItemsPerAccount
) {
  throw new Error("Follow Builders registry limits are invalid.");
}
const followBuildersHandles = new Set();
for (const account of followBuildersRegistry.accounts) {
  const handle = normalizeXHandle(account.handle);
  if (
    !handle
    || followBuildersHandles.has(handle)
    || !["approved", "excluded"].includes(account.status)
    || !["person", "organization"].includes(account.publisherKind)
    || (account.status === "approved" && account.publisherKind !== "person")
    || (account.status === "excluded" && !String(account.reason ?? "").trim())
  ) {
    throw new Error("Follow Builders accounts require unique handles, explicit status, and person-only roadside approval.");
  }
  followBuildersHandles.add(handle);
}

const activeXHandles = new Set(sources
  .filter((source) => source.originPlatform === "x")
  .map((source) => normalizeXHandle(source.channelIdentifier)));
let followBuildersDuplicates = 0;
let followBuildersAdded = 0;
for (const account of followBuildersRegistry.accounts.filter((item) => item.status === "approved")) {
  const handle = normalizeXHandle(account.handle);
  if (activeXHandles.has(handle)) {
    followBuildersDuplicates += 1;
    continue;
  }
  const idHandle = handle.replace(/[^a-z0-9_]+/g, "-");
  sources.push({
    id: `source-follow-builders-x-${idHandle}`,
    identity: `x:${handle}`,
    name: account.name,
    role: "评论",
    ownerEntity: `person:${idHandle}`,
    publisherKind: "person",
    evidenceNature: "social_community",
    classificationConfidence: "high",
    classificationSource: "curated_follow_builders_registry",
    language: "en",
    primaryLanguage: "en",
    geography: "unknown",
    channelType: "x",
    channelIdentifier: account.handle,
    homeUrl: `https://x.com/${account.handle}`,
    evidenceEligible: true,
    contentCapability: "feed-content",
    discoveredFrom: [{
      repository: followBuildersRegistry.upstream.repository,
      path: followBuildersRegistry.upstream.sourcePath,
    }],
    sourceStream: "roadside",
    contentGroup: "roadside",
    itemKind: "personal_post",
    provenanceRole: "canonical",
    provenanceStatus: "verified",
    originPlatform: "x",
    authorityTier: "editorial_voice",
    endpoint: followBuildersRegistry.upstream.feedUrl,
    connector: "follow-builders-x",
    aggregator: "zarazhangrui/follow-builders",
    failureMode: "isolated",
    staleAfterHours: followBuildersRegistry.staleAfterHours,
    maxAccounts: followBuildersRegistry.maxAccounts,
    maxItemsPerAccount: followBuildersRegistry.maxItemsPerAccount,
    maxItemsPerFeed: followBuildersRegistry.maxItemsPerFeed,
  });
  activeXHandles.add(handle);
  followBuildersAdded += 1;
}

sources.sort((left, right) => left.channelType.localeCompare(right.channelType) || left.name.localeCompare(right.name, "zh-CN"));
pending.sort((left, right) => left.channelType.localeCompare(right.channelType) || left.name.localeCompare(right.name, "zh-CN"));
const bundleRevision = createHash("sha256")
  .update(JSON.stringify({
    xPolicyHash,
    runtimePolicy,
    institutionalNewsRegistryVersion: institutionalNewsRegistry.version,
    sicRegistryVersion: sicRegistry.version,
    followBuildersRegistry,
    sicDocumentSources: approvedSicDocuments.map(({ id, status, endpoint, admissionRule }) => ({
      id,
      status,
      endpoint,
      admissionRule,
    })),
    repositories: registry.repositories.map(({ name, commit }) => ({ name, commit })),
    sources: sources.map(({ id, endpoint, connector, ownerEntity, publisherKind, evidenceNature, contentGroup, itemKind, provenanceRole, provenanceStatus, pathPrefix, failureMode }) => ({
      id,
      endpoint,
      connector,
      ownerEntity,
      publisherKind,
      evidenceNature,
      contentGroup,
      itemKind,
      provenanceRole,
      provenanceStatus,
      pathPrefix,
      failureMode,
    })),
  }))
  .digest("hex")
  .slice(0, 16);

const bundle = {
  version: 1,
  revision: `source-bundle-${bundleRevision}`,
  generatedAt: new Date().toISOString(),
  registryGeneratedAt: registry.generatedAt,
  registryAuditedAt: registry.audit?.checkedAt ?? null,
  policy: "Approved news publications, official newsrooms and project releases enter information. Verified people and personal blogs enter roadside. Follow Builders contributes a deduplicated, person-only X supplement through an isolated adapter; its institutional X accounts are excluded. Hacker News and Lobsters are retired. Approved deep research, engineering publications, and podcasts enter SiC and never duplicate into information or roadside. GitHub user activity is not published speech. Unknown publishers and unresolved canonical URLs are quarantined.",
  counts: {
    active: sources.length,
    pending: pending.length,
    rss: sources.filter((source) => source.connector === "rss").length,
    structured: sources.filter((source) => source.connector !== "rss").length,
    information: sources.filter((source) => source.contentGroup === "information").length,
    documents: sources.filter((source) => source.contentGroup === "documents").length,
    roadside: sources.filter((source) => source.sourceStream === "roadside").length,
    statements: sources.filter((source) => source.sourceStream === "roadside" && source.originPlatform === "x").length,
    followBuildersX: followBuildersAdded,
    followBuildersXDuplicates: followBuildersDuplicates,
    followBuildersXExcluded: followBuildersRegistry.accounts.filter((account) => account.status === "excluded").length,
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
