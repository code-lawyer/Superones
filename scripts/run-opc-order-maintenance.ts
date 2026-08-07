import { runOpcOrderRetention } from "../lib/opc-orders/admin.ts";
import { createOpcPaymentEmailSender } from "../lib/opc-payment-email.ts";
import { processOpcPaymentNotifications } from "../lib/opc-payment-notifications.ts";

const configuredBatch = Number(process.env.VAULT2077_OPC_PAYMENT_EMAIL_BATCH ?? 20);
const maximum = Number.isInteger(configuredBatch) && configuredBatch > 0 ? configuredBatch : 20;
const notifications = process.env.VAULT2077_OPC_PAYMENT_EMAIL_ENABLED === "true"
  ? await processOpcPaymentNotifications({ sender: createOpcPaymentEmailSender(), maximum })
  : { processed: 0, sent: 0, failed: 0 };
const retention = await runOpcOrderRetention();

console.log(JSON.stringify({ notifications, retention }));
if (notifications.failed > 0) process.exitCode = 1;
