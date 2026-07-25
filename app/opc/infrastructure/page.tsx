import type { Metadata } from "next";
import Link from "next/link";
import { OpcServiceRecords } from "@/components/opc-service-records";
import { PageIntro } from "@/components/page-intro";
import { readPublishedServiceCatalog } from "@/lib/managed-service-catalog";

export const metadata: Metadata = { title: "基础设施" };
export const dynamic = "force-dynamic";

export default async function InfrastructurePage() {
  const { infrastructure } = await readPublishedServiceCatalog();
  return (
    <>
      <PageIntro code="OPC / INFRASTRUCTURE" title="搭起一整套能力" lead="基础设施不是专项服务的折扣组合。它把多个相互依赖的专业模块编排为一个可运行的经营状态。" meta="WORKING PROTOTYPE / 公开菜单前仍需专业确认" />
      <section className="shell opc-catalog-page">
        <div className="opc-catalog-note mono"><span>OPC / INFRASTRUCTURE REGISTER</span><span>{infrastructure.length} 个当前公开项目</span></div>
        <OpcServiceRecords items={infrastructure} />
        <div className="opc-boundary-note"><p className="eyebrow mono">WHEN THIS IS NOT ENOUGH</p><p>当问题依赖复杂谈判、重大争议或无法在开始前界定的个案判断时，应直接联系外部独立专家。</p><Link className="text-link" href="/opc/rangers">查看游骑兵协会 ↗</Link></div>
      </section>
    </>
  );
}
