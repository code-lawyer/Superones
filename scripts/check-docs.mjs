import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const docsRoot = path.join(root, "docs");
const indexPath = path.join(docsRoot, "README.md");
const required = [
  "CONTEXT.md",
  "README.md",
  "docs/README.md",
  "docs/Vault2077-Design-Spec.md",
  "docs/Vault2077-Feed-Design-Spec.md",
  "docs/Vault2077-OPC-Design-Spec.md",
  "docs/Vault2077-SiC-Design-Spec.md",
  "docs/Vault2077-SiC-Source-Catalog.md",
  "docs/Vault2077-Frontier-Design-Spec.md",
  "docs/Vault2077-Admin-Operations-Spec.md",
  "docs/Vault2077-System-Delivery-Spec.md",
  "docs/Vault2077-Launch-Checklist.md",
  "docs/Vault2077-Implementation-Traceability.md",
  "docs/Vault2077-Unified-Acquisition-Runbook.md",
  "docs/Vault2077-Deployment-Configuration-Manual.md",
  "docs/adr/0001-cross-region-public-content-pipeline.md",
  "docs/adr/0002-accountless-public-product.md",
  "docs/adr/0003-independent-stateless-overseas-collector.md",
  "docs/adr/0004-unified-overseas-acquisition-pipeline.md",
  "docs/adr/0005-platform-native-rankings-and-lanes.md",
  "docs/adr/0006-production-data-and-public-task-boundary.md",
  "docs/adr/0007-frontier-github-hybrid-access.md",
];
const allowedStatuses = new Set([
  "active", "accepted", "amended", "reference", "historical", "superseded",
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

function frontmatter(body) {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z][a-z0-9-]*):\s*(.+)\s*$/i);
    if (field) result[field[1]] = field[2].replace(/^["']|["']$/g, "");
  }
  return result;
}

const errors = [];
for (const relative of required) {
  try { await access(path.join(root, relative)); }
  catch { errors.push(`缺少规范文件：${relative}`); }
}

const docFiles = await markdownFiles(docsRoot);
const files = [path.join(root, "CONTEXT.md"), path.join(root, "README.md"), ...docFiles];
const bodies = new Map();
for (const file of files) bodies.set(file, await readFile(file, "utf8"));

for (const [file, body] of bodies) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const meta = frontmatter(body);
  if (!meta) {
    errors.push(`缺少 YAML 元数据：${relative}`);
    continue;
  }
  for (const field of ["type", "status", "updated"]) {
    if (!meta[field]) errors.push(`缺少元数据 ${field}：${relative}`);
  }
  if (meta.status && !allowedStatuses.has(meta.status)) {
    errors.push(`未知文档状态 ${meta.status}：${relative}`);
  }
  if (meta.updated && !/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) {
    errors.push(`updated 必须是 YYYY-MM-DD：${relative}`);
  }
  if (body.includes("[[")) errors.push(`禁止 Obsidian 内链：${relative}`);
}

const index = bodies.get(indexPath);
for (const file of docFiles) {
  if (file === indexPath) continue;
  const relative = path.relative(docsRoot, file).replaceAll("\\", "/");
  if (!index.includes(relative)) errors.push(`文档未在 docs/README.md 登记：${relative}`);
}

const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
for (const [file, body] of bodies) {
  for (const match of body.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/.test(rawTarget)) continue;
    const target = decodeURIComponent(rawTarget.split("#")[0]);
    if (!target) continue;
    try { await access(path.resolve(path.dirname(file), target)); }
    catch {
      errors.push(`失效链接：${path.relative(root, file)} → ${rawTarget}`);
    }
  }
}

