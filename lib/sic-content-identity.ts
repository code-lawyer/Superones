import { createHash } from "node:crypto";

import type { SicContentItem } from "./sic-content-types.ts";

export function sicContentIdentityKey(item: Pick<SicContentItem, "sourceId" | "canonicalId" | "url">) {
  if (item.canonicalId) return `${item.sourceId}:canonical:${item.canonicalId}`;
  try {
    const url = new URL(item.url);
    for (const key of [...url.searchParams.keys()]) {
      if (key === "hl" || key.startsWith("utm_")) url.searchParams.delete(key);
    }
    url.hash = "";
    return `${item.sourceId}:url:${url.toString()}`;
  } catch {
    return `${item.sourceId}:url:${item.url}`;
  }
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sicContentProjectionDigest(items: SicContentItem[]) {
  const projection = [...items]
    .sort((left, right) => sicContentIdentityKey(left).localeCompare(sicContentIdentityKey(right)))
    .map((item) => [sicContentIdentityKey(item), item]);
  return createHash("sha256").update(canonicalJson(projection)).digest("hex");
}
