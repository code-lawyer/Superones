import Link from "next/link";
import type { OpcService } from "@/lib/opc-catalog";

export function OpcServiceDetail({ service }: { service: OpcService }) {
  const indexHref = service.kind === "infrastructure" ? "/opc/infrastructure" : "/opc/specialties";
  const indexLabel = service.kind === "infrastructure" ? "基础设施" : "专项服务";
  const capabilityLabel = service.kind === "infrastructure" ? "建立的能力" : "主要结果";

  return (
    <article className="detail-page shell service-detail opc-service-detail">
      <header className="detail-header">
        <div className="detail-kicker mono"><Link href="/opc">OPC / SERVICE DESK</Link><Link href={indexHref}>{indexLabel}</Link><span>{service.code}</span><span>{service.status}</span></div>
        <h1>{service.name}</h1>
        <p className="detail-lead">{service.outcome}</p>
        <div className="service-offer">
          <div><span className="mono">价格</span><strong>{service.price}</strong></div>
          <div><span className="mono">周期</span><strong>{service.period}</strong></div>
          <div><span className="mono">版本</span><strong>{service.revision}</strong></div>
        </div>
      </header>
      <div className="detail-layout">
        <div className="detail-body service-sections">
          <section><h2>适合谁</h2><p>{service.audience}</p></section>
          <section><h2>{capabilityLabel}</h2><ol>{service.deliverables.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <section><h2>包含内容</h2><ol>{service.includes.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <section><h2>需要准备</h2><ol>{service.materials.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <section><h2>超出范围时</h2><p>{service.boundary}</p><Link className="text-link opc-detail-ranger-link" href="/opc/rangers">查看游骑兵协会 ↗</Link></section>
        </div>
        <aside className="detail-aside service-contact-card" id="opc-contact">
          <p className="eyebrow mono">STANDARD SERVICE / PREVIEW</p>
          <h2>先确认边界，<br />再开始服务。</h2>
          <p>这是内容与页面工作原型。正式价格、周期、材料、专业复核与统一联系方式完成确认后才会公开。</p>
          <Link className="text-action" href={indexHref}>返回{indexLabel}</Link>
        </aside>
      </div>
      <a className="opc-mobile-contact mono" href="#opc-contact">查看服务状态</a>
    </article>
  );
}
