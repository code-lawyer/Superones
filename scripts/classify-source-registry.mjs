import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadXSourcePolicy, normalizeXHandle } from "./x-source-policy.mjs";

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) options.set(process.argv[index], process.argv[index + 1]);

const registryPath = resolve(options.get("--registry") ?? "config/source-registry.json");
const overridesInput = options.get("--overrides") ?? "config/source-classification-overrides.json";
const overridesPath = resolve(overridesInput);
const xPolicyInput = options.get("--x-policy") ?? "config/x-source-policy.json";
const xPolicyPath = resolve(xPolicyInput);
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const overridesText = await readFile(overridesPath, "utf8");
const overrides = JSON.parse(overridesText);
const { policy: xPolicy, hash: xPolicyHash } = await loadXSourcePolicy(xPolicyPath);
const registeredXHandles = new Set(
  registry.channels
    .filter((channel) => channel.channelType === "x")
    .map((channel) => normalizeXHandle(channel.channelIdentifier)),
);
const unknownPolicyHandles = [...xPolicy.accounts.keys()].filter((handle) => !registeredXHandles.has(handle));
if (unknownPolicyHandles.length > 0) {
  throw new Error(`X source policy contains unknown handles: ${unknownPolicyHandles.join(", ")}`);
}

const PUBLISHER_KINDS = new Set(["organization", "person", "editorial_media", "community", "platform", "aggregator", "open_source_project"]);
const EVIDENCE_NATURES = new Set(["primary", "reported_analysis", "social_community", "discovery_aggregate", "non_information_data"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);

function normalize(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[’]/g, "'").replace(/\s+/g, " ");
}

function slug(value) {
  return normalize(value).replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "unknown";
}

const aliases = new Map();
for (const entity of overrides.entities ?? []) {
  if (!PUBLISHER_KINDS.has(entity.kind)) throw new Error(`Invalid publisher kind for ${entity.id}`);
  for (const alias of entity.aliases ?? []) {
    const key = normalize(alias);
    if (aliases.has(key)) throw new Error(`Duplicate classification alias: ${alias}`);
    aliases.set(key, entity);
  }
}

function typeDefaults(channel) {
  switch (channel.channelType) {
    case "official-blog": return ["organization", "primary", "high"];
    case "github-release": return ["open_source_project", "primary", "high"];
    case "github-user-events": return ["person", "social_community", "high"];
    case "community":
    case "reddit": return ["community", "social_community", "high"];
    case "telegram": return ["community", "social_community", "medium"];
    case "hotlist": return ["platform", "discovery_aggregate", "high"];
    case "github-trending":
    case "news-search":
    case "dynamic-aggregate-list": return ["aggregator", "discovery_aggregate", "high"];
    case "market-data": return ["platform", "non_information_data", "high"];
    case "twitch": return ["person", "non_information_data", "medium"];
    case "podcast": return ["editorial_media", "reported_analysis", "medium"];
    case "x": return ["person", "social_community", "low"];
    case "article":
    default: return ["editorial_media", "reported_analysis", "low"];
  }
}

function defaultLanguage(channel) {
  if (/\p{Script=Han}/u.test(channel.publisherName)) return "zh-CN";
  if (["community", "github-release", "github-user-events"].includes(channel.channelType)) return "en";
  return "unknown";
}

function defaultOwnerEntity(channel, publisherKind) {
  if (channel.channelType === "github-release") return `github:${normalize(channel.channelIdentifier)}`;
  if (channel.channelType === "github-user-events") return `github-user:${normalize(channel.channelIdentifier)}`;
  if (channel.channelType === "github-trending") {
    return channel.publisherName.startsWith("OSS Insight") ? "aggregator:oss-insight" : "aggregator:github-trending";
  }
  if (channel.channelType === "news-search") return `aggregator:${slug(channel.publisherName.split(":")[0])}`;
  if (channel.channelType === "dynamic-aggregate-list") return `aggregator:folo:${channel.channelIdentifier}`;
  return `${publisherKind}:${slug(channel.publisherName)}`;
}

