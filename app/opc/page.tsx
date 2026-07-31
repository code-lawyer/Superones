import type { Metadata } from "next";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { OpcWorkspace } from "@/components/opc-workspace";
import { PageIntro } from "@/components/page-intro";
import { opcOrderingAvailable } from "@/lib/opc-payment-config";
import { getCachedPublishedServiceCatalog } from "@/lib/public-read-cache";
import { publicRangerMediaOrigin } from "@/lib/ranger-avatar-storage";

export const metadata: Metadata = { title: "OPC 服务台" };
export const dynamic = "force-dynamic";

type OpcPageSearchParams = {
  view?: string;
  service?: string;
};

export default async function OpcPage({ searchParams }: { searchParams: Promise<OpcPageSearchParams> }) {
  const query = await searchParams;
  const initialView = query.view === "specialties" || query.view === "rangers"
    ? query.view
    : "infrastructure";
  const catalog = await getCachedPublishedServiceCatalog();
  const orderingAvailable = opcOrderingAvailable();
  return <>
    <PageIntro code="OPC / SERVICE DESK" title="超级个体，全栈运行" lead="查看固定范围、公开价格、材料清单和交付周期。标准服务由 Vault2077 直接交付；非标准事项由用户直接联系独立专家。" meta="STANDARD SERVICES / 订单登记与服务器到账核验" />
    <ChannelRibbon identity="SUPERONES" slogan="ALL IS ONE. ONE IS ALL." />
    <div className="shell opc-service-browser-shell">
      <OpcWorkspace
        key={`${initialView}:${query.service ?? ""}`}
        infrastructure={catalog.infrastructure}
        specialties={catalog.specialties}
        rangers={catalog.rangers}
        rangerMediaOrigin={publicRangerMediaOrigin()}
        orderingAvailable={orderingAvailable}
        initialView={initialView}
        initialServiceSlug={query.service}
      />
    </div>
  </>;
}
