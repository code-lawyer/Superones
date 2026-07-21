import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "方法说明" };

export default function MethodologyPage() {
  return <ProsePage code="METHOD / PUBLIC RECORD" title="每个结论，都应该能回到它的来源。" lead="这里解释 Vault 信息流、SiC 趋势和边境计划排名如何产生。" sections={[
    { title: "信息流", paragraphs: ["系统只从经过批准的白名单来源自动采集。原始内容在境内完成翻译、摘要、实体提取和事件聚合。高置信度结果自动发布，原文链接和生成时间始终保留。"] },
    { title: "趋势榜", paragraphs: ["SiC 优先使用 24 小时和 7 天 Star 增量判断变化速度，累计 Star 作为辅助信息。榜单用于发现变化，不代表质量担保或投资建议。"] },
    { title: "边境排名", paragraphs: ["参赛仓库验证通过时记录基线，季度最后一天记录最终值，按净新增 Star 排名。获奖前只复核资格和异常，不加入主观评分。"] },
    { title: "模型责任", paragraphs: ["所有模型生成内容均明确标识。模型输出必须通过结构校验，但仍可能出现误译、漏合并或判断错误。用户可以通过纠错入口提交问题。"] },
  ]} />;
}
