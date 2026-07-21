import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "纠错" };

export default function CorrectionsPage() {
  return <ProsePage code="CORRECTIONS / PUBLIC RECORD" title="错误需要被看见，也需要被修正。" lead="如果 AI 摘要、翻译、来源归并或项目说明存在问题，请提供对应记录号和原始依据。" sections={[
    { title: "提交内容", paragraphs: ["请提供记录号或页面地址、具体错误、可以支持更正的原始来源，以及一个可选的联系邮箱。正式纠错表单和接收邮箱将在上线前接入。"] },
    { title: "处理方式", paragraphs: ["我们会根据问题类型重新抓取、重算摘要、拆分事件、补充来源或下架内容。重要更正会在记录中保留更新时间。"] },
  ]} />;
}
