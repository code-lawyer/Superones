import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Frontier verification distinguishes pending, rejected, and completed outcomes without exposing infrastructure", async () => {
  const form = await readFile(path.join(root, "app", "frontier", "submit", "submit-form.tsx"), "utf8");

  assert.match(form, /response\.status === 202 \|\| result\?\.pending/);
  assert.match(form, /result\?\.rejected/);
  assert.match(form, /setStep\("rejected"\)/);
  assert.match(form, /PENDING \/ VERIFICATION/);
  assert.match(form, /当前尚未计入榜单/);
  assert.match(form, /资格核验通过后，项目会自动进入当前赛季榜单/);
  assert.doesNotMatch(form, /核验队列|境外采集链路|境内无法直接读取/);
  assert.match(form, /公开榜单通常会在 30 秒内显示/);
});

test("Frontier donation actions and prize overflow remain visibly separated and accessible", async () => {
  const [donationForm, prizePool, page, styles, globalStyles] = await Promise.all([
    readFile(path.join(root, "app", "frontier", "donate", "donation-form.tsx"), "utf8"),
    readFile(path.join(root, "components", "frontier-prize-pool.tsx"), "utf8"),
    readFile(path.join(root, "app", "frontier", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "institutional-frontier.css"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
  ]);

  assert.match(donationForm, /className="donation-form__commit"/);
  assert.match(styles, /\.donation-form__commit\s*\{[\s\S]*?gap:\s*20px[\s\S]*?border-top:\s*1px solid var\(--rule\)/);
  assert.match(prizePool, /const COLLAPSED_PRIZE_COUNT = 3/);
  assert.match(prizePool, /aria-expanded=\{expanded\}/);
  assert.match(prizePool, /aria-controls="frontier-prize-pool-list"/);
  assert.match(prizePool, /PublicPrizeDonation\["status"\]/);
  assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.frontier-pool-more__icon[\s\S]*?transition: none !important/);
  assert.match(page, /<FrontierPrizePool prizes=\{prizes\} \/>/);
});
