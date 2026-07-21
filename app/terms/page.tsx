import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "使用与赛事条款" };

export default function TermsPage() {
  return <ProsePage code="TERMS / DRAFT" title="公开、可验证、规则一致。" lead="本页为第一阶段占位文本。正式服务条款与赛事规则需在上线前完成专业复核。" sections={[
    { title: "内容使用", paragraphs: ["Vault 信息流和 SiC 页面提供基于公开来源生成的摘要，不构成法律、税务、投资或其他专业意见。请根据原始来源独立判断。"] },
    { title: "参赛资格", paragraphs: ["仓库必须公开，具有明确开源许可证、可运行代码或可验证成果。纯 Fork、搬运、恶意软件、空壳与刷 Star 项目不得参赛。"] },
    { title: "排名与获奖", paragraphs: ["排名按验证通过后的净新增 Star 计算。前三名依次挑选奖品。已经获得过前三名的仓库不得参加后续赛季。"] },
    { title: "异常处理", paragraphs: ["Vault2077 可以对明显异常增长、权属问题、许可证缺失或违规内容进行资格复核。复核不引入主观项目评分。"] },
  ]} />;
}
