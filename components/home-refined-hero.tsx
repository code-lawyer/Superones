"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  claimHomeBrandIntroInBrowser,
  HOME_BRAND_INTRO_MAX_DURATION_MS,
  scheduleHomeBrandIntroSettlement,
} from "@/lib/home-brand-intro";

export function HomeRefinedHero() {
  const [manifestoOpen, setManifestoOpen] = useState(false);
  const revealButtonRef = useRef<HTMLButtonElement>(null);
  const issueRef = useRef<HTMLSpanElement>(null);
  const introEffectGenerationRef = useRef(0);

  useLayoutEffect(() => {
    const effectGeneration = ++introEffectGenerationRef.current;
    const root = document.documentElement;
    const introState = root.dataset.homeBrandIntro ?? claimHomeBrandIntroInBrowser();
    root.dataset.homeBrandIntro = introState;

    if (introState !== "play") return;

    function settleIntro() {
      root.dataset.homeBrandIntro = "settled";
    }

    function settleHiddenIntro() {
      if (document.visibilityState === "hidden") settleIntro();
    }

    function settleIssuedIntro(event: AnimationEvent) {
      if (event.animationName === "home-brand-issue") settleIntro();
    }

    if (
      document.visibilityState === "hidden"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      settleIntro();
      return;
    }

    const issue = issueRef.current;
    const timeoutId = window.setTimeout(settleIntro, HOME_BRAND_INTRO_MAX_DURATION_MS);
    issue?.addEventListener("animationend", settleIssuedIntro);
    document.addEventListener("visibilitychange", settleHiddenIntro);

    return () => {
      window.clearTimeout(timeoutId);
      issue?.removeEventListener("animationend", settleIssuedIntro);
      document.removeEventListener("visibilitychange", settleHiddenIntro);
      scheduleHomeBrandIntroSettlement(
        (callback) => window.queueMicrotask(callback),
        introEffectGenerationRef,
        effectGeneration,
        settleIntro,
      );
    };
  }, []);

  function closeManifesto() {
    setManifestoOpen(false);
    window.requestAnimationFrame(() => revealButtonRef.current?.focus());
  }

  return (
    <section className={manifestoOpen ? "home-refined-hero is-open" : "home-refined-hero"}>
      <div className="home-refined-hero__main">
        <div className="home-refined-hero__identity">
          <p className="mono">for you，Superones</p>
          <h1 className="home-brand" aria-label="Vault2077">
            <span className="home-brand__visual" aria-hidden="true">
              <span className="home-brand__vault">
                <span className="home-brand__char">V</span>
                <span className="home-brand__char">a</span>
                <span className="home-brand__char">u</span>
                <span className="home-brand__char">l</span>
                <span className="home-brand__char">t</span>
              </span>
              <span ref={issueRef} className="home-brand__issue">
                <span className="home-brand__char">2</span>
                <span className="home-brand__char">0</span>
                <span className="home-brand__char">7</span>
                <span className="home-brand__char">7</span>
              </span>
            </span>
          </h1>
          <button
            ref={revealButtonRef}
            className="home-refined-hero__reveal"
            type="button"
            aria-expanded={manifestoOpen}
            aria-controls="home-refined-manifesto"
            aria-label={manifestoOpen ? "收起Vault2077欢迎辞" : "展开Vault2077欢迎辞"}
            onClick={() => setManifestoOpen((open) => !open)}
          >
            <span className="home-refined-hero__triangle" aria-hidden="true" />
          </button>
        </div>
        <div className="home-refined-hero__orientation">
          <p>从信息、经营、进化到公开建造，为超级个体提供一套持续运行的坐标系统。</p>
        </div>
      </div>
      <div
        className="home-refined-manifesto"
        id="home-refined-manifesto"
        aria-hidden={!manifestoOpen}
      >
        <div>
          <p className="mono">VAULT2077 WELCOME / Vault2077欢迎辞</p>
          <article className="home-refined-manifesto__article">
            <p className="home-refined-manifesto__salutation"><strong>致 步入荒野的你：</strong></p>
            <div className="home-refined-manifesto__body">
              <p>当一人就能够完成旧式公司中一个部门的工作的时候，公司制就失去了存在的价值。</p>
              <p>我们不再需要股东来承担风险，不再需要经理来协调分工，不再需要前中后台冗长低效的合作，我们可以成为独立的作战单元。</p>
              <p>有史以来第一次，人类灵魂中最珍贵的部分——<strong>创意/灵感/品味</strong>，可以肆意生长，不再受限于资金、平台、技能、经验……甚至，可见的未来，AI万用工厂落地后，物理层面的生产也不再是障碍。</p>
              <p><strong>超级个体</strong>和<strong>霸权公司</strong>，将是新时代的主角。</p>
              <p>陈旧的架构已经失效，但超级个体仍然需要某种形式的组织：</p>
              <p>发布和验收任务，撮合交易和协作，链接不同特长的超级个体，提供基础的标准化中后台服务。</p>
              <p>这就是<strong>Vault2077</strong>：你可以专心于挥洒智慧，剩下的一切交给我们。</p>
              <p>如果你也受够了愚蠢，如果你也贪恋着自由，如果你也向往着荒野……</p>
              <p>欢迎你，这里是<strong>Vault2077</strong>，这里是<strong>自由人的集合</strong>。</p>
              <p>一簇小小的篝火，一方简陋的营地，我们开始建设。</p>
            </div>
            {manifestoOpen ? (
              <button
                className="home-refined-manifesto__close"
                type="button"
                aria-label="收起Vault2077欢迎辞"
                onClick={closeManifesto}
              >
                <span className="home-refined-hero__triangle" aria-hidden="true" />
              </button>
            ) : null}
          </article>
        </div>
      </div>
    </section>
  );
}
