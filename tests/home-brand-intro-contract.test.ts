import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  claimHomeBrandIntro,
  scheduleHomeBrandIntroSettlement,
} from "../lib/home-brand-intro.ts";

const heroUrl = new URL("../components/home-refined-hero.tsx", import.meta.url);
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/home.css", import.meta.url);
const designUrl = new URL("../DESIGN.md", import.meta.url);
const productSpecUrl = new URL("../docs/Vault2077-Design-Spec.md", import.meta.url);

test("homepage brand issuance preserves one accessible static identity", async () => {
  const hero = await readFile(heroUrl, "utf8");

  assert.match(hero, /<h1 className="home-brand" aria-label="Vault2077">/);
  assert.match(hero, /className="home-brand__visual" aria-hidden="true"/);
  assert.match(hero, /className="home-brand__vault"/);
  assert.match(hero, /<span[^>]+className="home-brand__issue"/);
  assert.doesNotMatch(hero, /setInterval|localStorage/);
});

test("homepage brand claim replays on each load and settles for reduced motion or hidden pages", () => {
  assert.equal(claimHomeBrandIntro(() => false, () => "visible"), "play");
  assert.equal(claimHomeBrandIntro(() => false, () => "visible"), "play");
  assert.equal(claimHomeBrandIntro(() => true, () => "visible"), "settled");
  assert.equal(claimHomeBrandIntro(() => false, () => "hidden"), "settled");
  assert.equal(claimHomeBrandIntro(() => { throw new Error("media query unavailable"); }, () => "visible"), "settled");
});

test("Strict Mode probe cleanup cannot settle a newer homepage intro effect", () => {
  const queuedCallbacks: Array<() => void> = [];
  const generationRef = { current: 1 };
  let settleCount = 0;

  scheduleHomeBrandIntroSettlement(
    (callback) => queuedCallbacks.push(callback),
    generationRef,
    1,
    () => settleCount++,
  );
  generationRef.current = 2;
  queuedCallbacks.shift()?.();
  assert.equal(settleCount, 0);

  scheduleHomeBrandIntroSettlement(
    (callback) => queuedCallbacks.push(callback),
    generationRef,
    2,
    () => settleCount++,
  );
  queuedCallbacks.shift()?.();
  assert.equal(settleCount, 1);
});

test("homepage brand issuance covers direct loads and client-side homepage entry", async () => {
  const [layout, page, hero, gate] = await Promise.all([
    readFile(layoutUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(heroUrl, "utf8"),
    readFile(new URL("../lib/home-brand-intro.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /<script|next\/script|HOME_BRAND_INTRO_INLINE_SCRIPT/);
  assert.doesNotMatch(layout, /<script|next\/script|HOME_BRAND_INTRO_INLINE_SCRIPT/);
  assert.doesNotMatch(layout, /import \{ headers \} from "next\/headers"|get\("x-nonce"\)/);
  assert.match(layout, /<html[^>]+suppressHydrationWarning>/);
  assert.match(gate, /HOME_BRAND_INTRO_MAX_DURATION_MS = 2_600/);
  assert.match(hero, /useLayoutEffect/);
  assert.match(hero, /root\.dataset\.homeBrandIntro \?\? claimHomeBrandIntroInBrowser\(\)/);
  assert.match(hero, /document\.visibilityState === "hidden"/);
  assert.match(hero, /event\.animationName === "home-brand-issue"/);
  assert.match(hero, /addEventListener\("animationend"/);
  assert.match(hero, /visibilitychange/);
  assert.match(hero, /introEffectGenerationRef/);
  assert.match(hero, /scheduleHomeBrandIntroSettlement/);
  assert.match(hero, /root\.dataset\.homeBrandIntro = "settled"/);
});

test("homepage brand issuance has static reduced-motion fallback and synchronized specs", async () => {
  const [styles, design, productSpec] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(designUrl, "utf8"),
    readFile(productSpecUrl, "utf8"),
  ]);

  assert.match(styles, /html\[data-home-brand-intro="play"\] \.home-brand__issue::before/);
  assert.match(styles, /@keyframes home-brand-register/);
  assert.match(styles, /@keyframes home-brand-verify/);
  assert.match(styles, /@keyframes home-brand-issue/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.home-brand__issue::before[\s\S]*?animation: none/);
  assert.match(design, /Homepage Brand Issuance/);
  assert.match(design, /唯一的静态身份例外是首页 `2077` 品牌签发牌/);
  assert.match(productSpec, /每次完整加载或刷新首页时/);
  assert.match(productSpec, /约 2\.3 秒的“登记—校验—签发”序列/);
});
