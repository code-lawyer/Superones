export type OpcPaymentAmount = {
  currency: "CNY";
  minorUnits: number;
  decimal: string;
};

export function decimalToOpcPaymentAmount(value: string): OpcPaymentAmount | null {
  const normalized = value.trim();
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const minorUnits = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) return null;
  return {
    currency: "CNY",
    minorUnits,
    decimal: `${match[1]}.${String(minorUnits % 100).padStart(2, "0")}`,
  };
}

export function catalogPriceToOpcPaymentAmount(price: string): OpcPaymentAmount | null {
  const compact = price.replaceAll(",", "").replaceAll("，", "").trim();
  const match = /(?:人民币|RMB|CNY|¥|￥)\s*(\d{1,9}(?:\.\d{1,2})?)/i.exec(compact);
  return match ? decimalToOpcPaymentAmount(match[1]) : null;
}
