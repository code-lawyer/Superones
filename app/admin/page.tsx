import type { Metadata } from "next";
import { AdminConsole } from "./admin-console";

export const metadata: Metadata = { title: "运营后台", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <section className="admin-page shell">
      <header className="admin-page__header">
        <p className="eyebrow mono">VAULT2077 / INTERNAL</p>
        <h1>最小运营台。</h1>
        <p>处理边境计划报名、联系信息、Star 快照和匿名奖品确认。普通用户无法访问此页。</p>
      </header>
      <AdminConsole />
    </section>
  );
}
