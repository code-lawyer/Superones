import "server-only";

import { createPrivateKey, createPublicKey } from "node:crypto";
import { AlipaySdk } from "alipay-sdk";

export type OpcAlipayChannel = "page" | "wap";
export type OpcAlipayMode = OpcAlipayChannel | "both";

export type OpcAlipayConfiguration = {
  appId: string;
  sellerId: string;
  privateKey: string;
  alipayPublicKey: string;
  gateway: string;
  endpoint: string;
  keyType: "PKCS1" | "PKCS8";
  mode: OpcAlipayMode;
  publicOrigin: string;
};

export type OpcAlipayPaymentOrder = {
  reference: string;
  serviceCode: string;
  serviceName: string;
  serviceRevision: string;
  alipayAmount: string;
};

export type OpcAlipayNotification = {
  reference: string;
  tradeNo: string;
  tradeStatus: "TRADE_SUCCESS" | "TRADE_FINISHED";
  totalAmount: string;
};

export type OpcAlipayQueryResult = {
  found: boolean;
  reference: string;
  tradeNo: string | null;
  tradeStatus: string | null;
  totalAmount: string | null;
};

const productionGateway = "https://openapi.alipay.com/gateway.do";
const sandboxGateway = "https://openapi-sandbox.dl.alipaydev.com/gateway.do";
const allowedGateways = new Set([productionGateway, sandboxGateway]);

function cleanSecret(value: string | undefined) {
  return (value ?? "").trim().replaceAll("\\n", "\n");
}

function alipayEnvironment(
  environment: Record<string, string | undefined>,
): OpcAlipayConfiguration {
  const gateway = environment.VAULT2077_ALIPAY_GATEWAY?.trim() ?? "";
  const gatewayUrl = new URL(gateway);
  const publicOriginUrl = new URL(environment.VAULT2077_PUBLIC_ORIGIN?.trim() ?? "");
  const mode = environment.VAULT2077_ALIPAY_WEB_PAYMENT_MODE?.trim() as OpcAlipayMode;
  const keyType = environment.VAULT2077_ALIPAY_KEY_TYPE?.trim() as "PKCS1" | "PKCS8";
  const configuration: OpcAlipayConfiguration = {
    appId: environment.VAULT2077_ALIPAY_APP_ID?.trim() ?? "",
    sellerId: environment.VAULT2077_ALIPAY_SELLER_ID?.trim() ?? "",
    privateKey: cleanSecret(environment.VAULT2077_ALIPAY_PRIVATE_KEY),
    alipayPublicKey: cleanSecret(environment.VAULT2077_ALIPAY_PUBLIC_KEY),
    gateway: gatewayUrl.toString(),
    endpoint: gatewayUrl.origin,
    keyType,
    mode,
    publicOrigin: publicOriginUrl.origin,
  };

  if (!/^\d{16,32}$/.test(configuration.appId)) throw new Error("支付宝应用 ID 格式无效。");
  if (!/^\d{16,32}$/.test(configuration.sellerId)) throw new Error("支付宝商户 PID 格式无效。");
  if (!allowedGateways.has(configuration.gateway)) throw new Error("支付宝网关必须使用官方生产或沙箱地址。");
  if (publicOriginUrl.protocol !== "https:" || publicOriginUrl.origin !== publicOriginUrl.toString().replace(/\/$/, "")) {
    throw new Error("支付宝通知所用公开地址必须是不带路径的 HTTPS origin。");
  }
  if (!["page", "wap", "both"].includes(configuration.mode)) {
    throw new Error("支付宝网页支付模式必须是 page、wap 或 both。");
  }
  if (!["PKCS1", "PKCS8"].includes(configuration.keyType)) {
    throw new Error("支付宝应用私钥格式必须明确为 PKCS1 或 PKCS8。");
  }
  if (!configuration.privateKey || !configuration.alipayPublicKey) {
    throw new Error("支付宝应用私钥和支付宝公钥必须完整配置。");
  }

  const sdk = createAlipaySdk(configuration);
  createPrivateKey(sdk.config.privateKey);
  createPublicKey(sdk.config.alipayPublicKey);
  return configuration;
}

export function opcAlipayConfigurationErrors(
  environment: Record<string, string | undefined> = process.env,
) {
  try {
    alipayEnvironment(environment);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : "支付宝开放平台配置无效。"];
  }
}

export function readOpcAlipayConfiguration(
  environment: Record<string, string | undefined> = process.env,
) {
  try {
    return alipayEnvironment(environment);
  } catch {
    return null;
  }
}

function createAlipaySdk(configuration: OpcAlipayConfiguration) {
  return new AlipaySdk({
    appId: configuration.appId,
    privateKey: configuration.privateKey,
    alipayPublicKey: configuration.alipayPublicKey,
    gateway: configuration.gateway,
    endpoint: configuration.endpoint,
    keyType: configuration.keyType,
    signType: "RSA2",
    timeout: 8_000,
    camelcase: true,
  });
}

export function opcOrderingAvailable(
  environment: Record<string, string | undefined> = process.env,
) {
  return readOpcAlipayConfiguration(environment) !== null;
}

