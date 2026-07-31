const PUBLICATION_PREFIX = /^\s*\[\s*AI\s*News\s*\]\s*(?:[:：\-–—]\s*)?/i;

export function cleanEditorialTitle(value: string) {
  const title = value.replace(PUBLICATION_PREFIX, "").trim();
  return title || value.trim();
}
