import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpcFeeNotePopover } from "@/components/opc-fee-note-popover";
import { OpcOrderEntry } from "@/components/opc-order-entry";
import { buildOpcOfflineCheckoutAgreement } from "@/lib/opc-offline-checkout-agreement";
import { readPublishedOpcOfflinePaymentProfile } from "@/lib/opc-offline-payment-profile";
import { opcOrderEntryAvailable } from "@/lib/opc-order-availability";
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
  if (!opcOrderEntryAvailable()) notFound();
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
  const paymentProfile = await readPublishedOpcOfflinePaymentProfile();
  if (!paymentProfile) notFound();
  const checkoutAgreement = buildOpcOfflineCheckoutAgreement(service, paymentProfile);
  const agreementSha256 = createHash("sha256").update(checkoutAgreement.text).digest("hex");
  return (
    <div className="shell opc-order-page">
      <header className="opc-order-page__header">
        <div className="opc-order-page__utility">
          <p className="mono">OPC / ORDER REGISTER</p>
          <Link href={returnHref}>← 返回服务详情</Link>
        </div>
        <div className="opc-order-page__introduction">
          <h1>确认服务，<br />再决定何时付款。</h1>
          <p>企业账户、服务协议和联系人二维码在同一页展示。你可以先扫码沟通确认，再按固定金额自行对公转账。</p>
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
          <p className="opc-order-page__delivery-note">线下对公转账 · 到账后人工核验</p>
        </aside>

        <OpcOrderEntry
          service={service}
          returnHref={returnHref}
          checkoutAgreement={checkoutAgreement}
          agreementSha256={agreementSha256}
          paymentProfile={paymentProfile}
        />
      </div>
    </div>
  );
}
