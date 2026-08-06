import "server-only";

import { opcOrderingAvailable } from "./opc-payment-config.ts";

export function opcOrderEntryAvailable(
  environment: Record<string, string | undefined> = process.env,
) {
  const paperEnabled = environment.NODE_ENV === "production"
    ? environment.VAULT2077_OPC_PAPER_CHECKOUT_ENABLED === "true"
    : environment.VAULT2077_OPC_PAPER_CHECKOUT_ENABLED !== "false";
  return paperEnabled && opcOrderingAvailable(environment);
}
