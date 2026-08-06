import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("OPC order endpoint enforces its public-write security boundary", async () => {
  const route = await readFile(path.join(root, "app", "api", "opc", "orders", "route.ts"), "utf8");

  assert.match(route, /x-vault2077-public-request/);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /VAULT2077_PUBLIC_ORIGIN/);
  assert.match(route, /maximumBodyBytes = 24_576/);
  assert.match(route, /Buffer\.byteLength\(raw, "utf8"\)/);
  assert.match(route, /withinDurableRateLimit\(`opc-orders:\$\{clientHash\}`, 6/);
  assert.match(route, /website/);
  assert.match(route, /agreementAccepted/);
  assert.match(route, /OpcOrderIdempotencyConflictError/);
  assert.match(route, /status: 409/);
});

test("OPC order endpoint trusts the published service snapshot, not client pricing", async () => {
  const route = await readFile(path.join(root, "app", "api", "opc", "orders", "route.ts"), "utf8");

  assert.match(route, /readPublishedServiceCatalog/);
  assert.match(route, /service\.status !== "[^"]+"/);
  assert.match(route, /serviceRevision: service\.revision/);
  assert.match(route, /quotedPrice: service\.price/);
  assert.match(route, /createOpcOrderLifecycle/);
  assert.match(route, /const signatureMethod = body\.signatureMethod/);
  assert.match(route, /signatureMethod !== "paper"/);
  assert.match(route, /signatureMethod,/);
  assert.match(route, /createOpcAlipayPaymentUrl/);
  assert.match(route, /agreementSha256/);
  assert.match(route, /serviceScope: service\.includes\.join/);
  assert.match(route, /serviceBoundary: service\.boundary/);
  assert.doesNotMatch(route, /createOpcEsignFlow|bindOpcSignatureFlow/);
  assert.doesNotMatch(route, /body\.(?:price|quotedPrice)/);
  assert.match(route, /expectedServiceRevision !== service\.revision/);
  assert.match(route, /expectedAgreementVersion !== agreement\.version/);
  assert.match(route, /expectedAgreementSha256 !== agreementSha256/);
  assert.match(route, /console\.error\("OPC paper order creation failed"/);
  assert.match(route, /error: "订单暂时无法创建，请稍后重试。"/);
  assert.doesNotMatch(route, /NextResponse\.json\(\{ error: message \}, \{ status \}\)/);
});

test("OPC Alipay notification verifies provider identity before marking an order paid", async () => {
  const notification = await readFile(path.join(root, "app", "api", "opc", "alipay", "notify", "route.ts"), "utf8");
  const payment = await readFile(path.join(root, "lib", "opc-payment-config.ts"), "utf8");
  const store = await readFile(path.join(root, "lib", "opc-order-store.ts"), "utf8");

  assert.match(notification, /application\/x-www-form-urlencoded/);
  assert.match(notification, /verifyOpcAlipayNotification/);
  assert.match(notification, /lifecycle\.applyPaymentEvidence/);
  assert.match(notification, /return textResponse\("success"\)/);
  assert.match(payment, /checkNotifySignV2\(notification\)/);
  assert.match(payment, /notification\.app_id !== configuration\.appId/);
  assert.match(payment, /notification\.seller_id !== configuration\.sellerId/);
  assert.match(payment, /OpcAlipayProviderError/);
  assert.doesNotMatch(payment, /subMsg|sub_msg|result\.msg/);
  const activeQuery = payment.slice(
    payment.indexOf("export async function queryOpcAlipayTrade"),
    payment.indexOf("export async function requestOpcAlipayFullRefund"),
  );
  assert.doesNotMatch(activeQuery, /\bsellerId: configuration\.sellerId/);
  assert.match(activeQuery, /configuredSellerId: configuration\.sellerId/);
  assert.match(activeQuery, /identitySource: "signed_application_query"/);
  assert.match(store, /order\.payment\.appId && input\.appId !== order\.payment\.appId/);
  assert.match(store, /input\.amount\.minorUnits !== order\.payment\.amount\.minorUnits/);
  assert.match(store, /evidenceSellerId !== order\.payment\.sellerId/);
  assert.match(store, /contractReady \? "paid" : "payment_exception"/);
  assert.match(store, /order\.signature\.archive\.status === "archived"/);
});

test("OPC order contacts remain encrypted outside the reauthenticated export", async () => {
  const store = await readFile(path.join(root, "lib", "opc-order-store.ts"), "utf8");
  const adminList = store.slice(
    store.indexOf("export async function listAdminOpcOrders"),
    store.indexOf("export async function getOpcPaymentReceipt"),
  );

  assert.match(store, /contactEncrypted: encryptSensitiveText\(JSON\.stringify\(input\.contact\)\)/);
  assert.match(store, /decryptSensitiveText\(order\.contactEncrypted\)/);
  assert.match(store, /retentionDays = order\.cancelledAt && !order\.paidAt \? 90 : 730/);
  assert.match(store, /runOpcOrderRetention/);
  assert.doesNotMatch(store, /store\.orders = store\.orders\.slice/);
  assert.match(adminList, /readStateDocument\(orderDocument\)/);
  assert.match(adminList, /contactAvailable/);
  assert.doesNotMatch(adminList, /decryptSensitiveText/);
  assert.doesNotMatch(adminList, /mutateStateDocument/);
});

test("OPC admin downloads require recent reauthentication, integrity checks, and auditing", async () => {
  const contractRoute = await readFile(path.join(root, "app", "api", "admin", "opc", "orders", "[id]", "contract", "route.ts"), "utf8");
  const contactRoute = await readFile(path.join(root, "app", "api", "admin", "opc", "orders", "[id]", "contact", "route.ts"), "utf8");
  for (const route of [contractRoute, contactRoute]) {
    assert.match(route, /authenticateAdminRequest/);
    assert.match(route, /hasRecentAdminReauthentication/);
    assert.match(route, /recordAuditEvent/);
    assert.match(route, /Cache-Control": "private, no-store"/);
  }
  assert.match(contractRoute, /createHash\("sha256"\)/);
  assert.match(contractRoute, /actualSha256 !== archive\.sha256/);
  assert.match(contactRoute, /\/\^\[=\+\\-@\]\//);
});

test("admin responses containing protected data are never cacheable", async () => {
  const access = await readFile(path.join(root, "lib", "admin-access.ts"), "utf8");
  const registration = await readFile(path.join(root, "app", "api", "admin", "passkey", "register", "verify", "route.ts"), "utf8");
  const recovery = await readFile(path.join(root, "app", "api", "admin", "passkey", "recover", "route.ts"), "utf8");

  assert.match(access, /response\.headers\.set\("Cache-Control", "private, no-store"\)/);
  assert.match(registration, /response\.headers\.set\("Cache-Control", "private, no-store"\)/);
  assert.match(recovery, /"Cache-Control": "private, no-store"/);
});
