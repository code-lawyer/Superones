/** Local-only editorial simulator for one real captured batch; never deployed. */
import { createServer } from "node:http";

const port = Number(process.env.VAULT2077_PREVIEW_MODEL_PORT ?? "4320");
const editorial = new Map([
  ["Terence Tao's ChatGPT conversation about the Jacobian Conjecture counterexample", ["陶哲轩讨论雅可比猜想反例", "数学家陶哲轩公开了一段围绕雅可比猜想反例的 ChatGPT 对话与讨论脉络。"]],
  ["GigaToken: ~1000x faster Language model tokenization", ["GigaToken：语言模型分词提速约千倍", "开源项目 GigaToken 宣称通过高度优化的实现，将语言模型分词速度提升至约千倍。"]],
  ["Building a serverless AI assistant at Pelago: concept to care in two weeks", ["Pelago 两周构建无服务器 AI 助手", "数字医疗公司 Pelago 分享了用 AWS 无服务器架构在两周内完成 AI 助手从概念到服务的实践。"]],
  ["Show HN: Bento - An entire PowerPoint in one HTML file (edit+view+data+collab)", ["Bento：把整份演示文稿装进一个 HTML 文件", "Bento 展示了一个基于网页技术的演示文稿方案，将编辑、展示、数据与协作整合为单个 HTML 文件。"]],
  ["Quality non-fiction books are the antithesis of AI slop", ["高质量非虚构书籍与 AI 垃圾内容", "一篇 Hacker News 讨论主张，以严肃非虚构作品为代表的深度内容仍与批量生成的低质内容形成鲜明对照。"]],
  ["Building multi-Region resiliency for AWS CloudFormation custom resource deployment", ["为 CloudFormation 自定义资源构建多区域韧性", "AWS 介绍如何为 CloudFormation 自定义资源部署设计多区域容错与恢复能力。"]],
  ["Accelerating the frontiers of scientific discovery: Google's $40M commitment to the Genesis Mission", ["Google 为 Genesis Mission 提供 4,000 万美元 AI 资源", "Google 宣布向 Genesis Mission 投入价值 4,000 万美元的 AI token 与算力额度，以支持科学发现。"]],
  ["Architecting offline-first generative AI applications for edge deployments using AWS services", ["用 AWS 构建离线优先的边缘生成式 AI", "AWS 分享面向边缘部署的离线优先生成式 AI 架构，重点在断网环境下的可用性与运维响应。"]],
  ["Automate custom PII detection at scale with Amazon Macie and Step Functions", ["用 Macie 与 Step Functions 自动化 PII 检测", "AWS 介绍将 Amazon Macie 和 Step Functions 组合，用于规模化识别和处理敏感个人信息。"]],
  ["Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber", ["Google 发布 Gemini 3.6 Flash 与 3.5 系列", "Google DeepMind 发布 Gemini 3.6 Flash、3.5 Flash-Lite 和面向网络安全的 3.5 Flash Cyber。"]],
  ["Eclipse Dataspace Components on AWS: Cost optimization strategies", ["在 AWS 上优化 Eclipse Dataspace 成本", "AWS 讨论部署 Eclipse Dataspace Components 连接器时的基础设施成本估算与优化策略。"]],
  ["Eclipse Dataspace Components on AWS: Architecture patterns in production", ["Eclipse Dataspace 的 AWS 生产架构模式", "AWS 梳理 Eclipse Dataspace Components 在生产环境中的隔离、托管服务和安全分层设计。"]],
  ["Eclipse Dataspace Components on AWS: Data sharing fundamentals", ["Eclipse Dataspace 的数据共享基础", "AWS 从 IDSA 标准与 Dataspace Protocol 出发，说明 Eclipse Dataspace Components 的数据共享基础。"]],
  ["Introducing Gemini 3.5 Flash Cyber", ["Google 发布 Gemini 3.5 Flash Cyber", "Google DeepMind 推出轻量级网络安全模型 Gemini 3.5 Flash Cyber，用于发现并修复漏洞。"]],
  ["Prioritize your AWS Health alerts using AWS User Notifications", ["用 AWS User Notifications 排定健康告警优先级", "AWS 介绍如何通过 User Notifications 对关键工作负载的健康事件进行筛选和优先排序。"]],
  ["Our approach to bioresilience", ["Google DeepMind 阐释生物韧性方法", "Google DeepMind 与 Isomorphic Labs 公开了双方围绕生物韧性及 AI 模型的联合方法。"]],
  ["Empowering India's next generation of innovators with ATL Saathi", ["Google 以 ATL Saathi 支持印度创客教育", "Google 与 AIM 推出基于 Gemini 的 ATL Saathi 工具，为印度机器人实验室的教育者提供支持。"]],
  ["How bitdrift scaled to 121 million concurrent gRPC connections on Amazon CloudFront for live telemetry sporting events", ["bitdrift 在 CloudFront 上承载 1.21 亿并发 gRPC", "AWS 复盘 bitdrift 在体育赛事实时遥测场景下，如何借助 CloudFront 处理 1.21 亿并发 gRPC 连接。"]],
  ["How Mapfre Insurance modernized fraud claims with Amazon EMR Serverless", ["Mapfre 用 EMR Serverless 改造欺诈理赔", "AWS 分享 Mapfre Insurance 使用 Amazon EMR Serverless 现代化保险欺诈理赔处理的案例。"]],
  ["Unlocking the future of video data: March Networks cloud storage on AWS", ["March Networks 在 AWS 上处理大规模视频数据", "AWS 介绍 March Networks 如何在云端存储架构中应对跨行业、分布式视频监控数据增长。"]],
  ["Specification-driven composition for flexible data workflows", ["以规范驱动的方式组合灵活数据工作流", "AWS 提出以规范驱动的组合方式减少数据管道中的重复变换逻辑和连锁修改成本。"]],
  ["S&P Global’s innovative disaster recovery strategy using Amazon FSx for NetApp ONTAP snapshots", ["标普全球用 FSx 快照设计灾难恢复", "AWS 介绍标普全球如何利用 Amazon FSx for NetApp ONTAP 快照，为 Capital IQ 设计只读故障切换。"]],
  ["Lessons learned from scaling to 1 million Lambda functions", ["扩展至百万 Lambda 函数的经验", "AWS 总结大规模无服务器 SaaS 平台在扩展到百万 Lambda 函数时的配额、弹性与运维经验。"]],
  ["Preventing data exfiltration in machine learning environments with Amazon SageMaker AI", ["用 SageMaker AI 防范机器学习环境数据外泄", "AWS 展示结合 SageMaker AI、VPC 端点与安全浏览器，为数据科学工作流建立多层数据外泄防护。"]],
  ["Dual-token authentication for Nakama game servers with Amazon Cognito on AWS", ["Nakama 游戏服务器的 Cognito 双令牌认证", "AWS 说明如何为 Nakama 游戏服务器配置 Cognito 认证，并在 Go 运行时验证 JWT。"]],
  ["Google DeepMind and A24 announce first-of-its-kind research partnership", ["Google DeepMind 与 A24 宣布研究合作", "Google DeepMind 宣布与 A24 开展研究合作。原始 feed 未提供更多摘要，保留原始链接供核验。"]],
  ["Start building with Nano Banana 2 Lite and Gemini Omni Flash", ["开始使用 Nano Banana 2 Lite 与 Gemini Omni Flash", "Google DeepMind 发布面向开发者的构建入口。原始 feed 未提供更多摘要，保留原始链接供核验。"]],
  ["Introducing computer use in Gemini 3.5 Flash", ["Gemini 3.5 Flash 引入计算机操作能力", "Google DeepMind 宣布 Gemini 3.5 Flash 增加计算机操作能力。原始 feed 未提供更多摘要，保留原始链接供核验。"]],
]);

