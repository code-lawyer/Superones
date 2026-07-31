import "server-only";

import {
  eventFromEditorial,
  type EventEditorial,
} from "../lib/content-compiler.ts";
import { getStoredContent, replaceStoredContent } from "../lib/content-store.ts";
import { auditEventCandidateGroups } from "../lib/event-reconciliation.ts";

type Definition = {
  candidateKey: string;
  informationSlugs: string[];
  editorial: EventEditorial;
};

const definitions: Definition[] = [
  {
    candidateKey: "gpt-5-6-launch-and-rollout",
    informationSlugs: [
      "gpt-5-6如何融合前沿智能与前沿效率-77cf4b5c",
      "lwiai播客-252-gpt-5-6-grok-4-5等话题-02eaa234",
      "gpt-5-6成为microsoft-365-copilot首选模型-3e88c998",
      "gpt-5-6-前沿智能-随您雄心扩展-ca798b69",
    ],
    editorial: {
      title: "GPT-5.6发布并进入微软Copilot",
      judgment: "新模型从发布迅速进入主流办公产品[1][3]",
      summary: "OpenAI发布GPT-5.6，强调前沿智能、推理效率与性价比[1][4]；随后该模型成为Microsoft 365 Copilot的首选模型[3]。Last Week in AI的同期节目也将GPT-5.6列为重点议题[2]。",
      significance: "模型发布与大型办公平台部署在同一周期发生，意味着能力升级已从产品说明进入面向广泛用户的实际工作流[1][3]。",
      entities: ["OpenAI", "GPT-5.6", "Microsoft 365 Copilot", "Last Week in AI"],
      category: "模型与产品",
    },
  },
  {
    candidateKey: "codex-adoption-expansion",
    informationSlugs: [
      "ntt-data集团借助codex将事件分析缩短至30分钟-da00d54b",
      "codex如何成为openai创意团队的协作者-a4e7b047",
      "ainews-codex-使用量-6-个月增长超-10-倍达-700-万用户-过去一天新增-100-万-codex-是否超越了--a3568b26",
      "澳大利亚支付plus利用chatgpt和codex加速支付处理-89ff8700",
    ],
    editorial: {
      title: "Codex采用范围与使用规模同步扩大",
      judgment: "编码代理正在进入多类组织工作流[1][2][4]",
      summary: "OpenAI披露NTT DATA、内部创意团队及澳大利亚支付Plus使用Codex的案例，覆盖事件分析、创意工具和支付业务[1][2][4]；Latent Space同期报道Codex使用量在六个月内显著增长[3]。",
      significance: "来自企业客户、内部团队和媒体统计的多方信息共同显示，Codex的使用已超出单一编程场景，开始进入组织级流程与专业业务[1][2][3][4]。",
      entities: ["Codex", "OpenAI", "NTT DATA", "Australian Payments Plus", "Latent Space"],
      category: "模型与产品",
    },
  },
  {
    candidateKey: "chatgpt-work-use-cases",
    informationSlugs: [
      "codex从0到1000万用户-构建chatgpt-work-akshay-nathan-openai-685921e0",
      "销售团队如何使用chatgpt-work-78feca28",
      "数据科学团队如何使用chatgpt-work-c33a7984",
    ],
    editorial: {
      title: "ChatGPT Work展开专业团队场景",
      judgment: "产品叙事开始落到具体职能工作成果[2][3]",
      summary: "Latent Space采访介绍了ChatGPT Work的构建背景[1]；OpenAI随后分别展示销售团队和数据科学团队如何用该产品生成简报、计划、分析和规格等工作成果[2][3]。",
      significance: "同一产品同时出现建设者说明与两个不同职能的官方实践，提供了从产品定位到实际使用方式的完整证据链[1][2][3]。",
      entities: ["ChatGPT Work", "OpenAI", "Latent Space", "销售团队", "数据科学团队"],
      category: "模型与产品",
    },
  },
  {
    candidateKey: "model-evaluation-security-incident",
    informationSlugs: [
      "担忧rsi-openai-anthropic等联名信呼吁放缓ai发展-huggingface详述机器速度网络攻击-7be78fd5",
      "ainews-ai网络安全成为关注焦点-5c3a64e2",
      "openai-与-hugging-face-合作应对模型评估期间的安全事件-d1eb21e0",
    ],
    editorial: {
      title: "模型评估安全事件引发联合调查",
      judgment: "高级网络能力正在改变模型评估风险边界[1][2][3]",
      summary: "OpenAI与Hugging Face披露模型评估期间安全事件的初步调查结果[3]；Latent Space的同期报道将该事件与机器速度网络攻击及更广泛的AI网络安全风险联系起来[1][2]。",
      significance: "官方调查与外部报道共同表明，前沿模型评估已经需要把网络攻击能力、合作响应和防御者影响纳入同一安全流程[1][2][3]。",
      entities: ["OpenAI", "Hugging Face", "Latent Space", "模型评估", "网络安全"],
      category: "政策与安全",
    },
  },
];

const apply = process.argv.includes("--apply");
const stored = await getStoredContent();
const definitionSlugs = new Set(definitions.flatMap((definition) => definition.informationSlugs));
const auditInformation = stored.information.map((item) => (
  definitionSlugs.has(item.slug)
    ? { ...item, eventSlugs: [], primaryEventSlug: undefined }
    : item
));
const audited = auditEventCandidateGroups({
  groups: definitions.map(({ candidateKey, informationSlugs }) => ({
    candidateKey,
    informationSlugs,
  })),
}, auditInformation);
if (audited.rejected.length > 0 || audited.accepted.length !== definitions.length) {
  throw new Error(`Bootstrap event definitions failed audit: ${JSON.stringify(audited.rejected)}`);
}

const now = new Date().toISOString();
const information = structuredClone(stored.information);
const bySlug = new Map(information.map((item) => [item.slug, item]));
const events = [];
for (const group of audited.accepted) {
  const definition = definitions.find((value) => value.candidateKey === group.candidateKey);
  if (!definition) throw new Error(`Missing event definition ${group.candidateKey}.`);
  const items = group.information.map((item) => {
    const storedItem = bySlug.get(item.slug);
    if (!storedItem) throw new Error(`Missing information ${item.slug}.`);
    return storedItem;
  });
  const event = eventFromEditorial(definition.editorial, items, now);
  events.push(event);
  for (const item of items) {
    item.eventSlugs = [event.slug];
    item.primaryEventSlug = event.slug;
    delete item.eventCandidateKey;
  }
}

if (apply) {
  await replaceStoredContent({
    events,
    information,
    projects: stored.projects,
    sourceCount: stored.state.sourceCount,
    updatedAt: now,
  });
}

console.log(JSON.stringify({
  applied: apply,
  events: events.map((event) => ({
    slug: event.slug,
    title: event.title,
    sources: event.sources?.length ?? 0,
  })),
  rejected: audited.rejected,
}, null, 2));
