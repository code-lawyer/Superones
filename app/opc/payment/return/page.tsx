import type { Metadata } from "next";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { OpcPaymentReceipt } from "@/components/opc-payment-receipt";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = { title: "付款完成凭证 — OPC 服务台" };

export default async function OpcPaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; out_trade_no?: string }>;
}) {
  const query = await searchParams;
  const candidate = query.out_trade_no ?? query.order ?? "";
  const reference = /^OPC-\d{8}-[0-9A-F]{12}$/.test(candidate) ? candidate : null;

  return <>
    <PageIntro
      code="OPC / PAYMENT RECEIPT"
      title="付款结果与凭证"
      lead="系统按订单约定的付款渠道核对收款主体、交易流水及固定金额，确认到账后生成付款完成凭证。"
      meta="PAYMENT / SERVER-SIDE VERIFICATION"
    />
    <ChannelRibbon identity="SUPERONES" slogan="ALL IS ONE. ONE IS ALL." />
    <main className="shell opc-payment-return">
      <OpcPaymentReceipt reference={reference} />
    </main>
  </>;
}
