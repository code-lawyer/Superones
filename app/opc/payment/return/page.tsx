import type { Metadata } from "next";
import Link from "next/link";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = { title: "支付结果核验 — OPC 服务台" };

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
      code="OPC / PAYMENT RETURN"
      title="支付结果正在核验"
      lead="付款返回页面不直接代表到账成功。系统将以付款服务的服务器通知和交易查询结果更新后台订单。"
      meta="PAYMENT / SERVER-SIDE VERIFICATION"
    />
    <ChannelRibbon identity="SUPERONES" slogan="ALL IS ONE. ONE IS ALL." />
    <main className="shell opc-payment-return">
      <p className="mono">ORDER / 订单</p>
      <h2>{reference ?? "订单号待确认"}</h2>
      <p>通常几分钟内即可完成自动核验。请不要为同一订单重复付款；如已经扣款而订单迟迟未更新，OPC 服务团队会使用订单号查询付款状态。</p>
      <Link href="/opc">
        返回 OPC 服务台 <span aria-hidden="true">→</span>
      </Link>
    </main>
  </>;
}
