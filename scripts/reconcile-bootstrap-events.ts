import { auditEventCandidateGroups } from "../lib/event-reconciliation.ts";
import {
  eventFromEditorial,
  type EventEditorial,
} from "../lib/content-compiler.ts";
import {
  getStoredContent,
  replaceStoredContent,
} from "../lib/content-store.ts";
import {
  createEditorialProfileClient,
  loadEditorialProfileConfig,
} from "../lib/openai-compatible-client.ts";
import {
  EVENT_CATEGORIES,
  type EventCategory,
} from "../lib/types.ts";
import { normalizeStructuredContent } from "../lib/content-markup.ts";

function object(value: unknown, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function clean(value: string, limit: number) {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function eventEditorial(value: unknown): EventEditorial {
  const item = object(value, "Event editorial response is invalid.");
  const title = typeof item.title === "string" ? clean(item.title, 30) : "";
  const judgment = typeof item.judgment === "string" ? clean(item.judgment, 44) : "";
  const summary = typeof item.summary === "string" ? clean(item.summary, 1_200) : "";
  const significance = typeof item.significance === "string" ? clean(item.significance, 560) : "";
  const entities = Array.isArray(item.entities)
    ? item.entities.filter((entry): entry is string => typeof entry === "string")
      .map((entry) => clean(entry, 80))
      .filter(Boolean)
      .slice(0, 8)
    : [];
  if (
    !title
    || !judgment
    || !summary
    || !significance
    || !EVENT_CATEGORIES.includes(item.category as EventCategory)
  ) {
    throw new Error("Event editorial response is missing required fields.");
  }
  return {
    title,
    judgment,
    summary,
    significance,
    entities,
    category: item.category as EventCategory,
  };
}

const apply = process.argv.includes("--apply");
const stored = await getStoredContent();
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000;
const eligible = stored.information
  .filter((item) => item.contentGroup === "information"
    && item.eventSlugs.length === 0
    && Date.parse(item.publishedAt ?? item.discoveredAt) >= cutoff)
  .sort((left, right) => (
    Date.parse(right.publishedAt ?? right.discoveredAt)
    - Date.parse(left.publishedAt ?? left.discoveredAt)
  ));
const client = createEditorialProfileClient(
  loadEditorialProfileConfig("vault_editorial"),
);
const proposal = await client.completeJson({
  task: "bootstrap_event_candidate_audit",
  schemaVersion: "bootstrap-event-candidate-audit/v1",
  instruction: [
    "Audit the complete recent information waterfall and return JSON {groups:[{candidateKey,informationSlugs}]}.",
    "A group must describe one concrete material event, not a broad topic, company, product family, or recurring release stream.",
    "Every group must contain at least three directionally aligned records, at least two independent publishers, and at least two source roles.",
    "Use only exact input slugs. Never use roadside records. Omit uncertain groups and return {groups:[]} when the evidence is insufficient.",
  ].join(" "),
  input: {
    information: eligible.map((item) => ({
      slug: item.slug,
      title: item.translatedTitle,
      summary: item.summary,
      publisher: item.originalPublisher || item.sourceName,
      ownerEntity: item.ownerEntity,
      sourceRole: item.sourceRole,
      publishedAt: item.publishedAt ?? item.discoveredAt,
    })),
  },
});
const audited = auditEventCandidateGroups(proposal, stored.information);
const report = {
  eligibleInformation: eligible.length,
  proposedGroups: object(proposal, "Candidate proposal is invalid.").groups instanceof Array
    ? (object(proposal, "Candidate proposal is invalid.").groups as unknown[]).length
    : 0,
  acceptedGroups: audited.accepted.map((group) => ({
    candidateKey: group.candidateKey,
    informationSlugs: group.information.map((item) => item.slug),
    titles: group.information.map((item) => item.translatedTitle),
  })),
  rejectedGroups: audited.rejected,
  applied: false,
};

if (!apply || audited.accepted.length === 0) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const now = new Date().toISOString();
const information = structuredClone(stored.information);
const bySlug = new Map(information.map((item) => [item.slug, item]));
const events = [...stored.events];
for (const group of audited.accepted) {
  const items = group.information.flatMap((item) => {
    const storedItem = bySlug.get(item.slug);
    return storedItem ? [storedItem] : [];
  });
  if (items.length !== group.information.length) {
    throw new Error(`Event group ${group.candidateKey} changed before persistence.`);
  }
  const editorial = eventEditorial(await client.completeJson({
    task: "event_editorial",
    schemaVersion: "event-editorial/v1",
    instruction: [
      "Compose a Chinese event record from all supplied information.",
      "Return {title,judgment,summary,significance,entities,category}.",
      "The information array is numbered [1], [2], and so on. judgment, summary, and significance must each cite one or more supplied records with valid [n] references.",
      "Do not add facts outside the supplied records and preserve disagreement between sources.",
    ].join(" "),
    input: {
      candidateKey: group.candidateKey,
      information: items.map((item) => ({
        slug: item.slug,
        title: item.translatedTitle,
        summary: item.summary,
        content: normalizeStructuredContent(item.translatedContent, 2_000) || item.summary,
        publisher: item.originalPublisher || item.sourceName,
        sourceRole: item.sourceRole,
        publishedAt: item.publishedAt ?? item.discoveredAt,
      })),
      categories: EVENT_CATEGORIES,
    },
  }));
  const event = eventFromEditorial(editorial, items, now);
  events.push(event);
  for (const item of items) {
    item.eventSlugs = [event.slug];
    item.primaryEventSlug = event.slug;
    delete item.eventCandidateKey;
  }
}
await replaceStoredContent({
  events,
  information,
  projects: stored.projects,
  sourceCount: stored.state.sourceCount,
  updatedAt: now,
});
console.log(JSON.stringify({ ...report, applied: true }, null, 2));
