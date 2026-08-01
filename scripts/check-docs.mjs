import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const docsRoot = path.join(root, "docs");
const indexPath = path.join(docsRoot, "README.md");
const required = [
  "CONTEXT.md",
  "README.md",
  "Vault2077-Production-Deployment-Plan-2026-07-31.md",
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
  "docs/adr/0008-single-destination-content-routing.md",
  "docs/adr/0009-channel-editorial-profiles.md",
  "docs/adr/0010-production-persistence-and-security-seam.md",
  "docs/adr/0011-managed-service-catalog.md",
  "docs/adr/0012-production-admin-access.md",
  "docs/adr/0013-reliable-delivery-and-domestic-worker.md",
  "docs/adr/0014-opc-accountless-orders-and-alipay.md",
  "docs/adr/0015-current-snapshots-and-automated-editorial.md",
  "docs/adr/0016-ranger-avatar-media-storage.md",
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
const productionPlanPath = path.join(root, "Vault2077-Production-Deployment-Plan-2026-07-31.md");
const files = [path.join(root, "CONTEXT.md"), path.join(root, "README.md"), productionPlanPath, ...docFiles];
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
    "所有内容通道共用一个模型",
  ]],
  ["docs/Vault2077-SiC-Design-Spec.md", [
    "Hugging Face 模型下载增长榜", "MCP 热门榜", "本地快照差",
    "首次上线仍只使用 24 小时窗口",
  ]],
  ["docs/Vault2077-OPC-Design-Spec.md", [
    "六大服务类别", "立即购买", "加入购物车",
    "`/opc/infrastructure`", "`/opc/specialties`", "`/opc/rangers`：",
  ]],
  ["docs/Vault2077-Feed-Design-Spec.md", [
    "北京时间 06:00、12:00、18:00、24:00", "每日四批",
    "聚合器和参考项目是发现路径，不是独立证据来源",
  ]],
  ["docs/Vault2077-SiC-Source-Catalog.md", [
    "档案：只接入机构自营的研究、工程、发布、版本记录和正式观点",
  ]],
  ["docs/Vault2077-Unified-Acquisition-Runbook.md", [
    "VAULT2077_SIC_SNAPSHOT_URL", "VAULT2077_SIC_CONTENT_URL",
    "不得从境内后台直连 GitHub",
    "三个内容通道使用的编辑提供方",
  ]],
  ["docs/Vault2077-Frontier-Design-Spec.md", [
    "所有 GitHub 读取均通过统一采集器",
    "不得由浏览器或境内业务服务直接请求 GitHub",
  ]],
  ["docs/Vault2077-System-Delivery-Spec.md", [
    "所有境外公开读取（包括边境计划仓库核验）",
    "所有内容通道共用一个模型",
  ]],
  ["docs/Vault2077-Launch-Checklist.md", [
    "境内服务与浏览器不直接请求境外公开上游",
  ]],
  ["docs/Vault2077-Implementation-Traceability.md", [
    "删除境内直连 GitHub 路径",
    "违反单一 workflow 边界",
    "详情判断尚未强制证据引用",
    "三类独立路由已实现",
    "独立核验日期、资料更新时间和撤销动作仍待补",
    "授权撤回永久删除命令已实现",
  ]],
  ["docs/Vault2077-Deep-Audit-2026-07-24.md", [
    "Frontier 绕过统一跨区边界",
    "删除境内 GitHub 直连和旧 tick",
    "身份网关签名 JWT", "身份网关策略",
  ]],
  ["docs/Vault2077-OPC-Development-Plan.md", [
    "/opc/rangers#ranger-slug", "才考虑建立 `/opc/rangers/[slug]`",
  ]],
  ["docs/Vault2077-Ranger-Avatar-Storage-Decision-2026-07-31.md", [
    "建议采纳，实施前需新增 ADR", "\"assetId\"", "\"version\": \"sha256\"",
    "清理模块当前尚未实现",
    "当前后台把文件转成 Data URL",
  ]],
  ["docs/Vault2077-OPC-Admin-Manual.md", [
    "永久删除该专家的全部头像版本",
  ]],
  ["docs/Vault2077-Deployment-Configuration-Manual.md", [
    "永久删除该 slug 的全部头像版本",
  ]],
  ["Vault2077-Production-Deployment-Plan-2026-07-31.md", [
    "首发不使用 Cloudflare、Redis、OSS",
    "管理员原生 Passkey 尚未实现",
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
  if (!body) continue;
  for (const phrase of phrases) {
    if (body.includes(phrase)) errors.push(`旧口径重新进入当前文档：${relative} → ${phrase}`);
  }
}

const requiredByFile = new Map([
  ["CONTEXT.md", ["交互式仓库核验", "参赛仓库观察", "频道编辑配置", "上线基线"]],
  ["docs/README.md", ["../Vault2077-Production-Deployment-Plan-2026-07-31.md"]],
  ["docs/Vault2077-Design-Spec.md", ["境内服务端优先即时核验", "Vault 编辑配置", "SiC 编辑配置", "正式启用内容频道前必须建立真实、可追溯的上线基线"]],
  ["docs/Vault2077-Frontier-Design-Spec.md", ["境内 GitHub 快速路径", "异步公开任务"]],
  ["docs/Vault2077-System-Delivery-Spec.md", ["Frontier GitHub 集成", "境内 GitHub 快速路径", "institutional-news-registry.json", "`externalUrl`", "`vault_editorial`", "`sic_editorial`", "不得使用编辑模型", "`runMode=bootstrap`"]],
  ["docs/Vault2077-Launch-Checklist.md", ["Frontier 境内 GitHub 快速路径", "发现—晋升中间产物", "频道编辑配置", "真实上线基线", "真实 OSS", "无引用对象清理"]],
  ["docs/Vault2077-Unified-Acquisition-Runbook.md", ["Frontier 境内侧另配置只读 GitHub 服务端凭证", "不得产生发现候选文件", "已经支持显式 `runMode=bootstrap`", "`vault_editorial` 与 `sic_editorial`"]],
  ["docs/Vault2077-Deployment-Configuration-Manual.md", ["Frontier 境内 GitHub 请求", "`vault_editorial`", "`sic_editorial`", "非生产迁移期本地预览兼容层", "bootstrap 是一次性受审计作业", "`npm run db:migrate`", "VAULT2077_RANGER_MEDIA_STORAGE", "VAULT2077_OSS_PUBLIC_ORIGIN", "media.superones.top"]],
  ["docs/Vault2077-Implementation-Traceability.md", ["Frontier GitHub 混合访问", "频道编辑配置", "上线基线与初始化回填", "真实 Bucket/CNAME/RAM 联调", "有效 `[n]` 证据引用校验", "`/opc` 单一工作台", "全部对象版本永久删除命令", "版本化删除演练"]],
  ["docs/Vault2077-Feed-Design-Spec.md", ["每条原始内容只有一个公开主去向", "不生成待晋升候选", "Vault 编辑配置", "最近 30 天的真实新闻型内容建立上线基线"]],
  ["docs/Vault2077-SiC-Design-Spec.md", ["宽泛混合 Feed", "才可批准", "SiC 编辑配置", "最近一条符合该来源准入边界的真实内容"]],
  ["docs/Vault2077-SiC-Source-Catalog.md", ["每个 approved 内容来源至少回填最近一条"]],
  ["docs/Vault2077-Admin-Operations-Spec.md", ["自动进入候选注册表", "同一原始内容只有一个主去向", "`vault_editorial`", "`sic_editorial`", "ADR-0016", "后台不接受任意第三方图片 URL"]],
  ["docs/adr/0008-single-destination-content-routing.md", ["单一主去向", "不递归抓取"]],
  ["docs/adr/0009-channel-editorial-profiles.md", ["频道编辑配置", "受控备用", "不得随机分发"]],
  ["docs/adr/0010-production-persistence-and-security-seam.md", ["`FOR UPDATE SKIP LOCKED`", "不可变审计", "文件与 PostgreSQL 不做生产双写"]],
  ["docs/Vault2077-Deep-Audit-2026-07-24.md", ["根据 ADR-0007"]],
  ["docs/adr/0004-unified-overseas-acquisition-pipeline.md", ["ADR-0007"]],
  ["docs/adr/0005-platform-native-rankings-and-lanes.md", ["ADR-0007"]],
  ["docs/adr/0006-production-data-and-public-task-boundary.md", ["ADR-0007"]],
  ["docs/adr/0007-frontier-github-hybrid-access.md", ["境内直读是快速路径，不是唯一成功路径"]],
  ["docs/Vault2077-OPC-Design-Spec.md", ["view=infrastructure|specialties|rangers", "`/opc/rangers/[slug]`", "ADR-0016"]],
  ["docs/Vault2077-OPC-Admin-Manual.md", ["data/ranger-media/", "VAULT2077_RANGER_MEDIA_STORAGE=oss", "opc:cleanup-ranger-media", "opc:purge-revoked-ranger-media"]],
  ["docs/Vault2077-Ranger-Avatar-Storage-Decision-2026-07-31.md", ["opc:cleanup-ranger-media", "超过 7 天", "保留 30 天", "全部对象版本永久删除命令", "历史 versionId"]],
  ["docs/Vault2077-Aliyun-Identity-Gateway-Decision.md", ["OIDC 路由和配置已经从运行时代码删除"]],
  ["Vault2077-Production-Deployment-Plan-2026-07-31.md", ["media.superones.top", "VAULT2077_RANGER_MEDIA_STORAGE=oss", "真实 OSS", "管理员原生 Passkey 未通过自动化测试"]],
]);
for (const [relative, phrases] of requiredByFile) {
  const body = bodies.get(path.join(root, relative));
  if (!body) continue;
  for (const phrase of phrases) {
    if (!body.includes(phrase)) errors.push(`当前口径缺失：${relative} → ${phrase}`);
  }
}

const sourceCatalog = bodies.get(path.join(docsRoot, "Vault2077-SiC-Source-Catalog.md"));
const sourceRegistry = JSON.parse(await readFile(path.join(root, "config", "sic-source-registry.json"), "utf8"));
const sourceEntries = Array.isArray(sourceRegistry) ? sourceRegistry : sourceRegistry.sources;
const approved = sourceEntries.filter((entry) => entry.status === "approved").length;
const retired = sourceEntries.filter((entry) => entry.status === "retired").length;
const pendingReview = sourceEntries.filter((entry) => entry.status === "pending_review").length;
if (!sourceCatalog.includes(`${approved} 个 approved`)) {
  errors.push(`SiC 来源目录的 approved 数量与注册表不一致：${approved}`);
}
if (!sourceCatalog.includes(`${retired} 个 retired`)) {
  errors.push(`SiC 来源目录的 retired 数量与注册表不一致：${retired}`);
}
if (!sourceCatalog.includes(`${pendingReview} 个 pending_review`)) {
  errors.push(`SiC 来源目录的 pending_review 数量与注册表不一致：${pendingReview}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`文档校验通过：${files.length} 个 Markdown，全部有元数据、索引登记和有效本地链接。`);
}
