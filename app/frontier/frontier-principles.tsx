"use client";

import { useState } from "react";

const principles = [
  {
    title: "无期限",
    label: "NO DEADLINE",
    detail: "计划全年生效，任何时候都可以出发；排名按自然季度结算，但创造不因赛季结束。",
  },
  {
    title: "无评审",
    label: "NO JUDGES",
    detail: "没有评委、答辩和主观打分。系统只记录验证之后真实发生的净新增 Star。",
  },
  {
    title: "无组织",
    label: "NO ORGANIZER",
    detail: "没有人替你排日程或分配任务。规则自动运行，参与者决定自己如何建设。",
  },
  {
    title: "无目标",
    label: "NO ASSIGNED GOAL",
    detail: "没有规定赛道与标准答案。提交一件你真正想做、并愿意持续公开建设的东西。",
  },
];

export function FrontierPrinciples() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <section className="frontier-principles" aria-labelledby="frontier-principles-title">
      <header className="frontier-doctrine__header frontier-principles__header">
        <p className="eyebrow mono">THE FOUR NOES / 原则</p>
        <h2 id="frontier-principles-title">四无原则</h2>
        <p>没有赛道，也没有人替你决定什么值得创造。</p>
      </header>

      <div className="frontier-principles__list">
        {principles.map((principle, index) => (
          <button
            className={`frontier-principle${active === index ? " is-active" : ""}`}
            type="button"
            key={principle.title}
            aria-label={`${principle.title}：${principle.detail}`}
            aria-pressed={active === index}
            onClick={() => setActive(active === index ? null : index)}
            onBlur={() => setActive(null)}
          >
            <span className="frontier-principle__face frontier-principle__face--front">
              <span className="frontier-principle__title">{principle.title}</span>
              <span className="frontier-principle__label mono">
                {principle.label}<span aria-hidden="true"> ↗</span>
              </span>
            </span>
            <span className="frontier-principle__face frontier-principle__face--back" aria-hidden="true">
              <span className="frontier-principle__label mono">{principle.label}</span>
              <span className="frontier-principle__detail">{principle.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
