import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "关于" };

export default function AboutPage() {
  return <ProsePage code="ABOUT / VAULT2077" title="超级个体不应该独自承担一整家公司的复杂度。" lead="Vault2077 把情报、经营服务、技术趋势和开放竞赛放进同一套可以持续运行的基础设施。" sections={[
    { title: "我们服务谁", paragraphs: ["我们首先服务已经产生收入或即将注册经营主体的技术型超级个体。他们可能经营 AI 产品、开发者工具、内容/IP 或专业服务，团队通常只有一到三人。"] },
    { title: "为什么现在", paragraphs: ["机器能力正在快速降低生产和交付的边际成本，但法务、税务、知产、信息筛选与持续学习仍然消耗大量上下文。真正缺少的不是更多工具，而是一套可靠的运行结构。"] },
    { title: "我们如何工作", paragraphs: ["Vault 信息流负责压缩变化，OPC 服务台直接交付标准化基础服务，SiC 学院观察硅碳共生的能力边界，边境计划让公开建设持续获得社区反馈。"] },
  ]} />;
}
