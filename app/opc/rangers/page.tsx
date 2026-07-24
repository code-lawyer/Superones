import type { Metadata } from "next";
import { OpcRangerDirectory } from "@/components/opc-ranger-directory";
import { PageIntro } from "@/components/page-intro";
import { rangerIdentities, rangerProfiles } from "@/lib/opc-catalog";

export const metadata: Metadata = { title: "游骑兵协会" };

export default function RangersPage() {
  return (
    <>
      <PageIntro code="OPC / RANGER ASSOCIATION" title="直接联系独立专家" lead="这里展示经本人确认的公开职业档案和联系方式。Vault2077 不参与后续咨询、定价、付款、交付或争议处理。" meta="WORKING PROTOTYPE / 仅展示档案结构，不公开真实顾问信息" />
      <section className="shell opc-rangers-page">
        <div className="opc-ranger-disclaimer"><p className="mono">EXTERNAL / INDEPENDENT</p><p>游骑兵按顾问本人的主要职业身份分类，而不按标准服务的专业领域分类。用户展开档案后直接联系顾问本人。</p></div>
        <nav className="opc-ranger-index" aria-label="游骑兵顾问身份索引">{rangerIdentities.map((identity) => <a href={`#${encodeURIComponent(identity)}`} key={identity}>{identity}</a>)}</nav>
        {rangerIdentities.map((identity) => {
          const profiles = rangerProfiles.filter((profile) => profile.identity === identity);
          return <section className="opc-ranger-group" id={identity} key={identity}><header><p className="mono">RANGER IDENTITY</p><h2>{identity}</h2><span className="mono">{profiles.length ? `${String(profiles.length).padStart(2, "0")} PROFILE` : "WAITING FOR CONFIRMATION"}</span></header>{profiles.length ? <OpcRangerDirectory profiles={profiles} /> : <p className="opc-ranger-empty">该身份的首批公开档案仍在完成授权与联系方式确认。</p>}</section>;
        })}
      </section>
    </>
  );
}
