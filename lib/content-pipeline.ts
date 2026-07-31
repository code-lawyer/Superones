import "server-only";

import { compileInformationBatch, type BatchedInformationEditorial, type EditorialPort, type EventDecision, type EventEditorial, type InformationEditorial } from "./content-compiler.ts";
import { validateContentBatch, type InformationEnvelope } from "./content-contract.ts";
import { getStoredContent, replaceStoredContent, type ContentSourceReport } from "./content-store.ts";
import {
  createEditorialProfileClient,
  loadEditorialProfileConfig,
} from "./openai-compatible-client.ts";
import { normalizeStructuredContent } from "./content-markup.ts";
import { EVENT_CATEGORIES, type BatchReceipt, type EventCategory } from "./types.ts";

export class BatchConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchConflictError";
  }
}

const MODEL_SOURCE_CONTENT_CHARACTERS = 3_000;
const MODEL_CHUNK_CONTENT_CHARACTERS = MODEL_SOURCE_CONTENT_CHARACTERS;

function cleanText(value: string, limit: number) {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function assertContentModelConfigured() {
  loadEditorialProfileConfig("vault_editorial");
}

function object(value: unknown, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function modelInformation(value: unknown): InformationEditorial {
  const item = object(value, "资讯编辑结果格式无效。");
  const translatedTitle = typeof item.translatedTitle === "string" ? cleanText(item.translatedTitle, 72) : "";
  const summary = typeof item.summary === "string" ? cleanText(item.summary, 120) : "";
  const translatedContent = typeof item.translatedContent === "string" ? normalizeStructuredContent(item.translatedContent, 12_000) : "";
  if (!translatedTitle || !summary || !translatedContent) throw new Error("资讯编辑结果缺少必要字段。");
  return { translatedTitle, summary, translatedContent };
}

function modelInformationBatch(value: unknown): BatchedInformationEditorial[] {
  const root = object(value, "批量资讯编辑结果格式无效。");
  if (!Array.isArray(root.items)) throw new Error("批量资讯编辑结果缺少 items 数组。");
  const seen = new Set<string>();
  return root.items.map((value, index) => {
    const item = object(value, `批量资讯编辑结果 items[${index}] 格式无效。`);
    const idempotencyKey = typeof item.idempotencyKey === "string" ? cleanText(item.idempotencyKey, 180) : "";
    if (!idempotencyKey || seen.has(idempotencyKey)) throw new Error(`批量资讯编辑结果 items[${index}] 的 idempotencyKey 无效或重复。`);
    seen.add(idempotencyKey);
    return {
      idempotencyKey,
      ...modelInformation(item),
      decision: modelDecision(item.decision),
    };
  });
}

function modelSourceContent(item: InformationEnvelope) {
  return normalizeStructuredContent(
    item.originalContent ?? item.originalTitle,
    MODEL_SOURCE_CONTENT_CHARACTERS,
  ) || item.originalTitle;
}

function informationChunks(information: InformationEnvelope[]) {
  const chunks: InformationEnvelope[][] = [];
  let current: InformationEnvelope[] = [];
  let currentCharacters = 0;
  const configuredItems = Number(
    process.env.VAULT2077_VAULT_LLM_BATCH_ITEMS
    ?? process.env.VAULT2077_LLM_BATCH_ITEMS
    ?? "3",
  );
  const maxItems = Number.isFinite(configuredItems)
    ? Math.max(1, Math.min(8, Math.floor(configuredItems)))
    : 3;
  for (const item of information) {
    const characters = item.originalTitle.length + modelSourceContent(item).length;
    if (
      current.length > 0
      && (current.length >= maxItems || currentCharacters + characters > MODEL_CHUNK_CONTENT_CHARACTERS)
    ) {
      chunks.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(item);
    currentCharacters += characters;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function modelConcurrency(environment: Record<string, string | undefined> = process.env) {
  const configured = Number(
    environment.VAULT2077_VAULT_LLM_CONCURRENCY
    ?? environment.VAULT2077_LLM_CONCURRENCY
    ?? "2",
  );
  return Number.isFinite(configured) ? Math.max(1, Math.min(4, Math.floor(configured))) : 2;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, operation: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function modelDecision(value: unknown): EventDecision {
  const item = object(value, "事件归类结果格式无效。");
  if (item.disposition === "independent") return { disposition: "independent" };
  if (item.disposition === "existing" && typeof item.eventSlug === "string" && item.eventSlug) {
    return { disposition: "existing", eventSlug: cleanText(item.eventSlug, 120) };
  }
  if (item.disposition === "candidate" && item.directionAligned === true && typeof item.candidateKey === "string" && item.candidateKey) {
    return { disposition: "candidate", candidateKey: cleanText(item.candidateKey, 120), directionAligned: true };
  }
  throw new Error("事件归类结果不符合 Schema。");
}

function modelEvent(value: unknown): EventEditorial {
  const item = object(value, "事件编辑结果格式无效。");
  if (!EVENT_CATEGORIES.includes(item.category as EventCategory) || !Array.isArray(item.entities)) {
    throw new Error("事件编辑结果分类或实体无效。");
  }
  const title = typeof item.title === "string" ? cleanText(item.title, 30) : "";
  const judgment = typeof item.judgment === "string" ? cleanText(item.judgment, 44) : "";
  const summary = typeof item.summary === "string" ? cleanText(item.summary, 1_200) : "";
  const significance = typeof item.significance === "string" ? cleanText(item.significance, 560) : "";
  const entities = item.entities.filter((entry): entry is string => typeof entry === "string").map((entry) => cleanText(entry, 80)).filter(Boolean).slice(0, 8);
  if (!title || !judgment || !summary || !significance) throw new Error("事件编辑结果缺少必要字段。");
  return { title, judgment, summary, significance, entities, category: item.category as EventCategory };
}

function llmEditorialPort(): EditorialPort {
  const client = createEditorialProfileClient(loadEditorialProfileConfig("vault_editorial"));
  const requestModel = (
    task: string,
    schemaVersion: string,
    instruction: string,
    input: unknown,
  ) => client.completeJson({ task, schemaVersion, instruction, input });
  return {
    async processInformationBatch(input) {
      const chunks = informationChunks(input.information);
      const requestChunk = async (chunk: InformationEnvelope[]) => {
        const complete = () => requestModel(
          "information_batch_editorial",
          "information-batch-editorial/v1",
          "逐条处理输入资讯，一次完成中文翻译、摘要和事件归类。必须为每条输入返回且只返回一条结果，保持原 idempotencyKey。返回 {items:[{idempotencyKey,translatedTitle,summary,translatedContent,decision}]}。translatedTitle 最多 72 字符；summary 最多 120 字符且为一行；translatedContent 是忠实中文译文或完整中文整理，不补充输入之外的事实。必须保留原文的段落、列表、链接和代码块边界；原文为 Markdown 时 translatedContent 也使用 Markdown，不得把块级语法压成一行。decision 只能是 {disposition:'existing',eventSlug}、{disposition:'candidate',candidateKey,directionAligned:true} 或 {disposition:'independent'}。只有重大变化且多条不同资讯指向同一方向时才使用 candidate；普通工具热度、单一评论或零散消息保持 independent。existing 只能引用提供的近 30 天事件 slug。",
          {
            information: chunk.map((item) => ({
              idempotencyKey: item.idempotencyKey,
              originalLanguage: item.originalLanguage,
              originalTitle: item.originalTitle,
              originalContent: modelSourceContent(item),
              originalPublisher: item.originalPublisher,
              sourceRole: item.sourceRole,
              publishedAt: item.originalPublishedAt,
            })),
            activeEvents: input.activeEvents,
            recentIndependent: input.recentIndependent,
          },
        );
        try {
          return await complete();
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          return complete();
        }
      };
      const recoverChunk = async (chunk: InformationEnvelope[]): Promise<BatchedInformationEditorial[]> => {
        try {
          const expectedIds = new Set(chunk.map((item) => item.idempotencyKey));
          const results = modelInformationBatch(await requestChunk(chunk));
          if (results.some((result) => !expectedIds.has(result.idempotencyKey))) {
            throw new Error("模型返回了当前分组之外的资讯标识。");
          }
          const completedIds = new Set(results.map((result) => result.idempotencyKey));
          const missing = chunk.filter((item) => !completedIds.has(item.idempotencyKey));
          if (missing.length === 0) return results;
          if (missing.length < chunk.length) return [...results, ...await recoverChunk(missing)];
        } catch (error) {
          if (chunk.length === 1) {
            console.error("资讯批量编辑降级到单条后仍失败。", {
              idempotencyKey: chunk[0].idempotencyKey,
              error: error instanceof Error ? error.message : String(error),
            });
            return [];
          }
        }
        const midpoint = Math.ceil(chunk.length / 2);
        return [
          ...await recoverChunk(chunk.slice(0, midpoint)),
          ...await recoverChunk(chunk.slice(midpoint)),
        ];
      };
      const results = await mapWithConcurrency(chunks, modelConcurrency(), recoverChunk);
      const flattened = results.flat();
      const expected = new Set(input.information.map((item) => item.idempotencyKey));
      for (const result of flattened) {
        if (!expected.has(result.idempotencyKey)) throw new Error(`模型返回了未知资讯 ${result.idempotencyKey}。`);
      }
      return flattened;
    },
    async translateInformation(item: InformationEnvelope) {
      return modelInformation(await requestModel(
        "information_editorial",
        "information-editorial/v1",
        "将原始资讯处理为中文。返回 {translatedTitle,summary,translatedContent}。translatedTitle 最多 72 字符，summary 最多 120 字符且只写一个自然段；保留事实边界，不补充未提供的信息。translatedContent 必须保留原文段落、列表、链接和代码块边界；原文为 Markdown 时继续返回 Markdown，不得把块级语法压成一行。",
        {
          originalLanguage: item.originalLanguage,
          originalTitle: item.originalTitle,
          originalContent: modelSourceContent(item),
          publisher: item.originalPublisher,
          publishedAt: item.originalPublishedAt,
        },
      ));
    },
    async classifyInformation(input) {
      return modelDecision(await requestModel(
        "event_classification",
        "event-classification/v1",
        "判断新资讯是否属于近 30 天已有事件，或与近期独立资讯指向同一个尚未形成的重大事件。返回以下之一：{disposition:'existing',eventSlug}、{disposition:'candidate',candidateKey,directionAligned:true}、{disposition:'independent'}。只有意义足够大且方向一致时才使用 candidate；普通工具热度或单一观点保持 independent。candidateKey 应是简短稳定的语义键。",
        {
          ...input,
          information: {
            slug: input.information.slug,
            translatedTitle: input.information.translatedTitle,
            summary: input.information.summary,
            sourceName: input.information.sourceName,
            sourceRole: input.information.sourceRole,
            publishedAt: input.information.publishedAt,
            ownerEntity: input.information.ownerEntity,
            publisherKind: input.information.publisherKind,
            evidenceNature: input.information.evidenceNature,
            classificationConfidence: input.information.classificationConfidence,
            contentGroup: input.information.contentGroup,
            itemKind: input.information.itemKind,
          },
        },
      ));
    },
    async composeEvent(input) {
      return modelEvent(await requestModel(
        "event_editorial",
        "event-editorial/v1",
        "基于全部相关资讯生成事件记录。输入资讯按数组顺序编号为 [1]、[2]……；返回 {title,judgment,summary,significance,entities,category}。judgment、summary 和 significance 都必须使用一个或多个有效的 [n] 引用支撑事实与判断，n 只能指向本次输入数组中的资讯；不得引用不存在的编号。title 最多 30 个字符，judgment 最多 44 个字符；category 只能是 模型与产品、研究与能力、公司与市场、政策与安全、开源与生态。不得遗漏反对意见或来源分歧。",
        {
          information: input.information.map((item) => ({
            slug: item.slug,
            translatedTitle: item.translatedTitle,
            summary: item.summary,
            translatedContent: normalizeStructuredContent(item.translatedContent, 2_000) || item.summary,
            sourceName: item.sourceName,
            sourceRole: item.sourceRole,
            publishedAt: item.publishedAt,
            ownerEntity: item.ownerEntity,
            publisherKind: item.publisherKind,
            evidenceNature: item.evidenceNature,
            classificationConfidence: item.classificationConfidence,
          })),
          previous: input.previous,
        },
      ));
    },
  };
}

let processChain: Promise<unknown> = Promise.resolve();

export function processInboundContent(
  value: unknown,
  bodyHash: string,
  options: {
    requireNoQuarantine?: boolean;
    snapshot?: {
      runId: string;
      collectedAt: string;
      sourceReports: ContentSourceReport[];
      activeSourceIds?: string[];
    };
  } = {},
) {
  const operation = processChain.then(async () => {
    const batch = validateContentBatch(value);
    const previous = await getStoredContent();
    const receipt = previous.batches.find((item) => item.batchId === batch.batchId);
    if (receipt) {
      if (receipt.payloadHash !== bodyHash) throw new BatchConflictError("同一 batchId 已被不同内容使用。");
      return { ...previous, duplicate: true, receipt };
    }

    if (batch.repositories.length > 0) {
      throw new Error("旧 GitHub 增量项目记录已停用；请使用平台原生 rankings 通道。");
    }
    const activeSourceIds = options.snapshot?.activeSourceIds ? new Set(options.snapshot.activeSourceIds) : null;
    const previousInformation = activeSourceIds
      ? previous.information.filter((item) => Boolean(item.sourceChannelId) && activeSourceIds.has(item.sourceChannelId!))
      : previous.information;
    const snapshotReports = options.snapshot?.sourceReports.filter((report) => (
      !activeSourceIds || activeSourceIds.has(report.sourceId)
    ));
    const acceptedSourceIds = new Set(snapshotReports?.flatMap((report) => {
      if (report.status === "failed") return [];
      const previousSnapshot = previous.sourceSnapshots[report.sourceId];
      return !previousSnapshot || Date.parse(options.snapshot!.collectedAt) >= Date.parse(previousSnapshot.collectedAt)
        ? [report.sourceId]
        : [];
    }) ?? []);
    const effectiveBatch = options.snapshot
      ? { ...batch, information: batch.information.filter((item) => acceptedSourceIds.has(item.sourceChannelId)) }
      : batch;
    if (effectiveBatch.information.length > 0) assertContentModelConfigured();

    const compiled = await compileInformationBatch({
      batch: effectiveBatch,
      previousInformation,
      previousEvents: previous.events,
      editorial: llmEditorialPort(),
    });
    const quarantine = compiled.quarantine;
    if (options.requireNoQuarantine && quarantine.length > 0) {
      throw new Error(`境内 LLM 未完成 ${quarantine.length} 条内容处理，批次保持可重试状态。`);
    }
    const snapshotSources = snapshotReports?.flatMap((report) => {
      if (!acceptedSourceIds.has(report.sourceId)) return [];
      const envelopes = effectiveBatch.information.filter((item) => item.sourceChannelId === report.sourceId);
      const candidates = compiled.information.filter((item) => item.sourceChannelId === report.sourceId);
      const seen = new Set<string>();
      const items = envelopes.flatMap((envelope) => {
        const canonicalUrl = envelope.originalUrl.replace(/[?#].*$/, "").toLowerCase();
        const match = candidates.find((item) => item.contentHash === envelope.contentHash)
          ?? candidates.find((item) => (
            envelope.originContentId
            && item.originContentId === envelope.originContentId
            && item.sourceUrl.replace(/[?#].*$/, "").toLowerCase() === canonicalUrl
          ))
          ?? candidates.find((item) => item.sourceUrl.replace(/[?#].*$/, "").toLowerCase() === canonicalUrl);
        if (!match || seen.has(match.slug)) return [];
        seen.add(match.slug);
        return [match];
      });
      // A successful empty source is a valid empty snapshot. If records were
      // present but every editorial operation failed, retain the last success.
      if (envelopes.length > 0 && items.length === 0) return [];
      return [{ sourceId: report.sourceId, items }];
    }) ?? [];
    const snapshotItemsBySource = new Map(snapshotSources.map((source) => [source.sourceId, source.items.length]));
    const normalizedSourceReports = snapshotReports?.map((report) => {
      if (!acceptedSourceIds.has(report.sourceId) || report.status === "failed") return report;
      const received = effectiveBatch.information.filter((item) => item.sourceChannelId === report.sourceId).length;
      const published = snapshotItemsBySource.get(report.sourceId) ?? 0;
      if (received > 0 && published === 0) {
        return {
          ...report,
          status: "failed" as const,
          errorCode: "EDITORIAL_SOURCE_FAILED",
          errorMessage: "该来源本轮记录均未完成编辑，继续保留上一成功快照。",
        };
      }
      if (published < received) {
        return {
          ...report,
          status: "partial" as const,
          errorCode: "EDITORIAL_PARTIAL",
          errorMessage: `境内编辑完成 ${published}/${received} 条；已发布成功条目。`,
        };
      }
      return report;
    }) ?? [];
    const publishedCount = options.snapshot
      ? snapshotSources.reduce((sum, source) => sum + source.items.length, 0)
      : compiled.information.length;
    const nextReceipt: BatchReceipt = {
      batchId: batch.batchId,
      payloadHash: bodyHash,
      receivedAt: new Date().toISOString(),
      status: "succeeded",
      informationCount: publishedCount,
      eventCount: compiled.events.length,
      projectCount: previous.projects.length,
      quarantinedCount: quarantine.length,
    };
    const sourceIds = new Set(previousInformation.map((item) => item.sourceChannelId).filter((value): value is string => Boolean(value)));
    for (const item of batch.information) sourceIds.add(item.sourceChannelId);
    const stored = await replaceStoredContent({
      events: compiled.events,
      information: compiled.information,
      projects: previous.projects,
      quarantine,
      receipt: nextReceipt,
      sourceCount: sourceIds.size,
      updatedAt: batch.generatedAt,
      ...(options.snapshot ? {
        snapshot: {
          runId: options.snapshot.runId,
          collectedAt: options.snapshot.collectedAt,
          sources: snapshotSources,
          reports: normalizedSourceReports,
          activeSourceIds: options.snapshot.activeSourceIds,
        },
      } : {}),
    });
    return { ...stored, duplicate: false, receipt: nextReceipt };
  });
  processChain = operation.then(() => undefined, () => undefined);
  return operation;
}
