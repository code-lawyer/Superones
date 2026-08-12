import type { Metadata } from "next";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { OpcRefundRequest } from "@/components/opc-refund-request";
import { PageIntro } from "@/components/page-intro";
import {
  isValidOpcOrderReference,
  normalizeOpcOrderReference,
} from "@/lib/opc-order-reference";

export const metadata: Metadata = { title: "退款申请 — OPC 服务台" };

export default async function OpcRefundPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const query = await searchParams;
  const candidate = normalizeOpcOrderReference(query.order ?? "");
  const reference = isValidOpcOrderReference(candidate) ? candidate : "";
  return <>
    <PageIntro
      code="OPC / REFUND REQUEST"
      title="退款申请"
      lead="使用原订单凭证安全核对订单，提交需要人工联系处理的退款需求。"
      meta="ACCOUNTLESS / SECURE RESUME"
    />
    <ChannelRibbon identity="SUPERONES" slogan="ALL IS ONE. ONE IS ALL." />
    <main className="shell opc-refund-page">
      <OpcRefundRequest initialReference={reference} />
    </main>
  </>;
}
