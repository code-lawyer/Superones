import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AdminConsole } from "./admin-console";
import { assertAdminPageHost } from "@/lib/admin-request-security";

export const metadata: Metadata = { title: "运营后台", robots: { index: false, follow: false } };

export default async function AdminPage() {
  try {
    assertAdminPageHost(await headers());
  } catch {
    notFound();
  }
  return (
    <section className="admin-page shell">
      <header className="admin-page__header">
        <p className="eyebrow mono">VAULT2077 / INTERNAL</p>
        <h1>运营控制台。</h1>
        <p>自动资讯与榜单保持只读；这里处理用户报告、边境计划业务和需要人工维护的 OPC 服务目录。普通用户无法访问此页。</p>
      </header>
      <AdminConsole />
    </section>
  );
}
