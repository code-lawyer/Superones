import { calculateOpcPaymentReceiptLayout } from "./opc-payment-receipt-layout.ts";

export type OpcPaymentReceiptView = {
  receiptId: string;
  receiptNumber: string;
  reference: string;
  paymentStatus: "verified_paid";
  snapshotSha256: string;
  generatedAt: string;
  operator: { name: string; creditCode: string; publicOrigin: string; icpNumber: string };
  customer: {
    type: "individual" | "organization";
    name: string;
    organizationName: string;
    organizationCreditCode: string;
    legalRepresentativeName: string;
    contactName: string;
    maskedPhone: string;
    maskedDeliveryAddress: string;
  };
  service: { code: string; name: string; revision: string; outcome: string; scope: string; boundary: string };
  payment: {
    provider: "retired_online" | "bank_transfer";
    amount: { currency: "CNY"; minorUnits: number; decimal: string };
    paidAt: string;
    tradeNo: string;
  };
};

export function canonicalOpcPaymentReceiptUrl(receipt: OpcPaymentReceiptView) {
  return `${receipt.operator.publicOrigin}/opc/payment/return?order=${encodeURIComponent(receipt.reference)}`;
}

export async function downloadOpcPaymentReceiptPng(receipt: OpcPaymentReceiptView) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成付款凭证图片。");
  const rows: Array<[string, string]> = [
    ["订单号", receipt.reference],
    ["付款状态", receipt.payment.provider === "bank_transfer" ? "企业银行到账已由后台核验" : "历史付款记录已归档"],
    ["服务事项", `${receipt.service.name}（${receipt.service.code} / ${receipt.service.revision}）`],
    ["服务成果", receipt.service.outcome],
    ["服务范围", receipt.service.scope],
    ["服务边界", receipt.service.boundary],
    ["付款金额", `人民币 ${receipt.payment.amount.decimal} 元`],
    ["付款方式", receipt.payment.provider === "bank_transfer" ? "线下对公转账" : "退役在线渠道（历史记录）"],
    [receipt.payment.provider === "bank_transfer" ? "银行流水号" : "历史交易参考号", receipt.payment.tradeNo],
    ["付款时间", formatReceiptDate(receipt.payment.paidAt)],
    ["我方名称", receipt.operator.name],
    ["统一社会信用代码", receipt.operator.creditCode],
    ["付款方", receipt.customer.organizationName || receipt.customer.name],
    ["付款方统一社会信用代码", receipt.customer.organizationCreditCode || "—"],
    ["法定代表人", receipt.customer.legalRepresentativeName || "—"],
    ["联系人", `${receipt.customer.contactName} / ${receipt.customer.maskedPhone}`],
    ...(receipt.customer.maskedDeliveryAddress ? [["合同寄送地址", receipt.customer.maskedDeliveryAddress] as [string, string]] : []),
    ["凭证生成时间", formatReceiptDate(receipt.generatedAt)],
  ];
  context.font = "500 29px system-ui, sans-serif";
  canvas.height = calculateOpcPaymentReceiptLayout(
    rows.map(([, value]) => value || "—"),
    (value) => context.measureText(value).width,
  ).height;
  context.fillStyle = "#f4f1e9";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#181817";
  context.font = "700 58px system-ui, sans-serif";
  context.fillText("付款完成凭证", 96, 132);
  context.font = "24px ui-monospace, monospace";
  context.fillStyle = "#555550";
  context.fillText(receipt.receiptNumber, 96, 180);
  context.strokeStyle = "#282825";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(96, 220);
  context.lineTo(1304, 220);
  context.stroke();

  let y = 278;
  for (const [label, value] of rows) {
    context.font = "24px system-ui, sans-serif";
    context.fillStyle = "#6b6a64";
    context.fillText(label, 96, y);
    context.font = "500 29px system-ui, sans-serif";
    context.fillStyle = "#181817";
    y = drawWrappedText(context, value || "—", 390, y, 880, 43) + 38;
    context.strokeStyle = "#d1cdc1";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(96, y - 20);
    context.lineTo(1304, y - 20);
    context.stroke();
  }
  context.font = "600 24px system-ui, sans-serif";
  context.fillStyle = "#181817";
  context.fillText("本凭证不是发票；到账核验及订单协议以系统留存记录为准。", 96, y + 22);
  context.font = "22px system-ui, sans-serif";
  context.fillStyle = "#555550";
  context.fillText(`凭证页面网址：${canonicalOpcPaymentReceiptUrl(receipt)}`, 96, y + 72);
  context.fillText(`网站：${receipt.operator.publicOrigin}  ·  ${receipt.operator.icpNumber}`, 96, y + 112);
  context.font = "18px ui-monospace, monospace";
  context.fillText(`SNAPSHOT SHA-256 ${receipt.snapshotSha256}`, 96, y + 158);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("付款凭证图片生成失败。");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${receipt.receiptNumber}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatReceiptDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(value));
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = "";
  let cursorY = y;
  for (const character of text) {
    const candidate = line + character;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, cursorY);
      line = character;
      cursorY += lineHeight;
    } else {
      line = candidate;
    }
  }
  context.fillText(line, x, cursorY);
  return cursorY;
}
