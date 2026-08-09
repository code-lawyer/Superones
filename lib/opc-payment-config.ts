import "server-only";

import { createPrivateKey, createPublicKey } from "node:crypto";
import { AlipaySdk } from "alipay-sdk";

export type OpcAlipayChannel = "page" | "wap";
export type OpcAlipayMode = OpcAlipayChannel | "both";

export type OpcAlipayAmount = {
  currency: "CNY";
  minorUnits: number;
  decimal: string;
};

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
  paymentAmount: OpcAlipayAmount;
};

export type OpcAlipayNotification = {
  reference: string;
  appId: string;
  sellerId: string;
  tradeNo: string;
  tradeStatus: "TRADE_SUCCESS" | "TRADE_FINISHED";
  amount: OpcAlipayAmount;
};

export type OpcAlipayQueryResult = {
  found: boolean;
  reference: string;
  appId: string;
  configuredSellerId: string;
  identitySource: "signed_application_query";
  tradeNo: string | null;
  tradeStatus: string | null;
  amount: OpcAlipayAmount | null;
};

export type OpcAlipayCloseResult = {
  status: "closed" | "paid" | "not_found";
  reference: string;
};

export type OpcAlipayRefundRequest = {
  reference: string;
  tradeNo: string;
  refundRequestNo: string;
  reason: string;
  amount: OpcAlipayAmount;
};

export type OpcAlipayRefundResult = {
  status: "succeeded" | "processing" | "not_found";
  reference: string;
  refundRequestNo: string;
  amount: OpcAlipayAmount;
};

export class OpcAlipayProviderError extends Error {
  readonly code = "OPC_ALIPAY_QUERY_FAILED";

  constructor() {
    super("暂时无法获取付款状态，请稍后安全重试。");
    this.name = "OpcAlipayProviderError";
  }
}

const productionGateway = "https://openapi.alipay.com/gateway.do";
const sandboxGateway = "https://openapi-sandbox.dl.alipaydev.com/gateway.do";
const allowedGateways = new Set([productionGateway, sandboxGateway]);

function cleanSecret(value: string | undefined) {
  return (value ?? "").trim().replaceAll("\\n", "\n");
}

function alipayEnvironment(
  environment: Record<string, string | undefined>,
  options: { productionGatewayOnly?: boolean } = {},
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
  if (options.productionGatewayOnly && configuration.gateway !== productionGateway) {
    throw new Error("生产环境必须使用支付宝正式网关，不能使用沙箱网关。");
  }
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
  options: { productionGatewayOnly?: boolean } = {},
) {
  try {
    alipayEnvironment(environment, {
      productionGatewayOnly: options.productionGatewayOnly ?? environment.NODE_ENV === "production",
    });
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : "支付宝开放平台配置无效。"];
  }
}

export function readOpcAlipayConfiguration(
  environment: Record<string, string | undefined> = process.env,
) {
  try {
    return alipayEnvironment(environment, {
      productionGatewayOnly: environment.NODE_ENV === "production",
    });
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
  const enabled = environment.NODE_ENV === "production"
    ? environment.VAULT2077_OPC_PAYMENTS_ENABLED === "true"
    : environment.VAULT2077_OPC_PAYMENTS_ENABLED !== "false";
  return enabled && readOpcAlipayConfiguration(environment) !== null;
}

export function requireOpcAlipayConfiguration() {
  const enabled = process.env.NODE_ENV === "production"
    ? process.env.VAULT2077_OPC_PAYMENTS_ENABLED === "true"
    : process.env.VAULT2077_OPC_PAYMENTS_ENABLED !== "false";
  if (!enabled) {
    throw new Error("OPC 在线付款当前未开放。");
  }
  const configuration = readOpcAlipayConfiguration();
  if (!configuration) {
    throw new Error("支付宝开放平台尚未完成生产配置，当前不能创建支付订单。");
  }
  return configuration;
}

export function alipayDecimalToAmount(value: string): OpcAlipayAmount | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const wholeUnits = Number(match[1]);
  const fractionalUnits = Number((match[2] ?? "").padEnd(2, "0"));
  const minorUnits = wholeUnits * 100 + fractionalUnits;
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0 || minorUnits > 100_000_000) return null;
  return {
    currency: "CNY",
    minorUnits,
    decimal: `${wholeUnits}.${String(fractionalUnits).padStart(2, "0")}`,
  };
}

