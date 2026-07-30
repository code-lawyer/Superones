"use client";

import { useEffect, useRef, useState } from "react";
import { ManifestoContent } from "./frontier-copy";

const principles = [
  {
    title: "无组织",
    label: "NO ORGANIZATION",
    summary: "没有管理方、组织方、赞助商或主理人。计划启动之后，它属于每一个愿意高举此旗的人。",
    content: (
      <>
        <p>所谓无组织，就是指的这一场黑客松，没有管理方，没有组织方，没有赞助商，没有主理人。</p>
        <p>一个很简单的道理：</p>
        <p>管理也是一种劳动，组织也是一种成本，一旦管理者为之付出了心血，ta 就必然想要从中获得收益——<strong>人类文明史上无数崇高的梦想因此毁灭</strong>。</p>
        <p>边境计划虽然算不上崇高，但我们并不想重蹈覆辙。</p>
        <p>作为一个纯粹的公益项目，边境计划没有赞助商，没有主办方，没有管理人——它运行于赛博空间，映射在我们的灵魂。</p>
        <p>事实上，计划启动之后，就再不属于任何人，也同时属于任何人——</p>
        <p className="frontier-principle-copy__signal">请随意高举此旗，无需许可。</p>
      </>
    ),
  },
  {
    title: "无纪律",
    label: "NO DISCIPLINE",
    summary: "没有固定日程、规章制度或评审细则。你创造喜欢的东西，世界用欢呼回应。",
    content: (
      <>
        <p>无纪律是指，边境计划没有固定的日程安排、规章制度、评审细则，通通没有。</p>
        <p>但无纪律不等于取消报名资格：公开仓库、非纯 Fork、未归档、开源许可证和仓库控制权验证，仍然是进入排行榜的通行条件。</p>
        <p className="frontier-principle-copy__signal">我们的原则很简单：<strong>你创造你喜欢的东西，这个世界用欢呼回应。</strong></p>
        <p>作为计划启动方的边境事务管理局，只提供一条规则：</p>
        <p>在本页面参与边境计划报名的所有参赛者，可以提交一个 GitHub 项目地址；验证成功时记录 Star 基线，在当季结算时间，报名后净新增 Star 最大者获得边境计划 Hackathon 的冠军奖励。</p>
        <p>没错，你可以呼朋引伴一起完成作品（允许使用召唤兽），你也可以发动亲友团为你刷星（谁说传播力不是战斗力），你也可以扔 100 个 idea，把报名库塞满你手搓的“垃圾”（战术后仰）；你甚至可以全程隐身，默默填入一个仓库地址，默默摘走桂冠。</p>
        <p><strong>It all depends on you.</strong></p>
      </>
    ),
  },
  {
    title: "无目标",
    label: "NO GOAL",
    summary: "没有赛道，没有标准答案。创造任何你喜爱的东西，无需许可，也没有目标。",
    content: (
      <>
        <p>边境计划不为参赛者设立任何目标。</p>
        <p className="frontier-principle-copy__signal">没有赛道。</p>
        <p>这不是一场较量，也不是什么比拼。我们不是主办方和赞助商脚下争宠的小狗，也不需要评委的名声或鲜红的印章为简历增色。创造本身便是人类最大的乐趣来源，更是这个 AI 时代，我们身为人类最后的骄傲。</p>
        <p>梵高落泪之前，AI 画不出那一夜的星空；陀翁提笔之后，AI 才学会了称量人性。</p>
        <p>如果 Claude 诞生在 18 世纪，它也只会赞美皇权而已；即便 Gemini 出现在九十年代，它也不可能发明 iPhone。</p>
        <p><strong>人类越过边境，开拓世界，AI 紧随其后，耕耘良田。</strong></p>
        <p>创造任何你喜爱的东西，无需许可，也没有目标。</p>
        <p>这是我们能为未来做的、最有价值的事情。</p>
      </>
    ),
  },
  {
    title: "无期限",
    label: "NO DEADLINE",
    summary: "计划全年生效，任何时间均可报名。季度会结算，但创造不会随赛季结束。",
    content: (
      <>
        <p>边境计划全年生效，任何时间均可报名，每一季度结算一次奖励，但任一项目仅能参加其报名之后最近一次结算时的评选。</p>
        <p>注意，该评选为边境事务管理局组织的评选。任何人或组织有意组织其他维度的评选，均可自由使用边境计划的名义及全部相关 IP 资产。</p>
        <p>季度赛冠军奖励来自边境事务管理局自筹，不接受赞助；冠军以外的其他奖励接受匿名捐赠。</p>
        <p>本站现已开放自主捐赠和随机奖励抽取：你可以把任何用不着、或者想要与别人分享的东西——一本书、一个手办、一台旧 CD 机或一台二手电脑——捐赠给赛事。它们将进入奖励池，以完全随机的形式抽取给赛事获胜者。奖励由捐赠者 P2P 发放，管理局并不参与——我们也承担不起仓储成本。</p>
        <p>边境计划不是一个评选完优胜者、发放完奖励就结束的短期活动。我们的最终目标，是将其培育成一个可持续、自运营、自管理的文化现象。</p>
        <p className="frontier-principle-copy__signal"><strong>只要边境还存在，我们将在这里长明此灯。</strong></p>
      </>
    ),
  },
];

