import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  inferContentFormat,
  normalizeStructuredContent,
  repairLegacyFlattenedMarkdown,
  type ContentFormat,
} from "../lib/content-markup.ts";
import { refreshBootstrapManifest } from "./bootstrap-manifest.ts";

type MutableInformation = {
  slug?: string;
  originalContent?: string;
  translatedContent?: string;
  contentFormat?: ContentFormat;
};

type ContentDocument = {
  information?: MutableInformation[];
};

function migrateText(value: string, format: ContentFormat) {
  return format === "markdown"
    ? repairLegacyFlattenedMarkdown(value)
    : normalizeStructuredContent(value, 48_000);
}

function migrateInformation(items: MutableInformation[]) {
  let formatted = 0;
  let repaired = 0;
  for (const item of items) {
    const original = item.originalContent ?? "";
    const translated = item.translatedContent ?? "";
    const format = item.contentFormat ?? inferContentFormat(original || translated);
    if (item.contentFormat !== format) formatted += 1;
    item.contentFormat = format;

    if (item.originalContent) {
      const next = migrateText(item.originalContent, format);
      if (next !== item.originalContent) repaired += 1;
      item.originalContent = next;
    }
    if (item.translatedContent) {
      const next = migrateText(item.translatedContent, format);
      if (next !== item.translatedContent) repaired += 1;
      item.translatedContent = next;
    }
  }
  return { records: items.length, formatted, repaired };
}

async function migrateFile(fileName: string) {
  const root = path.resolve(process.cwd());
  const target = path.resolve(root, fileName);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Migration target must stay inside the workspace: ${fileName}`);
  }
  const document = JSON.parse(await readFile(target, "utf8")) as ContentDocument;
  if (!Array.isArray(document.information)) throw new Error(`${fileName} does not contain an information array.`);
  const result = migrateInformation(document.information);
  const temporary = `${target}.markup.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return { file: path.relative(root, target), ...result };
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  throw new Error("Pass one or more content-store JSON paths.");
}

const results = [];
for (const target of targets) {
  const result = await migrateFile(target);
  results.push(result);
  console.log(JSON.stringify(result));
}
if (results.some((result) => result.file.replaceAll("\\", "/") === "data/bootstrap/content-store.seed.json")) {
  await refreshBootstrapManifest();
  console.log(JSON.stringify({ manifest: "data/bootstrap/manifest.json", refreshed: true }));
}
