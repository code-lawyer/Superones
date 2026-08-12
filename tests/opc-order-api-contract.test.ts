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
  assert.match(route, /readBoundedJsonBody\(request, maximumBodyBytes\)/);
  assert.doesNotMatch(route, /request\.text\(\)/);
  assert.match(route, /withinDurableRateLimit\(`opc-orders:\$\{clientHash\}`, 6/);
  assert.match(route, /website/);
  assert.match(route, /agreementAccepted/);
  assert.match(route, /identityConsentAccepted/);
  assert.match(route, /isValidPrcIdentityCard/);
  assert.match(route, /identityDocumentNumber/);
  assert.match(route, /OpcOrderIdempotencyConflictError/);
  assert.match(route, /status: 409/);
});

test("OPC offline order endpoint trusts published service and payment-profile snapshots, not client pricing", async () => {
  const route = await readFile(path.join(root, "app", "api", "opc", "orders", "route.ts"), "utf8");

  assert.match(route, /readPublishedServiceCatalog/);
  assert.match(route, /service\.status !== "[^"]+"/);
  assert.match(route, /serviceRevision: service\.revision/);
  assert.match(route, /quotedPrice: service\.price/);
  assert.match(route, /readPublishedOpcOfflinePaymentProfile/);
  assert.match(route, /createOpcOrder/);
  assert.match(route, /const signatureMethod = body\.signatureMethod/);
  assert.match(route, /signatureMethod !== "online"/);
  assert.match(route, /paymentMethod !== "offline_bank_transfer"/);
  assert.match(route, /paymentProvider: "bank_transfer"/);
  assert.match(route, /expectedProfileRevision !== profile\.revision/);
  assert.match(route, /offlinePaymentSnapshot/);
  assert.match(route, /agreementSha256/);
  assert.match(route, /serviceScope: service\.includes\.join/);
  assert.match(route, /serviceBoundary: service\.boundary/);
  assert.doesNotMatch(route, /createOpcEsignFlow|bindOpcSignatureFlow|createOpcAlipayPaymentUrl/);
  assert.doesNotMatch(route, /body\.(?:price|quotedPrice)/);
  assert.match(route, /expectedServiceRevision !== service\.revision/);
  assert.match(route, /expectedAgreementVersion !== agreement\.version/);
  assert.match(route, /expectedAgreementSha256 !== agreementSha256/);
  assert.match(route, /console\.error\("OPC offline order creation failed"/);
  assert.match(route, /error: "线下付款单暂时无法创建，请稍后重试。"/);
  assert.doesNotMatch(route, /NextResponse\.json\(\{ error: message \}, \{ status \}\)/);
});

test("OPC offline page shows company account, agreement, and contact QR together before transfer", async () => {
  const [page, entry] = await Promise.all([
    readFile(path.join(root, "app", "opc", "order", "page.tsx"), "utf8"),
    readFile(path.join(root, "components", "opc-order-entry.tsx"), "utf8"),
  ]);

  assert.match(page, /readPublishedOpcOfflinePaymentProfile/);
  assert.match(page, /paymentProfile=\{paymentProfile\}/);
  assert.match(entry, /企业收款账户/);
  assert.match(entry, /点击查看协议/);
  assert.match(entry, /下载 PDF/);
  assert.match(entry, /联系人二维码/);
  assert.match(entry, /线上付款 · 暂未开放/);
  assert.match(entry, /线下付款 · 对公转账/);
  assert.match(entry, /className="opc-agreement-modal__body" role="region" tabIndex=\{0\} aria-label="协议正文与 PDF 预览"/);
  assert.match(entry, /paymentMethod: "offline_bank_transfer"/);
  assert.doesNotMatch(entry, /recipientName|deliveryPhone|addressLine|window\.location\.assign/);
});

test("the public edge permits only the agreement PDF to render in a same-origin frame", async () => {
  const nginx = await readFile(path.join(root, "deploy", "nginx", "vault2077.conf.example"), "utf8");
  const agreementLocation = nginx.slice(
    nginx.indexOf("location = /api/opc/offline-payment/assets/agreement"),
    nginx.indexOf("location / {"),
  );
  assert.match(agreementLocation, /proxy_hide_header X-Frame-Options/);
  assert.match(agreementLocation, /add_header X-Frame-Options "SAMEORIGIN" always/);
  assert.doesNotMatch(agreementLocation, /frame-ancestors \*/);
});

test("OPC Alipay notification verifies provider identity before marking an order paid", async () => {
  const notification = await readFile(path.join(root, "app", "api", "opc", "alipay", "notify", "route.ts"), "utf8");
  const payment = await readFile(path.join(root, "lib", "opc-payment-config.ts"), "utf8");
  const store = await readFile(path.join(root, "lib", "opc-orders", "payment.ts"), "utf8");

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
  const [checkout, internalStore, admin] = await Promise.all([
    readFile(path.join(root, "lib", "opc-orders", "checkout.ts"), "utf8"),
    readFile(path.join(root, "lib", "opc-orders", "internal-store.ts"), "utf8"),
    readFile(path.join(root, "lib", "opc-orders", "admin.ts"), "utf8"),
  ]);
  const adminList = admin.slice(
    admin.indexOf("export async function listAdminOpcOrders"),
    admin.indexOf("export async function getAdminOpcOrderDossier"),
  );

  assert.match(checkout, /contactEncrypted: encryptSensitiveText\(JSON\.stringify\(input\.contact\)\)/);
  assert.match(internalStore, /decryptSensitiveText\(order\.contactEncrypted\)/);
  assert.match(internalStore, /retentionDays = order\.cancelledAt && !order\.paidAt \? 90 : 730/);
  assert.match(admin, /runOpcOrderRetention/);
  assert.doesNotMatch(internalStore, /store\.orders = store\.orders\.slice/);
  assert.match(adminList, /readOpcOrderStore\(\)/);
  assert.match(adminList, /contactAvailable/);
  assert.doesNotMatch(adminList, /decryptSensitiveText/);
  assert.match(adminList, /payerNameEncrypted: _payerNameEncrypted/);
  assert.doesNotMatch(adminList, /mutateOpcOrderStore/);
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

test("OPC bank-transfer verification requires reauthentication, exact evidence, and auditing", async () => {
  const route = await readFile(path.join(root, "app", "api", "admin", "opc", "orders", "[id]", "verify-bank-transfer", "route.ts"), "utf8");
  const payment = await readFile(path.join(root, "lib", "opc-orders", "payment.ts"), "utf8");
  const adminConsole = await readFile(path.join(root, "app", "admin", "admin-console.tsx"), "utf8");
  const bankVerificationBehavior = adminConsole.slice(
    adminConsole.indexOf("function openBankVerification"),
    adminConsole.indexOf("async function reconcileOpcSignature"),
  );
  const bankVerificationUi = adminConsole.slice(
    adminConsole.indexOf("<form id={`bank-verification-"),
    adminConsole.indexOf("function OpcDossierView"),
  );

  assert.match(route, /authenticateAdminRequest/);
  assert.match(route, /hasRecentAdminReauthentication/);
  assert.match(route, /withPersistenceTransaction/);
  assert.match(route, /recordAuditEvent/);
  assert.match(route, /bankTransactionId/);
  assert.match(route, /body\.evidenceConfirmed !== true/);
  assert.match(route, /transactionFingerprint/);
  assert.doesNotMatch(route, /diff:\s*\{[\s\S]*?payerName/);
  assert.match(payment, /order\.payment\.provider !== "bank_transfer"/);
  assert.match(payment, /amount\.minorUnits !== order\.payment\.amount\.minorUnits/);
  assert.match(payment, /candidate\.payment\.tradeNo === transactionId/);
  assert.match(payment, /payerNameEncrypted = encryptSensitiveText/);
  assert.match(bankVerificationUi, /type="datetime-local"/);
  assert.match(bankVerificationUi, /银行流水号/);
  assert.match(bankVerificationUi, /付款户名/);
  assert.match(bankVerificationUi, /我已逐项核对企业银行实际入账记录/);
  assert.match(bankVerificationBehavior, /evidenceConfirmed: true/);
  assert.match(bankVerificationUi, /className="admin-bank-verification"/);
  assert.doesNotMatch(bankVerificationBehavior, /window\.prompt/);
});

test("OPC unpaid bank-transfer cancellation uses its own evidence-safe branch", async () => {
  const route = await readFile(path.join(root, "app", "api", "admin", "opc", "orders", "[id]", "cancel", "route.ts"), "utf8");
  assert.match(route, /order\.payment\.provider === "bank_transfer"/);
  assert.match(route, /cancelAwaitingOpcBankTransferOrder/);
  assert.match(route, /withPersistenceTransaction/);
  assert.match(route, /recordAuditEvent/);
});

test("OPC refund applications require the original order credential and remain private", async () => {
  const [route, page, component, footer] = await Promise.all([
    readFile(path.join(root, "app", "api", "opc", "refund-requests", "route.ts"), "utf8"),
    readFile(path.join(root, "app", "opc", "refund", "page.tsx"), "utf8"),
    readFile(path.join(root, "components", "opc-refund-request.tsx"), "utf8"),
    readFile(path.join(root, "components", "site-footer.tsx"), "utf8"),
  ]);
  assert.match(footer, /href="\/opc\/refund"/);
  assert.match(route, /x-vault2077-public-request/);
  assert.match(route, /readBoundedJsonBody/);
  assert.match(route, /vault2077_opc_resume/);
  assert.match(route, /Cache-Control", "private, no-store"/);
  assert.match(route, /lookupOpcRefundApplication/);
  assert.match(route, /requestOpcRefundApplication/);
  assert.match(component, /vault2077:opc:resume:/);
  assert.match(component, /AbortController/);
  assert.match(component, /refundRequestTimeoutMs = 20_000/);
  assert.match(component, /提交申请不等于退款完成/);
  assert.match(page, /OpcRefundRequest/);
  assert.doesNotMatch(component, /identityDocumentNumber|bankAccount|payerName/);
});

test("admin responses containing protected data are never cacheable", async () => {
  const access = await readFile(path.join(root, "lib", "admin-access.ts"), "utf8");
  const registration = await readFile(path.join(root, "app", "api", "admin", "passkey", "register", "verify", "route.ts"), "utf8");
  const recovery = await readFile(path.join(root, "app", "api", "admin", "passkey", "recover", "route.ts"), "utf8");

  assert.match(access, /response\.headers\.set\("Cache-Control", "private, no-store"\)/);
  assert.match(registration, /response\.headers\.set\("Cache-Control", "private, no-store"\)/);
  assert.match(recovery, /"Cache-Control": "private, no-store"/);
});
