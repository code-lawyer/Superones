import type { Metadata } from "next";
import Link from "next/link";
import { beijingSeasonDate } from "@/lib/frontier-domain";
import { currentSeason, getFrontierSeasonLaunchState } from "@/lib/frontier-store";
import { SubmitForm } from "./submit-form";

export const metadata: Metadata = { title: "提交仓库 — 边境计划" };

export default async function SubmitPage() {
  const season = currentSeason();
  const { writesEnabled } = await getFrontierSeasonLaunchState(season.code);
  return (
    <section className="submission-page shell">
      <div className="submission-intro">
        <div className="detail-kicker mono"><Link href="/frontier">FRONTIER / {season.code}</Link><span>STEP 01 / SUBMIT</span></div>
        <h1>{writesEnabled ? "提交一个正在公开建设的项目。" : "本赛季报名正在准备中。"}</h1>
        <p>{writesEnabled
          ? `无需登录。系统会检查公开仓库与许可证；验证通过时记录 Star 基线，${beijingSeasonDate(season.endsAt)} 按净新增 Star 结算。`
          : "官方奖励与生产赛季配置确认后才会开放报名；当前页面不会接收或保存报名信息。"}</p>
      </div>
      {writesEnabled ? <SubmitForm /> : <p><Link className="text-link" href="/frontier">返回边境计划</Link></p>}
    </section>
  );
}
