import "server-only";

import nodemailer from "nodemailer";
import type { OpcPaymentEmailSender } from "./opc-payment-notifications.ts";
import { PRODUCTION_ADMIN_EMAIL } from "./admin-profile.ts";
import { PUBLIC_DOMAIN } from "./legal-profile.ts";

type OpcPaymentEmailConfiguration = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

export function opcPaymentEmailConfigurationErrors(
  environment: Record<string, string | undefined> = process.env,
) {
  if (environment.VAULT2077_OPC_PAYMENT_EMAIL_ENABLED !== "true") return ["OPC 付款邮件通知未启用。"];
  const port = Number(environment.VAULT2077_SMTP_PORT);
  const errors: string[] = [];
  if (!environment.VAULT2077_SMTP_HOST?.trim()) errors.push("SMTP 主机未配置。");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) errors.push("SMTP 端口无效。");
  if (!environment.VAULT2077_SMTP_USER?.trim()) errors.push("SMTP 用户名未配置。");
  if (!environment.VAULT2077_SMTP_PASSWORD?.trim()) errors.push("SMTP 授权码或密码未配置。");
  const from = environment.VAULT2077_SMTP_FROM?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    errors.push("SMTP 发件地址无效。");
  } else {
    const domain = from.slice(from.lastIndexOf("@") + 1);
    if (domain !== PUBLIC_DOMAIN && !domain.endsWith(`.${PUBLIC_DOMAIN}`)) {
      errors.push(`SMTP 发件地址必须使用 ${PUBLIC_DOMAIN} 或其子域。`);
    }
  }
  const user = environment.VAULT2077_SMTP_USER?.trim().toLowerCase() ?? "";
  if (user && from && user !== from) errors.push("SMTP 用户名必须与发件地址一致。");
  return errors;
}

function readConfiguration(): OpcPaymentEmailConfiguration {
  const errors = opcPaymentEmailConfigurationErrors();
  if (errors.length) throw new Error(errors.join(" "));
  return {
    host: process.env.VAULT2077_SMTP_HOST!.trim(),
    port: Number(process.env.VAULT2077_SMTP_PORT),
    user: process.env.VAULT2077_SMTP_USER!.trim(),
    password: process.env.VAULT2077_SMTP_PASSWORD!.trim(),
    from: process.env.VAULT2077_SMTP_FROM!.trim(),
  };
}

export function createOpcPaymentEmailSender(): OpcPaymentEmailSender {
  const configuration = readConfiguration();
  const transporter = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.port === 465,
    requireTLS: configuration.port !== 465,
    auth: { user: configuration.user, pass: configuration.password },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
    tls: { rejectUnauthorized: true },
  });
  return {
    async send(message) {
      await transporter.sendMail({
        from: configuration.from,
        replyTo: PRODUCTION_ADMIN_EMAIL,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: message.messageId,
      });
    },
  };
}
