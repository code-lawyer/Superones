import { createHash } from "node:crypto";
import type { InformationEnvelope, InboundContentBatch } from "./content-contract.ts";
import type { EventCategory, EventRecord, InformationItem, QuarantinedContent } from "./types.ts";

export type InformationEditorial = {
  translatedTitle: string;
  summary: string;
  translatedContent: string;
};

export type EventDecision =
  | { disposition: "existing"; eventSlug: string }
  | { disposition: "candidate"; candidateKey: string; directionAligned: true }
  | { disposition: "independent" };

export type EventEditorial = {
  title: string;
  judgment: string;
  summary: string;
  significance: string;
  entities: string[];
  category: EventCategory;
};

export type BatchedInformationEditorial = InformationEditorial & {
  idempotencyKey: string;
  decision: EventDecision;
};

export type EditorialPort = {
  processInformationBatch?(input: {
    information: InformationEnvelope[];
    activeEvents: Array<Pick<EventRecord, "slug" | "title" | "summary">>;
    recentIndependent: Array<Pick<InformationItem, "slug" | "translatedTitle" | "summary" | "eventCandidateKey">>;
  }): Promise<BatchedInformationEditorial[]>;
  translateInformation(item: InformationEnvelope): Promise<InformationEditorial>;
  classifyInformation(input: {
    information: InformationItem;
    activeEvents: Array<Pick<EventRecord, "slug" | "title" | "summary">>;
    recentIndependent: Array<Pick<InformationItem, "slug" | "translatedTitle" | "summary" | "eventCandidateKey">>;
  }): Promise<EventDecision>;
  composeEvent(input: { information: InformationItem[]; previous?: EventRecord }): Promise<EventEditorial>;
};

export type CompileResult = {
  information: InformationItem[];
  events: EventRecord[];
  quarantine: QuarantinedContent[];
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || hash(value).slice(0, 12);
}

function clamp(value: string, limit: number) {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

export async function withOneRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    return operation();
  }
}

export function activeEvents(events: EventRecord[], now: string, days = 30) {
  const cutoff = Date.parse(now) - days * 24 * 60 * 60 * 1000;
  return events.filter((event) => Date.parse(event.updated) >= cutoff);
}

export function meetsEventThreshold(items: InformationItem[]) {
  const independentPublishers = new Set(items.flatMap((item) => {
    if (item.classificationConfidence === "low") return [];
    return [(item.ownerEntity || item.originalPublisher || item.sourceName).toLowerCase()];
  }));
  return items.length >= 3
    && independentPublishers.size >= 2
    && new Set(items.map((item) => item.sourceRole)).size >= 2;
}

function validInformationEditorial(value: InformationEditorial) {
  const translatedTitle = clamp(value.translatedTitle, 72);
  const summary = clamp(value.summary, 120);
  const translatedContent = clamp(value.translatedContent, 12_000);
  if (!translatedTitle || !summary || !translatedContent) throw new Error("资讯编辑结果字段不完整。");
  return { translatedTitle, summary, translatedContent };
}

function validEventEditorial(value: EventEditorial) {
  const title = clamp(value.title, 30);
  const judgment = clamp(value.judgment, 44);
  const summary = clamp(value.summary, 1_200);
  const significance = clamp(value.significance, 560);
  if (!title || !judgment || !summary || !significance) throw new Error("事件编辑结果字段不完整。");
  return { ...value, title, judgment, summary, significance, entities: value.entities.map((item) => clamp(item, 80)).filter(Boolean).slice(0, 8) };
}

function quarantine(batch: InboundContentBatch, kind: QuarantinedContent["kind"], sourceKey: string, code: string, message: string): QuarantinedContent {
  return {
    id: hash(`${batch.batchId}:${kind}:${sourceKey}:${code}`).slice(0, 24),
    batchId: batch.batchId,
    kind,
    sourceKey,
    errorCode: code,
    summary: clamp(message, 240),
    createdAt: batch.generatedAt,
  };
}

function eventFromEditorial(editorial: EventEditorial, items: InformationItem[], now: string, prior?: EventRecord): EventRecord {
  const normalized = validEventEditorial(editorial);
  const newest = [...items].sort((left, right) => Date.parse(right.publishedAt ?? right.discoveredAt) - Date.parse(left.publishedAt ?? left.discoveredAt))[0];
  const eventSlug = prior?.slug ?? `${slug(normalized.title)}-${hash(items.map((item) => item.slug).sort().join(":" )).slice(0, 8)}`;
  return {
    slug: eventSlug,
    record: prior?.record ?? `VLT/EVT/${new Date(now).getUTCFullYear()}/${hash(eventSlug).slice(0, 5).toUpperCase()}`,
    category: normalized.category,
    title: normalized.title,
    judgment: normalized.judgment,
    originalTitle: newest.originalTitle,
    summary: normalized.summary,
    significance: normalized.significance,
    entities: normalized.entities,
    firstSeen: prior?.firstSeen ?? items.map((item) => item.publishedAt ?? item.discoveredAt).sort()[0],
    updated: now,
    sources: items.map((item) => ({
      name: item.sourceName,
      url: item.sourceUrl,
      publishedAt: item.publishedAt ?? item.discoveredAt,
      author: item.author,
      role: item.sourceRole,
      informationSlug: item.slug,
    })),
    timeline: items.map((item) => ({ time: item.publishedAt ?? item.discoveredAt, text: `${item.sourceName} 发布或更新相关资讯。` })),
  };
}

