import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpcFeeNotePopover } from "@/components/opc-fee-note-popover";
import { OpcOrderEntry } from "@/components/opc-order-entry";
import { opcOrderingAvailable } from "@/lib/opc-payment-config";
import { getCachedPublishedServiceCatalog } from "@/lib/public-read-cache";

export const metadata: Metadata = { title: "确认订单 — OPC 服务台" };
export const dynamic = "force-dynamic";

type OpcOrderPageSearchParams = {
  kind?: string;
  service?: string;
};

const publicServiceSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function OpcOrderPage({
  searchParams,
}: {
  searchParams: Promise<OpcOrderPageSearchParams>;
}) {
  const query = await searchParams;
  if (
    (query.kind !== "infrastructure" && query.kind !== "specialty")
    || !query.service
    || !publicServiceSlug.test(query.service)
  ) notFound();

  const catalog = await getCachedPublishedServiceCatalog();
  const services = query.kind === "infrastructure" ? catalog.infrastructure : catalog.specialties;
  const service = services.find((item) => item.slug === query.service);
  if (!service || service.kind !== query.kind) notFound();

  const view = service.kind === "infrastructure" ? "infrastructure" : "specialties";
  const returnHref = `/opc?view=${view}&service=${encodeURIComponent(service.slug)}`;
  const orderingAvailable = opcOrderingAvailable();

  return (
    <div className="shell opc-order-page">
      <header className="opc-order-page__header">
        <div className="opc-order-page__utility">
          <p className="mono">OPC / ORDER REGISTER</p>
          <Link href={returnHref}>← 返回服务详情</Link>
        </div>
        <div className="opc-order-page__introduction">
          <h1>确认服务，<br />生成付款订单。</h1>
          <p>核对服务名称、公开价格与预计周期，填写订单联系人。付款完成后，Vault2077 将按所选服务范围启动交付。</p>
        </div>
      </header>

      <div className="opc-order-page__workspace">
        <aside className="opc-order-page__summary" aria-labelledby="opc-order-service-name">
          <p className="mono">SELECTED SERVICE / 已选服务</p>
          <h2 id="opc-order-service-name">{service.name}</h2>
          <p className="opc-order-page__outcome">{service.outcome}</p>
          <dl>
            <div>
              <dt>服务编号</dt>
              <dd>{service.code}</dd>
            </div>
            <div>
              <dt>标准价格</dt>
              <dd className="opc-order-page__price">
                <span>{service.price}</span>
                {service.feeNote ? (
                  <OpcFeeNotePopover
                    id={`opc-order-fee-note-${service.slug}`}
                    note={service.feeNote}
                  />
                ) : null}
              </dd>
            </div>
            <div>
              <dt>预计周期</dt>
              <dd>{service.period}</dd>
            </div>
          </dl>
          <p className="opc-order-page__delivery-note">Vault2077 直接交付 · 独立付款页面</p>
        </aside>

        {orderingAvailable ? (
          <OpcOrderEntry service={service} returnHref={returnHref} />
        ) : (
          <section className="opc-order-entry opc-order-entry--unavailable" aria-labelledby="opc-order-unavailable-title">
            <p className="mono">PAYMENT / 付款服务</p>
            <h3 id="opc-order-unavailable-title">在线付款尚未开放。</h3>
            <p>服务目录可以正常浏览，订单与付款入口将在商户接入和真实交易验收完成后开放。当前页面不会收集或保存联系人信息。</p>
            <Link href={returnHref}>返回服务详情</Link>
          </section>
        )}
      </div>
    </div>
  );
}
