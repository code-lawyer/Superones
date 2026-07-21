import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { services } from "@/lib/data";

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = services.find((item) => item.slug === slug);
  return { title: service?.name ?? "OPC 服务" };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = services.find((item) => item.slug === slug);
  if (!service) notFound();

  return (
    <article className="detail-page shell service-detail">
      <header className="detail-header">
        <div className="detail-kicker mono"><Link href="/opc">OPC / SERVICE DESK</Link><span>{service.code}</span><span>示例内容</span></div>
        <h1>{service.name}</h1>
        <div className="service-offer">
          <div><span className="mono">固定价格</span><strong>{service.price}</strong></div>
          <div><span className="mono">标准周期</span><strong>{service.period}</strong></div>
          <div><span className="mono">服务版本</span><strong>{service.revision}</strong></div>
        </div>
      </header>
      <div className="detail-layout">
        <div className="detail-body service-sections">
          <section><h2>适用对象</h2><p>{service.audience}</p></section>
          <section><h2>包含事项</h2><ol>{service.includes.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <section><h2>不包含事项</h2><ol>{service.excludes.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <section><h2>所需材料</h2><ol>{service.materials.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <section><h2>交付成果</h2><ol>{service.deliverables.map((item) => <li key={item}>{item}</li>)}</ol></section>
        </div>
        <aside className="detail-aside service-contact-card">
          <p className="eyebrow mono">START SERVICE</p>
          <h2>确认符合标准范围后开始。</h2>
          <p>首发阶段通过统一工作人员二维码在线下完成确认、付款与交付。</p>
          <Link className="text-action" href="/opc#contact">查看联系方式</Link>
        </aside>
      </div>
    </article>
  );
}
