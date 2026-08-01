import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const [feedPage, informationList, roadsideList, roadsideRoute, feedStyles] = await Promise.all([
  readFile(path.join(root, "app", "feed", "page.tsx"), "utf8"),
  readFile(path.join(root, "components", "information-list.tsx"), "utf8"),
  readFile(path.join(root, "components", "statement-list.tsx"), "utf8"),
  readFile(path.join(root, "app", "feed", "roadside", "[slug]", "page.tsx"), "utf8"),
  readFile(path.join(root, "app", "institutional-feed.css"), "utf8"),
]);

test("information waterfall titles use the full row instead of shrink-to-fit text", () => {
  assert.match(informationList, /<h2>\{item\.translatedTitle\}<\/h2>/);
  assert.doesNotMatch(informationList, /<h2><span>/);
  assert.match(feedStyles, /\.information-row h2\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/);
  assert.match(feedStyles, /\.information-row__link:hover\s*\{\s*background:\s*var\(--carbon\);[\s\S]*?color:\s*var\(--paper-bright\);/);
  assert.match(feedStyles, /\.information-row__link:hover h2\s*\{[\s\S]*?transform:\s*translateX\(7px\);/);
  assert.match(feedStyles, /\.information-row__link:hover \.information-row__original\s*\{[\s\S]*?color:\s*var\(--text-on-dark\);/);
});

test("information interaction rows reach the viewport while copy stays on the reading rail", () => {
  assert.match(feedPage, /className="feed-page"/);
  assert.match(feedStyles, /\.feed-page\s*\{[\s\S]*?container-type:\s*inline-size;/);
  assert.match(feedStyles, /--feed-viewport-bleed:\s*calc\(max\(0px, \(100cqw - var\(--shell\)\) \/ 2\) \+ var\(--gutter\)\);/);
  assert.match(
    feedStyles,
    /\.feed-column--streams \.information-row__link\s*\{[\s\S]*?--information-row-inline-start:\s*var\(--feed-gutter\);[\s\S]*?--information-row-inline-end:\s*var\(--feed-viewport-bleed\);[\s\S]*?width:\s*calc\(100% \+ var\(--information-row-inline-start\) \+ var\(--information-row-inline-end\)\);[\s\S]*?max-width:\s*none;[\s\S]*?margin-left:\s*calc\(-1 \* var\(--information-row-inline-start\)\);[\s\S]*?padding:\s*0;/,
  );
  assert.match(
    feedStyles,
    /\.feed-column--streams \.information-row__main\s*\{[\s\S]*?width:\s*calc\(100% - var\(--information-row-inline-start\) - var\(--information-row-inline-end\)\);[\s\S]*?margin-left:\s*var\(--information-row-inline-start\);[\s\S]*?padding:\s*18px 0 20px;/,
  );
  assert.match(
    feedStyles,
    /@media \(max-width:\s*900px\)[\s\S]*?\.feed-column--streams \.information-row__link\s*\{[\s\S]*?--information-row-inline-start:\s*var\(--feed-viewport-bleed\);[\s\S]*?--information-row-inline-end:\s*var\(--feed-viewport-bleed\);/,
  );
});

test("feed entries use whitespace and interaction states instead of hairline separators", () => {
  assert.match(
    feedStyles,
    /\.event-entry__link,\s*\n\.information-row__link\s*\{[\s\S]*?border:\s*0;[\s\S]*?transition:\s*background-color 170ms ease, color 170ms ease;/,
  );
  assert.match(
    feedStyles,
    /\.statement-row__link\s*\{[\s\S]*?border:\s*0;/,
  );
  assert.match(
    feedStyles,
    /\.feed-more\s*\{[\s\S]*?border:\s*0;/,
  );
});

test("roadside rows show only viewpoints and time before opening the speech dialog", () => {
  assert.match(feedPage, /getPublicContent\(\)/);
  assert.doesNotMatch(feedPage, /getCachedPublicContent/);
  assert.doesNotMatch(roadsideList, /roadsideHref|from "next\/link"/);
  const rowButton = roadsideList.match(/<button[\s\S]*?className="statement-row__link"[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.match(rowButton, /<h3>\{item\.translatedTitle\}<\/h3>/);
  assert.match(rowButton, /<time dateTime=\{item\.publishedAt \?\? undefined\}>\{beijingTime\(item\.publishedAt\)\}<\/time>/);
  assert.match(rowButton, /aria-label=\{`查看观点：\$\{item\.translatedTitle\}`\}/);
  assert.doesNotMatch(rowButton, /personName\(item\)|account\(item\)|statement-row__open|<header>/);
  assert.match(roadsideList, /aria-haspopup="dialog"/);
  assert.match(roadsideList, /<dialog[\s\S]*?className="roadside-dialog"/);
  assert.match(roadsideList, /roadside-voice__statement/);
  assert.match(roadsideList, /item\.originPlatform === "x" \? 1_800 : 900/);
  assert.match(feedStyles, /\.statement-row__link\s*\{[\s\S]*?padding:\s*18px 0 20px;/);
  assert.match(feedStyles, /\.statement-row h3\s*\{[\s\S]*?font-size:\s*var\(--type-body-large\);[\s\S]*?line-height:\s*1\.45;/);
});

test("information and roadside streams disclose five records at a time", () => {
  assert.match(feedPage, /const WATERFALL_LIMIT = 5;/);
  assert.match(feedPage, /const STATEMENT_LIMIT = 5;/);
});

test("roadside dialog uses a wide reading rail with restrained body type", () => {
  assert.match(roadsideList, /className="roadside-voice__body"/);
  assert.match(feedStyles, /\.roadside-dialog\s*\{[\s\S]*?width:\s*min\(920px, calc\(100vw - 48px\)\);/);
  assert.match(feedStyles, /\.roadside-voice__body\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(feedStyles, /\.roadside-voice__statement\s*\{[\s\S]*?max-width:\s*72ch;[\s\S]*?font-size:\s*clamp\(16px, 1\.35vw, 18px\);/);
});

test("legacy roadside detail URLs return to the feed modal instead of a document page", () => {
  assert.doesNotMatch(roadsideRoute, /FeedInformationDetail/);
  assert.match(roadsideRoute, /redirect\(`\/feed\?roadsideItem=/);
});

test("event ledger has independent progressive pagination", () => {
  assert.match(feedPage, /eventLimit:\s*positiveLimit\(valueOf\(params\.events\), EVENT_LIMIT\)/);
  assert.match(feedPage, /slice\(0, state\.eventLimit\)/);
  assert.match(feedPage, /feedHref\(state, \{ eventLimit: state\.eventLimit \+ EVENT_LIMIT \}\)/);
  assert.match(feedPage, /展开更多事件/);
});
