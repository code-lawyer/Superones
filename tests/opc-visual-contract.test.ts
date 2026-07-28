import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
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
  const refinedItemRule = itemRules.find((rule) => rule.includes("min-height: 70px")) ?? "";
  const codeRules = styles.match(/\.opc-accordion__item > span\s*\{[\s\S]*?\n\}/g) ?? [];
  const refinedCodeRule = codeRules.at(-1) ?? "";

  assert.ok(refinedItemRule.includes("align-items: center"));
  assert.ok(refinedCodeRule.includes("padding-top: 0"));
});

test("OPC keeps three distinct workspace roles without silently choosing a service", async () => {
  const styles = await readOpcStyles();
  const workspace = await readFile(path.join(root, "components", "opc-workspace.tsx"), "utf8");

  assert.match(styles, /grid-template-columns:\s*minmax\(220px,\s*\.74fr\)\s*minmax\(320px,\s*1\.08fr\)\s*minmax\(0,\s*3\.18fr\)/);
  assert.match(workspace, /initialView === "rangers" \|\| !initialServiceSlug[\s\S]*?\? null/);
  assert.doesNotMatch(workspace, /setSelectedService\(infrastructure\[0\]|setSelectedService\(specialties\[0\]/);
  assert.match(workspace, /router\.push\(`/);
  assert.doesNotMatch(workspace, /router\.replace\(`/);
  assert.doesNotMatch(workspace, /OPC \/ INDEX|EXTERNAL \/ DIRECT CONTACT|VAULT2077 \/ DIRECT DELIVERY/);
});

test("OPC selection feedback is concise and mobile users get an explicit detail transition", async () => {
  const styles = await readOpcStyles();
  const [workspace, page] = await Promise.all([
    readFile(path.join(root, "components", "opc-workspace.tsx"), "utf8"),
    readFile(path.join(root, "app", "opc", "page.tsx"), "utf8"),
  ]);

  assert.match(page, /key=\{`\$\{initialView\}:\$\{query\.service \?\? ""\}`\}/);
  assert.match(workspace, /const owningGroup = serviceGroups\.find/);
  assert.match(workspace, /if \(owningGroup\) setOpenGroup\(owningGroup\.id\)/);
  assert.match(workspace, /className="opc-service-browser__announcement" aria-live="polite"/);
  assert.doesNotMatch(workspace, /className="opc-service-browser__content"\s*\n\s*aria-live=/);
  assert.match(workspace, /查看服务详情/);
  assert.match(workspace, /scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth"/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.opc-service-browser__selected\s*\{[\s\S]*?display:\s*grid/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.opc-accordion__item\s*\{[\s\S]*?width:\s*calc\(100% \+ \(var\(--opc-left-viewport-bleed\) \* 2\)\)/);
});

test("OPC service brief joins price context, order entry, payment guidance and adjacent navigation", async () => {
  const styles = await readOpcStyles();
  const [workspace, orderEntry] = await Promise.all([
    readFile(path.join(root, "components", "opc-workspace.tsx"), "utf8"),
    readFile(path.join(root, "components", "opc-order-entry.tsx"), "utf8"),
  ]);

  assert.match(workspace, /className="opc-reading-pane__fact-register" aria-label="当前服务关键事实"/);
  assert.match(workspace, /责任主体：Vault2077 直接交付/);
  assert.match(workspace, /订单提交后显示支付宝收款码/);
  assert.match(workspace, /<OpcOrderEntry key=\{service\.slug\} service=\{service\} enabled=\{orderingAvailable\} \/>/);
  assert.match(workspace, /aria-label="切换服务"/);
  assert.doesNotMatch(workspace, /当前页面为工作原型|由谁完成/);
  assert.match(orderEntry, /提交联系方式后获取支付宝付款码/);
  assert.match(orderEntry, /X-Vault2077-Public-Request/);
  assert.match(orderEntry, /付款备注中填写订单号/);
  assert.match(orderEntry, /href="\/terms"/);
  assert.match(orderEntry, /href="\/privacy"/);
  assert.match(orderEntry, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.opc-order-entry\s*\{[\s\S]*?border-top:\s*1px solid var\(--carbon\)/);
  assert.match(styles, /\.opc-reading-pane__fact-register\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*76px/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.opc-reading-pane__fact-register\s*\{[\s\S]*?position:\s*static/);
});

test("OPC detail reveal uses one shared focus and motion path", async () => {
  const workspace = await readFile(path.join(root, "components", "opc-workspace.tsx"), "utf8");

  assert.equal(workspace.match(/scrollIntoView\(/g)?.length, 1);
  assert.equal(workspace.match(/matchMedia\("\(prefers-reduced-motion: reduce\)"\)/g)?.length, 1);
  assert.match(workspace, /function revealHeading\(heading: HTMLHeadingElement \| null\)/);
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
  const workspace = await readFile(path.join(root, "components", "opc-workspace.tsx"), "utf8");
  const avif = await stat(path.join(root, "public", "opc", "ranger-portraits-v1.avif"));
  const webp = await stat(path.join(root, "public", "opc", "ranger-portraits-v1.webp"));

  assert.match(styles, /image-set\([\s\S]*ranger-portraits-v1\.avif[\s\S]*ranger-portraits-v1\.webp[\s\S]*ranger-portraits-v1\.png/);
  assert.ok(avif.size < 100_000);
  assert.ok(webp.size < 100_000);
  assert.doesNotMatch(styles, /transition:[^;]*(?:padding-left|padding-bottom)/);
  assert.match(workspace, /opc-ranger-portrait__copy/);
});

test("OPC ranger profiles use the public dossier composition at every breakpoint", async () => {
  const styles = await readOpcStyles();
  const profile = await readFile(path.join(root, "app", "opc", "rangers", "[slug]", "page.tsx"), "utf8");

  assert.match(profile, /opc-ranger-dossier__spine/);
  assert.match(profile, /opc-ranger-dossier__ledger/);
  assert.match(profile, /opc-ranger-dossier__contact/);
  assert.match(profile, /mailto:\$\{profile\.contactLabel\}/);
  assert.match(profile, /<h2 className="mono">EXPERTISE \/ 专业方向<\/h2>/);
  assert.match(profile, /<h2 className="mono">PUBLIC RECORD \/ 公开记录<\/h2>/);
  assert.match(profile, /<h2>直接联系专家本人<\/h2>/);
  assert.doesNotMatch(profile, /opc-ranger-profile-page|authorizationStatus|contactState/);
  assert.match(styles, /\.opc-ranger-dossier__hero\s*\{[\s\S]*?grid-template-columns:\s*var\(--dossier-spine\)/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.opc-ranger-dossier__hero\s*\{[\s\S]*?grid-template-columns:\s*var\(--dossier-spine\) minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.opc-ranger-dossier\s*\{[\s\S]*?--dossier-spine:\s*44px/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.opc-ranger-dossier__contact-action a i\s*\{[\s\S]*?transition:\s*none/);
  assert.doesNotMatch(styles, /\.opc-ranger-profile-page/);
});

test("OPC uses one workspace and has no duplicate public register pages", async () => {
  const [home, profile, styles] = await Promise.all([
    readFile(path.join(root, "app", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "opc", "rangers", "[slug]", "page.tsx"), "utf8"),
    readOpcStyles(),
  ]);
  const removedFiles = [
    path.join(root, "app", "opc", "infrastructure", "page.tsx"),
    path.join(root, "app", "opc", "specialties", "page.tsx"),
    path.join(root, "app", "opc", "rangers", "page.tsx"),
    path.join(root, "components", "opc-service-records.tsx"),
    path.join(root, "components", "opc-ranger-directory.tsx"),
  ];

  assert.match(home, /href: "\/opc\?view=infrastructure"/);
  assert.match(home, /href: "\/opc\?view=specialties"/);
  assert.match(home, /href: "\/opc\?view=rangers"/);
  assert.doesNotMatch(home, /\/opc\/(?:infrastructure|specialties|rangers)"/);
  assert.match(profile, /href="\/opc\?view=rangers"/);
  assert.doesNotMatch(styles, /\.opc-(?:catalog-page|records?|domain-index|specialty-domain|ranger-directory|ranger-record|ranger-index|ranger-group)/);
  await Promise.all(removedFiles.map((file) => assert.rejects(access(file))));
});

test("OPC service catalog contains no review, delivery-role or effective-date fields", async () => {
  const [workspace, admin, catalog, managed] = await Promise.all([
    readFile(path.join(root, "components", "opc-workspace.tsx"), "utf8"),
    readFile(path.join(root, "components", "admin-opc-catalog-editor.tsx"), "utf8"),
    readFile(path.join(root, "lib", "opc-catalog.ts"), "utf8"),
    readFile(path.join(root, "lib", "managed-service-catalog.ts"), "utf8"),
  ]);
  const surface = [workspace, admin, catalog, managed].join("\n");

  assert.doesNotMatch(surface, /REVIEW \/ 专业复核|复核与生效|reviewNote|effectiveAt|专业复核说明|修订生效时间|deliveryRoles|由谁完成/);
  assert.doesNotMatch(workspace, /service\.status/);
});
