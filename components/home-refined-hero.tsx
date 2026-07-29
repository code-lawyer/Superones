"use client";

import { useRef, useState } from "react";

export function HomeRefinedHero() {
  const [manifestoOpen, setManifestoOpen] = useState(false);
  const revealButtonRef = useRef<HTMLButtonElement>(null);

  function closeManifesto() {
    setManifestoOpen(false);
    window.requestAnimationFrame(() => revealButtonRef.current?.focus());
  }

  return (
    <section className={manifestoOpen ? "home-refined-hero is-open" : "home-refined-hero"}>
      <div className="home-refined-hero__main">
        <div className="home-refined-hero__identity">
          <p className="mono">for you，Superones</p>
          <h1>Vault2077</h1>
          <button
            ref={revealButtonRef}
            className="home-refined-hero__reveal"
            type="button"
            aria-expanded={manifestoOpen}
            aria-controls="home-refined-manifesto"
            aria-label={manifestoOpen ? "收起避难所欢迎辞" : "展开避难所欢迎辞"}
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
          <p className="mono">SHELTER WELCOME / 避难所欢迎辞</p>
          <article className="home-refined-manifesto__article">
            <p className="home-refined-manifesto__salutation"><strong>致 步入荒野的你：</strong></p>
            <div className="home-refined-manifesto__body">
              <p>当一人就能够完成旧式公司中一个部门的工作的时候，公司制就失去了存在的价值。</p>
              <p>我们不再需要股东来承担风险，不再需要经理来协调分工，不再需要前中后台冗长低效的合作，我们可以成为独立的作战单元。</p>
              <p>有史以来第一次，人类灵魂中最珍贵的部分——<strong>创意/灵感/品味</strong>，可以肆意生长，不再受限于资金、平台、技能、经验……甚至，可见的未来，AI万用工厂落地后，物理层面的生产也不再是障碍。</p>
              <p><strong>超级个体</strong>和<strong>霸权公司</strong>，将是新时代的主角。</p>
              <p>陈旧的架构已经失效，但超级个体仍然需要某种形式的组织：</p>
              <p>发布和验收任务，撮合交易和协作，链接不同特长的超级个体，提供基础的标准化中后台服务。</p>
              <p>这就是<strong>避难所计划</strong>：你可以专心于挥洒智慧，剩下的一切交给我们（Vault）。</p>
              <p>如果你也受够了愚蠢，如果你也贪恋着自由，如果你也向往着荒野……</p>
              <p>欢迎你，这里是<strong>避难所</strong>，这里是<strong>自由人的集合</strong>。</p>
              <p>一簇小小的篝火，一方简陋的营地，我们开始建设。</p>
            </div>
            {manifestoOpen ? (
              <button
                className="home-refined-manifesto__close"
                type="button"
                aria-label="收起避难所欢迎辞"
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
