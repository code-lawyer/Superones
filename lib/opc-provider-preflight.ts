import "server-only";

import {
  queryOpcAlipayTrade,
  readOpcAlipayConfiguration,
  type OpcAlipayConfiguration,
  type OpcAlipayQueryResult,
} from "./opc-payment-config.ts";
import { verifyOpcEsignTemplates, type OpcEsignTemplateProbe } from "./opc-esign.ts";

const reservedPreflightReference = "OPC-20991231-F0E1D2C3B4A5";

export type OpcProviderPreflightResult = {
  esign: OpcEsignTemplateProbe[];
  alipay: {
    gatewayHost: string;
    mode: "page" | "wap" | "both";
    tradeQuery: "ok";
  };
};

type OpcProviderPreflightDependencies = {
  verifyEsignTemplates?: (
    environment: Record<string, string | undefined>,
    fetcher: typeof fetch,
  ) => Promise<OpcEsignTemplateProbe[]>;
  queryAlipayTrade?: (
    reference: string,
    configuration: OpcAlipayConfiguration,
  ) => Promise<OpcAlipayQueryResult>;
};

export async function verifyOpcProviders(
  environment: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  dependencies: OpcProviderPreflightDependencies = {},
): Promise<OpcProviderPreflightResult> {
  const configuration = readOpcAlipayConfiguration(environment);
  if (!configuration) throw new Error("支付宝开放平台配置无效或不完整。");

  const esign = await (dependencies.verifyEsignTemplates ?? verifyOpcEsignTemplates)(environment, fetcher);
  const queryResult = await (dependencies.queryAlipayTrade ?? queryOpcAlipayTrade)(
    reservedPreflightReference,
    configuration,
  );
  if (queryResult.reference !== reservedPreflightReference) {
    throw new Error("支付宝交易查询探针返回了不匹配的商户订单号。");
  }
  if (queryResult.appId !== configuration.appId || queryResult.configuredSellerId !== configuration.sellerId) {
    throw new Error("支付宝交易查询探针使用的应用或商户身份与受控配置不一致。");
  }
  if (queryResult.found) {
    throw new Error("支付宝交易查询探针使用的保留订单号已存在，请先人工核对商户数据。");
  }

  return {
    esign,
    alipay: {
      gatewayHost: new URL(configuration.gateway).hostname,
      mode: configuration.mode,
      tradeQuery: "ok",
    },
  };
}
