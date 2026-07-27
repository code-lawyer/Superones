"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/feed", code: "INTEL", label: "信息流" },
  { href: "/opc", code: "OPERATE", label: "OPC 服务台" },
  { href: "/sic", code: "EVOLVE", label: "SiC 学院" },
  { href: "/frontier", code: "BUILD", label: "边境计划" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;

  return (
    <header className="site-header">
      <div className="site-header__inner shell">
        <Link className="wordmark" href="/" aria-label="Vault2077 首页">
          <span>VAULT</span><span>2077</span>
        </Link>
        <button
          className="menu-toggle text-link"
          type="button"
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpenPath(open ? null : pathname)}
        >
          {open ? "关闭" : "菜单"}
        </button>
        <nav id="primary-navigation" className={open ? "primary-nav is-open" : "primary-nav"} aria-label="主导航">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                className={active ? "nav-link is-active" : "nav-link"}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpenPath(null)}
              >
                <span className="nav-code mono">{item.code}</span><span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
