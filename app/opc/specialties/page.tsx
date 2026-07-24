import type { Metadata } from "next";
import Link from "next/link";
import { OpcServiceRecords } from "@/components/opc-service-records";
import { PageIntro } from "@/components/page-intro";
import { specialtyDomains, specialtyServices } from "@/lib/opc-catalog";

export const metadata: Metadata = { title: "专项服务" };

export default function SpecialtiesPage() {
  return (
    <>
      <PageIntro code="OPC / SPECIALTIES" title="解决一个明确问题" lead="专项服务以一个边界清楚的问题和一个主要结果完成交付；不按文件类型或办理动作无限拆分。" meta="WORKING PROTOTYPE / 公开菜单前仍需专业确认" />
      <nav className="shell opc-domain-index mono" aria-label="专项服务领域索引">
        {specialtyDomains.map((domain) => <a href={`#${encodeURIComponent(domain)}`} key={domain}>{domain}</a>)}
      </nav>
      <section className="shell opc-catalog-page opc-specialties-page">
        {specialtyDomains.map((domain, index) => {
          const services = specialtyServices.filter((service) => service.domain === domain);
          return <section className="opc-specialty-domain" id={domain} key={domain}>
            <header><p className="mono">{String(index + 1).padStart(2, "0")} / SPECIALTY DOMAIN</p><h2>{domain}</h2><span className="mono">{String(services.length).padStart(2, "0")} RECORDS</span></header>
            <OpcServiceRecords items={services} />
          </section>;
        })}
        <div className="opc-boundary-note"><p className="eyebrow mono">WHEN TO CHANGE PATH</p><p>需要持续编排多个模块时，应进入基础设施；需要个案策略、复杂谈判或正式意见时，应直接联系游骑兵。</p><div><Link className="text-link" href="/opc/infrastructure">查看基础设施 ↗</Link><Link className="text-link" href="/opc/rangers">查看游骑兵协会 ↗</Link></div></div>
      </section>
    </>
  );
}
