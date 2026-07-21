import Link from "next/link";
import type { Service } from "@/lib/types";

export function ServiceList({ items }: { items: Service[] }) {
  return (
    <div className="record-list service-list">
      <div className="record-head service-head mono" aria-hidden="true">
        <span>编号 / 分类</span>
        <span>服务</span>
        <span>价格</span>
        <span>周期</span>
      </div>
      {items.map((service) => (
        <article className="record-row service-row" key={service.slug}>
          <div className="record-id mono"><span>{service.code}</span><span>{service.category}</span></div>
          <div className="record-main">
            <h3><Link href={`/opc/${service.slug}`}>{service.name}</Link></h3>
            <p>{service.audience}</p>
          </div>
          <strong className="service-price">{service.price}</strong>
          <div className="record-meta mono"><span>{service.period}</span><span>{service.revision}</span></div>
        </article>
      ))}
    </div>
  );
}
