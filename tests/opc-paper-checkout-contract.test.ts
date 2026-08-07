import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("paper checkout presents only the enabled paper path and a disabled electronic path", async () => {
  const [entry, agreement, route, store] = await Promise.all([
    readFile(path.join(root, "components", "opc-order-entry.tsx"), "utf8"),
    readFile(path.join(root, "lib", "opc-checkout-agreement.ts"), "utf8"),
    readFile(path.join(root, "app", "api", "opc", "orders", "route.ts"), "utf8"),
    readFile(path.join(root, "lib", "opc-orders", "model.ts"), "utf8"),
  ]);
  assert.match(entry, /<button type="button" disabled>电子签约<\/button>/);
  assert.match(entry, /<button type="button" aria-pressed="true">纸质签约<\/button>/);
  assert.doesNotMatch(entry, /筹备中|当前可用/);
  assert.match(entry, /paymentChannel/);
  assert.match(entry, /recipientName, deliveryPhone, province, city, district, addressLine/);
  assert.match(entry, /downloadOpcAgreement/);
  assert.match(entry, /serviceRevision: service\.revision/);
  assert.match(entry, /agreementSha256/);
  assert.match(entry, /aria-describedby/);
  assert.match(agreement, /服务尚未开始/);
  assert.match(agreement, /违约与责任/);
  assert.match(agreement, /法律适用与争议解决/);
  assert.match(agreement, /buildOpcPaperCheckoutAgreement/);
  assert.match(agreement, /提交订单时.*协议成立/);
  assert.match(agreement, /承运人首次揽收记录/);
  assert.match(route, /buildOpcPaperCheckoutAgreement/);
  assert.match(route, /text: agreement\.text/);
  assert.match(store, /text: string/);
});

test("payment receipt is server verified and downloads a PNG containing URL and ICP", async () => {
  const [route, component, image] = await Promise.all([
    readFile(path.join(root, "app", "api", "opc", "orders", "[reference]", "receipt", "route.ts"), "utf8"),
    readFile(path.join(root, "components", "opc-payment-receipt.tsx"), "utf8"),
    readFile(path.join(root, "lib", "opc-payment-receipt-image.ts"), "utf8"),
  ]);
  assert.match(route, /queryOpcAlipayTrade/);
  assert.match(route, /claimPublicPaymentQuery/);
  assert.match(route, /applyActivePaymentQuery/);
  assert.match(route, /readPaymentReceipt/);
  assert.match(route, /orderStatus/);
  assert.match(image, /canvas\.toBlob\(resolve, "image\/png"\)/);
  assert.doesNotMatch(image, /window\.location\.href/);
  assert.match(component, /receipt\.reference/);
  assert.match(component, /receipt\.paymentStatus/);
  assert.match(component, /canonicalOpcPaymentReceiptUrl/);
  assert.match(image, /canonicalOpcPaymentReceiptUrl/);
  assert.match(component, /receipt\.operator\.icpNumber/);
  assert.match(component, /本凭证不是发票/);
  assert.match(component, /orderStatusLabels/);
  assert.match(component, /Math\.min\(15_000, 3_000 \* attempts\)/);
});

test("paper order cancellation closes the bound Alipay trade before changing local state", async () => {
  const [route, payment, store, consoleSource] = await Promise.all([
    readFile(path.join(root, "app", "api", "admin", "opc", "orders", "[id]", "cancel", "route.ts"), "utf8"),
    readFile(path.join(root, "lib", "opc-payment-config.ts"), "utf8"),
    readFile(path.join(root, "lib", "opc-orders", "refund.ts"), "utf8"),
    readFile(path.join(root, "app", "admin", "admin-console.tsx"), "utf8"),
  ]);
  assert.match(route, /requireOpcAlipayConfiguration/);
  assert.match(route, /order\.payment\.appId !== configuration\.appId/);
  assert.match(route, /order\.payment\.sellerId !== configuration\.sellerId/);
  assert.match(route, /queryOpcAlipayTrade/);
  assert.match(route, /closeOpcAlipayTrade/);
  assert.match(route, /withPersistenceTransaction/);
  assert.match(route, /cancelAwaitingOpcOrderWithProviderEvidence/);
  assert.match(route, /expired_not_found/);
  assert.match(store, /kind: "provider_closed"/);
  assert.match(store, /kind: "expired_not_found"/);
  assert.match(route, /hasRecentAdminReauthentication/);
  assert.match(payment, /alipay\.trade\.close/);
  assert.match(payment, /ACQ\.TRADE_HAS_SUCCESS/);
  assert.match(consoleSource, /\/cancel/);
});