export function requireOpcAlipayConfiguration() {
  const configuration = readOpcAlipayConfiguration();
  if (!configuration) {
    throw new Error("支付宝开放平台尚未完成生产配置，当前不能创建支付订单。");
  }
  return configuration;
}

export function catalogPriceToAlipayAmount(value: string) {
  const match = /^人民币\s*([\d,]+(?:\.\d{1,2})?)\s*元$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  return amount.toFixed(2);
}

export function selectOpcAlipayChannel(
  requested: unknown,
  configuration: OpcAlipayConfiguration,
): OpcAlipayChannel {
  if (configuration.mode === "both") return requested === "wap" ? "wap" : "page";
  return configuration.mode;
}

export function createOpcAlipayPaymentUrl(
  order: OpcAlipayPaymentOrder,
  channel: OpcAlipayChannel,
  configuration = requireOpcAlipayConfiguration(),
) {
  if (configuration.mode !== "both" && configuration.mode !== channel) {
    throw new Error("当前支付宝应用未开通所请求的网页支付模式。");
  }
  const method = channel === "wap" ? "alipay.trade.wap.pay" : "alipay.trade.page.pay";
  const productCode = channel === "wap" ? "QUICK_WAP_WAY" : "FAST_INSTANT_TRADE_PAY";
  const sdk = createAlipaySdk(configuration);
  const paymentUrl = sdk.pageExecute(method, "GET", {
    notifyUrl: `${configuration.publicOrigin}/api/opc/alipay/notify`,
    returnUrl: `${configuration.publicOrigin}/opc/payment/return?order=${encodeURIComponent(order.reference)}`,
    bizContent: {
      out_trade_no: order.reference,
      product_code: productCode,
      subject: `Vault2077 OPC｜${order.serviceName}`.slice(0, 256),
      body: `${order.serviceCode} · ${order.serviceRevision}`.slice(0, 128),
      total_amount: order.alipayAmount,
      timeout_express: "30m",
    },
  });
  const parsed = new URL(paymentUrl);
  if (parsed.origin !== new URL(configuration.gateway).origin) {
    throw new Error("支付宝支付地址未通过官方网关校验。");
  }
  return paymentUrl;
}

export function verifyOpcAlipayNotification(
  notification: Record<string, string>,
  configuration = requireOpcAlipayConfiguration(),
): OpcAlipayNotification {
  const sdk = createAlipaySdk(configuration);
  if (!sdk.checkNotifySignV2(notification)) throw new Error("支付宝异步通知验签失败。");
  if (notification.app_id !== configuration.appId) throw new Error("支付宝异步通知应用 ID 不匹配。");
  if (notification.seller_id !== configuration.sellerId) throw new Error("支付宝异步通知商户 PID 不匹配。");
  if (notification.trade_status !== "TRADE_SUCCESS" && notification.trade_status !== "TRADE_FINISHED") {
    throw new Error("支付宝异步通知不是已支付状态。");
  }
  if (!/^OPC-\d{8}-[0-9A-F]{12}$/.test(notification.out_trade_no ?? "")) {
    throw new Error("支付宝异步通知订单号无效。");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(notification.total_amount ?? "")) {
    throw new Error("支付宝异步通知金额无效。");
  }
  if (!/^\d{16,64}$/.test(notification.trade_no ?? "")) {
    throw new Error("支付宝交易号无效。");
  }
  return {
    reference: notification.out_trade_no,
    tradeNo: notification.trade_no,
    tradeStatus: notification.trade_status,
    totalAmount: Number(notification.total_amount).toFixed(2),
  };
}

export async function queryOpcAlipayTrade(
  reference: string,
  configuration = requireOpcAlipayConfiguration(),
): Promise<OpcAlipayQueryResult> {
  const sdk = createAlipaySdk(configuration);
  const result = await sdk.exec("alipay.trade.query", {
    bizContent: { out_trade_no: reference },
  }, { validateSign: true });
  if (result.code !== "10000") {
    if (result.subCode === "ACQ.TRADE_NOT_EXIST" || result.sub_code === "ACQ.TRADE_NOT_EXIST") {
      return { found: false, reference, tradeNo: null, tradeStatus: null, totalAmount: null };
    }
    throw new Error(`支付宝交易查询失败：${result.subMsg ?? result.sub_msg ?? result.msg ?? "未知错误"}`);
  }
  const resultReference = String(result.outTradeNo ?? result.out_trade_no ?? "");
  const tradeNo = String(result.tradeNo ?? result.trade_no ?? "") || null;
  const tradeStatus = String(result.tradeStatus ?? result.trade_status ?? "") || null;
  const rawTotalAmount = result.totalAmount ?? result.total_amount;
  const totalAmount = rawTotalAmount === undefined || rawTotalAmount === null
    ? null
    : Number(rawTotalAmount).toFixed(2);
  if (resultReference !== reference) {
    throw new Error("支付宝交易查询返回的商户订单号不匹配。");
  }
  if (
    (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED")
    && (!tradeNo || !totalAmount)
  ) {
    throw new Error("支付宝已支付交易查询结果缺少交易号或金额。");
  }
  return {
    found: true,
    reference: resultReference,
    tradeNo,
    tradeStatus,
    totalAmount,
  };
}
