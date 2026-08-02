import "server-only";

import { readOpcEsignConfiguration } from "./opc-esign.ts";
import { opcOrderingAvailable } from "./opc-payment-config.ts";

export function opcOrderEntryAvailable(
  environment: Record<string, string | undefined> = process.env,
) {
  const esign = readOpcEsignConfiguration(environment);
  if (!esign) return false;
  if (opcOrderingAvailable(environment)) return true;

  // Local previews may exercise the contract-first flow without real provider
  // credentials. Production still requires both e-sign and Alipay readiness.
  return environment.NODE_ENV !== "production" && esign.provider === "mock";
}