function classificationFor(channel) {
  const directOverride = overrides.channelOverrides?.[channel.identity];
  const entity = aliases.get(normalize(channel.publisherName));
  const xPolicyAccount = channel.channelType === "x"
    ? xPolicy.accounts.get(normalizeXHandle(channel.channelIdentifier))
    : undefined;
  let [publisherKind, evidenceNature, confidence] = typeDefaults(channel);
  let ownerEntity = defaultOwnerEntity(channel, publisherKind);
  let primaryLanguage = defaultLanguage(channel);
  let geography = "unknown";
  let classificationSource = `channel_type_rule:${channel.channelType}`;

  if (entity) {
    publisherKind = entity.kind;
    ownerEntity = `entity:${entity.id}`;
    primaryLanguage = entity.language ?? primaryLanguage;
    geography = entity.geography ?? geography;
    confidence = "high";
    classificationSource = `curated_entity:${entity.id}`;
    if (["organization", "open_source_project"].includes(publisherKind)
      && ["article", "official-blog", "x", "github-release"].includes(channel.channelType)) {
      evidenceNature = "primary";
    } else if (publisherKind === "editorial_media") {
      evidenceNature = "reported_analysis";
    }
  }

  if (xPolicyAccount) {
    publisherKind = xPolicyAccount.publisherKind;
    evidenceNature = xPolicyAccount.evidenceNature;
    confidence = xPolicyAccount.confidence;
    if (!entity) {
      ownerEntity = publisherKind === "person"
        ? `person:x:${xPolicyAccount.handle}`
        : `${publisherKind}:x:${xPolicyAccount.handle}`;
    }
    classificationSource = `x_source_policy:${xPolicy.version}:${xPolicyAccount.authorityTier}`;
  }

  if (directOverride) {
    publisherKind = directOverride.publisherKind ?? publisherKind;
    evidenceNature = directOverride.evidenceNature ?? evidenceNature;
    ownerEntity = directOverride.ownerEntity ?? ownerEntity;
    primaryLanguage = directOverride.primaryLanguage ?? primaryLanguage;
    geography = directOverride.geography ?? geography;
    confidence = directOverride.confidence ?? "high";
    classificationSource = `channel_override:${channel.identity}`;
  }

  if (!PUBLISHER_KINDS.has(publisherKind)) throw new Error(`Invalid publisherKind for ${channel.identity}`);
  if (!EVIDENCE_NATURES.has(evidenceNature)) throw new Error(`Invalid evidenceNature for ${channel.identity}`);
  if (!CONFIDENCES.has(confidence)) throw new Error(`Invalid classification confidence for ${channel.identity}`);
  return {
    ownerEntity,
    publisherKind,
    evidenceNature,
    primaryLanguage,
    geography,
    classification: {
      version: overrides.version,
      source: classificationSource,
      confidence,
      classifiedAt: new Date().toISOString(),
    },
  };
}

for (const channel of registry.channels) Object.assign(channel, classificationFor(channel));
registry.classification = {
  version: overrides.version,
  classifiedAt: new Date().toISOString(),
  overridesFile: overridesInput.replaceAll("\\", "/"),
  overridesHash: createHash("sha256").update(overridesText).digest("hex"),
  xPolicyFile: xPolicyInput.replaceAll("\\", "/"),
  xPolicyHash,
  xPolicyCounts: xPolicy.counts,
  counts: {
    publisherKind: Object.fromEntries([...PUBLISHER_KINDS].sort().map((kind) => [kind, registry.channels.filter((channel) => channel.publisherKind === kind).length])),
    evidenceNature: Object.fromEntries([...EVIDENCE_NATURES].sort().map((nature) => [nature, registry.channels.filter((channel) => channel.evidenceNature === nature).length])),
    confidence: Object.fromEntries([...CONFIDENCES].sort().map((confidence) => [confidence, registry.channels.filter((channel) => channel.classification.confidence === confidence).length])),
    primaryLanguage: Object.fromEntries([...new Set(registry.channels.map((channel) => channel.primaryLanguage))].sort().map((language) => [language, registry.channels.filter((channel) => channel.primaryLanguage === language).length])),
  },
};

await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
console.log(JSON.stringify(registry.classification, null, 2));
