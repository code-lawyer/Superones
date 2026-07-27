import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readOpcStyles() {
  const [shared, opc] = await Promise.all([
    readFile(path.join(root, "app", "institutional.css"), "utf8"),
    readFile(path.join(root, "app", "institutional-opc.css"), "utf8"),
  ]);
  return `${shared}\n${opc}`;
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

test("OPC primary navigation owns its viewport-edge reversal boundary", async () => {
  const styles = await readOpcStyles();
  const navigationRules = styles.match(/\.opc-service-browser__primary nav button\s*\{[\s\S]*?\n\}/g) ?? [];
  const boundaryRule = navigationRules.find((rule) => rule.includes("--opc-left-viewport-bleed")) ?? "";

  assert.ok(boundaryRule.includes("width: calc(100% + var(--opc-left-viewport-bleed))"));
  assert.ok(boundaryRule.includes("margin-left: calc(-1 * var(--opc-left-viewport-bleed))"));
  assert.ok(boundaryRule.includes("padding: 17px var(--opc-primary-pad) 17px calc(var(--opc-left-viewport-bleed) + var(--opc-primary-pad))"));
  assert.doesNotMatch(styles, /\.opc-service-browser__primary nav button::before/);
});

test("structural reversals never rely on detached viewport-fill effects", async () => {
  const [shared, feed, frontier, opc, sic] = await Promise.all([
    readFile(path.join(root, "app", "institutional.css"), "utf8"),
    readFile(path.join(root, "app", "institutional-feed.css"), "utf8"),
    readFile(path.join(root, "app", "institutional-frontier.css"), "utf8"),
    readFile(path.join(root, "app", "institutional-opc.css"), "utf8"),
    readFile(path.join(root, "app", "institutional-sic.css"), "utf8"),
  ]);
  const reversalStyles = `${shared}\n${feed}\n${frontier}\n${opc}\n${sic}`;

  assert.doesNotMatch(reversalStyles, /(?:box-shadow:\s*[^;]*100vmax|clip-path:\s*inset\([^)]*100vmax|inset:\s*0\s+-100vmax)/);
  assert.doesNotMatch(sic, /\.sic-content-list a::before/);
  assert.match(frontier, /\.frontier-principle\s*\{[\s\S]*?background:\s*transparent[\s\S]*?transition:\s*background-color 170ms ease, color 170ms ease/);
  assert.match(feed, /\.event-entry__link,\s*\n\.information-row__link\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--rule\)[\s\S]*?transition:\s*background-color 170ms ease, color 170ms ease/);
});

test("OPC primary navigation recomposes into viewport-wide rows on narrow screens", async () => {
  const styles = await readOpcStyles();
  const mobileStart = styles.lastIndexOf("@media (max-width: 820px)");
  const mobileEnd = styles.indexOf("@media (max-width: 620px)", mobileStart);
  const mobileNavigation = styles.slice(mobileStart, mobileEnd === -1 ? undefined : mobileEnd);

  assert.notEqual(mobileStart, -1);
  assert.match(mobileNavigation, /grid-template-columns:\s*1fr/);
  assert.match(mobileNavigation, /margin-left:\s*calc\(-1 \* \(var\(--opc-primary-pad\) \+ var\(--opc-left-viewport-bleed\)\)\)/);
  assert.match(mobileNavigation, /width:\s*100%/);
  assert.match(mobileNavigation, /margin-left:\s*0/);
  assert.doesNotMatch(mobileNavigation, /repeat\(3,\s*1fr\)|display:\s*flex|overflow-x:\s*auto/);
});

test("outer reversal controls use the physical viewport instead of the shell edge", async () => {
  const [feed, frontier] = await Promise.all([
    readFile(path.join(root, "app", "institutional-feed.css"), "utf8"),
    readFile(path.join(root, "app", "institutional-frontier.css"), "utf8"),
  ]);

  assert.match(feed, /--feed-viewport-bleed:\s*calc\(max\(0px, \(100vw - var\(--shell\)\) \/ 2\) \+ var\(--gutter\)\)/);
  assert.match(feed, /\.feed-column--ledger \.event-entry__link,[\s\S]*?width:\s*calc\(100% \+ var\(--feed-viewport-bleed\) \+ var\(--feed-gutter\)\)[\s\S]*?margin-left:\s*calc\(-1 \* var\(--feed-viewport-bleed\)\)/);
  assert.match(feed, /\.feed-column--streams \.information-row__link,[\s\S]*?width:\s*calc\(100% \+ var\(--feed-gutter\) \+ var\(--feed-viewport-bleed\)\)[\s\S]*?padding-right:\s*var\(--feed-viewport-bleed\)/);
  assert.match(frontier, /\.frontier-principle\s*\{[\s\S]*?width:\s*calc\(100% \+ var\(--frontier-doctrine-viewport-bleed\)\)[\s\S]*?padding:\s*0 calc\(var\(--frontier-doctrine-gutter\) \+ var\(--frontier-doctrine-viewport-bleed\)\) 0 var\(--frontier-doctrine-gutter\)/);
  assert.match(frontier, /@media \(max-width: 820px\)[\s\S]*?\.frontier-principle\s*\{[\s\S]*?width:\s*calc\(100% \+ \(var\(--frontier-doctrine-viewport-bleed\) \* 2\)\)[\s\S]*?margin-left:\s*calc\(-1 \* var\(--frontier-doctrine-viewport-bleed\)\)/);
});

test("compact OPC directory items center their complete label group", async () => {
  const styles = await readOpcStyles();
  const itemRules = styles.match(/\.opc-accordion__item\s*\{[\s\S]*?\n\}/g) ?? [];
  const refinedItemRule = itemRules.find((rule) => rule.includes("min-height: 68px")) ?? "";
  const codeRules = styles.match(/\.opc-accordion__item > span\s*\{[\s\S]*?\n\}/g) ?? [];
  const refinedCodeRule = codeRules.at(-1) ?? "";

  assert.ok(refinedItemRule.includes("align-items: center"));
  assert.ok(refinedCodeRule.includes("padding-top: 0"));
});

test("every OPC service title uses the shared single-line fluid type rule", async () => {
  const styles = await readOpcStyles();
  const globalStyles = await readFile(path.join(root, "app", "globals.css"), "utf8");
  const titleRules = styles.match(/\.opc-reading-pane h2\s*\{[\s\S]*?\n\s*\}/g) ?? [];
  const refinedTitleRule = titleRules.find((rule) => rule.includes("--type-opc-service-title")) ?? "";

  assert.match(globalStyles, /--type-opc-service-title:\s*clamp\(22px, 7cqw, 68px\)/);
  assert.ok(refinedTitleRule.includes("max-width: none"));
  assert.ok(refinedTitleRule.includes("font-size: var(--type-opc-service-title)"));
  assert.ok(refinedTitleRule.includes("text-wrap: nowrap"));
  assert.ok(refinedTitleRule.includes("white-space: nowrap"));
  assert.equal(titleRules.filter((rule) => rule.includes("font-size:")).length, 1);
});

test("OPC metadata contrast and shared touch targets stay accessible", async () => {
  const styles = await readFile(path.join(root, "app", "globals.css"), "utf8");
  const paper = styles.match(/--paper:\s*(#[0-9a-f]{6})/)?.[1] ?? "";
  const ash = styles.match(/--ash:\s*(#[0-9a-f]{6})/)?.[1] ?? "";

  assert.ok(contrastRatio(ash, paper) >= 4.5);
  assert.match(styles, /\.wordmark\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.menu-toggle\s*\{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.footer-brand,\s*\n\.footer-nav a\s*\{[\s\S]*?min-height:\s*44px/);
});

test("OPC ranger portraits use compact modern formats with a PNG fallback", async () => {
  const styles = await readOpcStyles();
  const avif = await stat(path.join(root, "public", "opc", "ranger-portraits-v1.avif"));
  const webp = await stat(path.join(root, "public", "opc", "ranger-portraits-v1.webp"));

  assert.match(styles, /image-set\([\s\S]*ranger-portraits-v1\.avif[\s\S]*ranger-portraits-v1\.webp[\s\S]*ranger-portraits-v1\.png/);
  assert.ok(avif.size < 100_000);
  assert.ok(webp.size < 100_000);
  assert.doesNotMatch(styles, /transition:[^;]*(?:padding-left|padding-bottom)/);
});
