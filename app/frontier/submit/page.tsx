import type { Metadata } from "next";
import Link from "next/link";
import { SubmitForm } from "./submit-form";

export const metadata: Metadata = { title: "提交仓库 — 边境计划" };

export default function SubmitPage() {
  return (
    <section className="submission-page shell">
      <div className="submission-intro">
        <div className="detail-kicker mono"><Link href="/frontier">FRONTIER / 2026 SUMMER</Link><span>STEP 01 / SUBMIT</span></div>
        <h1>提交一个正在公开建设的项目。</h1>
        <p>无需登录。系统会检查公开仓库与许可证；验证通过时记录 Star 基线，2026 年 9 月 30 日按净新增 Star 结算。</p>
      </div>
      <SubmitForm />
    </section>
  );
}
