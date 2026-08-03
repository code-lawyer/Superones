import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Frontier verification distinguishes queued fallback work from completed verification", async () => {
  const [form, route] = await Promise.all([
    readFile(path.join(root, "app", "frontier", "submit", "submit-form.tsx"), "utf8"),
    readFile(path.join(root, "app", "api", "frontier", "verify", "route.ts"), "utf8"),
  ]);

  assert.match(form, /response\.status === 202 \|\| result\.pending/);
  assert.match(form, /setStep\(response\.status === 202 \|\| result\.pending \? "queued" : "verified"\)/);
  assert.match(form, /PENDING \/ ASYNC VERIFICATION/);
  assert.match(form, /当前尚未计入榜单/);
  assert.match(form, /公开榜单通常会在 30 秒内显示/);
  assert.match(route, /请确认仓库公开、不是 Fork、未归档，并已声明 GitHub 可识别的开源许可证后重新报名/);
});

test("Frontier donation actions and prize overflow remain visibly separated and accessible", async () => {
  const [donationForm, prizePool, page, styles] = await Promise.all([
    readFile(path.join(root, "app", "frontier", "donate", "donation-form.tsx"), "utf8"),
    readFile(path.join(root, "components", "frontier-prize-pool.tsx"), "utf8"),
    readFile(path.join(root, "app", "frontier", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "institutional-frontier.css"), "utf8"),
  ]);

  assert.match(donationForm, /className="donation-form__commit"/);
  assert.match(styles, /\.donation-form__commit\s*\{[\s\S]*?gap:\s*20px[\s\S]*?border-top:\s*1px solid var\(--rule\)/);
  assert.match(prizePool, /const COLLAPSED_PRIZE_COUNT = 3/);
  assert.match(prizePool, /aria-expanded=\{expanded\}/);
  assert.match(prizePool, /aria-controls="frontier-prize-pool-list"/);
  assert.match(page, /<FrontierPrizePool prizes=\{prizes\} \/>/);
});
