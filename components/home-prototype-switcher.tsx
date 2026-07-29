"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

const variants = [
  { id: "axis", label: "A · 四轴总登记" },
  { id: "sequence", label: "B · 今日操作卷" },
  { id: "instrument", label: "C · 坐标仪" },
  { id: "refined", label: "D · 原版优化" },
] as const;

export type HomePrototypeVariant = (typeof variants)[number]["id"];

export function HomePrototypeSwitcher({ current }: { current: HomePrototypeVariant }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentIndex = Math.max(0, variants.findIndex((variant) => variant.id === current));

  const selectOffset = useCallback((offset: number) => {
    const next = variants[(currentIndex + offset + variants.length) % variants.length];
    const parameters = new URLSearchParams(searchParams.toString());
    parameters.set("variant", next.id);
    if (next.id !== "instrument") parameters.delete("channel");
    router.replace(`/?${parameters.toString()}`, { scroll: false });
  }, [currentIndex, router, searchParams]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectOffset(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectOffset(1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectOffset]);

  if (process.env.NODE_ENV === "production" || searchParams.get("controls") !== "1") return null;

  return (
    <aside className="home-prototype-switcher" aria-label="首页原型方案切换器">
      <button type="button" onClick={() => selectOffset(-1)} aria-label="查看上一个首页方案">←</button>
      <span>{variants[currentIndex].label}</span>
      <button type="button" onClick={() => selectOffset(1)} aria-label="查看下一个首页方案">→</button>
      <Link href="/?variant=original">原始首页</Link>
    </aside>
  );
}
