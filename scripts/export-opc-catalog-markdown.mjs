import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../data/defaults/opc-catalog.seed.json", import.meta.url);
const outputPath = new URL("../OPC-Service-Catalog-Complete.md", import.meta.url);
const state = JSON.parse(await readFile(sourcePath, "utf8"));
const catalog = state.catalog;

const serviceFields = [
  ["kind", "类型"],
  ["code", "项目编号"],
  ["slug", "访问标识"],
  ["name", "项目名称"],
  ["domain", "专业领域"],
  ["group", "所属分类"],
  ["outcome", "预期结果"],
  ["audience", "适用对象"],
  ["includes", "服务内容"],
  ["deliverables", "交付结果"],
  ["materials", "所需材料"],
  ["acceptance", "验收标准"],
  ["boundary", "服务边界"],
  ["price", "定价"],
  ["feeNote", "费用说明"],
  ["period", "周期"],
  ["revision", "修订版本"],
  ["status", "当前状态"],
];

const rangerFields = [
  ["slug", "档案标识"],
  ["publicName", "公开名称"],
  ["identity", "专家身份"],
  ["intro", "专家简介"],
  ["tags", "专业标签"],
  ["credential", "资质或公开经历"],
  ["contactLabel", "联系入口"],
  ["contactState", "联系状态"],
  ["verificationDate", "核验日期"],
  ["profileUpdatedAt", "资料更新时间"],
  ["authorizationStatus", "授权状态"],
];

function valueOf(value) {
  if (value === undefined || value === null || value === "") return "未填写";
  if (Array.isArray(value)) return value.length ? value.map((item) => `- ${String(item)}`).join("<br>") : "未填写";
  return String(value).replaceAll("|", "\\|").replaceAll("\r\n", "<br>").replaceAll("\n", "<br>");
}

function fieldTable(item, fields) {
  return [
    "| 字段 | 内容 |",
    "|---|---|",
    ...fields.map(([key, label]) => `| ${label}（${key}） | ${valueOf(item[key])} |`),
  ].join("\n");
}

const lines = [
  "# OPC 服务台完整服务目录",
  "",
  "> 自动生成文件：由 `scripts/export-opc-catalog-markdown.mjs` 从受控默认目录导出。请勿手工编辑；修改目录事实后重新运行导出脚本。",
  "",
  `> 数据来源：\`data/defaults/opc-catalog.seed.json\` 的默认公开目录。目录修订号：${state.sourceRevision ?? "未填写"}；发布时间：${state.publishedAt ?? "未发布"}。`,
  "> 本文档完整保留当前目录中的字段值。数组字段以列表形式展开；空字段统一标记为“未填写”。",
  "",
  "## 一、目录概览",
  "",
  `- 基础设施项目：${catalog.infrastructure.length} 项`,
  `- 专项服务项目：${catalog.specialties.length} 项`,
  `- 专家档案：${catalog.rangers.length} 份`,
  `- 定价现状：21 项服务均已填写人民币公开价格，后续调价须通过受控目录发布。`,
  `- 周期现状：21 项服务均已填写预计交付周期；政府、平台及其他第三方处理时间按条目说明另计。`,
  "",
  "## 二、基础设施项目",
  "",
];

for (const item of catalog.infrastructure) {
  lines.push(`### ${item.code}｜${item.name}`, "", `所属分类：${item.group}`, "", fieldTable(item, serviceFields), "");
}

lines.push("## 三、专项服务项目", "");
for (const item of catalog.specialties) {
  lines.push(`### ${item.code}｜${item.name}`, "", `所属分类：${item.domain} / ${item.group}`, "", fieldTable(item, serviceFields), "");
}

lines.push(
  "## 四、专家档案",
  "",
  catalog.rangers.length > 0
    ? "> 当前专家档案均已提供公开邮箱、核验信息和本人公开授权状态。"
    : "> 当前没有通过本人授权、职业资料核验和公开联系方式确认的专家档案；默认目录不使用样例身份填充。",
  "",
);
for (const item of catalog.rangers) {
  lines.push(`### ${item.publicName || item.slug}`, "", fieldTable(item, rangerFields), "");
}

lines.push("## 五、当前目录字段说明", "", "服务项目的核心字段包括：项目名称、分类、预期结果、适用对象、服务内容、交付结果、所需材料、验收标准、服务边界、定价、费用说明、周期、修订版本和状态。下单入口由页面订单流程统一提供，不作为运营人员可编辑文案。", "", "专家档案的核心字段包括：档案标识、公开名称、专家身份、简介、专业标签、资质或公开经历、联系入口、联系状态、核验日期、资料更新时间和授权状态。", "");

await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`已生成：${outputPath.pathname}`);
