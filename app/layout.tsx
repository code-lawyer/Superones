import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./institutional.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { default: "Vault2077 — 一人公司，全栈运行", template: "%s — Vault2077" },
  description: "为超级个体提供持续情报、标准化经营服务、技术趋势与开放实验场。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">跳到正文</a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
