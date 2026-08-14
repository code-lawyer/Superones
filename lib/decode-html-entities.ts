const entityMap: Record<string, string> = {
  "&amp;": "&",
  "&#038;": "&",
  "&#38;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

export function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(?:amp|quot|lt|gt);|&#(?:038|38|39);/g,
    (entity) => entityMap[entity] ?? entity,
  );
}
