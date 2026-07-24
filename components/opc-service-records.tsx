import Link from "next/link";
import type { OpcService } from "@/lib/opc-catalog";

type OpcServiceRecordsProps = {
  items: OpcService[];
  variant?: "light" | "dark";
  compact?: boolean;
};

export function OpcServiceRecords({ items, variant = "light", compact = false }: OpcServiceRecordsProps) {
  return (
    <div className={`opc-records opc-records--${variant}${compact ? " opc-records--compact" : ""}`}>
      <div className="opc-records__head mono" aria-hidden="true">
        <span>编号 / 类型</span>
        <span>服务与结果</span>
        <span>价格</span>
        <span>周期 / 修订</span>
      </div>
      {items.map((service) => {
        const href = service.kind === "infrastructure"
          ? `/opc/infrastructure/${service.slug}`
          : `/opc/specialties/${service.slug}`;

        return (
          <article className="opc-record" key={service.code}>
            <p className="opc-record__id mono"><span>{service.code}</span><span>{service.domain}</span></p>
            <div className="opc-record__main">
              <h3><Link href={href}><span>{service.name}</span></Link></h3>
              <p>{service.outcome}</p>
            </div>
            <strong className="opc-record__price">{service.price}</strong>
            <p className="opc-record__meta mono"><span>{service.period}</span><span>{service.revision}</span></p>
          </article>
        );
      })}
    </div>
  );
}