function parseInput(messages) {
  const user = String(messages?.at(-1)?.content ?? "");
  // The instruction itself contains illustrative JSON braces. The untrusted
  // source payload is the final JSON object after the final newline.
  const marker = user.lastIndexOf("\n{");
  if (marker < 0) throw new Error("The preview request has no JSON input.");
  return JSON.parse(user.slice(marker + 1));
}

function informationItem(item) {
  const copy = editorial.get(item.originalTitle)
    ?? editorial.get(item.originalTitle.replaceAll("’", "'"))
    ?? [`原文速览：${item.originalTitle}`, "此条真实采集资讯尚未编写预览译文，保留原始标题与链接供核验。"];
  return { idempotencyKey: item.idempotencyKey, translatedTitle: copy[0], summary: copy[1], translatedContent: copy[1], decision: { disposition: "independent" } };
}

function responseFor(messages) {
  const system = String(messages?.[0]?.content ?? "");
  if (system.includes("information_batch_editorial")) {
    const input = parseInput(messages);
    return { items: input.information.map(informationItem) };
  }
  if (system.includes("information_editorial")) return informationItem(parseInput(messages));
  if (system.includes("event_classification")) return { disposition: "independent" };
  return { title: "预览事件", judgment: "仅用于本地处理预览", summary: "本地预览不生成事件。", significance: "用于验证展示链路。", entities: ["Vault2077"], category: "模型与产品" };
}

createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") return response.writeHead(404).end();
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    try {
      const requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const content = JSON.stringify(responseFor(requestBody.messages));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : "invalid preview request" } }));
    }
  });
}).listen(port, "127.0.0.1", () => console.log(`real-source preview model listening on ${port}`));
