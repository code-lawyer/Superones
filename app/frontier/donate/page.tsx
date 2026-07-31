import type { Metadata } from "next";
import Link from "next/link";
import { currentSeason, getFrontierSeasonLaunchState } from "@/lib/frontier-store";
import { DonationForm } from "./donation-form";

export const metadata: Metadata = { title: "捐献奖品 — 边境计划" };

export default async function DonatePage() {
  const season = currentSeason();
  const { writesEnabled } = await getFrontierSeasonLaunchState(season.code);
  return (
    <section className="submission-page donation-page shell">
      <div className="submission-intro">
        <div className="detail-kicker mono"><Link href="/frontier">FRONTIER / {season.code}</Link><span>ANONYMOUS PRIZE POOL</span></div>
        <h1>{writesEnabled ? "把一件东西，交给正在穿越边境的人。" : "匿名奖池正在准备中。"}</h1>
        <p>{writesEnabled
          ? `本次捐献预计进入 ${season.name} 随机奖池。确认后只公开奖品本身，不公开捐献者身份。`
          : "赛季配置确认后才会开放奖品捐献；当前页面不会接收或保存捐献信息。"}</p>
      </div>
      {writesEnabled ? <DonationForm seasonName={season.name} /> : <p><Link className="text-link" href="/frontier">返回边境计划</Link></p>}
    </section>
  );
}