export function FrontierPrinciples() {
  const [active, setActive] = useState<number | null>(null);
  const [lastActive, setLastActive] = useState(0);
  const [turnSequence, setTurnSequence] = useState(0);
  const principleButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const principleDetail = useRef<HTMLElement | null>(null);
  const principleHeading = useRef<HTMLHeadingElement | null>(null);
  const activatedByKeyboard = useRef(false);
  const selectedPrinciple = principles[active ?? lastActive];
  const hasInteracted = turnSequence > 0;

  useEffect(() => {
    if (active === null) return;

    const frame = window.requestAnimationFrame(() => {
      if (activatedByKeyboard.current) {
        principleHeading.current?.focus({ preventScroll: true });
      }
      principleDetail.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [active, turnSequence]);

  function selectPrinciple(index: number, fromKeyboard: boolean) {
    activatedByKeyboard.current = fromKeyboard;
    setLastActive(index);
    setActive(index);
    setTurnSequence((sequence) => sequence + 1);
  }

  function returnToManifesto() {
    const returnFocusIndex = lastActive;
    setActive(null);
    setTurnSequence((sequence) => sequence + 1);
    window.requestAnimationFrame(() => principleButtons.current[returnFocusIndex]?.focus());
  }

  return (
    <div className="shell frontier-doctrine__columns">
      {hasInteracted ? (
        <p className="frontier-principle-status" aria-live="polite" aria-atomic="true">
          {active === null ? "已返回边境计划宣言" : `已打开${selectedPrinciple.title}原则详解`}
        </p>
      ) : null}

      <div className="frontier-manifesto-column">
        <div
          className={`frontier-doctrine-card${active !== null ? " is-detail" : ""}${hasInteracted ? active !== null ? " is-turning-to-detail" : " is-returning-to-manifesto" : ""}`}
          key={`${active === null ? "manifesto" : active}-${turnSequence}`}
        >
          <article
            className="frontier-doctrine-face frontier-doctrine-face--manifesto"
            aria-hidden={active !== null}
            inert={active !== null}
          >
            <p className="eyebrow mono frontier-manifesto-column__label">FRONTIER MANIFESTO / 宣言</p>
            <ManifestoContent />
          </article>

          <article
            className="frontier-doctrine-face frontier-doctrine-face--principle"
            id="frontier-principle-detail"
            ref={principleDetail}
            aria-hidden={active === null}
            inert={active === null}
          >
            <header className="frontier-principle-copy__header">
              <p className="eyebrow mono">{selectedPrinciple.label} / 原则详解</p>
              <h2 ref={principleHeading} tabIndex={-1}>{selectedPrinciple.title}</h2>
              <p>{selectedPrinciple.summary}</p>
            </header>
            <div className="frontier-principle-copy">{selectedPrinciple.content}</div>
            <button
              className="frontier-manifesto-return mono"
              type="button"
              tabIndex={active === null ? -1 : 0}
              onClick={returnToManifesto}
            >
              <span aria-hidden="true">←</span> 返回宣言
            </button>
          </article>
        </div>
      </div>

      <section className="frontier-principles" aria-labelledby="frontier-principles-title">
        <header className="frontier-doctrine__header frontier-principles__header">
          <p className="eyebrow mono">THE FOUR NOES / 原则</p>
          <h2 id="frontier-principles-title">四无原则</h2>
          <p>选择一项原则，翻开左侧档案查看详解。</p>
        </header>

        <div className="frontier-principles__list">
          {principles.map((principle, index) => (
            <button
              className={`frontier-principle${active === index ? " is-active" : ""}`}
              type="button"
              key={principle.title}
              ref={(element) => {
                principleButtons.current[index] = element;
              }}
              aria-label={`查看${principle.title}的详细解释`}
              aria-controls="frontier-principle-detail"
              aria-pressed={active === index}
              onClick={(event) => selectPrinciple(index, event.detail === 0)}
            >
              <span className="frontier-principle__title">{principle.title}</span>
              <span className="frontier-principle__label mono">
                {principle.label}<span className="frontier-principle__arrow" aria-hidden="true"> ↗</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
