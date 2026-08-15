const entityMap: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

export function decodeHtmlEntities(value: string) {
  return value.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|([a-z]+));/gi, (entity, hex: string | undefined, decimal: string | undefined, name: string | undefined) => {
    if (name) return entityMap[name.toLowerCase()] ?? entity;
    const point = Number.parseInt(hex ?? decimal ?? "", hex ? 16 : 10);
    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : entity;
  });
}