const forbiddenByFile = new Map([
  ["docs/Vault2077-Design-Spec.md", [
    "GH Archive", "BigQuery", "Smithery", "近期 Star 增速优先", "六大服务类别",
  ]],
  ["docs/Vault2077-SiC-Design-Spec.md", [
    "Hugging Face 模型下载增长榜", "MCP 热门榜", "本地快照差",
  ]],
  ["docs/Vault2077-OPC-Design-Spec.md", [
    "六大服务类别", "立即购买", "加入购物车",
  ]],
  ["docs/Vault2077-Feed-Design-Spec.md", [
    "北京时间 06:00、12:00、18:00、24:00", "每日四批",
  ]],
  ["docs/Vault2077-Unified-Acquisition-Runbook.md", [
    "VAULT2077_SIC_SNAPSHOT_URL", "VAULT2077_SIC_CONTENT_URL",
    "不得从境内后台直连 GitHub",
  ]],
  ["docs/Vault2077-Frontier-Design-Spec.md", [
    "所有 GitHub 读取均通过统一采集器",
    "不得由浏览器或境内业务服务直接请求 GitHub",
  ]],
  ["docs/Vault2077-System-Delivery-Spec.md", [
    "所有境外公开读取（包括边境计划仓库核验）",
  ]],
  ["docs/Vault2077-Launch-Checklist.md", [
    "境内服务与浏览器不直接请求境外公开上游",
  ]],
  ["docs/Vault2077-Implementation-Traceability.md", [
    "删除境内直连 GitHub 路径",
    "违反单一 workflow 边界",
  ]],
  ["docs/Vault2077-Deep-Audit-2026-07-24.md", [
    "Frontier 绕过统一跨区边界",
    "删除境内 GitHub 直连和旧 tick",
  ]],
  ["docs/adr/0004-unified-overseas-acquisition-pipeline.md", [
    "接收侧也不得绕过签名协议直接抓取境外页面",
  ]],
  ["docs/adr/0006-production-data-and-public-task-boundary.md", [
    "所有境外公开读取（包括边境计划 GitHub 核验）",
  ]],
  ["CONTEXT.md", [
    "/api/", "VAULT2077_", "PostgreSQL", "Redis", "BigQuery", "Smithery",
  ]],
]);
for (const [relative, phrases] of forbiddenByFile) {
  const body = bodies.get(path.join(root, relative));
  for (const phrase of phrases) {
    if (body.includes(phrase)) errors.push(`旧口径重新进入当前文档：${relative} → ${phrase}`);
  }
}

const requiredByFile = new Map([
  ["CONTEXT.md", ["交互式仓库核验", "参赛仓库观察"]],
  ["docs/Vault2077-Design-Spec.md", ["境内服务端优先即时核验"]],
  ["docs/Vault2077-Frontier-Design-Spec.md", ["境内 GitHub 快速路径", "异步公开任务"]],
  ["docs/Vault2077-System-Delivery-Spec.md", ["Frontier GitHub 集成", "境内 GitHub 快速路径"]],
  ["docs/Vault2077-Launch-Checklist.md", ["Frontier 境内 GitHub 快速路径"]],
  ["docs/Vault2077-Unified-Acquisition-Runbook.md", ["Frontier 境内侧另配置只读 GitHub 服务端凭证"]],
  ["docs/Vault2077-Deployment-Configuration-Manual.md", ["Frontier 境内 GitHub 请求"]],
  ["docs/Vault2077-Implementation-Traceability.md", ["Frontier GitHub 混合访问"]],
  ["docs/Vault2077-Deep-Audit-2026-07-24.md", ["根据 ADR-0007"]],
  ["docs/adr/0004-unified-overseas-acquisition-pipeline.md", ["ADR-0007"]],
  ["docs/adr/0005-platform-native-rankings-and-lanes.md", ["ADR-0007"]],
  ["docs/adr/0006-production-data-and-public-task-boundary.md", ["ADR-0007"]],
  ["docs/adr/0007-frontier-github-hybrid-access.md", ["境内直读是快速路径，不是唯一成功路径"]],
]);
for (const [relative, phrases] of requiredByFile) {
  const body = bodies.get(path.join(root, relative));
  for (const phrase of phrases) {
    if (!body.includes(phrase)) errors.push(`当前口径缺失：${relative} → ${phrase}`);
  }
}

const sourceCatalog = bodies.get(path.join(docsRoot, "Vault2077-SiC-Source-Catalog.md"));
const sourceRegistry = JSON.parse(await readFile(path.join(root, "config", "sic-source-registry.json"), "utf8"));
const sourceEntries = Array.isArray(sourceRegistry) ? sourceRegistry : sourceRegistry.sources;
const approved = sourceEntries.filter((entry) => entry.status === "approved").length;
const retired = sourceEntries.filter((entry) => entry.status === "retired").length;
if (!sourceCatalog.includes(`运行时共 ${approved} 个 approved 来源`)) {
  errors.push(`SiC 来源目录的 approved 数量与注册表不一致：${approved}`);
}
if (!sourceCatalog.includes(`另保留 ${retired} 个 retired 来源`)) {
  errors.push(`SiC 来源目录的 retired 数量与注册表不一致：${retired}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`文档校验通过：${files.length} 个 Markdown，全部有元数据、索引登记和有效本地链接。`);
}
