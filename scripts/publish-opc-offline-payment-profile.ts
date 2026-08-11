import { publishOpcOfflinePaymentProfileFromDirectory } from "../lib/opc-offline-payment-profile-publisher.ts";

const defaultStagingDirectory = "/srv/vault2077/shared/opc-offline-payment";
const directory = process.argv[2] || process.env.VAULT2077_OPC_OFFLINE_PAYMENT_STAGING_DIR || defaultStagingDirectory;

try {
  const published = await publishOpcOfflinePaymentProfileFromDirectory(directory);
  console.log(JSON.stringify({
    ok: true,
    revision: published.revision,
    publishedAt: published.publishedAt,
    agreementSha256: published.agreement.sha256,
    contactQrSha256: published.contactQr.sha256,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "线下付款资料发布失败。");
  process.exitCode = 1;
}
