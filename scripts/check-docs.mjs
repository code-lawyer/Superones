import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "CONTEXT.md",
  "docs/README.md",
  "docs/Vault2077-Design-Spec.md",
  "docs/Vault2077-Feed-Design-Spec.md",
  "docs/Vault2077-OPC-Design-Spec.md",
  "docs/Vault2077-SiC-Design-Spec.md",
  "docs/Vault2077-Frontier-Design-Spec.md",
  "docs/Vault2077-Admin-Operations-Spec.md",
  "docs/Vault2077-System-Delivery-Spec.md",
  "docs/Vault2077-Launch-Checklist.md",
  "docs/Vault2077-Implementation-Traceability.md",
  "docs/Vault2077-Deployment-Configuration-Manual.md",
  "docs/adr/0001-cross-region-public-content-pipeline.md",
  "docs/adr/0002-accountless-public-product.md",
];

const forbidden = new Map([
  ["docs/Vault2077-Source-Inventory.md", ["## 4. 首发分层", "### P0：", "### P1：", "### P2：", "### P3：", "### P4："]],
  ["docs/Content-Pipeline-Operations.md", ["降级摘要继续发布"]],
  ["docs/Vault2077-Feed-Design-Spec.md", ["归入事件后显示“已沉淀”及主事件名称"]],
]);

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files;
}

const errors = [];

for (const relative of required) {
  try { await access(path.join(root, relative)); }
  catch { errors.push(`缺少规范文件：${relative}`); }
}

const files = [path.join(root, "CONTEXT.md"), path.join(root, "README.md"), ...await markdownFiles(path.join(root, "docs"))];
const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

for (const file of files) {
  const body = await readFile(file, "utf8");
  for (const match of body.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/.test(rawTarget)) continue;
    const target = decodeURIComponent(rawTarget.split("#")[0]);
    if (!target) continue;
    try { await access(path.resolve(path.dirname(file), target)); }
    catch { errors.push(`失效链接：${path.relative(root, file)} → ${rawTarget}`); }
  }
}

for (const [relative, phrases] of forbidden) {
  const body = await readFile(path.join(root, relative), "utf8");
  for (const phrase of phrases) if (body.includes(phrase)) errors.push(`旧结论重新出现：${relative} → ${phrase}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`文档校验通过：${files.length} 个 Markdown 文件，${required.length} 个必需规范。`);
}