export function catalogPriceToAlipayAmount(value: string) {
  const match = /^人民币\s*([\d,]+(?:\.\d{1,2})?)\s*元(?:\/(?:年|月))?$/.exec(value.trim());
  return match ? alipayDecimalToAmount(match[1].replaceAll(",", "")) : null;
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
  const expiresAt = new Date(Date.now() + 30 * 60 * 1_000);
  const timeParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(expiresAt).map((part) => [part.type, part.value]));
  const sdk = createAlipaySdk(configuration);
  const paymentUrl = sdk.pageExecute(method, "GET", {
    notifyUrl: `${configuration.publicOrigin}/api/opc/alipay/notify`,
    returnUrl: `${configuration.publicOrigin}/opc/payment/return?order=${encodeURIComponent(order.reference)}`,
    bizContent: {
      out_trade_no: order.reference,
      product_code: productCode,
      seller_id: configuration.sellerId,
      subject: `Vault2077 OPC｜${order.serviceName}`.slice(0, 256),
      body: `${order.serviceCode} · ${order.serviceRevision}`.slice(0, 128),
      total_amount: order.paymentAmount.decimal,
      timeout_express: "30m",
      time_expire: `${timeParts.year}-${timeParts.month}-${timeParts.day} ${timeParts.hour}:${timeParts.minute}:00`,
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
  const amount = alipayDecimalToAmount(notification.total_amount ?? "");
  if (!amount) {
    throw new Error("支付宝异步通知金额无效。");
  }
  if (!/^\d{16,64}$/.test(notification.trade_no ?? "")) {
    throw new Error("支付宝交易号无效。");
  }
  return {
    reference: notification.out_trade_no,
    appId: notification.app_id,
    sellerId: notification.seller_id,
    tradeNo: notification.trade_no,
    tradeStatus: notification.trade_status,
    amount,
  };
}

export async function queryOpcAlipayTrade(
  reference: string,
  configuration = requireOpcAlipayConfiguration(),
): Promise<OpcAlipayQueryResult> {
  const sdk = createAlipaySdk(configuration);
  const result = await sdk.exec("alipay.trade.query", {
    bizContent: { out_trade_no: reference },
  }, { validateSign: true }).catch((error: unknown) => {
    console.error("OPC Alipay trade query request failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    throw new OpcAlipayProviderError();
  });
  if (result.code !== "10000") {
    if (result.subCode === "ACQ.TRADE_NOT_EXIST" || result.sub_code === "ACQ.TRADE_NOT_EXIST") {
      return {
        found: false,
        reference,
        appId: configuration.appId,
        configuredSellerId: configuration.sellerId,
        identitySource: "signed_application_query",
        tradeNo: null,
        tradeStatus: null,
        amount: null,
      };
    }
    console.error("OPC Alipay trade query failed", {
      code: result.code ?? "UNKNOWN",
      subCode: result.subCode ?? result.sub_code ?? "UNKNOWN",
    });
    throw new OpcAlipayProviderError();
  }
  const resultReference = String(result.outTradeNo ?? result.out_trade_no ?? "");
  const tradeNo = String(result.tradeNo ?? result.trade_no ?? "") || null;
  const tradeStatus = String(result.tradeStatus ?? result.trade_status ?? "") || null;
  const rawTotalAmount = result.totalAmount ?? result.total_amount;
  const amount = rawTotalAmount === undefined || rawTotalAmount === null
    ? null
    : alipayDecimalToAmount(String(rawTotalAmount));
  if (resultReference !== reference) {
    throw new Error("支付宝交易查询返回的商户订单号不匹配。");
  }
  if (
    (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED")
    && (!tradeNo || !amount)
  ) {
    throw new Error("支付宝已支付交易查询结果缺少交易号或金额。");
  }
  return {
    found: true,
    reference: resultReference,
    appId: configuration.appId,
    configuredSellerId: configuration.sellerId,
    identitySource: "signed_application_query",
    tradeNo,
    tradeStatus,
    amount,
  };
}

export async function closeOpcAlipayTrade(
  reference: string,
  configuration = requireOpcAlipayConfiguration(),
): Promise<OpcAlipayCloseResult> {
  if (!/^OPC-\d{8}-[0-9A-F]{12}$/.test(reference)) throw new Error("OPC 支付宝关单订单号无效。");
  const sdk = createAlipaySdk(configuration);
  const result = await sdk.exec("alipay.trade.close", {
    bizContent: { out_trade_no: reference },
  }, { validateSign: true }).catch((error: unknown) => {
    console.error("OPC Alipay trade close request failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    throw new OpcAlipayProviderError();
  });
  if (result.code === "10000") {
    const resultReference = String(result.outTradeNo ?? result.out_trade_no ?? reference);
    if (resultReference !== reference) throw new Error("支付宝关单返回的商户订单号不匹配。");
    return { status: "closed", reference };
  }
  const subCode = String(result.subCode ?? result.sub_code ?? "");
  if (subCode === "ACQ.TRADE_HAS_SUCCESS") return { status: "paid", reference };
  if (subCode === "ACQ.TRADE_NOT_EXIST") return { status: "not_found", reference };
  console.error("OPC Alipay trade close rejected", {
    code: result.code ?? "UNKNOWN",
    subCode: subCode || "UNKNOWN",
  });
  throw new OpcAlipayProviderError();
}

export async function requestOpcAlipayFullRefund(
  request: OpcAlipayRefundRequest,
  configuration = requireOpcAlipayConfiguration(),
): Promise<OpcAlipayRefundResult> {
  if (!/^OPC-\d{8}-[0-9A-F]{12}$/.test(request.reference)) throw new Error("OPC 退款订单号无效。");
  if (!/^\d{16,64}$/.test(request.tradeNo)) throw new Error("支付宝退款交易号无效。");
  if (!/^RF-[A-Z0-9]{10,40}$/.test(request.refundRequestNo)) throw new Error("支付宝退款请求号无效。");
  const sdk = createAlipaySdk(configuration);
  const result = await sdk.exec("alipay.trade.refund", {
    bizContent: {
      out_trade_no: request.reference,
      trade_no: request.tradeNo,
      refund_amount: request.amount.decimal,
      out_request_no: request.refundRequestNo,
      refund_reason: request.reason.slice(0, 256),
    },
  }, { validateSign: true }).catch((error: unknown) => {
    console.error("OPC Alipay refund request failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    throw new OpcAlipayProviderError();
  });
  if (result.code !== "10000") {
    console.error("OPC Alipay refund rejected", {
      code: result.code ?? "UNKNOWN",
      subCode: result.subCode ?? result.sub_code ?? "UNKNOWN",
    });
    throw new OpcAlipayProviderError();
  }
  const refundAmount = alipayDecimalToAmount(String(result.refundFee ?? result.refund_fee ?? ""));
  if (!refundAmount || refundAmount.minorUnits !== request.amount.minorUnits) {
    throw new Error("支付宝退款响应金额与订单全额不一致。");
  }
  return {
    status: String(result.fundChange ?? result.fund_change ?? "").toUpperCase() === "Y"
      ? "succeeded"
      : "processing",
    reference: request.reference,
    refundRequestNo: request.refundRequestNo,
    amount: refundAmount,
  };
}

export async function queryOpcAlipayRefund(
  request: Pick<OpcAlipayRefundRequest, "reference" | "tradeNo" | "refundRequestNo" | "amount">,
  configuration = requireOpcAlipayConfiguration(),
): Promise<OpcAlipayRefundResult> {
  const sdk = createAlipaySdk(configuration);
  const result = await sdk.exec("alipay.trade.fastpay.refund.query", {
    bizContent: {
      out_trade_no: request.reference,
      out_request_no: request.refundRequestNo,
    },
  }, { validateSign: true }).catch((error: unknown) => {
    console.error("OPC Alipay refund query failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    throw new OpcAlipayProviderError();
  });
  if (result.code !== "10000") {
    const subCode = String(result.subCode ?? result.sub_code ?? "");
    console.error("OPC Alipay refund query rejected", {
      code: result.code ?? "UNKNOWN",
      subCode: subCode || "UNKNOWN",
    });
    if (["ACQ.TRADE_NOT_EXIST", "ACQ.REFUND_NOT_EXIST"].includes(subCode)) {
      return {
        status: "not_found",
        reference: request.reference,
        refundRequestNo: request.refundRequestNo,
        amount: request.amount,
      };
    }
    throw new OpcAlipayProviderError();
  }
  const resultRequestNo = String(result.outRequestNo ?? result.out_request_no ?? "");
  const resultReference = String(result.outTradeNo ?? result.out_trade_no ?? "");
  const resultTradeNo = String(result.tradeNo ?? result.trade_no ?? "");
  const refundAmount = alipayDecimalToAmount(String(result.refundAmount ?? result.refund_amount ?? ""));
  if (
    resultRequestNo !== request.refundRequestNo
    || resultReference !== request.reference
    || resultTradeNo !== request.tradeNo
    || !refundAmount
    || refundAmount.minorUnits !== request.amount.minorUnits
  ) {
    throw new Error("支付宝退款查询结果与订单全额退款请求不一致。");
  }
  // 新版 alipay.trade.fastpay.refund.query 的成功响应没有 refund_status
  // 字段；匹配到稳定退款请求号、原交易和全额金额即是该退款记录的证据。
  return {
    status: "succeeded",
    reference: request.reference,
    refundRequestNo: request.refundRequestNo,
    amount: refundAmount,
  };
}
