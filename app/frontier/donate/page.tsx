import type { Metadata } from "next";
import Link from "next/link";
import { currentSeason } from "@/lib/frontier-store";
import { DonationForm } from "./donation-form";

export const metadata: Metadata = { title: "捐献奖品 — 边境计划" };

export default function DonatePage() {
  const season = currentSeason();
  return (
    <section className="submission-page donation-page shell">
      <div className="submission-intro">
        <div className="detail-kicker mono"><Link href="/frontier">FRONTIER / {season.code}</Link><span>ANONYMOUS PRIZE POOL</span></div>
        <h1>把一件东西，交给正在穿越边境的人。</h1>
        <p>本次捐献预计进入 {season.name} 随机奖池。确认后只公开奖品本身，不公开捐献者身份。</p>
      </div>
      <DonationForm seasonName={season.name} />
    </section>
  );
}
