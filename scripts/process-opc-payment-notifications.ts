import { createOpcPaymentEmailSender } from "../lib/opc-payment-email.ts";
import { processOpcPaymentNotifications } from "../lib/opc-payment-notifications.ts";

const configuredMaximum = Number(process.env.VAULT2077_OPC_PAYMENT_EMAIL_BATCH ?? 20);
const result = await processOpcPaymentNotifications({
  sender: createOpcPaymentEmailSender(),
  maximum: Number.isSafeInteger(configuredMaximum) && configuredMaximum > 0 ? configuredMaximum : 20,
});
console.log(JSON.stringify(result));
if (result.failed > 0) process.exitCode = 1;