test("privacy policy discloses paper-order fields and actual retention periods", async () => {
  const privacy = await readFile(path.join(root, "app", "privacy", "page.tsx"), "utf8");
  assert.match(privacy, /统一社会信用代码/);
  assert.match(privacy, /法定代表人/);
  assert.match(privacy, /纸质合同收件人/);
  assert.match(privacy, /省、市、区和详细地址/);
  assert.match(privacy, /未付款取消满 90 天/);
  assert.match(privacy, /已付款订单完成或退款满 24 个月/);
});

test("administrator dossier and paper actions require reauthentication and auditing", async () => {
  const [routes, consoleSource] = await Promise.all([
    Promise.all(["dossier", "approve-contract", "refund"].map((name) =>
      readFile(path.join(root, "app", "api", "admin", "opc", "orders", "[id]", name, "route.ts"), "utf8"))),
    readFile(path.join(root, "app", "admin", "admin-console.tsx"), "utf8"),
  ]);
  for (const route of routes) {
    assert.match(route, /authenticateAdminRequest/);
    assert.match(route, /hasRecentAdminReauthentication/);
    assert.match(route, /recordAuditEvent/);
  }
  for (const route of routes.slice(1)) {
    assert.match(route, /authenticateAdminRequest\(request, \{ mutation: true \}\)/);
    assert.match(route, /withPersistenceTransaction/);
    assert.match(route, /expectedUpdatedAt/);
  }
  assert.match(routes[2], /requestOpcAlipayFullRefund/);
  assert.match(routes[2], /queryOpcAlipayRefund/);
  assert.match(routes[2], /confirmFullRefund/);
  assert.match(routes[0], /listAuditEventsForTarget/);
  assert.match(consoleSource, /auditTrail/);
  assert.match(consoleSource, /downloadOpcPaymentReceiptData/);
  assert.match(consoleSource, /body\?\.order\?\.status === "refunded"/);
  assert.match(consoleSource, /全额退款仍在处理中/);
});

test("generic administrator state updates cannot claim a refund succeeded", async () => {
  const route = await readFile(path.join(root, "app", "api", "admin", "content", "route.ts"), "utf8");
  assert.match(route, /\["cancelled", "completed"\]\.includes\(orderStatus\)/);
  assert.doesNotMatch(route, /\["cancelled", "completed", "refunded"\]/);
});

test("Alipay callbacks only persist the outbox event and a scheduled worker delivers it", async () => {
  const [callback, maintenance, service, timer, packageJson] = await Promise.all([
    readFile(path.join(root, "app", "api", "opc", "alipay", "notify", "route.ts"), "utf8"),
    readFile(path.join(root, "scripts", "run-opc-order-maintenance.ts"), "utf8"),
    readFile(path.join(root, "deploy", "systemd", "vault2077-opc-order-maintenance.service"), "utf8"),
    readFile(path.join(root, "deploy", "systemd", "vault2077-opc-order-maintenance.timer"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
  ]);
  assert.doesNotMatch(callback, /createOpcPaymentEmailSender|processOpcPaymentNotifications/);
  assert.match(maintenance, /processOpcPaymentNotifications/);
  assert.match(maintenance, /runOpcOrderRetention/);
  assert.match(service, /^OnFailure=vault2077-failure-notify@%n\.service$/m);
  assert.match(service, /npm run opc:maintain-orders/);
  assert.match(timer, /OnUnitActiveSec=60s/);
  assert.match(packageJson, /"opc:maintain-orders"/);
});