function recentIndependentItems(information: InformationItem[], now: string, days = 30) {
  const cutoff = Date.parse(now) - days * 24 * 60 * 60 * 1000;
  return information
    .filter((candidate) => candidate.eventSlugs.length === 0
      && Date.parse(candidate.publishedAt ?? candidate.discoveredAt) >= cutoff)
    .sort((left, right) => Date.parse(right.publishedAt ?? right.discoveredAt) - Date.parse(left.publishedAt ?? left.discoveredAt))
    .slice(0, 50)
    .map(({ slug: itemSlug, translatedTitle, summary, eventCandidateKey }) => ({ slug: itemSlug, translatedTitle, summary, eventCandidateKey }));
}

export async function compileInformationBatch(input: {
  batch: InboundContentBatch;
  previousInformation: InformationItem[];
  previousEvents: EventRecord[];
  editorial: EditorialPort;
}): Promise<CompileResult> {
  const { batch, editorial } = input;
  const information = [...input.previousInformation];
  const events = [...input.previousEvents];
  const quarantineRecords: QuarantinedContent[] = [];
  const existingKeys = new Set(information.map((item) => `${item.sourceUrl.replace(/[?#].*$/, "").toLowerCase()}#${item.contentHash ?? ""}`));
  const existingHashes = new Set(information.map((item) => item.contentHash).filter((value): value is string => Boolean(value)));
  const newSlugs = new Set<string>();
  const hiddenSlugs = new Set<string>();
  const active = activeEvents(events, batch.generatedAt).map(({ slug: eventSlug, title, summary }) => ({ slug: eventSlug, title, summary }));
  const batchEligible: InformationEnvelope[] = [];
  const incomingKeys = new Set(existingKeys);
  const incomingHashes = new Set(existingHashes);
  for (const envelope of batch.information) {
    const canonicalKey = `${envelope.originalUrl.replace(/[?#].*$/, "").toLowerCase()}#${envelope.contentHash}`;
    if (incomingKeys.has(canonicalKey) || incomingHashes.has(envelope.contentHash)) continue;
    batchEligible.push(envelope);
    incomingKeys.add(canonicalKey);
    incomingHashes.add(envelope.contentHash);
  }
  const batchedResults = new Map<string, BatchedInformationEditorial>();
  if (editorial.processInformationBatch && batchEligible.length > 0) {
    const recentIndependent = recentIndependentItems(information, batch.generatedAt);
    try {
      const results = await editorial.processInformationBatch({ information: batchEligible, activeEvents: active, recentIndependent });
      for (const result of results) batchedResults.set(result.idempotencyKey, result);
    } catch {
      // Missing batched results fall back to the single-record editorial path.
    }
  }

  for (const envelope of batchEligible) {
    const canonicalKey = `${envelope.originalUrl.replace(/[?#].*$/, "").toLowerCase()}#${envelope.contentHash}`;
    if (existingKeys.has(canonicalKey) || existingHashes.has(envelope.contentHash)) continue;
    let translated: InformationEditorial;
    let batchedDecision: EventDecision | undefined;
    try {
      const batched = batchedResults.get(envelope.idempotencyKey);
      if (batched) {
        translated = validInformationEditorial(batched);
        batchedDecision = batched.decision;
      } else {
        translated = validInformationEditorial(await withOneRetry(() => editorial.translateInformation(envelope)));
      }
    } catch (error) {
      quarantineRecords.push(quarantine(batch, "information", envelope.idempotencyKey, "INFORMATION_EDITORIAL_FAILED", error instanceof Error ? error.message : "资讯翻译或摘要失败。"));
      continue;
    }
    const item: InformationItem = {
      slug: `${slug(translated.translatedTitle)}-${hash(envelope.idempotencyKey).slice(0, 8)}`,
      ...translated,
      originalTitle: envelope.originalTitle,
      originalContent: envelope.originalContent ?? envelope.originalTitle,
      originalLanguage: envelope.originalLanguage,
      sourceName: envelope.originalPublisher,
      sourceRole: envelope.sourceRole,
      sourceUrl: envelope.originalUrl,
      author: envelope.originalAuthor ?? "作者未注明",
      publishedAt: envelope.originalPublishedAt ?? null,
      discoveredAt: envelope.fetchedAt,
      eventSlugs: [],
      originalDisplay: envelope.contentCompleteness === "fulltext" || envelope.contentCompleteness === "transcript" ? "full" : "excerpt",
      contentHash: envelope.contentHash,
      sourceChannelId: envelope.sourceChannelId,
      originalPublisher: envelope.originalPublisher,
      ownerEntity: envelope.ownerEntity,
      publisherKind: envelope.publisherKind,
      evidenceNature: envelope.evidenceNature,
      classificationConfidence: envelope.classificationConfidence,
    };
    try {
      const recentIndependent = recentIndependentItems(information, batch.generatedAt);
      const decision = batchedDecision ?? await withOneRetry(() => editorial.classifyInformation({ information: item, activeEvents: active, recentIndependent }));
      if (decision.disposition === "existing" && active.some((event) => event.slug === decision.eventSlug)) {
        item.primaryEventSlug = decision.eventSlug;
        item.eventSlugs = [decision.eventSlug];
      } else if (decision.disposition === "candidate" && decision.directionAligned) {
        item.eventCandidateKey = clamp(decision.candidateKey, 120);
      }
    } catch (error) {
      quarantineRecords.push(quarantine(batch, "event", envelope.idempotencyKey, "EVENT_CLASSIFICATION_FAILED", error instanceof Error ? error.message : "事件归类失败，资讯已隔离。"));
      continue;
    }
    information.push(item);
    newSlugs.add(item.slug);
    existingKeys.add(canonicalKey);
    existingHashes.add(envelope.contentHash);
  }

  const existingAssociations = new Map<string, InformationItem[]>();
  for (const item of information) {
    if (!item.primaryEventSlug) continue;
    const group = existingAssociations.get(item.primaryEventSlug) ?? [];
    group.push(item);
    existingAssociations.set(item.primaryEventSlug, group);
  }
  for (const [eventSlug, items] of existingAssociations) {
    const index = events.findIndex((event) => event.slug === eventSlug);
    if (index < 0) continue;
    const previous = events[index];
    const knownSources = new Set((previous.sources ?? []).map((source) => source.informationSlug).filter(Boolean));
    if (!items.some((item) => !knownSources.has(item.slug))) continue;
    try {
      events[index] = eventFromEditorial(await withOneRetry(() => editorial.composeEvent({ information: items, previous })), items, batch.generatedAt, previous);
    } catch (error) {
      for (const item of items) {
        if (knownSources.has(item.slug)) continue;
        item.eventSlugs = [];
        delete item.primaryEventSlug;
        if (newSlugs.has(item.slug)) hiddenSlugs.add(item.slug);
      }
      quarantineRecords.push(quarantine(batch, "event", eventSlug, "EVENT_COMPOSITION_FAILED", error instanceof Error ? error.message : "事件重算失败。"));
    }
  }

  const candidates = new Map<string, InformationItem[]>();
  const candidateCutoff = Date.parse(batch.generatedAt) - 30 * 24 * 60 * 60 * 1000;
  for (const item of information) {
    if (item.eventSlugs.length > 0 || !item.eventCandidateKey
      || Date.parse(item.publishedAt ?? item.discoveredAt) < candidateCutoff) continue;
    const group = candidates.get(item.eventCandidateKey) ?? [];
    group.push(item);
    candidates.set(item.eventCandidateKey, group);
  }
  for (const [candidateKey, items] of candidates) {
    if (!meetsEventThreshold(items)) continue;
    try {
      const event = eventFromEditorial(await withOneRetry(() => editorial.composeEvent({ information: items })), items, batch.generatedAt);
      events.push(event);
      for (const item of items) {
        item.eventSlugs = [event.slug];
        item.primaryEventSlug = event.slug;
        delete item.eventCandidateKey;
      }
    } catch (error) {
      for (const item of items) if (newSlugs.has(item.slug)) hiddenSlugs.add(item.slug);
      quarantineRecords.push(quarantine(batch, "event", candidateKey, "EVENT_COMPOSITION_FAILED", error instanceof Error ? error.message : "新事件生成失败。"));
    }
  }

  return {
    information: information.filter((item) => !hiddenSlugs.has(item.slug)).sort((left, right) => Date.parse(right.publishedAt ?? right.discoveredAt) - Date.parse(left.publishedAt ?? left.discoveredAt)),
    events: events.sort((left, right) => Date.parse(right.updated) - Date.parse(left.updated)),
    quarantine: quarantineRecords,
  };
}
