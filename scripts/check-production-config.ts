import process from "node:process";
import {
  opcPaymentAssetAvailable,
  readOpcPaymentConfiguration,
} from "../lib/opc-payment-config.ts";
import { validateProductionConfiguration } from "../lib/production-config.ts";

const report = validateProductionConfiguration();
if (report.ok) {
  const payment = readOpcPaymentConfiguration();
  if (!payment || !(await opcPaymentAssetAvailable(payment))) {
    report.errors.push("支付宝收款码必须是 public 下不超过 2 MiB、格式与扩展名一致的 PNG、WebP 或 JPEG 图片。");
  }
  report.ok = report.errors.length === 0;
}
for (const warning of report.warnings) console.warn(`WARN ${warning}`);
if (!report.ok) {
  for (const error of report.errors) console.error(`ERROR ${error}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "ok", ...report.summary }, null, 2));
}
