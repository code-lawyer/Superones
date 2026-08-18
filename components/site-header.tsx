"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { href: "/feed", code: "INTEL", label: "信息流" },
  { href: "/opc", code: "OPERATE", label: "OPC 服务台" },
  { href: "/sic", code: "EVOLVE", label: "SiC 学院" },
  { href: "/frontier", code: "BUILD", label: "边境计划" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const open = openPath === pathname;

  useEffect(() => {
    if (!open) return;

    const mobileViewport = window.matchMedia("(max-width: 820px)");
    if (!mobileViewport.matches) {
      const closeFrame = requestAnimationFrame(() => setOpenPath(null));
      return () => cancelAnimationFrame(closeFrame);
    }

    const toggle = menuToggleRef.current;
    const navigation = navigationRef.current;
    if (!toggle || !navigation) return;

    const background = [...document.querySelectorAll<HTMLElement>(
      ".skip-link, .site-header .wordmark, main, .site-footer",
    )];
    const previousInert = background.map((element) => [element, element.inert] as const);
    const previousBodyOverflow = document.body.style.overflow;
    background.forEach((element) => {
      element.inert = true;
    });
    document.body.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => {
      navigation.querySelector<HTMLElement>("a[href]")?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenPath(null);
        toggle.focus();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [
        toggle,
        ...navigation.querySelectorAll<HTMLElement>("a[href]"),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setOpenPath(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    mobileViewport.addEventListener("change", handleViewportChange);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      mobileViewport.removeEventListener("change", handleViewportChange);
      previousInert.forEach(([element, inert]) => {
        element.inert = inert;
      });
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  return (
    <header className="site-header">
      <div className="site-header__inner shell">
        <Link className="wordmark" href="/" aria-label="Vault2077 首页">
          <span>VAULT</span><span>2077</span>
        </Link>
        <button
          ref={menuToggleRef}
          className="menu-toggle text-link"
          type="button"
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpenPath(open ? null : pathname)}
        >
          {open ? "关闭" : "菜单"}
        </button>
        <nav
          ref={navigationRef}
          id="primary-navigation"
          className={open ? "primary-nav is-open" : "primary-nav"}
          aria-label="主导航"
        >
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
