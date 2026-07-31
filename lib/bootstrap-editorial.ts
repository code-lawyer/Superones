import type {
  BatchedInformationEditorial,
  EditorialPort,
  InformationEditorial,
} from "./content-compiler.ts";
import type { InformationEnvelope } from "./content-contract.ts";
import { normalizeStructuredContent } from "./content-markup.ts";
import { cleanEditorialTitle } from "./editorial-title.ts";

function clean(value: string, limit: number) {
  return value
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export function bootstrapInformationEditorial(item: InformationEnvelope): InformationEditorial {
  const originalContent = item.originalContent ?? item.originalTitle;
  const translatedTitle = clean(cleanEditorialTitle(item.originalTitle), 72);
  const translatedContent = normalizeStructuredContent(originalContent, 12_000) || translatedTitle;
  const summary = clean(originalContent, 120) || translatedTitle;
  return {
    translatedTitle,
    summary,
    translatedContent,
  };
}

/**
 * Cold-start materialization intentionally performs no network or model calls.
 * English source text remains English until a later incremental editorial pass.
 */
export function createBootstrapEditorialPort(): EditorialPort {
  return {
    async processInformationBatch(input): Promise<BatchedInformationEditorial[]> {
      return input.information.map((item) => ({
        idempotencyKey: item.idempotencyKey,
        ...bootstrapInformationEditorial(item),
        decision: { disposition: "independent" as const },
      }));
    },
    async translateInformation(item) {
      return bootstrapInformationEditorial(item);
    },
    async classifyInformation() {
      return { disposition: "independent" };
    },
    async composeEvent() {
      throw new Error("Bootstrap event composition is handled by the corpus-level reconciler.");
    },
  };
}
