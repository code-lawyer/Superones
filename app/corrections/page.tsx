import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "纠错" };

export default function CorrectionsPage() {
  return <ProsePage code="CORRECTIONS / PUBLIC RECORD" title="错误需要被看见，也需要被修正。" lead="如果事件归类、信息内容或原始来源存在问题，请提供对应记录号和原始依据。" sections={[
    { title: "报告范围", paragraphs: ["前台报告分为误合并、信息错误和来源失效。请提供记录号或页面地址、具体问题、支持更正的原始来源，以及一个可选的联系邮箱。正式提交入口将在人工纠错后台设计完成后接入。"] },
    { title: "处理边界", paragraphs: ["日常资讯归类和事件编排由 AI 自动完成；用户报告的问题由工作人员人工判断和处理，LLM 不自动修改已经发布的事件归属。"] },
  ]} />;
}
