export const CONTENT_FORMATS = ["plain_text", "markdown"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

const MARKDOWN_BLOCK = /(^|\n)\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|```|>\s+)/m;
const MARKDOWN_INLINE = /(?:\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*|`[^`\n]+`)/;

export function normalizeStructuredContent(value: string, limit: number) {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (normalized.length <= limit) return normalized;

  // Published structured content is never cut through a Markdown block. Work
  // backwards from a complete block boundary and reject an overlong first
  // block instead of emitting an unterminated fence, list, link, or paragraph.
  const boundary = normalized.lastIndexOf("\n\n", limit);
  if (boundary <= 0) return "";
  let candidate = normalized.slice(0, boundary).trimEnd();
  while ((candidate.match(/^```/gm)?.length ?? 0) % 2 !== 0) {
    const previousBoundary = normalized.lastIndexOf("\n\n", candidate.length - 1);
    if (previousBoundary <= 0) return "";
    candidate = normalized.slice(0, previousBoundary).trimEnd();
  }
  return candidate;
}

export function inferContentFormat(value: string): ContentFormat {
  return MARKDOWN_BLOCK.test(value) || MARKDOWN_INLINE.test(value) ? "markdown" : "plain_text";
}

/**
 * One-time migration helper for legacy records whose Markdown block boundaries
 * were flattened before publication. New content must preserve boundaries at
 * ingestion instead of relying on this repair.
 */
export function repairLegacyFlattenedMarkdown(value: string) {
  if (value.includes("\n") || inferContentFormat(value) !== "markdown") {
    return normalizeStructuredContent(value, 48_000);
  }

  let repaired = value.trim();
  repaired = repaired.replace(/^```\s+/, "```\n");
  repaired = repaired.replace(/\s+```\s+(?=#{1,6}\s+)/, "\n```\n\n");
  repaired = repaired.replace(/\s+```([A-Za-z0-9_-]+)\s+/g, "\n\n```$1\n");
  repaired = repaired.replace(/\s+```\s*/g, "\n```\n\n");
  repaired = repaired.replace(/\s+(#{1,6})\s+/g, "\n\n$1 ");
  repaired = repaired.replace(/\s+-\s+(?=(?:\[[^\]]+\]|\*\*|[A-Za-z\u4e00-\u9fff]))/g, "\n- ");
  repaired = repaired.replace(/\s+(?=\d+\.\s+)/g, "\n");
  return normalizeStructuredContent(repaired, 48_000);
}

export function safeMarkdownUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}
