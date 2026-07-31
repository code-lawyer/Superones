import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const [eventList, eventRoute, publicContent, feedStyles] = await Promise.all([
  readFile(path.join(root, "components", "event-list.tsx"), "utf8"),
  readFile(path.join(root, "app", "feed", "[slug]", "page.tsx"), "utf8"),
  readFile(path.join(root, "lib", "public-content.ts"), "utf8"),
  readFile(path.join(root, "app", "institutional-feed.css"), "utf8"),
]);

test("event links and detail lookup share the canonical Unicode slug contract", () => {
  assert.match(eventList, /eventHref\(item\.slug\)/);
  assert.match(eventRoute, /matchesFeedSlug\(item\.slug, slug\)/);
});

test("event list and detail pages read the same live public content source", () => {
  assert.match(eventRoute, /getPublicContent\(\)/);
  assert.doesNotMatch(eventRoute, /getCachedPublicContent/);
});

test("public information titles remove known publication labels", () => {
  assert.match(publicContent, /translatedTitle:\s*cleanEditorialTitle\(item\.translatedTitle\)/);
  assert.match(publicContent, /originalTitle:\s*cleanEditorialTitle\(item\.originalTitle\)/);
});

test("event detail is a linear dossier without a ruled sidebar or ruled evidence rows", () => {
  assert.match(eventRoute, /feed-detail--event event-dossier/);
  assert.doesNotMatch(eventRoute, /feed-detail__aside/);
  assert.match(eventRoute, /<details className="source-record__original">/);
  assert.match(eventRoute, /event-dossier__facts/);
  assert.match(feedStyles, /\.event-dossier \.source-record\s*{[\s\S]*?border:\s*0;/);
  assert.match(feedStyles, /\.event-dossier \.source-record__index\s*{[\s\S]*?align-self:\s*center;/);
});

test("event detail keeps the AI attribution in the conclusion-first header", () => {
  const header = eventRoute.match(/<header className="feed-detail__header">([\s\S]*?)<\/header>/)?.[1] ?? "";
  assert.match(header, /由 AI 基于公开来源自动编排/);
  assert.match(header, /href="\/methodology"/);
  const footer = eventRoute.match(/<footer className="event-dossier__footer">([\s\S]*?)<\/footer>/)?.[1] ?? "";
  assert.doesNotMatch(footer, /由 AI 基于公开来源自动编排/);
});

test("structured detail content stays inside the mobile reading rail", () => {
  assert.match(feedStyles, /\.feed-detail__body,[\s\S]*?\.source-record__content\s*{[\s\S]*?min-width:\s*0;/);
  assert.match(feedStyles, /\.content-markup\s*{[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;/);
  assert.match(feedStyles, /\.content-markup pre\s*{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?width:\s*100%;[\s\S]*?overflow-x:\s*auto;/);
  assert.match(feedStyles, /@media \(max-width: 820px\)[\s\S]*?\.feed-detail__layout\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/);
});
