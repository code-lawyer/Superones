import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the root layout installs the mobile dossier layer and safe-area viewport contract", async () => {
  const layout = await readFile(path.join(root, "app", "layout.tsx"), "utf8");

  assert.match(layout, /import "\.\/mobile\.css"/);
  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(layout, /width:\s*"device-width"/);
});

test("the viewport-covering mobile channel index remains reachable and traps interaction", async () => {
  const [styles, header] = await Promise.all([
    readFile(path.join(root, "app", "mobile.css"), "utf8"),
    readFile(path.join(root, "components", "site-header.tsx"), "utf8"),
  ]);

  assert.match(styles, /\.site-header \.menu-toggle\s*\{[\s\S]*?display:\s*inline-flex/);
  assert.match(styles, /\.site-header \.primary-nav\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(header, /document\.body\.style\.overflow\s*=\s*"hidden"/);
  assert.match(header, /element\.inert\s*=\s*true/);
  assert.match(header, /event\.key\s*===\s*"Escape"/);
  assert.match(header, /event\.key\s*!==\s*"Tab"/);
  assert.match(header, /matchMedia\("\(max-width: 820px\)"\)/);
  assert.match(header, /addEventListener\("change", handleViewportChange\)/);
  assert.match(header, /if \(!event\.matches\) setOpenPath\(null\)/);
});

test("the mobile dossier layer replaces border density with type, space, and touch-safe rails", async () => {
  const [shared, home, feed, sic, frontier] = await Promise.all([
    readFile(path.join(root, "app", "mobile.css"), "utf8"),
    readFile(path.join(root, "app", "mobile-home.css"), "utf8"),
    readFile(path.join(root, "app", "mobile-feed.css"), "utf8"),
    readFile(path.join(root, "app", "mobile-sic.css"), "utf8"),
    readFile(path.join(root, "app", "mobile-frontier.css"), "utf8"),
  ]);

  assert.match(shared, /@media \(max-width: 820px\)/);
  assert.match(shared, /--type-micro:\s*11px/);
  assert.match(shared, /--type-body:\s*16px/);
  assert.match(shared, /\.channel-page-intro\s*\{[\s\S]*?border:\s*0/);
  assert.match(shared, /\.mobile-task-nav\s*\{[\s\S]*?display:\s*flex[\s\S]*?overflow-x:\s*auto/);
  assert.match(shared, /\.mobile-task-nav__item\s*\{[\s\S]*?min-height:\s*46px/);
  assert.match(shared, /\.footer-nav\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(home, /\.home-experience \.home-mobile-status/);
  assert.match(feed, /\.feed-page \.feed-stage/);
  assert.match(sic, /\.sic-overview \.sic-overview-group:not\(:last-child\)/);
  assert.match(frontier, /\.frontier-landing \.frontier-live/);
  assert.match(sic, /\.sic-overview \.sic-overview-ranking__position > small,[\s\S]*?font-size:\s*var\(--type-label\)/);
  assert.match(sic, /\.sic-overview \.sic-overview-ranking__slide li a\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(sic, /\.sic-overview \.sic-overview-ranking__trust a\s*\{[\s\S]*?min-height:\s*44px/);
});

test("viewport-fit cover maps each physical safe area to its matching side", async () => {
  const styles = await readFile(path.join(root, "app", "mobile.css"), "utf8");

  assert.match(styles, /\.shell\s*\{[\s\S]*?padding-right:\s*max\(var\(--gutter\), env\(safe-area-inset-right\)\)[\s\S]*?padding-left:\s*max\(var\(--gutter\), env\(safe-area-inset-left\)\)/);
  assert.match(styles, /\.channel-ribbon__track\s*\{[\s\S]*?padding-right:\s*max\(var\(--gutter\), env\(safe-area-inset-right\)\)[\s\S]*?padding-left:\s*max\(var\(--gutter\), env\(safe-area-inset-left\)\)/);
  assert.doesNotMatch(styles, /padding-inline:\s*max\(var\(--gutter\), env\(safe-area-inset-left\)\)/);
});

test("the shared mobile layer cannot override channel-owned viewport reversals", async () => {
  const [mobile, opc, frontier] = await Promise.all([
    readFile(path.join(root, "app", "mobile.css"), "utf8"),
    readFile(path.join(root, "app", "institutional-opc.css"), "utf8"),
    readFile(path.join(root, "app", "institutional-frontier.css"), "utf8"),
  ]);

  assert.doesNotMatch(mobile, /\.opc-service-browser/);
  assert.doesNotMatch(mobile, /\.frontier-landing \.frontier-principle\s*\{/);
  assert.match(opc, /@media \(max-width: 820px\)[\s\S]*?\.opc-service-browser__primary nav\s*\{[\s\S]*?grid-template-columns:\s*1fr[\s\S]*?margin-left:\s*calc\(-1 \* \(var\(--opc-primary-pad\) \+ var\(--opc-left-viewport-bleed\)\)\)/);
  assert.match(opc, /@media \(max-width: 820px\)[\s\S]*?\.opc-accordion__item\s*\{[\s\S]*?width:\s*calc\(100% \+ \(var\(--opc-left-viewport-bleed\) \* 2\)\)[\s\S]*?margin-left:\s*calc\(-1 \* var\(--opc-left-viewport-bleed\)\)/);
  assert.match(frontier, /@media \(max-width: 820px\)[\s\S]*?\.frontier-principle\s*\{[\s\S]*?width:\s*calc\(100% \+ \(var\(--frontier-doctrine-viewport-bleed\) \* 2\)\)[\s\S]*?margin-left:\s*calc\(-1 \* var\(--frontier-doctrine-viewport-bleed\)\)/);
});

test("homepage exposes all four primary channels without horizontal discovery", async () => {
  const [styles, home] = await Promise.all([
    readFile(path.join(root, "app", "mobile-home.css"), "utf8"),
    readFile(path.join(root, "components", "home-experience.tsx"), "utf8"),
  ]);
  const statusRule = styles.match(
    /\.home-experience \.home-mobile-status\s*\{[\s\S]*?\n\s*\}/,
  )?.[0];
  const itemRule = styles.match(
    /\.home-experience \.home-mobile-status > a\s*\{[\s\S]*?\n\s*\}/,
  )?.[0];

  assert.ok(statusRule, "expected a homepage channel navigation rule");
  assert.match(statusRule, /display:\s*grid/);
  assert.match(statusRule, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(statusRule, /overflow-x:\s*auto|scrollbar-width:\s*none/);
  assert.ok(itemRule, "expected a homepage channel item rule");
  assert.match(itemRule, /min-width:\s*0/);

  for (const label of ["Vault 信息流", "OPC 服务台", "SiC 学院", "边境计划"]) {
    assert.match(home, new RegExp(label));
  }
});

test("route-level mobile decisions have one selector source", async () => {
  const files = await Promise.all([
    "mobile.css",
    "mobile-home.css",
    "mobile-feed.css",
    "mobile-sic.css",
    "mobile-frontier.css",
  ].map((file) => readFile(path.join(root, "app", file), "utf8")));
  const styles = files.join("\n");
  const occurrences = (pattern: RegExp) => styles.match(pattern)?.length ?? 0;

  assert.equal(occurrences(/\.home-experience \.home-mobile-status\s*\{/g), 1);
  assert.equal(occurrences(/\.sic-overview \.sic-overview-group:nth-child\(even\)\s*\{/g), 1);
  assert.doesNotMatch(files[0]!, /\.home-experience|\.feed-page|\.sic-overview|\.frontier-landing/);
});
