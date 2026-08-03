export const ACQUISITION_SOURCE_REGISTRY_VERSION = 1 as const;
export const MAX_ACQUISITION_REGISTRY_SOURCES = 512;

export const SUPPORTED_ACQUISITION_SOURCE_ADAPTERS = new Set([
  "follow-builders-x",
  "github",
  "github-frontier-fallback",
  "github-releases",
  "hosted_podcast",
  "hugging_face",
  "official_api",
  "official_atom",
  "official_catalog",
  "official_channel",
  "official_dated_index",
  "official_rss",
  "official_sitemap",
  "openrouter",
  "rss",
  "trusted_feed_json",
]);

type SourceRegistryLane = "information" | "roadside" | "sic" | "rankings";

export type AcquisitionSourceRegistryEntry = {
  sourceId: string;
  adapter: string;
};

export type AcquisitionSourceRegistrySnapshot = {
  schemaVersion: typeof ACQUISITION_SOURCE_REGISTRY_VERSION;
  revision: string;
  lane: SourceRegistryLane;
  sources: AcquisitionSourceRegistryEntry[];
};

export class AcquisitionSourceRegistryError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AcquisitionSourceRegistryError";
    this.code = code;
  }
}

function stableId(value: unknown, field: string, limit = 180) {
  if (typeof value !== "string") {
    throw new AcquisitionSourceRegistryError(`${field} 必须是文本。`, "INVALID_SOURCE_REGISTRY");
  }
  const result = value.trim();
  if (!result || result.length > limit || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(result)) {
    throw new AcquisitionSourceRegistryError(`${field} 格式无效。`, "INVALID_SOURCE_REGISTRY");
  }
  return result;
}

export function buildAcquisitionSourceRegistrySnapshot(input: {
  revision: string;
  lane: SourceRegistryLane;
  sources: Iterable<AcquisitionSourceRegistryEntry>;
}): AcquisitionSourceRegistrySnapshot {
  return validateAcquisitionSourceRegistrySnapshot({
    schemaVersion: ACQUISITION_SOURCE_REGISTRY_VERSION,
    revision: input.revision,
    lane: input.lane,
    sources: [...input.sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  }, {
    revision: input.revision,
    lane: input.lane,
  });
}

export function validateAcquisitionSourceRegistrySnapshot(
  value: unknown,
  expected: {
    revision: string;
    lane: SourceRegistryLane;
    reports?: Iterable<AcquisitionSourceRegistryEntry>;
  },
): AcquisitionSourceRegistrySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AcquisitionSourceRegistryError("sourceRegistry 必须是对象。", "INVALID_SOURCE_REGISTRY");
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== ACQUISITION_SOURCE_REGISTRY_VERSION) {
    throw new AcquisitionSourceRegistryError(
      "境内处理器不支持该来源快照版本。",
      "UNSUPPORTED_SOURCE_REGISTRY_VERSION",
    );
  }
  const revision = stableId(raw.revision, "sourceRegistry.revision", 120);
  if (revision !== expected.revision) {
    throw new AcquisitionSourceRegistryError(
      "sourceRegistry.revision 与批次 registryRevision 不一致。",
      "SOURCE_REGISTRY_REVISION_MISMATCH",
    );
  }
  if (raw.lane !== expected.lane) {
    throw new AcquisitionSourceRegistryError(
      "sourceRegistry.lane 与批次 lane 不一致。",
      "SOURCE_REGISTRY_LANE_MISMATCH",
    );
  }
  if (!Array.isArray(raw.sources) || raw.sources.length > MAX_ACQUISITION_REGISTRY_SOURCES) {
    throw new AcquisitionSourceRegistryError(
      `sourceRegistry.sources 最多包含 ${MAX_ACQUISITION_REGISTRY_SOURCES} 个来源。`,
      "INVALID_SOURCE_REGISTRY",
    );
  }
  const seen = new Set<string>();
  const sources = raw.sources.map((item, index): AcquisitionSourceRegistryEntry => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new AcquisitionSourceRegistryError(
        `sourceRegistry.sources[${index}] 格式无效。`,
        "INVALID_SOURCE_REGISTRY",
      );
    }
    const source = item as Record<string, unknown>;
    const sourceId = stableId(source.sourceId, `sourceRegistry.sources[${index}].sourceId`);
    const adapter = stableId(source.adapter, `sourceRegistry.sources[${index}].adapter`, 120);
    if (seen.has(sourceId)) {
      throw new AcquisitionSourceRegistryError(
        `sourceRegistry 包含重复来源 ${sourceId}。`,
        "DUPLICATE_SOURCE_REGISTRY_ENTRY",
      );
    }
    seen.add(sourceId);
    return { sourceId, adapter };
  });

  if (expected.reports) {
    const adapterBySource = new Map(sources.map((source) => [source.sourceId, source.adapter]));
    for (const report of expected.reports) {
      const adapter = adapterBySource.get(report.sourceId);
      if (!adapter) {
        throw new AcquisitionSourceRegistryError(
          `来源报告 ${report.sourceId} 不在签名来源快照中。`,
          "SOURCE_NOT_IN_REGISTRY",
        );
      }
      if (adapter !== report.adapter) {
        throw new AcquisitionSourceRegistryError(
          `来源 ${report.sourceId} 的 adapter 与签名来源快照不一致。`,
          "SOURCE_ADAPTER_MISMATCH",
        );
      }
    }
  }

  return {
    schemaVersion: ACQUISITION_SOURCE_REGISTRY_VERSION,
    revision,
    lane: expected.lane,
    sources,
  };
}

export function assertAcquisitionSourceRegistryCompatibility(input: {
  batchSchemaVersion: number;
  registryRevision: string;
  sourceRegistry?: AcquisitionSourceRegistrySnapshot;
}, options: {
  legacyAllowedRegistryRevisions?: ReadonlySet<string>;
  supportedAdapters?: ReadonlySet<string>;
} = {}) {
  if (input.batchSchemaVersion === 1) {
    if (
      options.legacyAllowedRegistryRevisions
      && !options.legacyAllowedRegistryRevisions.has(input.registryRevision)
    ) {
      throw new AcquisitionSourceRegistryError(
        `旧版批次的来源修订 ${input.registryRevision} 未部署。`,
        "UNKNOWN_REGISTRY_REVISION",
      );
    }
    return;
  }
  if (!input.sourceRegistry) {
    throw new AcquisitionSourceRegistryError("v2 批次缺少来源快照。", "MISSING_SOURCE_REGISTRY");
  }
  const supported = options.supportedAdapters ?? SUPPORTED_ACQUISITION_SOURCE_ADAPTERS;
  for (const source of input.sourceRegistry.sources) {
    if (supported.has(source.adapter)) continue;
    throw new AcquisitionSourceRegistryError(
      `来源 ${source.sourceId} 使用境内尚未支持的 adapter：${source.adapter}。`,
      "UNSUPPORTED_SOURCE_ADAPTER",
    );
  }
}

export function acquisitionSourceIds(snapshot: AcquisitionSourceRegistrySnapshot) {
  return snapshot.sources.map((source) => source.sourceId);
}
