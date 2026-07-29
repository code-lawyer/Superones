import { generateKeyPairSync } from "node:crypto";

const applicationKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const alipayKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

export const testAlipayNotificationPrivateKey = alipayKeys.privateKey;

export function validTestAlipayEnvironment() {
  return {
    VAULT2077_PUBLIC_ORIGIN: "https://vault2077.test",
    VAULT2077_ALIPAY_APP_ID: "2021000000000001",
    VAULT2077_ALIPAY_SELLER_ID: "2088000000000001",
    VAULT2077_ALIPAY_PRIVATE_KEY: applicationKeys.privateKey,
    VAULT2077_ALIPAY_PUBLIC_KEY: alipayKeys.publicKey,
    VAULT2077_ALIPAY_KEY_TYPE: "PKCS8",
    VAULT2077_ALIPAY_GATEWAY: "https://openapi.alipay.com/gateway.do",
    VAULT2077_ALIPAY_WEB_PAYMENT_MODE: "both",
  };
}
