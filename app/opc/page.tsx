import type { Metadata } from "next";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { OpcWorkspace } from "@/components/opc-workspace";
import { PageIntro } from "@/components/page-intro";
import { infrastructureServices, rangerProfiles, specialtyServices } from "@/lib/opc-catalog";

export const metadata: Metadata = { title: "OPC 服务台" };

export default function OpcPage() {
  return <>
    <PageIntro code="OPC / SERVICE DESK" title="一人公司，全栈运行" lead="明确范围、价格、材料清单和交付周期。标准服务由 Vault2077 直接交付；非标准问题由用户直接联系独立专家。" meta="WORKING PROTOTYPE / 正式上线前由专业负责人确认" />
    <ChannelRibbon identity="SUPERONES" slogan="ALL IS ONE. ONE IS ALL." />
    <OpcWorkspace infrastructure={infrastructureServices} specialties={specialtyServices} rangers={rangerProfiles} />
  </>;
}
