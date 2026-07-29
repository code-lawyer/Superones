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
  assert.match(route, /maximumBodyBytes = 16_384/);
  assert.match(route, /Buffer\.byteLength\(raw, "utf8"\)/);
  assert.match(route, /withinDurableRateLimit\(`opc-orders:\$\{clientHash\}`, 6/);
  assert.match(route, /website/);
  assert.match(route, /consent/);
});

test("OPC order endpoint trusts the published service snapshot, not client pricing", async () => {
  const route = await readFile(path.join(root, "app", "api", "opc", "orders", "route.ts"), "utf8");

  assert.match(route, /readPublishedServiceCatalog/);
  assert.match(route, /service\.status !== "公开服务"/);
  assert.match(route, /serviceRevision: service\.revision/);
  assert.match(route, /quotedPrice: service\.price/);
  assert.match(route, /createOpcAlipayPaymentUrl\(paymentOrder, paymentChannel, paymentConfiguration\)/);
  assert.match(route, /recordOpcPaymentRequest\(order\.reference, paymentChannel\)/);
  assert.doesNotMatch(route, /body\.(?:price|quotedPrice|serviceRevision)/);
  assert.match(route, /console\.error\("OPC order creation failed", error\)/);
  assert.match(route, /error: "订单暂时无法创建，请稍后重试。"/);
  assert.doesNotMatch(route, /NextResponse\.json\(\{ error: message \}, \{ status \}\)/);
});

test("OPC Alipay notification verifies provider identity before marking an order paid", async () => {
  const notification = await readFile(path.join(root, "app", "api", "opc", "alipay", "notify", "route.ts"), "utf8");
  const payment = await readFile(path.join(root, "lib", "opc-payment-config.ts"), "utf8");
  const store = await readFile(path.join(root, "lib", "opc-order-store.ts"), "utf8");

  assert.match(notification, /application\/x-www-form-urlencoded/);
  assert.match(notification, /verifyOpcAlipayNotification/);
  assert.match(notification, /applyOpcAlipayTradeResult/);
  assert.match(notification, /return textResponse\("success"\)/);
  assert.match(payment, /checkNotifySignV2\(notification\)/);
  assert.match(payment, /notification\.app_id !== configuration\.appId/);
  assert.match(payment, /notification\.seller_id !== configuration\.sellerId/);
  assert.match(store, /input\.totalAmount !== order\.alipayAmount/);
  assert.match(store, /order\.status = "paid"/);
});

test("OPC order contacts remain encrypted outside the protected admin projection", async () => {
  const store = await readFile(path.join(root, "lib", "opc-order-store.ts"), "utf8");

  assert.match(store, /contactEncrypted: encryptSensitiveText\(JSON\.stringify\(input\.contact\)\)/);
  assert.match(store, /decryptSensitiveText\(order\.contactEncrypted\)/);
  assert.match(store, /730 \* 24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(store, /store\.orders = store\.orders\.slice/);
});
