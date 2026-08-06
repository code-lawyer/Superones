import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  rootLayout,
  publicReadCache,
  stateDocumentStore,
  environmentExample,
  webService,
  workerService,
  frontierService,
  rangerMediaCleanupService,
  opcOrderMaintenanceService,
  globalStyles,
  institutionalStyles,
  proxy,
  adminOpcRoute,
] = await Promise.all([
  source("../app/layout.tsx"),
  source("../lib/public-read-cache.ts"),
  source("../lib/state-document-store.ts"),
  source("../.env.example"),
  source("../deploy/systemd/vault2077-web.service"),
  source("../deploy/systemd/vault2077-acquisition-worker.service"),
  source("../deploy/systemd/vault2077-frontier-tick.service"),
  source("../deploy/systemd/vault2077-ranger-media-cleanup.service"),
  source("../deploy/systemd/vault2077-opc-order-maintenance.service"),
  source("../app/globals.css"),
  source("../app/institutional.css"),
  source("../proxy.ts"),
  source("../app/api/admin/opc/route.ts"),
]);

test("per-request nonce CSP keeps document rendering dynamic", () => {
  assert.match(proxy, /'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.match(rootLayout, /export const dynamic = "force-dynamic"/);
});

test("CSP only allows the confirmed ranger media origin for remote images", () => {
  assert.match(proxy, /RANGER_MEDIA_ORIGIN/);
  assert.doesNotMatch(proxy, /imageSources \+= " https:"/);
});

test("public database reads use bounded cross-request caches", () => {
  for (const reader of [
    "getCachedPublicContent",
    "getCachedDirectRankingBoards",
    "getCachedSicContent",
    "getCachedPublishedServiceCatalog",
    "getCachedFrontierSnapshot",
    "getCachedFrontierRanking",
  ]) {
    assert.match(publicReadCache, new RegExp(`export const ${reader} = unstable_cache`));
  }
  assert.match(publicReadCache, /revalidate: 30/);
  assert.match(publicReadCache, /revalidate: 60/);
  assert.match(publicReadCache, /revalidate: 300/);
  assert.doesNotMatch(publicReadCache, /revalidate:\s*(?:0|false)/);
});

test("publishing the OPC catalog immediately expires its public cache", () => {
  assert.match(adminOpcRoute, /revalidateTag\(PUBLISHED_SERVICE_CATALOG_CACHE_TAG, \{ expire: 0 \}\)/);
});

test("the default PostgreSQL pool fits the 2C2G runtime baseline", () => {
  assert.match(stateDocumentStore, /VAULT2077_DATABASE_POOL_SIZE \?\? 4/);
  assert.match(environmentExample, /^VAULT2077_DATABASE_POOL_SIZE=4$/m);
});

test("systemd templates bound Node heaps and deprioritize background work", () => {
  assert.match(webService, /NODE_OPTIONS=--max-old-space-size=384/);
  assert.match(workerService, /NODE_OPTIONS=--max-old-space-size=512/);
  assert.match(frontierService, /NODE_OPTIONS=--max-old-space-size=384/);
  assert.match(rangerMediaCleanupService, /NODE_OPTIONS=--max-old-space-size=384/);
  assert.match(opcOrderMaintenanceService, /NODE_OPTIONS=--max-old-space-size=384/);
  for (const backgroundService of [workerService, frontierService, rangerMediaCleanupService, opcOrderMaintenanceService]) {
    assert.match(backgroundService, /^Nice=5$/m);
    assert.match(backgroundService, /^CPUWeight=50$/m);
  }
  for (const service of [webService, workerService, frontierService, rangerMediaCleanupService, opcOrderMaintenanceService]) {
    assert.match(service, /^RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK$/m);
  }
});

test("the production web service binds Next.js to the loopback interface", () => {
  assert.match(
    webService,
    /^ExecStart=\/opt\/node\/bin\/npm run start -- --hostname 127\.0\.0\.1$/m,
  );
});

test("the sticky site header avoids continuous backdrop recompositing", () => {
  for (const stylesheet of [globalStyles, institutionalStyles]) {
    const rule = /\.site-header\s*\{([^}]+)\}/.exec(stylesheet)?.[1] ?? "";
    assert.ok(rule, "site header rule must exist");
    assert.doesNotMatch(rule, /backdrop-filter/);
    assert.match(rule, /background:\s*var\(--paper\)/);
  }
});
